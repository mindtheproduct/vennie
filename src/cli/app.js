'use strict';

const fs = require('fs');
const path = require('path');
const React = require('react');
const { useState, useEffect, useCallback, useRef } = React;
const { render, Box, Text, Static, useApp, useInput, useStdout } = require('ink');
const TextInput = require('ink-text-input').default;
const { agentLoop, buildSystemPrompt, DEFAULT_MODEL } = require('../core/agent.js');
const { calibrateResponse, detectFollowUp } = require('../core/response-calibration.js');
const { detectEnergy, detectTimeContext } = require('../core/energy-match.js');
const { getToolDefinitions, executeTool } = require('../core/tools.js');
const { loadSkill, listSkills } = require('../core/skills.js');
const { startMCPServers } = require('../core/mcp.js');
const { getWelcomeSuggestions, getResponseSuggestions, getIdleHint, getOnboardingTip, generateContextualActions } = require('../core/suggestions.js');
const { checkMilestones, incrementSessionCount: incrementOnboardingSession, markFeatureDiscovered } = require('../core/progressive-onboarding.js');
const { searchVault, rebuildIndex } = require('../core/search.js');
const { saveSessionMemory, getMemoryContext, pruneOldMemories } = require('../core/memory.js');
const { detectIntent, formatIntentSuggestion, detectFramework, formatFrameworkSuggestion } = require('../core/intent.js');
const { getVaultPulse, quickCapture, parseLogCommand } = require('../core/vault-pulse.js');
const { getPersonaContext, incrementSessionCount } = require('../core/persona-memory.js');
const { generateMorningBrief, formatBriefForDisplay, shouldShowBrief } = require('../core/morning-brief.js');
const { buildSimulationContext, listSimulatableStakeholders } = require('../core/stakeholder-sim.js');
const { analyseDecisions, formatPatternReport, detectMissingContext } = require('../core/decision-patterns.js');
const { gatherContext, formatContextBlock, shouldInjectContext } = require('../core/auto-context.js');
const { findExpertise, getRelationshipMap, formatNetworkResponse } = require('../core/network-recall.js');
const { addCompetitor, removeCompetitor, checkCompetitors, listCompetitors, formatRadarReport } = require('../core/competitive-radar.js');
const { generateExercise, markExerciseCompleted, getStreak, formatExercise } = require('../core/product-gym.js');
const { captureShipment, suggestSkillFromDescription, getCareerTimeline, getSkillMatrix, formatCareerSummary } = require('../core/ship-to-story.js');
const { generateInsight } = require('../core/ambient-insights.js');
const { parseFileReferences, formatFileContext, saveSession, listSessions, resumeSession: resumeSessionData } = require('../core/context-manager.js');
const { createCitationManager } = require('../core/citations.js');
const { createPermissionChecker } = require('../core/permissions.js');
const { routeModel, getModelDisplayName, formatCostComparison, getRoutingInfo, MODEL_INFO } = require('../core/model-router.js');
const { runHooks } = require('../core/hooks.js');
const { detectProactiveTriggers, formatTriggerNudge } = require('../core/proactive.js');
const { createConversationTracker } = require('../core/conversation-tracker.js');
const { extractSessionLearnings, appendLearning } = require('../core/learnings.js');
const { writeArtifact, inferArtifactType, cleanupOldArtifacts } = require('../core/skill-artifacts.js');
const { gatherRetroData, generatePersonBreakdown, detectPatterns, formatRetroContext, parsePeriodDays } = require('../core/retro.js');
const { buildCareerSnapshot, saveSnapshot, getSnapshotHistory, comparePeriods, generateCareerBrief, formatDashboard, formatTrajectory, getPromotionReadiness } = require('../core/career-intelligence.js');
const { extractCommitments, saveCommitment, getOpenCommitments, completeCommitment, generateFollowUpNudge, getCommitmentStats } = require('../core/commitments.js');
const { recordSignal, recordSuggestionShown, getPendingSuggestions, clearPendingSuggestions, isRejection } = require('../core/feedback-signals.js');
const { gatherPreflightContext } = require('../core/preflight.js');
const { createPhaseTracker, shouldShowNudge, getPhaseInstruction } = require('../core/conversation-phase.js');

const e = React.createElement;

// ── Session topic extraction ─────────────────────────────────────────────
function extractSessionTopic(messages) {
  const firstUserMsg = messages.find(m => m.role === 'user' && typeof m.content === 'string');
  if (!firstUserMsg) return 'Untitled session';
  // Strip skill context prefix if present
  let text = firstUserMsg.content;
  const skillDivider = text.indexOf('\n\n---\n\nUser request: ');
  if (skillDivider !== -1) text = text.slice(skillDivider + '\n\n---\n\nUser request: '.length);
  // Clean up and truncate
  return text.replace(/\s+/g, ' ').trim().slice(0, 50) || 'Untitled session';
}

function autoSaveSession(vaultPath, messages, opts) {
  if (!messages || messages.length === 0) return;
  try {
    saveSession(vaultPath, {
      id: `session-${Date.now()}`,
      model: opts.model,
      messages,
      cost: opts.cost,
      persona: opts.persona,
      summary: extractSessionTopic(messages),
    });
  } catch {}

  // Extract and persist session learnings
  try {
    const sessionLearnings = extractSessionLearnings(messages);
    const sessionId = `session-${Date.now()}`;
    for (const learning of sessionLearnings) {
      learning.session_id = sessionId;
      appendLearning(vaultPath, learning);
    }
  } catch {
    // Learnings should never block session save
  }
}

// ── Colors (matching render.js palette) ────────────────────────────────────
const CYAN = '#00d7d7';
const DIM_BLUE = '#5f87af';
const SKY_BLUE = '#87d7ff';
const ACCENT_BLUE = '#5fafff';
const WHITE = '#e4e4e4';
const DIM = '#6c6c6c';
const GREEN = '#87d787';
const YELLOW = '#d7d75f';

// ── Markdown Renderer ─────────────────────────────────────────────────────
// Converts markdown text into styled Ink Text elements.

function MarkdownText({ text, indent }) {
  const pad = indent != null ? indent : '   ';
  const lines = text.split('\n');
  const elements = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(e(Box, { key: `code-${i}`, flexDirection: 'column', marginLeft: 2, marginTop: 0, marginBottom: 0 },
          ...codeLines.map((cl, ci) =>
            e(Text, { key: ci, color: DIM }, `${pad}  ${cl}`)
          ),
        ));
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      } else {
        inCodeBlock = true;
        codeLang = line.trim().slice(3);
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Blank line — use a single space so Ink doesn't collapse it
    if (!line.trim()) {
      elements.push(e(Text, { key: `blank-${i}` }, ' '));
      continue;
    }

    // Headers
    const h1 = line.match(/^#{1}\s+(.+)/);
    if (h1) {
      elements.push(e(Text, { key: `h-${i}`, bold: true, color: SKY_BLUE }, `${pad}${h1[1]}`));
      continue;
    }
    const h2 = line.match(/^#{2}\s+(.+)/);
    if (h2) {
      elements.push(e(Text, { key: `h-${i}`, bold: true, color: CYAN }, `${pad}${h2[1]}`));
      continue;
    }
    const h3 = line.match(/^#{3,}\s+(.+)/);
    if (h3) {
      elements.push(e(Text, { key: `h-${i}`, bold: true, color: ACCENT_BLUE }, `${pad}${h3[1]}`));
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(e(Text, { key: `hr-${i}`, color: DIM_BLUE }, `${pad}${'─'.repeat(40)}`));
      continue;
    }

    // Table — collect consecutive pipe-delimited lines
    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      const tableLines = [line];
      while (i + 1 < lines.length && lines[i + 1].trimStart().startsWith('|') && lines[i + 1].trimEnd().endsWith('|')) {
        tableLines.push(lines[++i]);
      }
      if (tableLines.length >= 2) {
        const parseRow = (r) => r.split('|').slice(1, -1).map(c => c.trim());
        const headers = parseRow(tableLines[0]);
        const hasSep = /^\|[\s:]*[-]+[\s:]*\|/.test(tableLines[1]);
        const dataStart = hasSep ? 2 : 1;
        const rows = tableLines.slice(dataStart).map(parseRow);
        const colWidths = headers.map((h, ci) => {
          const cellLens = rows.map(r => (r[ci] || '').length);
          return Math.min(Math.max(h.length, ...cellLens, 3), 40);
        });
        const headerText = headers.map((h, ci) => h.padEnd(colWidths[ci])).join('  ');
        elements.push(e(Text, { key: `th-${i}`, bold: true, color: CYAN }, `${pad}  ${headerText}`));
        const sepText = colWidths.map(w => '\u2500'.repeat(w)).join('\u2500\u2500');
        elements.push(e(Text, { key: `tsep-${i}`, color: DIM }, `${pad}  ${sepText}`));
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri];
          const rowText = headers.map((_, ci) => (row[ci] || '').padEnd(colWidths[ci])).join('  ');
          elements.push(e(Text, { key: `tr-${i}-${ri}`, color: WHITE }, `${pad}  ${rowText}`));
        }
        continue;
      }
    }

    // List items (- or * or numbered)
    const bullet = line.match(/^(\s*)([-*])\s+(.+)/);
    if (bullet) {
      const depth = Math.floor(bullet[1].length / 2);
      const extra = '  '.repeat(depth);
      elements.push(e(Text, { key: `li-${i}` }, `${pad}${extra}`, e(Text, { color: CYAN }, '  • '), renderInline(`li-${i}`, bullet[3])));
      continue;
    }
    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.+)/);
    if (numbered) {
      const depth = Math.floor(numbered[1].length / 2);
      const extra = '  '.repeat(depth);
      elements.push(e(Text, { key: `ol-${i}` }, `${pad}${extra}`, e(Text, { color: CYAN }, `  ${numbered[2]}. `), renderInline(`ol-${i}`, numbered[3])));
      continue;
    }

    // Regular paragraph line with inline formatting
    elements.push(e(Text, { key: `p-${i}` }, pad, renderInline(`p-${i}`, line)));
  }

  // Unclosed code block
  if (inCodeBlock && codeLines.length > 0) {
    elements.push(e(Box, { key: 'code-end', flexDirection: 'column', marginLeft: 2 },
      ...codeLines.map((cl, ci) =>
        e(Text, { key: ci, color: DIM }, `   ${cl}`)
      ),
    ));
  }

  return e(Box, { flexDirection: 'column' }, ...elements);
}

// Parse inline markdown: **bold**, *italic*, `code`, [links](url)
function renderInline(keyPrefix, text) {
  const parts = [];
  // Regex to match inline patterns
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIdx = 0;
  let match;
  let partIdx = 0;

  while ((match = re.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIdx) {
      parts.push(e(Text, { key: `${keyPrefix}-t${partIdx++}` }, text.slice(lastIdx, match.index)));
    }
    if (match[2]) {
      // **bold**
      parts.push(e(Text, { key: `${keyPrefix}-b${partIdx++}`, bold: true, color: WHITE }, match[2]));
    } else if (match[3]) {
      // *italic*
      parts.push(e(Text, { key: `${keyPrefix}-i${partIdx++}`, color: SKY_BLUE }, match[3]));
    } else if (match[4]) {
      // `code`
      parts.push(e(Text, { key: `${keyPrefix}-c${partIdx++}`, color: GREEN }, match[4]));
    } else if (match[5]) {
      // [link](url)
      parts.push(e(Text, { key: `${keyPrefix}-l${partIdx++}`, color: ACCENT_BLUE, underline: true }, match[5]));
    }
    lastIdx = match.index + match[0].length;
  }

  // Remaining text
  if (lastIdx < text.length) {
    parts.push(e(Text, { key: `${keyPrefix}-r${partIdx}` }, text.slice(lastIdx)));
  }

  if (parts.length === 0) return e(Text, null, text);
  if (parts.length === 1) return parts[0];
  return e(Text, null, ...parts);
}

// ── Tool display helpers ──────────────────────────────────────────────────

