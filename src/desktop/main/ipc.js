'use strict';

const { ipcMain, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Core modules — shared between CLI and desktop
const { agentLoop, buildSystemPrompt, DEFAULT_MODEL } = require('../../core/agent.js');
const { getToolDefinitions, executeTool } = require('../../core/tools.js');
const { startMCPServers } = require('../../core/mcp.js');
const { loadSkill, listSkills } = require('../../core/skills.js');
const { searchVault, rebuildIndex } = require('../../core/search.js');
const { saveSessionMemory, getMemoryContext, pruneOldMemories } = require('../../core/memory.js');
const { detectIntent, formatIntentSuggestion } = require('../../core/intent.js');
const { getVaultPulse, quickCapture, parseLogCommand } = require('../../core/vault-pulse.js');
const { getPersonaContext, incrementSessionCount } = require('../../core/persona-memory.js');
const { generateMorningBrief, formatBriefForDisplay, shouldShowBrief } = require('../../core/morning-brief.js');
const { buildSimulationContext, listSimulatableStakeholders } = require('../../core/stakeholder-sim.js');
const { analyseDecisions, formatPatternReport, detectMissingContext } = require('../../core/decision-patterns.js');
const { gatherContext, formatContextBlock, shouldInjectContext } = require('../../core/auto-context.js');
const { findExpertise, getRelationshipMap, formatNetworkResponse } = require('../../core/network-recall.js');
const { addCompetitor, removeCompetitor, checkCompetitors, listCompetitors, formatRadarReport } = require('../../core/competitive-radar.js');
const { generateExercise, markExerciseCompleted, getStreak, formatExercise } = require('../../core/product-gym.js');
const { captureShipment, suggestSkillFromDescription, getCareerTimeline, getSkillMatrix, formatCareerSummary } = require('../../core/ship-to-story.js');
const { getWelcomeSuggestions, getResponseSuggestions, getIdleHint, getOnboardingTip } = require('../../core/suggestions.js');
const { parseFileReferences, formatFileContext } = require('../../core/context-manager.js');

// ── State ──────────────────────────────────────────────────────────────────

let mcpRef = { tools: [], callTool: null, shutdown: () => {} };
let messagesRef = [];
let toolsRef = [];
let costRef = { input: 0, output: 0, cost: 0 };
let personaRef = null;
let thinkingRef = false;
let skillCtxRef = null;
let lastSkillRef = null;
let vaultPathRef = null;
let versionRef = '1.0.0';
let interactionCount = 0;
let usedCommands = [];
let abortController = null;
let askUserResolve = null;

// ── Setup ──────────────────────────────────────────────────────────────────

async function setupIPC(vaultPath, version) {
  vaultPathRef = vaultPath;
  versionRef = version;

  // Start MCP servers
  console.log('[vennie] Vault path:', vaultPath);
  console.log('[vennie] Starting MCP servers...');
  try {
    mcpRef = await startMCPServers(vaultPath);
    console.log(`[vennie] MCP: ${mcpRef.tools.length} tools from ${mcpRef.tools.length > 0 ? [...new Set(mcpRef.tools.map(t => t._server))].join(', ') : 'no'} servers`);
  } catch (err) {
    console.error('[vennie] MCP startup failed:', err.message);
  }

  // Build tool list
  const builtInTools = getToolDefinitions();
  toolsRef = [...builtInTools, ...mcpRef.tools];

  // Prune old memories silently
  try { pruneOldMemories(vaultPath, 30); } catch {}

  // ── IPC Handlers ───────────────────────────────────────────────────────

  // Get initial app data (called once on renderer mount)
  ipcMain.handle('app:init', async () => {
    const pulse = (() => { try { return getVaultPulse(vaultPath); } catch { return null; } })();
    const morningBrief = (() => {
      try {
        if (shouldShowBrief(vaultPath)) {
          return generateMorningBrief(vaultPath);
        }
      } catch {}
      return null;
    })();
    const welcomeData = getWelcomeSuggestions(vaultPath);
    const builtInCommands = getBuiltInCommands();
    const skillCommands = listSkills(vaultPath).map(s => ({ name: s.name, description: s.description }));
    const allCommands = [...builtInCommands, ...skillCommands].sort((a, b) => a.name.localeCompare(b.name));

    return {
      version: versionRef,
      vaultPath,
      model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
      toolCount: toolsRef.length,
      pulse,
      morningBrief: morningBrief ? { brief: morningBrief, display: formatBriefForDisplay(morningBrief) } : null,
      welcomeData,
      commands: allCommands,
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    };
  });

  // ── Agent communication ───────────────────────────────────────────────

  ipcMain.handle('agent:send', async (event, { message, attachments }) => {
    const sender = event.sender;
    const trimmed = message.trim();
    if (!trimmed && (!attachments || attachments.length === 0)) return { handled: false };

    // Handle AskUser responses
    if (askUserResolve) {
      const resolve = askUserResolve;
      askUserResolve = null;
      resolve({ response: trimmed });
      return { handled: true, type: 'ask-user-response' };
    }

    // ── Slash commands (handled locally, not sent to agent) ──────────
    if (trimmed.startsWith('/')) {
      const result = handleSlashCommand(trimmed, sender);
      if (result.handled && !result.fallThrough) {
        return result;
      }
      // Commands that fall through set skillCtxRef
    }

    // Intent detection
    let intent = null;
    if (!trimmed.startsWith('/') && !skillCtxRef) {
      intent = detectIntent(trimmed);
      if (intent && intent.confidence < 0.7) intent = null;
    }

    // Build user content
    let userContent = trimmed;
    if (skillCtxRef) {
      userContent = `${skillCtxRef}\n\n---\n\nUser request: ${trimmed}`;
      skillCtxRef = null;
    }

    // Parse @file references
    const fileRefs = parseFileReferences(userContent, vaultPath);
    if (fileRefs.files.length > 0) {
      userContent = fileRefs.cleanInput;
      for (const f of fileRefs.files) {
        sender.send('agent:event', { type: 'system', message: `@${f.filename} injected` });
      }
    }

    // Build multimodal content if attachments present
    if (attachments && attachments.length > 0) {
      const contentBlocks = [];
      for (const att of attachments) {
        if (att.type === 'image' && att.data) {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mediaType, data: att.data },
          });
        } else if (att.type === 'document' && att.content) {
          contentBlocks.push({
            type: 'text',
            text: `[Attached file: ${att.fileName}]\n\n${att.content}`,
          });
        }
      }
      contentBlocks.push({ type: 'text', text: userContent || 'Please review the attached files.' });
      messagesRef.push({ role: 'user', content: contentBlocks });
    } else {
      messagesRef.push({ role: 'user', content: userContent });
    }
    let systemPrompt = buildSystemPrompt(vaultPath, personaRef);

    // Inject @file content
    if (fileRefs.files.length > 0) {
      systemPrompt += formatFileContext(fileRefs.files);
    }

    // Session memory (first message only)
    if (messagesRef.length === 1) {
      try {
        const memCtx = getMemoryContext(vaultPath, { days: 7 });
        if (memCtx) systemPrompt += `\n\n${memCtx}`;
      } catch {}
    }

    // Persona memory
    if (personaRef) {
      try {
        const pCtx = getPersonaContext(vaultPath, personaRef);
        if (pCtx) systemPrompt += `\n\n${pCtx}`;
        if (messagesRef.length === 1) incrementSessionCount(vaultPath, personaRef);
      } catch {}
    }

    // Auto-context injection
    let contextSummary = null;
    if (shouldInjectContext(trimmed)) {
      try {
        const ctx = gatherContext(vaultPath, trimmed);
        const ctxBlock = formatContextBlock(ctx);
        if (ctxBlock) systemPrompt += `\n\n${ctxBlock}`;
        // Build context summary for UI
        const parts = [];
        if (ctx.people?.length) parts.push(`${ctx.people.length} person page${ctx.people.length > 1 ? 's' : ''}`);
        if (ctx.projects?.length) parts.push(`${ctx.projects.length} project${ctx.projects.length > 1 ? 's' : ''}`);
        if (ctx.relatedNotes?.length) parts.push(`${ctx.relatedNotes.length} meeting note${ctx.relatedNotes.length > 1 ? 's' : ''}`);
        if (ctx.decisions?.length) parts.push(`${ctx.decisions.length} decision${ctx.decisions.length > 1 ? 's' : ''}`);
        if (parts.length) contextSummary = parts;
      } catch {}
    }

    // Tool context with AskUser bridge
    const toolContext = {
      vaultPath,
      personaName: personaRef,
      mcpCallTool: mcpRef.callTool,
      askUser: (question) => {
        return new Promise((resolve) => {
          sender.send('agent:event', { type: 'ask_user', question });
          askUserResolve = resolve;
        });
      },
    };

    async function execTool(name, inp) {
      return executeTool(name, inp, toolContext);
    }

    console.log(`[vennie] Agent send: "${trimmed.slice(0, 50)}" | tools: ${toolsRef.length} | messages: ${messagesRef.length}`);

    // Abort any in-flight request
    if (abortController) {
      try { abortController.abort(); } catch {}
    }
    abortController = new AbortController();

    // Emit context summary to renderer
    if (contextSummary) {
      sender.send('agent:event', { type: 'context_loaded', sources: contextSummary });
    }
    if (fileRefs.files.length > 0) {
      sender.send('agent:event', { type: 'context_loaded', sources: [`${fileRefs.files.length} referenced file${fileRefs.files.length > 1 ? 's' : ''}`] });
    }

    // Run agent loop and stream events to renderer
    let responseText = '';
    try {
      const stream = agentLoop(messagesRef, toolsRef, systemPrompt, {
        executeTool: execTool,
        thinking: thinkingRef,
      });

      for await (const agentEvent of stream) {
        if (abortController.signal.aborted) break;
        sender.send('agent:event', agentEvent);

        // Accumulate response text for suggestions
        if (agentEvent.type === 'text_delta') {
          responseText += agentEvent.text;
        }

        // Track cost
        if (agentEvent.type === 'usage') {
          costRef.input += agentEvent.inputTokens;
          costRef.output += agentEvent.outputTokens;
          costRef.cost += agentEvent.cost;
        }

        // Post-response suggestions (always, not just after skills)
        if (agentEvent.type === 'done') {
          interactionCount++;
          const suggestions = getResponseSuggestions(responseText, lastSkillRef, usedCommands);
          if (suggestions.length > 0) {
            sender.send('agent:event', { type: 'suggestions', items: suggestions });
          }
          lastSkillRef = null;
        }
      }
    } catch (err) {
      sender.send('agent:event', { type: 'error', message: err.message });
    }

    return { handled: true, intent: intent ? formatIntentSuggestion(intent) : null };
  });

  // Abort current request
  ipcMain.handle('agent:abort', () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  });

  // ── Vault operations ──────────────────────────────────────────────────

  ipcMain.handle('vault:search', async (_event, { query, topN }) => {
    try {
      return searchVault(vaultPath, query, { topN: topN || 10 });
    } catch {
      return [];
    }
  });

  ipcMain.handle('vault:reindex', async () => {
    try {
      return rebuildIndex(vaultPath);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('vault:read', async (_event, { filePath }) => {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(vaultPath, filePath);
      return { content: fs.readFileSync(fullPath, 'utf8'), path: fullPath };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('vault:write', async (_event, { filePath, content }) => {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(vaultPath, filePath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('vault:tree', async () => {
    try {
      return buildVaultTree(vaultPath);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('vault:pulse', async () => {
    try {
      return getVaultPulse(vaultPath);
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('vault:brief', async () => {
    try {
      const brief = generateMorningBrief(vaultPath);
      return { brief, display: formatBriefForDisplay(brief) };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('vault:log', async (_event, { type, content }) => {
    try {
      return quickCapture(vaultPath, type, content);
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Skills ────────────────────────────────────────────────────────────

  ipcMain.handle('skills:list', async () => {
    return listSkills(vaultPath).map(s => ({
      name: s.name,
      description: s.description,
      category: s.category || 'general',
    }));
  });

  // ── Personas ──────────────────────────────────────────────────────────

  ipcMain.handle('persona:list', async () => {
    return listPersonas(vaultPath);
  });

  ipcMain.handle('persona:set', async (_event, { id }) => {
    personaRef = id === 'off' ? null : id;
    return { active: personaRef };
  });

  ipcMain.handle('persona:registry', async () => {
    return getPersonaRegistry(vaultPath);
  });

  ipcMain.handle('persona:install', async (_event, { id }) => {
    return installPersonaFromRegistry(vaultPath, id);
  });

  ipcMain.handle('persona:uninstall', async (_event, { id }) => {
    return uninstallPersona(vaultPath, id);
  });

  ipcMain.handle('persona:detail', async (_event, { id }) => {
    return getPersonaDetail(vaultPath, id);
  });

  // ── Settings ──────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', async () => {
    return {
      model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
      thinking: thinkingRef,
      persona: personaRef,
      vaultPath,
      apiKeySet: !!process.env.ANTHROPIC_API_KEY,
      cost: costRef,
    };
  });

  ipcMain.handle('settings:setModel', async (_event, { model }) => {
    const aliases = {
      'sonnet': 'claude-sonnet-4-6',
      'opus': 'claude-opus-4-6',
      'haiku': 'claude-haiku-4-5-20251001',
    };
    const resolved = aliases[model] || model;
    process.env.VENNIE_MODEL = resolved;
    return { model: resolved };
  });

  ipcMain.handle('settings:toggleThinking', async () => {
    thinkingRef = !thinkingRef;
    return { thinking: thinkingRef };
  });

  ipcMain.handle('settings:setApiKey', async (_event, { key }) => {
    process.env.ANTHROPIC_API_KEY = key;
    // Persist to config
    const configDir = path.join(require('os').homedir(), '.config', 'vennie');
    const envFile = path.join(configDir, 'env');
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    let envContent = '';
    if (fs.existsSync(envFile)) {
      envContent = fs.readFileSync(envFile, 'utf8')
        .split('\n')
        .filter(l => !l.startsWith('ANTHROPIC_API_KEY='))
        .join('\n');
    }
    envContent += `\nANTHROPIC_API_KEY=${key}\n`;
    fs.writeFileSync(envFile, envContent.trim() + '\n', 'utf8');
    return { success: true };
  });

  // ── Analysis tools ────────────────────────────────────────────────────

  ipcMain.handle('analysis:patterns', async () => {
    try {
      const analysis = analyseDecisions(vaultPath);
      const missing = detectMissingContext(vaultPath);
      return { analysis, report: formatPatternReport(analysis), missing };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('analysis:stakeholders', async () => {
    try {
      return listSimulatableStakeholders(vaultPath);
    } catch {
      return [];
    }
  });

  ipcMain.handle('analysis:network', async (_event, { topic }) => {
    try {
      const results = findExpertise(vaultPath, topic);
      return { results, formatted: formatNetworkResponse(results, topic) };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('analysis:radar', async () => {
    try {
      return listCompetitors(vaultPath);
    } catch {
      return [];
    }
  });

  ipcMain.handle('analysis:gym', async () => {
    try {
      const exercise = generateExercise(vaultPath);
      const streak = getStreak(vaultPath);
      return { exercise, formatted: formatExercise(exercise), streak };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('analysis:career', async () => {
    try {
      const timeline = getCareerTimeline(vaultPath, { months: 6 });
      const matrix = getSkillMatrix(vaultPath);
      return { timeline, matrix, formatted: formatCareerSummary(timeline, matrix) };
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Git / Time Machine ──────────────────────────────────────────────

  ipcMain.handle('git:log', async () => {
    try {
      const { execSync } = require('child_process');
      const raw = execSync(
        'git log --pretty=format:"%H||%ad||%s||%an" --date=short -50 --numstat',
        { cwd: vaultPath, encoding: 'utf8', timeout: 5000 }
      );
      const commits = [];
      let current = null;
      for (const line of raw.split('\n')) {
        const match = line.match(/^([a-f0-9]{40})\|\|(.+?)\|\|(.+?)\|\|(.+)$/);
        if (match) {
          if (current) commits.push(current);
          current = { hash: match[1], date: match[2], message: match[3], author: match[4], filesChanged: 0 };
        } else if (current && line.trim()) {
          const numstat = line.match(/^\d+\s+\d+\s+/);
          if (numstat) current.filesChanged++;
        }
      }
      if (current) commits.push(current);
      return commits;
    } catch {
      return [];
    }
  });

  ipcMain.handle('git:diff', async (_event, { hash }) => {
    try {
      const { execSync } = require('child_process');
      const raw = execSync(
        `git diff ${hash}~1..${hash} --no-color`,
        { cwd: vaultPath, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }
      );
      const files = [];
      let currentFile = null;
      for (const line of raw.split('\n')) {
        if (line.startsWith('diff --git')) {
          if (currentFile) files.push(currentFile);
          const pathMatch = line.match(/b\/(.+)$/);
          currentFile = { path: pathMatch?.[1] || '?', additions: 0, deletions: 0, lines: [] };
        } else if (currentFile) {
          if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('index') || line.startsWith('@@')) continue;
          if (line.startsWith('+')) {
            currentFile.additions++;
            currentFile.lines.push({ type: 'add', content: line.slice(1) });
          } else if (line.startsWith('-')) {
            currentFile.deletions++;
            currentFile.lines.push({ type: 'remove', content: line.slice(1) });
          } else {
            currentFile.lines.push({ type: 'context', content: line.slice(1) || line });
          }
        }
      }
      if (currentFile) files.push(currentFile);
      // Limit lines per file to avoid huge payloads
      for (const f of files) { if (f.lines.length > 100) f.lines = f.lines.slice(0, 100); }
      return { files };
    } catch {
      return { files: [] };
    }
  });

  // ── Notifications ─────────────────────────────────────────────────────

  ipcMain.handle('notifications:getPrefs', async () => {
    try {
      const { getPrefs } = require('./notification-prefs.js');
      return getPrefs();
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('notifications:setPrefs', async (_event, { prefs }) => {
    try {
      const { updatePrefs } = require('./notification-prefs.js');
      return updatePrefs(prefs);
    } catch (err) {
      return { error: err.message };
    }
  });

  // ── Session management ────────────────────────────────────────────────

  ipcMain.handle('session:save', async () => {
    try {
      saveSessionMemory(vaultPath, messagesRef, {
        model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
        cost: costRef.cost,
        persona: personaRef,
      });
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('session:clear', async () => {
    messagesRef = [];
    costRef = { input: 0, output: 0, cost: 0 };
    return { success: true };
  });

  ipcMain.handle('session:load', async (_event, { messages }) => {
    // Rebuild messagesRef from saved thread messages (user + assistant only)
    messagesRef = [];
    costRef = { input: 0, output: 0, cost: 0 };
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.type === 'user' && msg.text) {
          messagesRef.push({ role: 'user', content: msg.text });
        } else if (msg.type === 'assistant' && msg.text) {
          messagesRef.push({ role: 'assistant', content: msg.text });
        }
      }
    }
    return { success: true, messageCount: messagesRef.length };
  });

  // ── Voice Transcription ──────────────────────────────────────────────

  // ── Streaming Voice Transcription (real-time) ──────────────────────

  let voiceProcess = null;

  ipcMain.handle('voice:start', async (_event, { sampleRate }) => {
    // Kill any existing process
    if (voiceProcess) {
      try { voiceProcess.kill(); } catch {}
      voiceProcess = null;
    }

    const transcribeBin = path.join(__dirname, 'transcribe');
    if (process.platform !== 'darwin' || !fs.existsSync(transcribeBin)) {
      return { error: 'Voice input requires macOS with Speech Recognition enabled.' };
    }

    const { spawn } = require('child_process');
    const child = spawn(transcribeBin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    voiceProcess = child;

    // Send sample rate header
    child.stdin.write(`RATE:${sampleRate || 16000}\n`);

    // Read JSON lines from stdout → forward to renderer as events
    let buffer = '';
    child.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
          if (win) win.webContents.send('voice:result', json);
        } catch {}
      }
    });

    child.stderr.on('data', (data) => {
      console.warn('[vennie] transcribe stderr:', data.toString());
    });

    child.on('close', () => {
      voiceProcess = null;
    });

    child.on('error', (err) => {
      console.error('[vennie] transcribe error:', err.message);
      voiceProcess = null;
    });

    return { started: true };
  });

  ipcMain.handle('voice:chunk', async (_event, { pcmBase64 }) => {
    if (!voiceProcess || !voiceProcess.stdin.writable) return { error: 'No active voice session' };
    try {
      const buf = Buffer.from(pcmBase64, 'base64');
      voiceProcess.stdin.write(buf);
      return { ok: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('voice:stop', async () => {
    if (!voiceProcess) return { ok: true };
    try {
      voiceProcess.stdin.end();
      // Give it a moment to finish, then force kill
      setTimeout(() => {
        if (voiceProcess) {
          try { voiceProcess.kill(); } catch {}
          voiceProcess = null;
        }
      }, 5000);
    } catch {}
    return { ok: true };
  });

  // ── Attachments ──────────────────────────────────────────────────────

  ipcMain.handle('files:pick', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: 'Documents', extensions: ['pdf', 'md', 'txt', 'json', 'yaml', 'yml', 'csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return [];

    const attachments = [];
    for (const filePath of result.filePaths) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 20 * 1024 * 1024) continue; // Skip files > 20MB

        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath);
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);

        if (isImage) {
          const data = fs.readFileSync(filePath).toString('base64');
          const mediaType = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
          }[ext] || 'image/png';
          attachments.push({ type: 'image', fileName, filePath, mediaType, data, size: stat.size });
        } else {
          const content = fs.readFileSync(filePath, 'utf8');
          attachments.push({ type: 'document', fileName, filePath, content, size: stat.size });
        }
      } catch {}
    }
    return attachments;
  });

  ipcMain.handle('files:read-drop', async (_event, { filePaths }) => {
    const attachments = [];
    for (const filePath of filePaths) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > 20 * 1024 * 1024) continue;

        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath);
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext);

        if (isImage) {
          const data = fs.readFileSync(filePath).toString('base64');
          const mediaType = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
          }[ext] || 'image/png';
          attachments.push({ type: 'image', fileName, filePath, mediaType, data, size: stat.size });
        } else {
          const content = fs.readFileSync(filePath, 'utf8');
          attachments.push({ type: 'document', fileName, filePath, content, size: stat.size });
        }
      } catch {}
    }
    return attachments;
  });
}

// ── Slash Command Handler ────────────────────────────────────────────────

function handleSlashCommand(trimmed, sender) {
  const parts = trimmed.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  const vaultPath = vaultPathRef;

  switch (cmd) {
    case 'help':
      return { handled: true, type: 'system', text: 'Commands: /help, /model, /status, /think, /search, /log, /cost, /clear, /persona, /gym, /patterns, /who, /radar, /career, /brief, /simulate, /shipped, /challenge, /feedback, /quit' };

    case 'cost':
      return { handled: true, type: 'system', text: `Input: ${costRef.input.toLocaleString()} tokens | Output: ${costRef.output.toLocaleString()} tokens | Cost: $${costRef.cost.toFixed(4)}` };

    case 'clear':
      messagesRef = [];
      return { handled: true, type: 'system', text: 'Conversation cleared. Fresh start.' };

    case 'think':
      thinkingRef = !thinkingRef;
      return { handled: true, type: 'system', text: thinkingRef ? 'Extended thinking enabled' : 'Extended thinking disabled' };

    case 'model': {
      const aliases = { 'sonnet': 'claude-sonnet-4-6', 'opus': 'claude-opus-4-6', 'haiku': 'claude-haiku-4-5-20251001' };
      const arg = args.trim().toLowerCase();
      if (!arg) {
        return { handled: true, type: 'system', text: `Current model: ${process.env.VENNIE_MODEL || DEFAULT_MODEL}` };
      }
      process.env.VENNIE_MODEL = aliases[arg] || arg;
      return { handled: true, type: 'system', text: `Model switched to ${process.env.VENNIE_MODEL}` };
    }

    case 'status': {
      const pulse = (() => { try { return getVaultPulse(vaultPath); } catch { return null; } })();
      return { handled: true, type: 'system', text: `Model: ${process.env.VENNIE_MODEL || DEFAULT_MODEL} | Tools: ${toolsRef.length} | Messages: ${messagesRef.length} | Cost: $${costRef.cost.toFixed(4)}${pulse ? '\n' + pulse.detail : ''}` };
    }

    case 'search': {
      if (!args.trim()) return { handled: true, type: 'system', text: 'Usage: /search <query>' };
      try {
        const results = searchVault(vaultPath, args.trim(), { topN: 5 });
        if (results.length === 0) return { handled: true, type: 'system', text: 'No results found.' };
        const lines = results.map(r => {
          const relPath = r.file.replace(vaultPath + '/', '');
          return `${relPath} (score: ${r.score.toFixed(1)})\n  ${r.snippet.slice(0, 120)}`;
        });
        return { handled: true, type: 'system', text: lines.join('\n') };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'log': {
      const parsed = parseLogCommand(args);
      if (!parsed.content) return { handled: true, type: 'system', text: 'Usage: /log [decision|win|idea|note] <content>' };
      try {
        const result = quickCapture(vaultPath, parsed.type, parsed.content);
        return { handled: true, type: 'system', text: `\u2713 ${result.message}` };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'brief': {
      try {
        const brief = generateMorningBrief(vaultPath);
        return { handled: true, type: 'text', text: formatBriefForDisplay(brief) };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'patterns': {
      try {
        const analysis = analyseDecisions(vaultPath);
        if (analysis.totalDecisions === 0) return { handled: true, type: 'system', text: 'No decisions found yet. Use /log decision to start capturing them.' };
        return { handled: true, type: 'text', text: formatPatternReport(analysis) };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'who': {
      if (!args.trim()) return { handled: true, type: 'system', text: 'Usage: /who knows about <topic>' };
      const topic = args.replace(/^knows?\s+(about\s+)?/i, '').trim();
      try {
        const results = findExpertise(vaultPath, topic);
        return { handled: true, type: 'text', text: formatNetworkResponse(results, topic) };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'gym': {
      try {
        const exercise = generateExercise(vaultPath);
        const streak = getStreak(vaultPath);
        skillCtxRef = `The user is doing a Product Sense Gym exercise. Exercise:\n\n${exercise.scenario}\n\n${exercise.question}\n\nEvaluate their answer like a senior PM mentor. Be specific. Don't just validate — challenge and teach.`;
        lastSkillRef = 'gym';
        return { handled: true, type: 'text', text: (streak > 1 ? `\uD83D\uDD25 ${streak}-day streak!\n\n` : '') + formatExercise(exercise), fallThrough: false };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'shipped': case 'ship': {
      if (!args.trim()) return { handled: true, type: 'system', text: 'Usage: /shipped <what you shipped>' };
      try {
        const skills = suggestSkillFromDescription(args.trim());
        const result = captureShipment(vaultPath, args.trim(), { skills });
        return { handled: true, type: 'system', text: `\u2713 ${result.message || 'Shipment captured!'}${skills.length > 0 ? `\n  Skills: ${skills.join(', ')}` : ''}` };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'career': {
      try {
        const timeline = getCareerTimeline(vaultPath, { months: 6 });
        const matrix = getSkillMatrix(vaultPath);
        if (timeline.length === 0) return { handled: true, type: 'system', text: 'No career evidence yet. Use /shipped to start.' };
        return { handled: true, type: 'text', text: formatCareerSummary(timeline, matrix) };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'simulate': case 'sim': {
      if (!args.trim()) {
        try {
          const stakeholders = listSimulatableStakeholders(vaultPath);
          if (stakeholders.length === 0) return { handled: true, type: 'system', text: 'No stakeholders with enough context to simulate.' };
          const lines = stakeholders.map(s => `  /simulate ${s.name} — ${s.role} (${s.confidence}, ${s.meetingCount} meetings)`);
          return { handled: true, type: 'system', text: `Simulatable stakeholders:\n${lines.join('\n')}` };
        } catch (err) {
          return { handled: true, type: 'error', text: err.message };
        }
      }
      try {
        const sim = buildSimulationContext(vaultPath, args.trim());
        if (!sim.found) return { handled: true, type: 'system', text: `Couldn't find "${args.trim()}". Try /simulate to see who's available.` };
        skillCtxRef = sim.sessionPrompt;
        lastSkillRef = 'simulate';
        return { handled: true, type: 'system', text: `Simulating ${sim.personName} (${sim.role}). Chat as if you're talking to them.`, fallThrough: true };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'challenge': case 'missing': {
      if (!args.trim()) return { handled: true, type: 'system', text: 'Usage: /challenge <your plan or idea>' };
      skillCtxRef = `The user wants you to adversarially challenge their plan. Find what's missing, what could go wrong, what they haven't considered.\n\n1. Stakeholder blindspots\n2. Technical risks\n3. Market assumptions\n4. Timeline reality\n5. Second-order effects\n\nBe specific. Reference vault context.\n\nPlan to challenge:\n${args.trim()}`;
      lastSkillRef = 'challenge';
      return { handled: true, type: 'system', text: 'Running adversarial analysis...', fallThrough: true };
    }

    case 'radar': {
      const sub = args.trim().toLowerCase();
      if (!sub || sub === 'status') {
        try {
          const comps = listCompetitors(vaultPath);
          if (comps.length === 0) return { handled: true, type: 'system', text: 'No competitors tracked yet. Add with: /radar add <name> <url>' };
          const lines = comps.map(c => `  ${c.name} — ${c.urls.length} URL${c.urls.length > 1 ? 's' : ''}, last checked ${c.lastChecked || 'never'}`);
          return { handled: true, type: 'system', text: `Tracking ${comps.length} competitor${comps.length > 1 ? 's' : ''}:\n${lines.join('\n')}` };
        } catch (err) {
          return { handled: true, type: 'error', text: err.message };
        }
      }
      if (sub.startsWith('add ')) {
        const addParts = args.trim().slice(4).split(/\s+/);
        const name = addParts[0];
        const urls = addParts.slice(1).filter(u => u.startsWith('http'));
        if (!name) return { handled: true, type: 'system', text: 'Usage: /radar add <name> <url>' };
        try {
          addCompetitor(vaultPath, name, urls, ['direct']);
          return { handled: true, type: 'system', text: `\u2713 Added ${name} to radar` };
        } catch (err) {
          return { handled: true, type: 'error', text: err.message };
        }
      }
      if (sub.startsWith('remove ')) {
        try {
          removeCompetitor(vaultPath, args.trim().slice(7).trim());
          return { handled: true, type: 'system', text: '\u2713 Removed from radar' };
        } catch (err) {
          return { handled: true, type: 'error', text: err.message };
        }
      }
      if (sub === 'check') {
        skillCtxRef = `Check competitive radar for changes:\n\n${JSON.stringify(listCompetitors(vaultPath), null, 2)}\n\nFor each competitor with URLs, use WebFetch to check for changes. Summarise findings.`;
        lastSkillRef = 'radar';
        return { handled: true, type: 'system', text: 'Scanning competitors...', fallThrough: true };
      }
      return { handled: true, type: 'system', text: 'Radar commands: /radar, /radar add, /radar remove, /radar check' };
    }

    case 'reindex': {
      try {
        const stats = rebuildIndex(vaultPath);
        return { handled: true, type: 'system', text: `Indexed ${stats.files} files, ${stats.chunks} chunks` };
      } catch (err) {
        return { handled: true, type: 'error', text: err.message };
      }
    }

    case 'feedback': {
      if (!args.trim()) return { handled: true, type: 'system', text: 'Usage: /feedback <your feedback>\nTell us what you love, what\'s broken, or what you wish Vennie could do.' };
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../package.json'), 'utf8'));
      const payload = {
        feedback: args.trim(),
        version: pkg.version,
        timestamp: new Date().toISOString(),
        platform: process.platform,
      };
      const WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/15825235/ujbr95d/';
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {}); // fire and forget
      return { handled: true, type: 'system', text: '\u2713 Feedback sent — thanks! We read every one.' };
    }

    default: {
      // Try loading as a skill
      const skill = loadSkill(vaultPath, cmd);
      if (skill) {
        skillCtxRef = skill.body;
        lastSkillRef = cmd;
        usedCommands.push(cmd);
        return { handled: true, type: 'system', text: `/${cmd}`, fallThrough: true };
      }
      return { handled: false };
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getBuiltInCommands() {
  return [
    { name: 'help', description: 'Show available commands and skills' },
    { name: 'model', description: 'Switch model (sonnet, opus, haiku)' },
    { name: 'status', description: 'Show session status' },
    { name: 'persona', description: 'Switch active persona' },
    { name: 'think', description: 'Toggle extended thinking mode' },
    { name: 'search', description: 'Search your vault' },
    { name: 'reindex', description: 'Rebuild vault search index' },
    { name: 'log', description: 'Quick capture: /log [decision|win|idea|note] text' },
    { name: 'brief', description: 'Morning brief' },
    { name: 'simulate', description: 'Roleplay as a stakeholder' },
    { name: 'patterns', description: 'Analyse decision-making patterns' },
    { name: 'who', description: 'Find expertise: /who knows about <topic>' },
    { name: 'radar', description: 'Competitive intelligence radar' },
    { name: 'gym', description: 'Product sense training exercise' },
    { name: 'shipped', description: 'Capture a shipment for career evidence' },
    { name: 'career', description: 'Career timeline and skill matrix' },
    { name: 'challenge', description: 'Adversarial analysis' },
    { name: 'feedback', description: 'Send feedback to the Vennie team' },
    { name: 'cost', description: 'Show session cost' },
    { name: 'clear', description: 'Clear conversation' },
  ];
}

function listPersonas(vaultPath) {
  const dirs = ['core', 'marketplace', 'custom'];
  const personas = [];
  for (const dir of dirs) {
    const dirPath = path.join(vaultPath, '.vennie', 'personas', dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))) {
      try {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
        const nameMatch = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
        const idMatch = content.match(/^id:\s*["']?(.+?)["']?\s*$/m);
        const bestFor = content.match(/^best_for:\s*(.+?)$/m);
        personas.push({
          name: nameMatch ? nameMatch[1] : file.replace('.md', ''),
          id: idMatch ? idMatch[1] : file.replace('.md', ''),
          source: dir,
          bestFor: bestFor ? bestFor[1].slice(0, 60) : '',
        });
      } catch {}
    }
  }
  return personas;
}

function getPersonaRegistry(vaultPath) {
  const registryPath = path.join(vaultPath, '.vennie', 'personas', 'marketplace-registry.json');
  if (!fs.existsSync(registryPath)) return [];
  try {
    const catalog = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    // Check which ones are already installed
    const marketplaceDir = path.join(vaultPath, '.vennie', 'personas', 'marketplace');
    const customDir = path.join(vaultPath, '.vennie', 'personas', 'custom');
    const installedIds = new Set();
    for (const dir of [marketplaceDir, customDir]) {
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const idMatch = content.match(/^id:\s*["']?(.+?)["']?\s*$/m);
        if (idMatch) installedIds.add(idMatch[1]);
      }
    }
    return catalog.map(p => ({ ...p, installed: installedIds.has(p.id) }));
  } catch { return []; }
}

function installPersonaFromRegistry(vaultPath, personaId) {
  const registry = getPersonaRegistry(vaultPath);
  const entry = registry.find(p => p.id === personaId);
  if (!entry) return { error: `Persona '${personaId}' not found in registry.` };
  if (entry.installed) return { error: `Persona '${personaId}' is already installed.` };

  const marketplaceDir = path.join(vaultPath, '.vennie', 'personas', 'marketplace');
  if (!fs.existsSync(marketplaceDir)) fs.mkdirSync(marketplaceDir, { recursive: true });

  // Build .md file with YAML frontmatter matching existing format
  const frontmatter = [
    '---',
    `name: ${entry.name}`,
    `id: ${entry.id}`,
    entry.type === 'real-person' ? `type: real-person` : null,
    `archetype: ${entry.category.charAt(0).toUpperCase() + entry.category.slice(1)}`,
    `style: ${entry.style}`,
    `best_for: ${entry.bestFor}`,
    `author: ${entry.author}`,
    `version: ${entry.version}`,
    `installed_at: ${new Date().toISOString()}`,
    '---',
  ].filter(Boolean).join('\n');

  const content = `${frontmatter}\n\n${entry.personaContent || `# ${entry.name}\n\n${entry.description}`}`;
  const filePath = path.join(marketplaceDir, `${entry.id}.md`);
  fs.writeFileSync(filePath, content, 'utf8');

  return { status: 'installed', id: entry.id, name: entry.name, path: filePath };
}

function uninstallPersona(vaultPath, personaId) {
  const marketplaceDir = path.join(vaultPath, '.vennie', 'personas', 'marketplace');
  const filePath = path.join(marketplaceDir, `${personaId}.md`);
  if (!fs.existsSync(filePath)) return { error: `Persona '${personaId}' is not installed or is a core persona.` };
  fs.unlinkSync(filePath);
  return { status: 'uninstalled', id: personaId };
}

function getPersonaDetail(vaultPath, personaId) {
  // Check installed first
  const dirs = ['core', 'marketplace', 'custom'];
  for (const dir of dirs) {
    const dirPath = path.join(vaultPath, '.vennie', 'personas', dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))) {
      const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
      const idMatch = content.match(/^id:\s*["']?(.+?)["']?\s*$/m);
      if (idMatch && idMatch[1] === personaId) {
        return { source: dir, installed: true, content };
      }
    }
  }
  // Fall back to registry
  const registryPath = path.join(vaultPath, '.vennie', 'personas', 'marketplace-registry.json');
  if (fs.existsSync(registryPath)) {
    try {
      const catalog = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const entry = catalog.find(p => p.id === personaId);
      if (entry) return { source: 'registry', installed: false, ...entry };
    } catch {}
  }
  return { error: `Persona '${personaId}' not found.` };
}

function buildVaultTree(vaultPath, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  const entries = [];

  try {
    const items = fs.readdirSync(vaultPath, { withFileTypes: true })
      .filter(d => !d.name.startsWith('.') && d.name !== 'node_modules')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const item of items) {
      const fullPath = path.join(vaultPath, item.name);
      const entry = {
        name: item.name,
        path: fullPath,
        isDir: item.isDirectory(),
      };

      if (item.isDirectory()) {
        entry.children = buildVaultTree(fullPath, depth + 1, maxDepth);
      }

      entries.push(entry);
    }
  } catch {}

  return entries;
}

function shutdownMCP() {
  if (mcpRef && typeof mcpRef.shutdown === 'function') {
    mcpRef.shutdown();
  }
}

module.exports = { setupIPC, shutdownMCP };