function describeToolCall(name, input) {
  // Shorten MCP names: mcp__server__tool → server:tool
  let displayName = name;
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    displayName = `${parts[1]}:${parts.slice(2).join('_')}`;
  }

  // Extract meaningful context from input
  const contextMap = {
    Read: () => (input.file_path || '').split('/').pop(),
    Write: () => (input.file_path || '').split('/').pop(),
    Edit: () => (input.file_path || '').split('/').pop(),
    Bash: () => (input.command || '').slice(0, 60),
    Glob: () => input.pattern,
    Grep: () => `"${(input.pattern || '').slice(0, 30)}"`,
    WebFetch: () => { try { return new URL(input.url || '').hostname; } catch { return input.url; } },
    WebSearch: () => `"${(input.query || '').slice(0, 40)}"`,
  };

  // Also handle MCP tools with common input patterns
  let context = '';
  if (contextMap[name]) {
    context = contextMap[name]() || '';
  } else if (input.url) {
    try { context = new URL(input.url).hostname; } catch { context = input.url; }
  } else if (input.query) {
    context = `"${input.query.slice(0, 40)}"`;
  } else if (input.file_path) {
    context = (input.file_path || '').split('/').pop();
  }

  return { name: displayName, context, rawName: name };
}

function formatToolStepSummary(tools, step) {
  if (tools.length === 0) return '';
  const totalMs = Math.max(...tools.map(t => t.duration || 0));
  const failed = tools.filter(t => !t.success).length;

  if (tools.length === 1) {
    const t = tools[0];
    const ctx = t.context ? ` ${t.context}` : '';
    const icon = t.success ? '\u2713' : '\u2717';
    const dur = t.duration ? ` ${t.duration}ms` : '';
    return `${icon} ${t.name}${ctx}${dur}`;
  }

  // Group by tool name for compact display
  const groups = {};
  for (const t of tools) {
    groups[t.name] = (groups[t.name] || 0) + 1;
  }
  const parts = Object.entries(groups).map(([name, count]) =>
    count > 1 ? `${name} \u00D7${count}` : name
  );
  const failStr = failed > 0 ? ` (${failed} failed)` : '';
  return `\u2713 ${parts.join(', ')} ${totalMs}ms${failStr}`;
}

// ── Mascot ─────────────────────────────────────────────────────────────────
const MASCOT_LINES = [
  '  \u2584\u2588\u2588\u2588\u2588\u2588\u2588\u2584',
  '  \u2588\u2580\u2580\u2588\u2588\u2580\u2580\u2588',
  ' \u258C\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2590',
  '  \u2580\u2588\u2588\u2588\u2588\u2588\u2588\u2580',
  '    \u2580  \u2580',
];

// ── Spinner ────────────────────────────────────────────────────────────────
const SPINNER_FRAMES = ['\u25DC', '\u25E0', '\u25DD', '\u25DE', '\u25E1', '\u25DF'];
const THINKING_MESSAGES = [
  'thinking', 'chewing on that', 'consulting the product gods',
  'brewing ideas', 'connecting the dots', 'reading the room',
  'processing vibes', 'crunching product wisdom', 'sketching a mental model',
  'looking at this from all angles', 'weighing trade-offs', 'pulling threads',
  'synthesising', 'going deep', 'finding the signal',
];

// ── File list cache for @file autocomplete ────────────────────────────────

let _fileListCache = null;
let _fileListCacheTime = 0;
const FILE_CACHE_TTL = 30000; // 30 seconds

function getVaultFileList(vaultPath) {
  const now = Date.now();
  if (_fileListCache && (now - _fileListCacheTime) < FILE_CACHE_TTL) return _fileListCache;

  const files = [];
  const searchDirs = [
    '00-Inbox', '00-Inbox/Meetings', '00-Inbox/Ideas',
    '01-Quarter_Goals', '02-Week_Priorities', '03-Tasks',
    '04-Projects', '05-Areas/People', '05-Areas/People/Internal',
    '05-Areas/People/External', '05-Areas/Companies',
    '06-Resources', 'System',
  ];
  const seen = new Set();

  for (const dir of searchDirs) {
    const dirPath = path.join(vaultPath, dir);
    try {
      if (!fs.existsSync(dirPath)) continue;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.md') && !entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) continue;
        if (entry.name.startsWith('.')) continue;
        const relPath = path.join(dir, entry.name);
        if (seen.has(relPath)) continue;
        seen.add(relPath);
        files.push({
          name: entry.name.replace(/\.(md|yaml|yml)$/, ''),
          filename: entry.name,
          relPath,
          dir,
        });
      }
    } catch {}
  }

  _fileListCache = files;
  _fileListCacheTime = now;
  return files;
}

// ── Autocomplete Component ─────────────────────────────────────────────────

// Fuzzy match scoring — inspired by fzf/Sublime Text
function fuzzyScore(query, target) {
  if (!query) return 1; // Show everything when no query
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact prefix match — highest score
  if (t.startsWith(q)) return 100 + (q.length / t.length) * 50;

  // Substring match — high score
  if (t.includes(q)) return 50 + (q.length / t.length) * 25;

  // Fuzzy character match — lower score based on gaps
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive characters
      const consecutive = lastMatchIdx === ti - 1 ? 5 : 0;
      // Bonus for matching at word boundaries (after -, _, space)
      const boundary = ti === 0 || '-_ '.includes(t[ti - 1]) ? 10 : 0;
      score += 1 + consecutive + boundary;
      lastMatchIdx = ti;
      qi++;
    }
  }

  // All query chars must be found
  if (qi < q.length) return -1;
  return score;
}

function Autocomplete({ commands, filter, onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const query = (filter || '').toLowerCase();

  // Fuzzy match and sort by score
  const scored = commands
    .map(c => {
      const nameScore = fuzzyScore(query, c.name);
      const descScore = fuzzyScore(query, c.description || '');
      const bestScore = Math.max(nameScore, descScore * 0.5); // Name matches weighted higher
      return { ...c, score: bestScore };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const maxVisible = 10;
  const scrollOffset = Math.max(0, Math.min(selectedIndex - maxVisible + 1, scored.length - maxVisible));
  const visible = scored.slice(scrollOffset, scrollOffset + maxVisible);

  useEffect(() => { setSelectedIndex(0); }, [filter]);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1));
    else if (key.downArrow) setSelectedIndex(i => Math.min(scored.length - 1, i + 1));
    else if (key.tab || (key.return && scored.length > 0)) {
      if (scored[selectedIndex]) onSelect(scored[selectedIndex]);
    }
  });

  if (scored.length === 0) {
    return e(Box, { paddingLeft: 3 }, e(Text, { color: DIM }, `No commands matching "${query}"`));
  }

  const children = visible.map((item, i) => {
    const globalIdx = scrollOffset + i;
    const isSelected = globalIdx === selectedIndex;
    const lastUsed = item.lastUsed ? `${fg.dimBlue} · last: ${item.lastUsed}${style.reset}` : '';

    return e(Box, { key: `${i}-${item.name}`, flexDirection: 'row' },
      e(Text, { color: isSelected ? CYAN : DIM_BLUE, bold: isSelected },
        isSelected ? ' ▸ ' : '   ',
      ),
      e(Text, { color: isSelected ? CYAN : SKY_BLUE, bold: isSelected },
        `/${item.name}`.padEnd(22),
      ),
      e(Text, { color: DIM }, item.description || ''),
    );
  });

  if (scrollOffset + maxVisible < scored.length) {
    children.push(e(Text, { key: '_more', color: DIM_BLUE }, `   ↓ ${scored.length - scrollOffset - maxVisible} more`));
  }
  children.push(e(Text, { key: '_hint', color: DIM },
    `   Tab to select · ↑↓ to navigate · ${scored.length} match${scored.length !== 1 ? 'es' : ''}`
  ));

  return e(Box, { flexDirection: 'column', marginLeft: 3 }, ...children);
}

// ── File Autocomplete Component ───────────────────────────────────────────
// Triggered by @ — shows vault files with fuzzy matching

function FileAutocomplete({ files, filter, onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const query = (filter || '').toLowerCase();

  const scored = files
    .map(f => {
      const nameScore = fuzzyScore(query, f.name);
      const pathScore = fuzzyScore(query, f.relPath);
      const bestScore = Math.max(nameScore, pathScore * 0.7);
      return { ...f, score: bestScore };
    })
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score);

  const maxVisible = 10;
  const scrollOffset = Math.max(0, Math.min(selectedIndex - maxVisible + 1, scored.length - maxVisible));
  const visible = scored.slice(scrollOffset, scrollOffset + maxVisible);

  useEffect(() => { setSelectedIndex(0); }, [filter]);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1));
    else if (key.downArrow) setSelectedIndex(i => Math.min(scored.length - 1, i + 1));
    else if (key.tab || (key.return && scored.length > 0)) {
      if (scored[selectedIndex]) onSelect(scored[selectedIndex]);
    }
    else if (key.escape) onSelect(null); // cancel
  });

  if (scored.length === 0) {
    return e(Box, { paddingLeft: 3 }, e(Text, { color: DIM }, `No files matching "${query}"`));
  }

  const children = visible.map((item, i) => {
    const globalIdx = scrollOffset + i;
    const isSelected = globalIdx === selectedIndex;

    return e(Box, { key: `${i}-${item.filename}`, flexDirection: 'row' },
      e(Text, { color: isSelected ? CYAN : DIM_BLUE, bold: isSelected },
        isSelected ? ' ▸ ' : '   ',
      ),
      e(Text, { color: isSelected ? CYAN : SKY_BLUE, bold: isSelected },
        `@${item.filename}`.padEnd(30),
      ),
      e(Text, { color: DIM }, item.dir),
    );
  });

  if (scrollOffset + maxVisible < scored.length) {
    children.push(e(Text, { key: '_more', color: DIM_BLUE }, `   ↓ ${scored.length - scrollOffset - maxVisible} more`));
  }
  children.push(e(Text, { key: '_hint', color: DIM },
    `   Tab to select · ↑↓ to navigate · Esc to cancel · ${scored.length} file${scored.length !== 1 ? 's' : ''}`
  ));

  return e(Box, { flexDirection: 'column', marginLeft: 3 }, ...children);
}

// ── Spinner Component ──────────────────────────────────────────────────────
// Claude Code style: colored asterisk/star that rotates, message, and elapsed timer

const STAR_FRAMES = ['✦', '✶', '✴', '✵', '✷', '✸', '✹', '✺'];

function SpinnerWidget({ startTime }) {
  const [frame, setFrame] = useState(0);
  const [msgIdx, setMsgIdx] = useState(() => Math.floor(Math.random() * THINKING_MESSAGES.length));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => f + 1), 120);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setMsgIdx(i => (i + 1) % THINKING_MESSAGES.length), 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startTime || Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return e(Box, { paddingLeft: 1 },
    e(Text, { color: CYAN, bold: true }, ` ${STAR_FRAMES[frame % STAR_FRAMES.length]} `),
    e(Text, { color: CYAN }, `${THINKING_MESSAGES[msgIdx]}\u2026`),
    e(Text, { color: DIM }, `  ${timeStr}`),
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

function App({ vaultPath, version, userName, initialTools, initialMcp, initialCommands, welcomeData, morningBrief, ambientInsight, mcpPromise, resumedSession }) {
  // Static items — rendered once, never re-rendered (scrolls up naturally)
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  // Dynamic state — only the active area re-renders
  const streamingRef = useRef('');
  const [streamingTick, setStreamingTick] = useState(0); // triggers re-render for streaming area
  const streamThrottleRef = useRef(null); // throttle streaming re-renders to prevent flicker
  const streamFlushRef = useRef(null); // pending flush timeout
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStart, setThinkingStart] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [completeFilter, setCompleteFilter] = useState('');
  const [idleHint, setIdleHint] = useState('');
  const [ephemeralHint, setEphemeralHint] = useState(''); // Shows below response, clears on next input
  const [contextualActions, setContextualActions] = useState([]); // Post-response action suggestions
  const lastUserInputRef = useRef(''); // Track last user message for contextual actions
  const activeToolsRef = useRef([]); // Tools currently running — shown in dynamic area
  const stepToolsRef = useRef([]); // All tools completed in current step — for summary
  const currentStepRef = useRef(0);
  const { exit } = useApp();

  const messagesRef = useRef([]);
  const personaRef = useRef(null);
  const skillCtxRef = useRef(null);
  const lastSkillRef = useRef(null);
  const activeFrameworkRef = useRef(null); // Interactive framework overlay (persists across turns)
  const costRef = useRef({ input: 0, output: 0, cost: 0 });
  const toolsRef = useRef(initialTools);
  const mcpRef = useRef(initialMcp);
  const ctrlCRef = useRef(0);
  const usedCommandsRef = useRef([]);
  const interactionCountRef = useRef(0);
  const askUserResolveRef = useRef(null); // For AskUser tool → Ink input bridge
  const thinkingRef = useRef(false); // Extended thinking toggle
  const autoRoutingRef = useRef(true); // Model auto-routing enabled by default
  const conversationTrackerRef = useRef(createConversationTracker());
  const lastSuggestedIntentRef = useRef(null); // Tracks intent suggestion for feedback signals
  const phaseTrackerRef = useRef(createPhaseTracker());
  const [pendingQuestion, setPendingQuestion] = useState(null);

  // Multi-line input state (ref mirrors state so callbacks always see current value)
  const [isMultiLine, _setIsMultiLine] = useState(false);
  const isMultiLineRef = useRef(false);
  const setIsMultiLine = useCallback((val) => { isMultiLineRef.current = val; _setIsMultiLine(val); }, []);
  const multiLineBufferRef = useRef([]);

  // @file autocomplete state
  const [showFileComplete, setShowFileComplete] = useState(false);
  const [fileCompleteFilter, setFileCompleteFilter] = useState('');
  const fileListRef = useRef([]);

  const allCommands = initialCommands;

  // Throttled streaming tick — ~8 re-renders/sec to prevent terminal flicker
  // Plain Text is used during streaming (not MarkdownText), so lower rate is fine
  const STREAM_INTERVAL = 120;
  const tickStreaming = useCallback(() => {
    const now = Date.now();
    const elapsed = now - (streamThrottleRef.current || 0);
    if (elapsed >= STREAM_INTERVAL) {
      streamThrottleRef.current = now;
      setStreamingTick(t => t + 1);
    } else if (!streamFlushRef.current) {
      streamFlushRef.current = setTimeout(() => {
        streamFlushRef.current = null;
        streamThrottleRef.current = Date.now();
        setStreamingTick(t => t + 1);
      }, STREAM_INTERVAL - elapsed);
    }
  }, []);

  // Append a line to the static log (renders once, never updates)
  const addLine = useCallback((text, type = 'text') => {
    const id = idRef.current++;
    setItems(prev => [...prev, { id, text, type }]);
  }, []);

  // ── Welcome suggestions + morning brief on first render ───
  useEffect(() => {
    if (welcomeData) {
      const { greeting, suggestions } = welcomeData;
      if (suggestions && suggestions.length > 0) {
        addLine(greeting, 'system');
        for (const s of suggestions) {
          addLine(`  ${s.cmd}  ${s.reason}`, 'welcome_suggestion');
        }
      }
    }
    // Morning brief — zero-prompt value
    if (morningBrief) {
      addLine('', 'text'); // spacer
      addLine(formatBriefForDisplay(morningBrief), 'text');
    }
    // Monday career snapshot — weekly auto-capture
    try {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 1 && morningBrief) { // Monday and brief is showing
        const recentSnapshots = getSnapshotHistory(vaultPath, 1);
        const lastSnapshot = recentSnapshots.length > 0 ? recentSnapshots[0] : null;
        const needsSnapshot = !lastSnapshot || !lastSnapshot.timestamp ||
          (Date.now() - new Date(lastSnapshot.timestamp).getTime()) > 6 * 24 * 60 * 60 * 1000;
        if (needsSnapshot) {
          const snapshot = buildCareerSnapshot(vaultPath);
          const insights = lastSnapshot ? comparePeriods(snapshot, lastSnapshot) : [];
          saveSnapshot(vaultPath, snapshot);
          const brief = generateCareerBrief(vaultPath);
          addLine('', 'text');
          addLine('-- Weekly Career Pulse --', 'system');
          addLine(brief, 'text');
          if (insights.length > 0) {
            const topInsight = insights.find(i => i.type === 'positive') || insights[0];
            if (topInsight) addLine('  ' + topInsight.text, 'text');
          }
          addLine('  Run /career-dashboard for the full picture.', 'hint');
        }
      }
    } catch { /* career snapshot should never block startup */ }
    // Ambient insight — occasional data-driven observation
    if (ambientInsight && ambientInsight.text) {
      addLine('', 'text'); // spacer
      addLine(ambientInsight.text, 'insight');
    }
    // Commitment follow-up nudge — warm accountability
    try {
      const commitNudge = generateFollowUpNudge(vaultPath);
      if (commitNudge) {
        addLine('', 'text');
        addLine(commitNudge, 'system');
      }
    } catch {}
    // Increment progressive onboarding session count
    try { incrementOnboardingSession(vaultPath); } catch {}
    // Resumed session — pre-populate messages and show context
    if (resumedSession) {
      messagesRef.current = resumedSession.messages || [];
      if (resumedSession.cost) costRef.current.cost = resumedSession.cost;
      if (resumedSession.persona) personaRef.current = resumedSession.persona;
      const topic = resumedSession.summary || 'previous session';
      addLine(`Resumed session: ${topic} (${resumedSession.messages.length} messages restored)`, 'system');
    }
  }, []);

  // ── Background MCP loading ──────────────────────────────
  useEffect(() => {
    if (!mcpPromise) return;
    mcpPromise.then(result => {
      if (result && result.tools) {
        toolsRef.current = [...initialTools, ...result.tools];
        mcpRef.current = result;
        addLine(`${result.tools.length} MCP tools connected`, 'system');
      }
    }).catch(() => {
      addLine('MCP servers failed to load — built-in tools only', 'system');
    });
  }, []);

  // ── Idle hint timer ───────────────────────────────────────
  useEffect(() => {
    let timer;
    const resetHint = () => {
      clearTimeout(timer);
      setIdleHint('');
      timer = setTimeout(() => {
        if (!isThinking && !streamingRef.current) {
          setIdleHint(getIdleHint(usedCommandsRef.current));
        }
      }, 8000);
    };
    resetHint();
    // Reset on any state change that indicates activity
    return () => clearTimeout(timer);
  }, [input, isThinking, streamingTick, items.length]);

  // Handle Ctrl+C
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      ctrlCRef.current++;
      if (ctrlCRef.current >= 2) {
        addLine('See you later. Go ship something great.', 'system');
        try {
          saveSessionMemory(vaultPath, messagesRef.current, {
            model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
            cost: costRef.current.cost,
            persona: personaRef.current,
          });
        } catch {}
        autoSaveSession(vaultPath, messagesRef.current, {
          model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
          cost: costRef.current.cost,
          persona: personaRef.current,
        });
        mcpRef.current.shutdown();
        setTimeout(() => { process.exit(0); }, 100);
      } else {
        addLine('Leave already? Press Ctrl+C again to confirm, or keep typing.', 'system');
      }
    } else {
      ctrlCRef.current = 0;
    }
    if (key.escape && showComplete) setShowComplete(false);
    if (key.escape && showFileComplete) setShowFileComplete(false);
    // Ctrl+D exits multi-line mode and submits
    if (key.ctrl && inputChar === 'd' && isMultiLineRef.current) {
      const fullText = multiLineBufferRef.current.join('\n');
      setIsMultiLine(false);
      multiLineBufferRef.current = [];
      setInput('');
      if (fullText.trim() && handleSubmitRef.current) handleSubmitRef.current(fullText);
    }
  });

  // Update autocomplete state
  const handleInputChange = useCallback((value) => {
    setInput(value);

    // Check for @file trigger — look for @ followed by text, not preceded by space+word
    const atMatch = value.match(/@([^\s]*)$/);
    if (atMatch) {
      // Lazily load file list on first @ trigger
      if (fileListRef.current.length === 0) {
        fileListRef.current = getVaultFileList(vaultPath);
      }
      setShowFileComplete(true);
      setFileCompleteFilter(atMatch[1]);
      setShowComplete(false);
    } else if (value.startsWith('/') && !value.includes(' ')) {
      setShowComplete(true);
      setCompleteFilter(value.slice(1));
      setShowFileComplete(false);
    } else {
      setShowComplete(false);
      setShowFileComplete(false);
    }
  }, []);

  const handleSubmitRef = useRef(null);

  const autocompleteSubmittedRef = useRef(false);
  const handleAutocompleteSelect = useCallback((item) => {
    setShowComplete(false);
    setInput('');
    // Guard: prevent TextInput onSubmit from also firing
    autocompleteSubmittedRef.current = true;
    setTimeout(() => { autocompleteSubmittedRef.current = false; }, 50);
    if (handleSubmitRef.current) handleSubmitRef.current(`/${item.name}`);
  }, []);

  // Handle @file autocomplete selection
  const handleFileCompleteSelect = useCallback((item) => {
    setShowFileComplete(false);
    if (!item) return; // Esc pressed — cancel

    // Replace the @query portion of the input with @filename
    setInput(prev => {
      const replaced = prev.replace(/@[^\s]*$/, `@${item.filename} `);
      return replaced;
    });
  }, []);

  // Handle submit
  const handleSubmit = useCallback(async (value) => {
    // Guard against double-submit from autocomplete + TextInput
    if (autocompleteSubmittedRef.current) return;
    const trimmed = value.trim();
    if (!trimmed) return;

    // ── Multi-line mode: triple-quote toggle ──────────────
    if (trimmed === '"""') {
      if (isMultiLineRef.current) {
        // Exit multi-line mode and submit the buffered content
        const fullText = multiLineBufferRef.current.join('\n');
        setIsMultiLine(false);
        multiLineBufferRef.current = [];
        setInput('');
        if (fullText.trim()) {
          if (handleSubmitRef.current) handleSubmitRef.current(fullText);
        }
        return;
      } else {
        // Enter multi-line mode
        setIsMultiLine(true);
        multiLineBufferRef.current = [];
        setInput('');
        addLine('Entering multi-line mode (type """ to submit, Ctrl+D to send)', 'system');
        return;
      }
    }

    // In multi-line mode: each Enter adds a line to the buffer instead of submitting
    if (isMultiLineRef.current) {
      multiLineBufferRef.current.push(value); // preserve raw value (not trimmed) for whitespace
      setInput('');
      return;
    }

    setInput('');
    setShowComplete(false);
    setShowFileComplete(false);
    setEphemeralHint('');
    ctrlCRef.current = 0;

    // ── Contextual action selection (1, 2, 3) ─────────────
    if (/^[1-3]$/.test(trimmed) && contextualActions.length > 0) {
      const idx = parseInt(trimmed, 10) - 1;
      if (idx < contextualActions.length) {
        const action = contextualActions[idx];
        // Record 'acted' for chosen action, 'ignored' for others
        try {
          recordSignal(vaultPath, { type: 'acted', trigger: action.trigger || 'contextual_action', action: action.text });
          for (let i = 0; i < contextualActions.length; i++) {
            if (i !== idx) recordSignal(vaultPath, { type: 'ignored', trigger: contextualActions[i].trigger || 'contextual_action', action: contextualActions[i].text });
          }
        } catch { /* feedback should never crash */ }
        clearPendingSuggestions();
        setContextualActions([]);
        // Re-submit the action's command as if the user typed it
        if (handleSubmitRef.current) handleSubmitRef.current(action.command);
        return;
      }
    }
    // Clear contextual actions on any other input — record ignores/rejections
    if (contextualActions.length > 0) {
      try {
        const sigType = isRejection(trimmed) ? 'rejected' : 'ignored';
        for (const a of contextualActions) recordSignal(vaultPath, { type: sigType, trigger: a.trigger || 'contextual_action', action: a.text });
      } catch { /* feedback should never crash */ }
    }
    setContextualActions([]);
    // Record ignored/rejected signals for pending proactive nudges
    try {
      const pending = getPendingSuggestions();
      if (pending.length > 0) {
        const sigType = isRejection(trimmed) ? 'rejected' : 'ignored';
        for (const p of pending) recordSignal(vaultPath, { type: sigType, trigger: p.trigger, action: p.action });
        clearPendingSuggestions();
      }
    } catch { /* feedback should never crash */ }

    // If there's a pending AskUser question, resolve it instead of sending to agent
    if (pendingQuestion && askUserResolveRef.current) {
      addLine(trimmed, 'user');
      const resolve = askUserResolveRef.current;
      askUserResolveRef.current = null;
      setPendingQuestion(null);
      resolve({ response: trimmed });
      return;
    }

    // ── Slash commands (don't echo to chat history) ─────────
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      switch (cmd) {
        case 'help':
          addLine('Commands: /help, /model, /status, /think, /search, /log, /commitments, /cost, /sessions, /clear, /persona, /voice train, /dance, /quit', 'system');
          const skills = listSkills(vaultPath);
          if (skills.length > 0) {
            addLine(`Skills: ${skills.map(s => '/' + s.name).join(', ')}`, 'system');
          }
          return;
        case 'quit': case 'exit':
          addLine('See you later. Go ship something great.', 'system');
          try {
            saveSessionMemory(vaultPath, messagesRef.current, {
              model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
              cost: costRef.current.cost,
              persona: personaRef.current,
            });
          } catch {}
          autoSaveSession(vaultPath, messagesRef.current, {
            model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
            cost: costRef.current.cost,
            persona: personaRef.current,
          });
          mcpRef.current.shutdown();
          setTimeout(() => { process.exit(0); }, 100);
          return;
        case 'cost': {
          const co = costRef.current;
          addLine(`Input: ${co.input.toLocaleString()} tokens | Output: ${co.output.toLocaleString()} tokens | Cost: $${co.cost.toFixed(4)}`, 'system');
          return;
        }
        case 'sessions': {
          const sessions = listSessions(vaultPath, 10);
          if (sessions.length === 0) {
            addLine('No saved sessions yet. Sessions are auto-saved when you exit.', 'system');
          } else {
            addLine(`Recent sessions (${sessions.length}):`, 'system');
            for (let si = 0; si < sessions.length; si++) {
              const s = sessions[si];
              const date = new Date(s.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
              const topic = s.summary || 'Untitled';
              addLine(`  ${si + 1}. ${date} — ${topic} (${s.messageCount} msgs)  ${s.id}`, 'system');
            }
            addLine('\nResume with: vennie --continue (latest) or vennie --session <id>', 'hint');
          }
          return;
        }
        case 'clear':
          messagesRef.current = [];
          setItems([]);
          addLine('Conversation cleared. Fresh start.', 'system');
          return;
        case 'persona': {
          const sub = args.trim().toLowerCase();
          if (!sub || sub === 'list') {
            // List available personas
            const personaDirs = ['core', 'marketplace', 'custom'];
            const personas = [];
            for (const dir of personaDirs) {
              const dirPath = path.join(vaultPath, '.vennie', 'personas', dir);
              if (fs.existsSync(dirPath)) {
                for (const file of fs.readdirSync(dirPath).filter(f => f.endsWith('.md'))) {
                  const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
                  const nameMatch = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
                  const idMatch = content.match(/^id:\s*["']?(.+?)["']?\s*$/m);
                  const bestFor = content.match(/^best_for:\s*(.+?)$/m);
                  const pName = nameMatch ? nameMatch[1] : file.replace('.md', '');
                  const pId = idMatch ? idMatch[1] : file.replace('.md', '');
                  personas.push({ name: pName, id: pId, source: dir, bestFor: bestFor ? bestFor[1].slice(0, 60) : '' });
                }
              }
            }
            if (personas.length === 0) {
              addLine('No personas found.', 'system');
            } else {
              addLine(`Available personas (${personas.length}):`, 'system');
              for (const p of personas) {
                addLine(`  /persona ${p.id} — ${p.name}${p.bestFor ? ' · ' + p.bestFor : ''}`, 'system');
              }
              if (personaRef.current) {
                addLine(`\nActive: ${personaRef.current}. Use /persona off to deactivate.`, 'system');
              }
            }
            return;
          }
          if (sub === 'off') {
            personaRef.current = null;
            addLine('Persona deactivated.', 'system');
            return;
          }
          // Activate a persona by id
          personaRef.current = sub;
          addLine(`Persona activated: ${sub}`, 'system');
          return;
        }
        case 'think': {
          thinkingRef.current = !thinkingRef.current;
          addLine(thinkingRef.current ? 'Extended thinking enabled — deeper reasoning, higher cost' : 'Extended thinking disabled', 'system');
          return;
        }
        case 'search': {
          if (!args.trim()) {
            addLine('Usage: /search <query>  — search your vault for relevant content', 'system');
            return;
          }
          addLine(`Searching vault for "${args.trim()}"...`, 'system');
          try {
            const results = searchVault(vaultPath, args.trim(), { topN: 5 });
            if (results.length === 0) {
              addLine('No results found. Try different keywords.', 'system');
            } else {
              for (const r of results) {
                const relPath = r.file.replace(vaultPath + '/', '');
                addLine(`${relPath} (score: ${r.score.toFixed(1)})`, 'system');
                addLine(`  ${r.snippet.slice(0, 120)}${r.snippet.length > 120 ? '...' : ''}`, 'hint');
              }
              addLine(`${results.length} results found`, 'system');
            }
          } catch (err) {
            addLine(`Search error: ${err.message}`, 'error');
          }
          return;
        }
        case 'reindex': {
          addLine('Rebuilding vault search index...', 'system');
          try {
            const stats = rebuildIndex(vaultPath);
            addLine(`Indexed ${stats.files} files, ${stats.chunks} chunks`, 'system');
          } catch (err) {
            addLine(`Index error: ${err.message}`, 'error');
          }
          return;
        }
        case 'status': {
          addLine(`Model: ${process.env.VENNIE_MODEL || DEFAULT_MODEL} | Tools: ${toolsRef.current.length} | Messages: ${messagesRef.current.length} | Cost: $${costRef.current.cost.toFixed(4)}`, 'system');
          try {
            const pulse = getVaultPulse(vaultPath);
            addLine(pulse.detail, 'system');
          } catch {}
          return;
        }
        case 'log': {
          const parsed = parseLogCommand(args);
          if (!parsed.content) {
            addLine('Usage: /log [decision|win|idea|note] <content>', 'system');
            addLine('  /log decision We\'re going with option A', 'hint');
            addLine('  /log win Shipped the new dashboard', 'hint');
            addLine('  /log Interesting thought about retention', 'hint');
            return;
          }
          try {
            const result = quickCapture(vaultPath, parsed.type, parsed.content);
            addLine(`\u2713 ${result.message}`, 'system');
          } catch (err) {
            addLine(`Log error: ${err.message}`, 'error');
          }
          return;
        }
        case 'brief': {
          try {
            const brief = generateMorningBrief(vaultPath);
            if (brief.topPriority) {
              addLine(`> Top priority: ${brief.topPriority}`, 'system');
            }
            addLine(formatBriefForDisplay(brief), 'text');
          } catch (err) {
            addLine(`Brief error: ${err.message}`, 'error');
          }
          return;
        }
        case 'commitments': {
          try {
            const sub = args.trim().toLowerCase();
            if (sub === 'stats') {
              const stats = getCommitmentStats(vaultPath, 30);
              addLine(`Commitments (last 30 days): ${stats.total} total, ${stats.completed} done, ${stats.overdue} overdue`, 'system');
              if (stats.avgCompletionDays > 0) addLine(`  Avg completion: ${stats.avgCompletionDays} days`, 'system');
              if (Object.keys(stats.byPerson).length > 0) {
                const top = Object.entries(stats.byPerson).sort((a, b) => b[1] - a[1]).slice(0, 5);
                addLine(`  People: ${top.map(([n, c]) => `${n} (${c})`).join(', ')}`, 'system');
              }
              return;
            }
            // "done N" or "done 1,3,5"
            const doneMatch = sub.match(/^(?:done|complete|mark)\s+(.+)/);
            if (doneMatch) {
              const ids = doneMatch[1].split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
              const open = getOpenCommitments(vaultPath);
              let completed = 0;
              for (const idx of ids) {
                const c = open[idx - 1];
                if (c && c.id) {
                  if (completeCommitment(vaultPath, c.id)) completed++;
                }
              }
              addLine(`Done! Marked ${completed} commitment${completed === 1 ? '' : 's'} as complete.`, 'system');
              return;
            }
            // Default: show open commitments
            const open = getOpenCommitments(vaultPath);
            if (open.length === 0) {
              addLine('No open commitments. Commitments are auto-detected from conversations.', 'system');
              return;
            }
            const todayStr = new Date().toISOString().split('T')[0];
            const selfItems = open.filter(c => c.owner === 'self');
            const otherItems = open.filter(c => c.owner === 'other');
            let idx = 1;
            if (selfItems.length > 0) {
              addLine(`Your commitments (${selfItems.length}):`, 'system');
              for (const c of selfItems) {
                const overdue = c.due && c.due < todayStr;
                const dueLabel = c.due ? (overdue ? `OVERDUE (${c.due})` : `due ${c.due}`) : 'no date';
                const personLabel = c.person ? ` → ${c.person}` : '';
                const marker = overdue ? '!' : ' ';
                addLine(`  ${marker}${idx}. ${c.text.slice(0, 60)}${personLabel} [${dueLabel}]`, overdue ? 'error' : 'system');
                idx++;
              }
            }
            if (otherItems.length > 0) {
              addLine(`Others owe you (${otherItems.length}):`, 'system');
              for (const c of otherItems) {
                const overdue = c.due && c.due < todayStr;
                const dueLabel = c.due ? (overdue ? `OVERDUE (${c.due})` : `due ${c.due}`) : 'no date';
                const marker = overdue ? '!' : ' ';
                addLine(`  ${marker}${idx}. ${c.person || '?'}: ${c.text.slice(0, 50)} [${dueLabel}]`, overdue ? 'error' : 'system');
                idx++;
              }
            }
            addLine('', 'system');
            addLine('Mark done: /commitments done 1,3  |  Stats: /commitments stats', 'hint');
          } catch (err) {
            addLine(`Commitments error: ${err.message}`, 'error');
          }
          return;
        }
        case 'simulate': case 'sim': {
          if (!args.trim()) {
            // List available stakeholders
            try {
              const stakeholders = listSimulatableStakeholders(vaultPath);
              if (stakeholders.length === 0) {
                addLine('No stakeholders with enough context to simulate. Build up person pages first.', 'system');
              } else {
                addLine(`Simulatable stakeholders (${stakeholders.length}):`, 'system');
                for (const s of stakeholders) {
                  addLine(`  /simulate ${s.name} — ${s.role} (${s.confidence} confidence, ${s.meetingCount} meetings)`, 'system');
                }
              }
            } catch (err) {
              addLine(`Error: ${err.message}`, 'error');
            }
            return;
          }
          // Activate simulation mode
          try {
            const sim = buildSimulationContext(vaultPath, args.trim());
            if (!sim.found) {
              addLine(`Couldn't find "${args.trim()}" in your people pages. Try /simulate to see who's available.`, 'system');
              return;
            }
            skillCtxRef.current = sim.sessionPrompt;
            lastSkillRef.current = 'simulate';
            addLine(`Simulating ${sim.personName} (${sim.role}). Chat as if you're talking to them.`, 'system');
            // Fall through to agent with simulation context
          } catch (err) {
            addLine(`Simulation error: ${err.message}`, 'error');
            return;
          }
          break; // Fall through to agent
        }
        case 'patterns': {
          addLine('Analysing your decision history...', 'system');
          try {
            const analysis = analyseDecisions(vaultPath);
            if (analysis.totalDecisions === 0) {
              addLine('No decisions found yet. Use /log decision to start capturing them.', 'system');
            } else {
              addLine(formatPatternReport(analysis), 'text');
            }
            // Check for unlogged decisions
            const missing = detectMissingContext(vaultPath);
            if (missing.length > 0) {
              addLine(`\n${missing.length} possible unlogged decision${missing.length > 1 ? 's' : ''} detected:`, 'system');
              for (const m of missing.slice(0, 3)) {
                addLine(`  ${m.hint}`, 'hint');
              }
            }
          } catch (err) {
            addLine(`Analysis error: ${err.message}`, 'error');
          }
          return;
        }
        case 'who': {
          if (!args.trim()) {
            addLine('Usage: /who knows about <topic>  — find people in your network with relevant expertise', 'system');
            return;
          }
          const topic = args.replace(/^knows?\s+(about\s+)?/i, '').trim();
          if (!topic) {
            addLine('Usage: /who knows about <topic>', 'system');
            return;
          }
          try {
            const results = findExpertise(vaultPath, topic);
            addLine(formatNetworkResponse(results, topic), 'text');
          } catch (err) {
            addLine(`Network recall error: ${err.message}`, 'error');
          }
          return;
        }
        case 'radar': {
          const sub = args.trim().toLowerCase();
          if (!sub || sub === 'status') {
            try {
              const comps = listCompetitors(vaultPath);
              if (comps.length === 0) {
                addLine('No competitors tracked yet. Add one with: /radar add <name> <url>', 'system');
              } else {
                addLine(`Tracking ${comps.length} competitor${comps.length > 1 ? 's' : ''}:`, 'system');
                for (const c of comps) {
                  const stale = c.daysSinceCheck > 1 ? ' (stale)' : '';
                  addLine(`  ${c.name}${stale} — ${c.urls.length} URL${c.urls.length > 1 ? 's' : ''}, last checked ${c.lastChecked || 'never'}`, 'system');
                }
                addLine('\nRun /radar check to scan for changes (uses web tools)', 'hint');
              }
            } catch (err) {
              addLine(`Radar error: ${err.message}`, 'error');
            }
            return;
          }
          if (sub.startsWith('add ')) {
            const addParts = args.trim().slice(4).split(/\s+/);
            const name = addParts[0];
            const urls = addParts.slice(1).filter(u => u.startsWith('http'));
            if (!name) { addLine('Usage: /radar add <name> <url1> [url2...]', 'system'); return; }
            try {
              addCompetitor(vaultPath, name, urls, ['direct']);
              addLine(`\u2713 Added ${name} to competitive radar${urls.length ? ` with ${urls.length} URL${urls.length > 1 ? 's' : ''}` : ''}`, 'system');
            } catch (err) {
              addLine(`Error: ${err.message}`, 'error');
            }
            return;
          }
          if (sub.startsWith('remove ')) {
            const name = args.trim().slice(7).trim();
            try {
              removeCompetitor(vaultPath, name);
              addLine(`\u2713 Removed ${name} from radar`, 'system');
            } catch (err) {
              addLine(`Error: ${err.message}`, 'error');
            }
            return;
          }
          if (sub === 'check') {
            // Fall through to agent — let Claude do the actual web scraping
            skillCtxRef.current = `The user wants to check their competitive radar for changes. Here are the tracked competitors:\n\n${JSON.stringify(listCompetitors(vaultPath), null, 2)}\n\nFor each competitor with URLs, use WebFetch to check their website for recent changes (new features, pricing changes, blog posts, job postings). Summarise what you find. Be specific about changes.`;
            lastSkillRef.current = 'radar';
            addLine('Scanning competitors...', 'system');
            break; // Fall through to agent
          }
          addLine('Radar commands: /radar, /radar add <name> <url>, /radar remove <name>, /radar check', 'system');
          return;
        }
        case 'gym': {
          try {
            const exercise = generateExercise(vaultPath);
            const streak = getStreak(vaultPath);
            if (streak > 1) addLine(`\uD83D\uDD25 ${streak}-day streak!`, 'system');
            addLine(formatExercise(exercise), 'text');
            addLine('\nAnswer below. Vennie will evaluate your thinking.', 'hint');
            // Set context so the agent can evaluate the answer
            skillCtxRef.current = `The user is doing a Product Sense Gym exercise. Here is the exercise:\n\n${exercise.scenario}\n\n${exercise.question}\n\nWhen the user responds, evaluate their answer like a senior PM mentor. Be specific about what's strong, what's missing, and what a great answer would include. Don't just validate — challenge and teach. After evaluating, mark the exercise as complete.`;
            lastSkillRef.current = 'gym';
          } catch (err) {
            addLine(`Gym error: ${err.message}`, 'error');
          }
          return;
        }
        case 'shipped': case 'ship': {
          if (!args.trim()) {
            addLine('Usage: /shipped <what you shipped>  — captures evidence and builds career narrative', 'system');
            addLine('  /shipped Launched the new API migration, reduced p95 latency 40%', 'hint');
            return;
          }
          try {
            const skills = suggestSkillFromDescription(args.trim());
            const result = captureShipment(vaultPath, args.trim(), { skills });
            addLine(`\u2713 ${result.message || 'Shipment captured!'}`, 'system');
            if (skills.length > 0) {
              addLine(`  Skills tagged: ${skills.join(', ')}`, 'system');
            }
            addLine('  Evidence → career timeline → resume stories. Automatic.', 'hint');
          } catch (err) {
            addLine(`Capture error: ${err.message}`, 'error');
          }
          return;
        }
        case 'career': {
          try {
            const timeline = getCareerTimeline(vaultPath, { months: 6 });
            const matrix = getSkillMatrix(vaultPath);
            if (timeline.length === 0) {
              addLine('No career evidence captured yet. Use /shipped to start building your narrative.', 'system');
            } else {
              addLine(formatCareerSummary(timeline, matrix), 'text');
            }
          } catch (err) {
            addLine(`Career error: ${err.message}`, 'error');
          }
          return;
        }
        case 'career-dashboard': {
          try {
            const snapshot = buildCareerSnapshot(vaultPath);
            const history = getSnapshotHistory(vaultPath, 1);
            const previous = history.length > 0 ? history[0] : null;
            const insights = previous ? comparePeriods(snapshot, previous) : [];
            addLine(formatDashboard(snapshot, insights), 'text');
            // Save snapshot for longitudinal tracking
            saveSnapshot(vaultPath, snapshot);
            // Show career brief
            const brief = generateCareerBrief(vaultPath);
            addLine('', 'text');
            addLine(brief, 'text');
            if (insights.length === 0 && !previous) {
              addLine('', 'text');
              addLine('First snapshot saved. Run /career-dashboard again next week to start seeing trends.', 'hint');
            }
          } catch (err) {
            addLine(`Career dashboard error: ${err.message}`, 'error');
          }
          return;
        }
        case 'career-trajectory': {
          try {
            const snapshots = getSnapshotHistory(vaultPath, 12);
            if (snapshots.length < 2) {
              addLine('Need at least 2 career snapshots for trajectory analysis.', 'system');
              addLine('Run /career-dashboard now to capture your first, then again next week.', 'hint');
              return;
            }
            addLine(formatTrajectory(snapshots), 'text');
            // Check for promotion readiness if profile has career level
            try {
              const profilePath = path.join(vaultPath, 'System', 'profile.yaml');
              if (fs.existsSync(profilePath)) {
                const profileRaw = fs.readFileSync(profilePath, 'utf8');
                const levelMatch = profileRaw.match(/career_level:\s*["']?(\w+)["']?/);
                if (levelMatch) {
                  const currentLevel = levelMatch[1].toLowerCase();
                  const nextLevel = { junior: 'senior', mid: 'senior', senior: 'lead', lead: 'director', director: 'vp' }[currentLevel];
                  if (nextLevel) {
                    const readiness = getPromotionReadiness(vaultPath, nextLevel);
                    addLine('', 'text');
                    addLine(`Promotion Readiness: ${readiness.level.charAt(0).toUpperCase() + readiness.level.slice(1)} (overall: ${readiness.readiness}/100)`, 'text');
                    if (readiness.strong.length > 0) {
                      addLine('  Strong: ' + readiness.strong.map(s => `${s.competency} (${s.score})`).join(', '), 'text');
                    }
                    if (readiness.gaps.length > 0) {
                      addLine('  Gaps: ' + readiness.gaps.map(g => `${g.competency} (${g.score})`).join(', '), 'text');
                    }
                    for (const rec of readiness.recommendations.slice(0, 2)) {
                      addLine('  ' + rec, 'hint');
                    }
                  }
                }
              }
            } catch { /* promotion readiness is optional, don't block trajectory */ }
          } catch (err) {
            addLine(`Career trajectory error: ${err.message}`, 'error');
          }
          return;
        }
        case 'challenge': case 'missing': {
          if (!args.trim()) {
            addLine('Usage: /challenge <your plan or idea>  — adversarial analysis: what are you missing?', 'system');
            return;
          }
          // Fall through to agent with challenge context
          skillCtxRef.current = `The user wants you to adversarially challenge their plan. Your job is to find what's missing, what could go wrong, and what they haven't considered.\n\nAnalyse from multiple angles:\n1. **Stakeholder blindspots** — who will object and why?\n2. **Technical risks** — what could break or scale badly?\n3. **Market assumptions** — what are you assuming about users/competitors that might be wrong?\n4. **Timeline reality** — is the schedule realistic given dependencies?\n5. **Second-order effects** — what does this change downstream?\n\nBe specific, not generic. Reference their vault context where relevant. Don't soften your critique — they asked for this.\n\nThe plan to challenge:\n${args.trim()}`;
          lastSkillRef.current = 'challenge';
          addLine('Running adversarial analysis...', 'system');
          break; // Fall through to agent
        }
        case 'retro': {
          // Deep retrospective with pre-gathered data
          const retroSkill = loadSkill(vaultPath, 'retro');
          if (!retroSkill) {
            addLine('Retro skill not found. Check .vennie/skills/core/retro.md', 'error');
            return;
          }
          const retroDays = parsePeriodDays(args.trim());
          addLine(`Gathering retro data (last ${retroDays <= 7 ? 'week' : retroDays <= 30 ? 'month' : retroDays <= 90 ? 'quarter' : retroDays + ' days'})...`, 'system');
          try {
            const retroData = gatherRetroData(vaultPath, retroDays);
            const personBreakdown = generatePersonBreakdown(vaultPath, retroDays);
            const patterns = detectPatterns(retroData);
            const retroContext = formatRetroContext(retroData, personBreakdown, patterns);
            skillCtxRef.current = retroSkill.body + '\n\n---\n\n' + retroContext;
            lastSkillRef.current = 'retro';
            usedCommandsRef.current.push('retro');
            try { markFeatureDiscovered(vaultPath, 'retro'); } catch {}
            runHooks('before', 'retro', { vaultPath, model: process.env.VENNIE_MODEL || DEFAULT_MODEL }).catch(() => {});
            const summary = [];
            summary.push(`${retroData.meetings.length} meetings`);
            summary.push(`${retroData.completedTasks.length} completed tasks`);
            summary.push(`${retroData.decisions.length} decisions`);
            summary.push(`${personBreakdown.length} people`);
            addLine(`Found: ${summary.join(', ')}`, 'system');
          } catch (err) {
            addLine(`Retro data error: ${err.message}`, 'error');
            // Fall back to skill-only mode (agent will gather data itself)
            skillCtxRef.current = retroSkill.body;
            lastSkillRef.current = 'retro';
          }
          break; // Fall through to agent
        }
        case 'model': {
          const arg = args.trim().toLowerCase();
          const currentModelId = process.env.VENNIE_MODEL || DEFAULT_MODEL;

          if (!arg) {
            // Show current model + routing info
            addLine(getRoutingInfo(currentModelId, autoRoutingRef.current), 'system');
            addLine('', 'system');
            addLine('Switch: /model opus, /model sonnet, /model haiku, /model auto', 'system');
            return;
          }

          if (arg === 'auto') {
            autoRoutingRef.current = true;
            // Clear manual override so auto-routing takes effect
            delete process.env.VENNIE_MODEL;
            addLine('Auto-routing enabled — model will be chosen per task', 'system');
            return;
          }

          // Switch to a specific model
          const MODEL_ALIASES = {
            'sonnet': 'claude-sonnet-4-6',
            'sonnet4.6': 'claude-sonnet-4-6',
            'opus': 'claude-opus-4-6',
            'opus4.6': 'claude-opus-4-6',
            'haiku': 'claude-haiku-4-5-20251001',
            'haiku4.5': 'claude-haiku-4-5-20251001',
          };
          const resolved = MODEL_ALIASES[arg] || arg;
          const prevModelId = currentModelId;
          process.env.VENNIE_MODEL = resolved;
          autoRoutingRef.current = false; // Manual override disables auto-routing

          const displayName = getModelDisplayName(resolved);
          addLine(`Model switched to ${displayName} (${resolved})`, 'system');

          // Show cost comparison
          const costComp = formatCostComparison(prevModelId, resolved);
          if (costComp) addLine(costComp, 'system');
          addLine('Use /model auto to re-enable smart routing', 'hint');
          return;
        }
        default: {
          const skill = loadSkill(vaultPath, cmd);
          if (skill) {
            skillCtxRef.current = skill.body;
            lastSkillRef.current = cmd;
            usedCommandsRef.current.push(cmd);
            // Record skill_followed if this skill was suggested by intent detection
            try {
              const suggested = lastSuggestedIntentRef.current;
              if (suggested && suggested.skill === cmd && (Date.now() - suggested.timestamp) < 120000) {
                recordSignal(vaultPath, { type: 'skill_followed', trigger: 'intent:' + cmd, action: cmd });
              }
              lastSuggestedIntentRef.current = null;
            } catch { /* feedback should never crash */ }
            // Track feature discovery for progressive onboarding
            try { markFeatureDiscovered(vaultPath, cmd); } catch {}
            // Run before hooks (fire-and-forget, don't block)
            runHooks('before', cmd, { vaultPath, model: process.env.VENNIE_MODEL || DEFAULT_MODEL }).catch(() => {});
            // Fall through to agent — skill context will be prepended to the message
          } else {
            addLine(`Unknown command: /${cmd}. Type /help for commands.`, 'system');
            return;
          }
        }
      }
    }

    // ── Intent detection (non-slash messages only) ────────
    if (!trimmed.startsWith('/') && !skillCtxRef.current) {
      // Check for interactive framework triggers first
      const fwMatch = detectFramework(trimmed);
      if (fwMatch && fwMatch.confidence >= 0.75 && !activeFrameworkRef.current) {
        // Activate the framework — overlay persists across turns
        activeFrameworkRef.current = fwMatch;
        addLine(formatFrameworkSuggestion(fwMatch), 'system');
      } else if (!fwMatch || fwMatch.confidence < 0.75) {
        // Fall back to skill intent detection
        const intent = detectIntent(trimmed);
        if (intent && intent.confidence >= 0.7) {
          addLine(formatIntentSuggestion(intent), 'hint');
          // Track suggested skill for feedback signals (skill_followed vs skill_ignored)
          lastSuggestedIntentRef.current = { skill: intent.skill, timestamp: Date.now() };
        }
      }

      // Clear active framework if user signals they're done
      if (activeFrameworkRef.current) {
        const doneSignal = /\b(done|finished|that(?:'s| is) (?:it|all|enough)|move on|new topic|never ?mind|cancel|stop)\b/i;
        if (doneSignal.test(trimmed)) {
          addLine(`Wrapping up ${activeFrameworkRef.current.framework.name}. Back to normal.`, 'system');
          activeFrameworkRef.current = null;
        }
      }
    }

    // ── Exit active skill session ──────────────────────────
    if (lastSkillRef.current && !skillCtxRef.current) {
      const exitSignal = /^\s*(done|exit|quit|wrap up|that'?s? (?:it|all|enough)|move on|new topic|never ?mind|\/exit|\/done)\s*$/i;
      if (exitSignal.test(trimmed)) {
        addLine(`Wrapped up /${lastSkillRef.current}. Back to normal chat.`, 'system');
        lastSkillRef.current = null;
        return;
      }
    }

    // Record skill_ignored if user bypasses an intent-suggested skill
    try {
      const suggested = lastSuggestedIntentRef.current;
      if (suggested && !trimmed.startsWith('/') && (Date.now() - suggested.timestamp) < 120000) {
        recordSignal(vaultPath, { type: 'skill_ignored', trigger: 'intent:' + suggested.skill, action: suggested.skill });
        lastSuggestedIntentRef.current = null;
      }
    } catch { /* feedback should never crash */ }

    // ── Send to agent ──────────────────────────────────────
    lastUserInputRef.current = trimmed;
    phaseTrackerRef.current.recordTurn(trimmed.length, null);
    phaseTrackerRef.current.setActiveSkill(lastSkillRef.current);
    addLine(trimmed, 'user');
    setIsThinking(true);
    setThinkingStart(Date.now());

    let userContent = trimmed;
    if (skillCtxRef.current) {
      userContent = `${skillCtxRef.current}\n\n---\n\nUser request: ${trimmed}`;
      skillCtxRef.current = null;
    }

    // Parse @file references — inject file content into context
    const fileRefs = parseFileReferences(userContent, vaultPath);
    if (fileRefs.files.length > 0) {
      userContent = fileRefs.cleanInput;
      for (const f of fileRefs.files) {
        addLine(`@${f.filename} injected`, 'system');
      }
    }

    messagesRef.current.push({ role: 'user', content: userContent });

    // Build learnings context from current message and active skill
    const learningsContext = {
      topic: trimmed.slice(0, 200),
      skillName: lastSkillRef.current || undefined,
    };
    // Extract person names heuristically (capitalized two-word sequences)
    const nameMatches = trimmed.match(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g);
    if (nameMatches) learningsContext.personNames = [...new Set(nameMatches)];

    // Pre-flight context gathering — silently enrich with vault knowledge
    // Skip when a skill injected its own context (userContent !== trimmed)
    let preflightResult = null;
    if (userContent === trimmed) {
      try {
        preflightResult = gatherPreflightContext(vaultPath, trimmed, {
          activeSkill: lastSkillRef.current || undefined,
          userName: userName || undefined,
        });
      } catch {}
    }

    // Response length calibration — detect ideal depth before building prompt
    const isFollowUp = detectFollowUp(trimmed, messagesRef.current);
    const calibration = calibrateResponse(trimmed, {
      activeSkill: lastSkillRef.current || undefined,
      conversationLength: messagesRef.current.length,
      isFollowUp,
    });

    // Energy/intent detection — tune tone to match user's vibe
    const energyResult = detectEnergy(trimmed, {
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      turnCount: messagesRef.current.length,
    });
    const timeContext = detectTimeContext();
    const energyParts = [];
    if (energyResult.instruction) energyParts.push(energyResult.instruction);
    if (timeContext.hint) energyParts.push(timeContext.hint);
    const energyInstruction = energyParts.length > 0 ? energyParts.join('\n') : undefined;

    let systemPrompt = buildSystemPrompt(vaultPath, personaRef.current, learningsContext, {
      calibrationInstruction: calibration.instruction,
      preflightContext: preflightResult?.context || undefined,
      energyInstruction,
    });

    // Inject @file content into system prompt
    if (fileRefs.files.length > 0) {
      systemPrompt += formatFileContext(fileRefs.files);
    }

    // Inject session memory context (only on first message of session)
    if (messagesRef.current.length === 1) {
      try {
        const memCtx = getMemoryContext(vaultPath, { days: 7 });
        if (memCtx) systemPrompt += `\n\n${memCtx}`;
      } catch {}
    }

    // Inject persona memory when a persona is active
    if (personaRef.current) {
      try {
        const pCtx = getPersonaContext(vaultPath, personaRef.current);
        if (pCtx) systemPrompt += `\n\n${pCtx}`;
        // Track persona session usage
        if (messagesRef.current.length === 1) {
          incrementSessionCount(vaultPath, personaRef.current);
        }
      } catch {}
    }

    // Auto-context injection — enriches every message with relevant vault context
    if (shouldInjectContext(trimmed)) {
      try {
        const ctx = gatherContext(vaultPath, trimmed);
        const ctxBlock = formatContextBlock(ctx);
        if (ctxBlock) systemPrompt += `\n\n${ctxBlock}`;
      } catch {}
    }

    // Inject active framework overlay — persists across turns until user says "done"
    if (activeFrameworkRef.current) {
      systemPrompt += `\n\n---\n${activeFrameworkRef.current.framework.systemPromptOverlay}`;
    }

    // Inject conversation phase instruction — adjusts tone based on session depth
    const phaseInstruction = getPhaseInstruction(phaseTrackerRef.current.getPhase().phase);
    if (phaseInstruction) {
      systemPrompt += `\n\n---\n## Conversation Phase\n${phaseInstruction}`;
    }

    const toolContext = {
      vaultPath,
      personaName: personaRef.current,
      mcpCallTool: mcpRef.current.callTool,
      askUser: (question) => {
        return new Promise((resolve) => {
          addLine(question, 'question');
          setIsThinking(false);
          setPendingQuestion(true);
          askUserResolveRef.current = resolve;
        });
      },
    };

    async function execTool(name, inp) {
      return executeTool(name, inp, toolContext);
    }

    // Citation tracking for this response
    const citationMgr = createCitationManager();

    // Model selection — auto-route or use manual override
    let selectedModel;
    if (autoRoutingRef.current && !process.env.VENNIE_MODEL) {
      selectedModel = routeModel(trimmed, lastSkillRef.current, { vaultPath });
    } else {
      selectedModel = process.env.VENNIE_MODEL || DEFAULT_MODEL;
    }

    try {
      const activeSkillName = lastSkillRef.current;
      const stream = agentLoop(messagesRef.current, toolsRef.current, systemPrompt, {
        executeTool: execTool,
        thinking: thinkingRef.current,
        model: selectedModel,
        activeSkill: activeSkillName || null,
        vaultPath,
      });

      let firstText = true;
      let currentText = ''; // Current streaming segment
      const allSegments = []; // Collect text + tool summaries — commit to Static ONLY on done
      let thinkingText = '';

      for await (const event of stream) {
        switch (event.type) {
          case 'thinking_delta':
            if (firstText) { setIsThinking(false); addLine('', 'label'); firstText = false; }
            thinkingText += event.text;
            break;
          case 'text_delta':
            if (firstText) { setIsThinking(false); addLine('', 'label'); firstText = false; }
            if (thinkingText) { addLine(thinkingText, 'thinking'); thinkingText = ''; }
            currentText += event.text;
            streamingRef.current = currentText;
            tickStreaming();
            break;
          case 'turn_progress': {
            // Stash current text + finalize previous step tools
            if (currentText) { allSegments.push({ type: 'text', content: currentText }); currentText = ''; streamingRef.current = ''; }
            if (stepToolsRef.current.length > 0) {
              allSegments.push({ type: 'tool_summary', content: formatToolStepSummary(stepToolsRef.current, currentStepRef.current) });
              stepToolsRef.current = [];
            }
            currentStepRef.current = event.turn;
            activeToolsRef.current = [];
            tickStreaming();
            break;
          }
          case 'tool_start': {
            setIsThinking(false);
            if (firstText) { addLine('', 'label'); firstText = false; }
            // Stash text before tools — don't commit to Static yet
            if (currentText) {
              allSegments.push({ type: 'text', content: currentText });
              currentText = '';
              if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
              streamingRef.current = '';
            }
            const toolInfo = describeToolCall(event.name, event.input);
            activeToolsRef.current = [...activeToolsRef.current, { ...toolInfo, startTime: Date.now() }];
            tickStreaming();
            break;
          }
          case 'tool_result': {
            const toolInfo = describeToolCall(event.name, {});
            const active = activeToolsRef.current.find(t => t.name === toolInfo.name);
            const duration = event.duration || (active ? Date.now() - active.startTime : 0);
            stepToolsRef.current.push({ ...toolInfo, context: active?.context || toolInfo.context, duration, success: event.success });
            activeToolsRef.current = activeToolsRef.current.filter(t => t !== active);
            tickStreaming();
            break;
          }
          case 'citations':
            for (const src of event.sources) citationMgr.add(src);
            break;
          case 'checkpoint':
            break;
          case 'usage':
            costRef.current.input += event.inputTokens;
            costRef.current.output += event.outputTokens;
            costRef.current.cost += event.cost;
            break;
          case 'error':
            setIsThinking(false);
            addLine(event.message, 'error');
            break;
          case 'done': {
            setIsThinking(false);
            // Stash final text + tool summary
            if (currentText) allSegments.push({ type: 'text', content: currentText });
            if (stepToolsRef.current.length > 0) {
              allSegments.push({ type: 'tool_summary', content: formatToolStepSummary(stepToolsRef.current, currentStepRef.current) });
            }
            stepToolsRef.current = [];
            activeToolsRef.current = [];
            currentStepRef.current = 0;

            // Clear streaming BEFORE committing to Static
            if (streamFlushRef.current) { clearTimeout(streamFlushRef.current); streamFlushRef.current = null; }
            streamingRef.current = '';

            // Commit ALL segments to Static in ONE state update — prevents flash of both
            const newItems = allSegments.map(seg => ({
              id: idRef.current++,
              text: seg.content,
              type: seg.type,
            }));
            setItems(prev => [...prev, ...newItems]);
            setStreamingTick(t => t + 1);

            const fullResponseText = allSegments.filter(s => s.type === 'text').map(s => s.content).join('');
            if (fullResponseText) {

              // Record response turn for phase tracking
              phaseTrackerRef.current.recordTurn(null, fullResponseText.length);
              const currentPhase = phaseTrackerRef.current.getPhase();

              // Show citations if any sources were collected
              if (citationMgr.hasAny()) {
                const sources = citationMgr.getSources();
                const citationText = sources.map((s, i) => {
                  const num = `[${i + 1}]`;
                  if (s.type === 'file') return `${num} ${s.filename} (${s.lines})`;
                  if (s.type === 'search') return `${num} Search: "${s.pattern}" (${s.matchCount} matches)`;
                  if (s.type === 'glob') return `${num} ${s.fileCount} files matching ${s.pattern}`;
                  return `${num} ${s.type}`;
                }).join('\n');
                addLine(citationText, 'citations');
              }

              // Post-response contextual actions — replaces static hints (skip in deep/quick phases)
              interactionCountRef.current++;
              if (currentPhase.phase !== 'deep' && currentPhase.phase !== 'quick') {
                // Build lightweight vault state for fallback suggestions
                const today = new Date().toISOString().split('T')[0];
                const meetingsDir = path.join(vaultPath, '00-Inbox', 'Meetings');
                let hasUnprocessedMeetings = false;
                try { hasUnprocessedMeetings = fs.existsSync(meetingsDir) && fs.readdirSync(meetingsDir).some(f => f.endsWith('.md')); } catch {}
                const hasDailyPlan = [
                  path.join(vaultPath, '02-Week_Priorities', `${today}.md`),
                  path.join(vaultPath, '00-Inbox', `Daily_Plan_${today}.md`),
                ].some(p => fs.existsSync(p));
                const hasTasks = fs.existsSync(path.join(vaultPath, '03-Tasks', 'Tasks.md'));

                const actions = generateContextualActions(
                  fullResponseText,
                  lastUserInputRef.current,
                  { hasUnprocessedMeetings, hasDailyPlan, hasTasks },
                  vaultPath,
                );
                if (actions.length > 0) {
                  setContextualActions(actions);
                  setEphemeralHint('');
                  // Track shown contextual actions for feedback signals
                  try { recordSuggestionShown(vaultPath, actions.map(a => ({ trigger: a.trigger || 'contextual_action', action: a.text }))); } catch { /* non-critical */ }
                } else if (lastSkillRef.current) {
                  // Fall back to skill chaining for skill completions with no contextual match
                  const suggestions = getResponseSuggestions(fullResponseText, lastSkillRef.current, usedCommandsRef.current);
                  if (suggestions.length > 0) {
                    setEphemeralHint(`next: ${suggestions.join('  ·  ')}`);
                  }
                } else {
                  // Progressive onboarding — check for milestone to surface
                  let milestoneShown = false;
                  try {
                    const milestone = checkMilestones(vaultPath, {
                      userMessage: lastUserInputRef.current || '',
                      responseText: fullResponseText,
                    });
                    if (milestone) {
                      setEphemeralHint(milestone.message);
                      milestoneShown = true;
                    }
                  } catch {}
                  // Fall back to onboarding breadcrumbs every 3rd interaction
                  if (!milestoneShown && interactionCountRef.current % 3 === 0) {
                    const tip = getOnboardingTip(usedCommandsRef.current);
                    if (tip) {
                      setEphemeralHint(`${tip.cmd} — ${tip.tip}`);
                    }
                  }
                }
              }
              // ── Proactive triggers — gentle nudges based on conversation context ──
              // Filtered by conversation phase to avoid interrupting deep work
              try {
                const tracker = conversationTrackerRef.current;
                tracker.addTurn(lastUserInputRef.current, fullResponseText);
                const proactiveTriggers = detectProactiveTriggers(
                  lastUserInputRef.current, fullResponseText, vaultPath, { tracker, userName }
                );
                const shownNudges = [];
                for (const trigger of proactiveTriggers) {
                  if (shouldShowNudge(currentPhase.phase, trigger.priority)) {
                    addLine(formatTriggerNudge(trigger), 'proactive_nudge');
                    shownNudges.push({ trigger: trigger.type, action: trigger.action });
                  }
                }
                // Track shown nudges so we can detect ignores on next user input
                if (shownNudges.length > 0) {
                  try { recordSuggestionShown(vaultPath, shownNudges); } catch { /* non-critical */ }
                }
              } catch {
                // Non-critical — never block the response for a nudge failure
              }

              // ── Silent commitment extraction — auto-detect promises ──
              try {
                const combinedText = `${lastUserInputRef.current || ''}\n${fullResponseText}`;
                const detected = extractCommitments(combinedText, lastSkillRef.current ? `skill:${lastSkillRef.current}` : 'conversation');
                for (const c of detected) {
                  saveCommitment(vaultPath, c);
                }
              } catch {
                // Commitment tracking should never crash the app
              }

              // Write skill artifact for chaining (fire-and-forget)
              if (activeSkillName && fullResponseText) {
                try {
                  writeArtifact(vaultPath, {
                    skill: activeSkillName,
                    type: inferArtifactType(activeSkillName),
                    content: fullResponseText,
                  });
                } catch {
                  // Artifact writing should never crash the app
                }
              }

              // Opportunistic artifact cleanup (~1% of runs)
              if (Math.random() < 0.01) {
                try { cleanupOldArtifacts(vaultPath, 30); } catch {}
              }

              // Run after hooks for completed skill (fire-and-forget)
              if (lastSkillRef.current) {
                runHooks('after', lastSkillRef.current, { vaultPath, model: process.env.VENNIE_MODEL || DEFAULT_MODEL }).catch(() => {});
              }
              lastSkillRef.current = null;
            }
            break;
          }
        }
      }
    } catch (err) {
      setIsThinking(false);
      addLine(`Unexpected error: ${err.message}`, 'error');
    }
  }, [vaultPath, addLine]);

  // Keep ref in sync for autocomplete
  handleSubmitRef.current = handleSubmit;

  const { stdout } = useStdout();
  const cols = stdout?.columns || 80;

  // ── Render ─────────────────────────────────────────────────
  return e(Box, { flexDirection: 'column' },

    // ── Static area: committed messages (rendered once, scroll up) ───
    e(Static, { items: items },
      (item) => {
        // User input — bold, stands out clearly
        if (item.type === 'user') return e(Box, { key: item.id, paddingLeft: 1, marginTop: 1 },
          e(Text, { bold: true, color: WHITE }, `❯ ${item.text}`),
        );
        // Label — just a small spacer before response, no "vennie" text
        if (item.type === 'label') return e(Box, { key: item.id, height: 1 });
        // Tool summary — one compact line per step (replaces individual tool lines)
        if (item.type === 'tool_summary') return e(Box, { key: item.id, paddingLeft: 5 }, e(Text, { color: DIM }, item.text));
        // Legacy tool types — keep for backwards compat but shouldn't appear anymore
        if (item.type === 'tool' || item.type === 'tool_done' || item.type === 'tool_error') return e(Box, { key: item.id, paddingLeft: 5 }, e(Text, { color: DIM }, `  ${item.text}`));
        // Skip previews in history — too noisy
        if (item.type === 'preview') return e(Box, { key: item.id });
        // Progress — skip in history, handled by tool summaries
        if (item.type === 'progress') return e(Box, { key: item.id });
        if (item.type === 'checkpoint') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: DIM_BLUE }, `  ${item.text}`));
        // Citations — compact
        if (item.type === 'citations') return e(Box, { key: item.id, flexDirection: 'column', paddingLeft: 3 },
          ...item.text.split('\n').map((line, li) => e(Text, { key: li, color: DIM }, `  ${line}`)),
        );
        // Standard types
        if (item.type === 'error') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: 'red', bold: true }, `✗ ${item.text}`));
        if (item.type === 'system') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: DIM_BLUE }, item.text));
        if (item.type === 'question') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: '#d787ff' }, `? ${item.text}`));
        // Proactive nudges — gentle suggestions below the response
        if (item.type === 'proactive_nudge') return e(Box, { key: item.id, paddingLeft: 3 },
          e(Text, { color: '#d7af5f' }, item.text),
        );
        // Welcome suggestions — visible on startup
        if (item.type === 'welcome_suggestion') return e(Box, { key: item.id, paddingLeft: 3 },
          e(Text, { color: DIM_BLUE }, '→  '), e(Text, { color: CYAN }, item.text),
        );
        // Ambient insight — subtle, dim aside
        if (item.type === 'insight') return e(Box, { key: item.id, paddingLeft: 3 },
          e(Text, { color: DIM, italic: true }, `  \u2139 ${item.text}`),
        );
        // Post-response suggestions/hints/tips — skip in history (ephemeral only)
        if (item.type === 'suggestion') return e(Box, { key: item.id });
        if (item.type === 'hint') return e(Box, { key: item.id });
        if (item.type === 'tip') return e(Box, { key: item.id });
        // Thinking — compact, dim
        if (item.type === 'thinking') return e(Box, { key: item.id, paddingLeft: 5 },
          e(Text, { color: DIM }, `[thinking] ${item.text.slice(0, 150)}${item.text.length > 150 ? '…' : ''}`),
        );
        // text (response) — render with markdown formatting
        return e(Box, { key: item.id, paddingLeft: 3 }, e(MarkdownText, { text: item.text, indent: '' }));
      }
    ),

    // ── Dynamic area: active tools + streaming text ──────
    // Active tools — shown while running, replaced by summary when done
    activeToolsRef.current.length > 0 ? e(Box, { flexDirection: 'column', paddingLeft: 5 },
      ...activeToolsRef.current.map((t, i) => {
        const elapsed = Date.now() - t.startTime;
        const ctx = t.context ? ` ${t.context}` : '';
        return e(Text, { key: i, color: DIM }, `  ⏵ ${t.name}${ctx} ${elapsed > 500 ? `${Math.round(elapsed / 100) / 10}s` : ''}`);
      }),
    ) : null,

    // Completed tools in current step (not yet committed to Static)
    stepToolsRef.current.length > 0 && activeToolsRef.current.length > 0 ? e(Box, { paddingLeft: 5 },
      e(Text, { color: DIM }, `  ${stepToolsRef.current.length} done`),
    ) : null,

    // Streaming response text — plain Text during streaming (fast), MarkdownText only in Static
    streamingRef.current ? e(Box, { paddingLeft: 3 }, e(Text, { wrap: 'wrap' }, `   ${streamingRef.current}`)) : null,

    // Spinner — only show when thinking and no active tools visible
    isThinking && activeToolsRef.current.length === 0 ? e(SpinnerWidget, { startTime: thinkingStart }) : null,

    // ── Separator ────────────────────────────────────────────
    e(Box, null, e(Text, { color: DIM_BLUE }, '─'.repeat(cols))),

    // ── Multi-line buffer preview ────────────────────────────
    isMultiLine && multiLineBufferRef.current.length > 0
      ? e(Box, { flexDirection: 'column', paddingLeft: 3 },
          ...multiLineBufferRef.current.map((line, i) =>
            e(Text, { key: `ml-${i}`, color: DIM }, `  ${line}`)
          ),
        )
      : null,

    // ── Input ────────────────────────────────────────────────
    e(Box, { paddingLeft: 3 },
      e(Text, { color: isMultiLine ? YELLOW : CYAN, bold: true }, isMultiLine ? '... ' : '> '),
      e(TextInput, { value: input, onChange: handleInputChange, onSubmit: handleSubmit, focus: !isThinking }),
    ),

    // ── Bottom separator ─────────────────────────────────────
    e(Box, null, e(Text, { color: DIM_BLUE }, '─'.repeat(cols))),

    // ── Autocomplete, file autocomplete, contextual actions, ephemeral hint, or idle hint ──────
    showFileComplete
      ? e(FileAutocomplete, { files: fileListRef.current, filter: fileCompleteFilter, onSelect: handleFileCompleteSelect })
      : showComplete
        ? e(Autocomplete, { commands: allCommands, filter: completeFilter, onSelect: handleAutocompleteSelect })
        : isMultiLine
          ? e(Box, { paddingLeft: 3 }, e(Text, { color: DIM }, 'multi-line mode: type """ to submit or Ctrl+D to send'))
          : contextualActions.length > 0
            ? e(Box, { paddingLeft: 3, flexDirection: 'column' },
                ...contextualActions.map((action, i) =>
                  e(Box, { key: `ca-${i}` },
                    e(Text, { color: DIM_BLUE }, `${i + 1}. `),
                    e(Text, { color: DIM }, action.text),
                  )
                ),
              )
            : ephemeralHint
              ? e(Box, { paddingLeft: 3 }, e(Text, { color: DIM }, ephemeralHint))
              : (idleHint && !input && !isThinking && !streamingRef.current)
                ? e(Box, { paddingLeft: 3 }, e(Text, { color: DIM }, `try: ${idleHint}`))
                : e(Text, null, ''),

    // ── Status Line ─────────────────────────────────────────
    e(StatusLine, {
      model: process.env.VENNIE_MODEL || DEFAULT_MODEL,
      toolCount: toolsRef.current.length,
      cost: costRef.current.cost,
      inputTokens: costRef.current.input,
      outputTokens: costRef.current.output,
      vaultPath,
    }),
  );
}

// ── Status Line Component ───────────────────────────────────────────────
// Persistent bar at the bottom — model, tools, cost, tokens, vault path.

function StatusLine({ model, toolCount, cost, inputTokens, outputTokens, vaultPath }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns || 80;

  const shortModel = (model || '')
    .replace('claude-', '')
    .replace('-20250514', '')
    .replace('-4-6', ' 4.6')
    .replace('-4-5-20251001', ' 4.5');

  const parts = [];
  parts.push(shortModel);
  if (toolCount) parts.push(`${toolCount} tools`);
  if (cost > 0) parts.push(`$${cost.toFixed(4)}`);
  if (inputTokens > 0) {
    const inK = (inputTokens / 1000).toFixed(1);
    const outK = ((outputTokens || 0) / 1000).toFixed(1);
    parts.push(`${inK}k↑ ${outK}k↓`);
  }

  const home = require('os').homedir();
  const shortPath = vaultPath?.startsWith(home) ? '~' + vaultPath.slice(home.length) : vaultPath;
  parts.push(shortPath || '');

  const line = parts.join(' │ ');

  return e(Box, null,
    e(Text, { color: DIM }, ` ${line}${''.padEnd(Math.max(0, cols - line.length - 2))}`),
  );
}

// ── Start ──────────────────────────────────────────────────────────────────

const MODEL_FRIENDLY = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
};

async function startInkApp(vaultPath, version, resumedSession) {
  const modelId = process.env.VENNIE_MODEL || DEFAULT_MODEL;
  const modelName = MODEL_FRIENDLY[modelId] || modelId;

  // Print welcome mascot BEFORE Ink takes over (this stays above the Ink region)
  const fgV = '\x1b[38;5;44m';
  const fgDim = '\x1b[38;5;67m';
  const bold = '\x1b[1m';
  const reset = '\x1b[0m';
  const fgLink = '\x1b[38;5;75m';  // brighter blue for links
  const uline = '\x1b[4m';
  const link = `${fgLink}${uline}\x1b]8;;https://mindtheproduct.com\x1b\\Mind the Product\x1b]8;;\x1b\\${reset}`;
  const vennieLink = `${fgLink}${uline}\x1b]8;;https://vennie.ai\x1b\\vennie.ai\x1b]8;;\x1b\\${reset}`;
  const infoLines = [
    `${bold}\x1b[36mVennie${reset} ${fgDim}v${version}${reset}`,
    `${fgDim}Your AI product operating system, by ${link}`,
    `${fgDim}${modelName} \u00B7 ${vennieLink}`,
    '', '',
  ];

  // ── Animated welcome with wink + sparkles ──────────────────
  const ESC = '\x1b[';
  const fgSparkle = `${ESC}38;5;228m`; // warm yellow

  const mascotFrames = [
    // Frame 0: normal
    MASCOT_LINES,
    // Frame 1: sparkles appear
    [
      `${fgSparkle}✦${fgV} ${MASCOT_LINES[0].trim()} ${fgSparkle}✦${reset}`,
      `  ${MASCOT_LINES[1]}`,
      `${MASCOT_LINES[2]}`,
      `  ${MASCOT_LINES[3]}`,
      `  ${MASCOT_LINES[4]}`,
    ],
    // Frame 2: wink (replace left eye)
    [
      `${fgSparkle}✧${fgV} ${MASCOT_LINES[0].trim()} ${fgSparkle}✧${reset}`,
      `  ${fgV}\u2588\u2500\u2500\u2588\u2588\u2580\u2580\u2588${reset}`,
      `${MASCOT_LINES[2]}`,
      `  ${MASCOT_LINES[3]}`,
      `  ${MASCOT_LINES[4]}`,
    ],
    // Frame 3: sparkles + smile
    [
      `${fgSparkle} \u00B7${fgV} ${MASCOT_LINES[0].trim()} ${fgSparkle}\u00B7${reset}`,
      `  ${MASCOT_LINES[1]}`,
      `${MASCOT_LINES[2]}`,
      `  ${MASCOT_LINES[3]}`,
      `  ${MASCOT_LINES[4]}`,
    ],
    // Frame 4: settle back to normal
    MASCOT_LINES,
  ];

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rows = MASCOT_LINES.length;

  // Draw initial frame with info
  console.log();
  for (let i = 0; i < rows; i++) {
    console.log(`   ${fgV}${MASCOT_LINES[i]}${reset}  ${infoLines[i] || ''}`);
  }

  // Animate — non-blocking, short and sweet
  for (let f = 1; f < mascotFrames.length; f++) {
    await sleep(f === 2 ? 200 : 150);
    process.stdout.write(`\x1b[${rows}A`); // move cursor up
    for (let i = 0; i < rows; i++) {
      const line = typeof mascotFrames[f][i] === 'string' && mascotFrames[f][i].includes('\x1b')
        ? mascotFrames[f][i]
        : `${fgV}${mascotFrames[f][i]}${reset}`;
      process.stdout.write(`\r\x1b[K   ${line}  ${infoLines[i] || ''}\n`);
    }
  }
  console.log();

  // ── Fast startup: built-in tools first, MCP in background ──
  const builtInTools = getToolDefinitions();

  // Vault pulse — show accumulated value (instant, local files only)
  let pulseMsg = '';
  try {
    const pulse = getVaultPulse(vaultPath);
    pulseMsg = pulse.message;
  } catch {}

  console.log(`   ${fgDim}${builtInTools.length} tools ready \u00B7 loading MCP servers...${reset}`);
  if (pulseMsg) console.log(`   ${fgDim}${pulseMsg}${reset}`);
  console.log();

  // Silently prune old session memories (>30 days)
  try { pruneOldMemories(vaultPath, 30); } catch {}

  // Build command list for autocomplete
  const builtInCommands = [
    { name: 'help', description: 'Show available commands and skills' },
    { name: 'model', description: 'Switch model (sonnet, opus, haiku)' },
    { name: 'status', description: 'Show session status' },
    { name: 'persona', description: 'Switch active persona' },
    { name: 'voice', description: 'Voice training and style' },
    { name: 'dance', description: 'Make vennie dance' },
    { name: 'think', description: 'Toggle extended thinking mode' },
    { name: 'search', description: 'Search your vault (BM25 keyword search)' },
    { name: 'reindex', description: 'Rebuild vault search index' },
    { name: 'log', description: 'Quick capture: /log [decision|win|idea|note] text' },
    { name: 'brief', description: 'Morning brief — your day at a glance' },
    { name: 'commitments', description: 'View and manage tracked commitments' },
    { name: 'simulate', description: 'Roleplay as a stakeholder from your vault' },
    { name: 'patterns', description: 'Analyse your decision-making patterns' },
    { name: 'who', description: 'Find expertise: /who knows about <topic>' },
    { name: 'radar', description: 'Competitive intelligence radar' },
    { name: 'gym', description: 'Product sense training exercise' },
    { name: 'shipped', description: 'Capture a shipment for career evidence' },
    { name: 'career', description: 'View your career timeline and skill matrix' },
    { name: 'challenge', description: 'Adversarial analysis: what are you missing?' },
    { name: 'sessions', description: 'List recent saved sessions' },
    { name: 'cost', description: 'Show session cost breakdown' },
    { name: 'clear', description: 'Clear conversation history' },
    { name: 'quit', description: 'Exit Vennie' },
  ];
  const skillCommands = listSkills(vaultPath).map(s => ({ name: s.name, description: s.description }));
  const allCommands = [...builtInCommands, ...skillCommands].sort((a, b) => a.name.localeCompare(b.name));

  // Read user's name from profile (used for excluding self from person detection)
  let userName = '';
  try {
    const profilePath = path.join(vaultPath, 'System', 'profile.yaml');
    if (fs.existsSync(profilePath)) {
      const profileRaw = fs.readFileSync(profilePath, 'utf8');
      const nameMatch = profileRaw.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      if (nameMatch && nameMatch[1]) userName = nameMatch[1];
    }
  } catch {}

  // Generate welcome suggestions based on vault state
  const welcomeData = getWelcomeSuggestions(vaultPath);

  // Morning brief — auto-generated, zero-prompt value
  let morningBrief = null;
  try {
    if (shouldShowBrief(vaultPath)) {
      morningBrief = generateMorningBrief(vaultPath);
    }
  } catch {}

  // Ambient insight — occasional, data-driven observation
  let ambientInsight = null;
  try {
    ambientInsight = generateInsight(vaultPath);
  } catch {}

  // Start MCP servers in background — don't block the UI
  const mcpStub = { callTool: async () => ({ error: 'MCP still loading' }), shutdown: () => {} };
  const mcpPromise = startMCPServers(vaultPath).catch(err => {
    console.error(`   ${fgDim}MCP failed: ${err.message}${reset}`);
    return null;
  });

  // Render Ink app — Static component ensures committed output doesn't re-render
  render(e(App, {
    vaultPath,
    version,
    userName,
    initialTools: builtInTools,
    initialMcp: mcpStub,
    initialCommands: allCommands,
    welcomeData: resumedSession ? null : welcomeData,
    morningBrief: resumedSession ? null : morningBrief,
    ambientInsight: resumedSession ? null : ambientInsight,
    mcpPromise,
    resumedSession,
  }));
}

module.exports = { startInkApp };
