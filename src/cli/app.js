'use strict';

const fs = require('fs');
const path = require('path');
const React = require('react');
const { useState, useEffect, useCallback, useRef } = React;
const { render, Box, Text, Static, useApp, useInput, useStdout } = require('ink');
const TextInput = require('ink-text-input').default;
const { agentLoop, buildSystemPrompt, DEFAULT_MODEL } = require('../core/agent.js');
const { getToolDefinitions, executeTool } = require('../core/tools.js');
const { loadSkill, listSkills } = require('../core/skills.js');
const { startMCPServers } = require('../core/mcp.js');
const { getWelcomeSuggestions, getResponseSuggestions, getIdleHint, getOnboardingTip } = require('../core/suggestions.js');
const { searchVault, rebuildIndex } = require('../core/search.js');
const { saveSessionMemory, getMemoryContext, pruneOldMemories } = require('../core/memory.js');
const { detectIntent, formatIntentSuggestion } = require('../core/intent.js');
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

const e = React.createElement;

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

// ── Autocomplete Component ─────────────────────────────────────────────────

function Autocomplete({ commands, filter, onSelect }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const query = (filter || '').toLowerCase();
  const filtered = query
    ? commands.filter(c => c.name.toLowerCase().startsWith(query) || (c.description || '').toLowerCase().includes(query))
    : commands;

  const maxVisible = 8;
  const scrollOffset = Math.max(0, Math.min(selectedIndex - maxVisible + 1, filtered.length - maxVisible));
  const visible = filtered.slice(scrollOffset, scrollOffset + maxVisible);

  useEffect(() => { setSelectedIndex(0); }, [filter]);

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1));
    else if (key.downArrow) setSelectedIndex(i => Math.min(filtered.length - 1, i + 1));
    else if (key.tab || (key.return && filtered.length > 0)) {
      if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
    }
  });

  if (filtered.length === 0) return null;

  const children = visible.map((item, i) => {
    const globalIdx = scrollOffset + i;
    const isSelected = globalIdx === selectedIndex;
    return e(Box, { key: `${i}-${item.name}` },
      e(Text, { color: isSelected ? SKY_BLUE : DIM_BLUE, bold: isSelected },
        isSelected ? ' \u25B8 ' : '   ',
        `/${item.name}`.padEnd(22),
      ),
      e(Text, { color: DIM_BLUE }, (item.description || '').slice(0, 50)),
    );
  });

  if (scrollOffset + maxVisible < filtered.length) {
    children.push(e(Text, { key: '_more', color: DIM_BLUE }, `   \u2193 ${filtered.length - scrollOffset - maxVisible} more`));
  }
  children.push(e(Text, { key: '_count', color: DIM_BLUE },
    `   ${filtered.length} command${filtered.length !== 1 ? 's' : ''}${query ? ` matching "${query}"` : ''}`
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

function App({ vaultPath, version, initialTools, initialMcp, initialCommands, welcomeData, morningBrief }) {
  // Static items — rendered once, never re-rendered (scrolls up naturally)
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  // Dynamic state — only the active area re-renders
  const streamingRef = useRef('');
  const [streamingTick, setStreamingTick] = useState(0); // triggers re-render for streaming area
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStart, setThinkingStart] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [completeFilter, setCompleteFilter] = useState('');
  const [idleHint, setIdleHint] = useState('');
  const { exit } = useApp();

  const messagesRef = useRef([]);
  const personaRef = useRef(null);
  const skillCtxRef = useRef(null);
  const lastSkillRef = useRef(null);
  const costRef = useRef({ input: 0, output: 0, cost: 0 });
  const toolsRef = useRef(initialTools);
  const mcpRef = useRef(initialMcp);
  const ctrlCRef = useRef(0);
  const usedCommandsRef = useRef([]);
  const interactionCountRef = useRef(0);
  const askUserResolveRef = useRef(null); // For AskUser tool → Ink input bridge
  const thinkingRef = useRef(false); // Extended thinking toggle
  const [pendingQuestion, setPendingQuestion] = useState(null);

  const allCommands = initialCommands;

  // Append a line to the static log (renders once, never updates)
  const addLine = useCallback((text, type = 'text') => {
    const id = idRef.current++;
    setItems(prev => [...prev, { id, text, type }]);
  }, []);

  // ── Welcome suggestions + morning brief on first render ───
  useEffect(() => {
    if (welcomeData) {
      const { greeting, suggestions } = welcomeData;
      addLine(`${greeting}. Here are some ideas:`, 'system');
      for (const s of suggestions) {
        addLine(`  ${s.cmd}  ${s.reason}`, 'suggestion');
      }
    }
    // Morning brief — zero-prompt value
    if (morningBrief) {
      addLine('', 'text'); // spacer
      addLine(formatBriefForDisplay(morningBrief), 'text');
    }
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
        mcpRef.current.shutdown();
        setTimeout(() => { process.exit(0); }, 100);
      } else {
        addLine('Leave already? Press Ctrl+C again to confirm, or keep typing.', 'system');
      }
    } else {
      ctrlCRef.current = 0;
    }
    if (key.escape && showComplete) setShowComplete(false);
  });

  // Update autocomplete state
  const handleInputChange = useCallback((value) => {
    setInput(value);
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowComplete(true);
      setCompleteFilter(value.slice(1));
    } else {
      setShowComplete(false);
    }
  }, []);

  const handleAutocompleteSelect = useCallback((item) => {
    setInput(`/${item.name} `);
    setShowComplete(false);
  }, []);

  // Handle submit
  const handleSubmit = useCallback(async (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');
    setShowComplete(false);
    ctrlCRef.current = 0;

    // If there's a pending AskUser question, resolve it instead of sending to agent
    if (pendingQuestion && askUserResolveRef.current) {
      addLine(trimmed, 'user');
      const resolve = askUserResolveRef.current;
      askUserResolveRef.current = null;
      setPendingQuestion(null);
      resolve({ response: trimmed });
      return;
    }

    addLine(trimmed, 'user');

    // ── Slash commands ─────────────────────────────────────
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      switch (cmd) {
        case 'help':
          addLine('Commands: /help, /model, /status, /think, /search, /log, /cost, /clear, /persona, /voice train, /dance, /quit', 'system');
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
          mcpRef.current.shutdown();
          setTimeout(() => { process.exit(0); }, 100);
          return;
        case 'cost': {
          const co = costRef.current;
          addLine(`Input: ${co.input.toLocaleString()} tokens | Output: ${co.output.toLocaleString()} tokens | Cost: $${co.cost.toFixed(4)}`, 'system');
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
        case 'model': {
          const MODEL_ALIASES = {
            'sonnet': 'claude-sonnet-4-6',
            'sonnet4.6': 'claude-sonnet-4-6',
            'opus': 'claude-opus-4-6',
            'opus4.6': 'claude-opus-4-6',
            'haiku': 'claude-haiku-4-5-20251001',
            'haiku4.5': 'claude-haiku-4-5-20251001',
          };
          const arg = args.trim().toLowerCase();
          if (!arg) {
            const current = process.env.VENNIE_MODEL || DEFAULT_MODEL;
            addLine(`Current model: ${current}`, 'system');
            addLine('Switch with: /model sonnet, /model opus, /model haiku', 'system');
            return;
          }
          const resolved = MODEL_ALIASES[arg] || arg;
          process.env.VENNIE_MODEL = resolved;
          addLine(`Model switched to ${resolved}`, 'system');
          return;
        }
        default: {
          const skill = loadSkill(vaultPath, cmd);
          if (skill) {
            skillCtxRef.current = skill.body;
            lastSkillRef.current = cmd;
            usedCommandsRef.current.push(cmd);
            addLine(`/${cmd}`, 'system');
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
      const intent = detectIntent(trimmed);
      if (intent && intent.confidence >= 0.7) {
        // High confidence — suggest the skill
        addLine(formatIntentSuggestion(intent), 'hint');
      }
    }

    // ── Send to agent ──────────────────────────────────────
    setIsThinking(true);
    setThinkingStart(Date.now());

    let userContent = trimmed;
    if (skillCtxRef.current) {
      userContent = `${skillCtxRef.current}\n\n---\n\nUser request: ${trimmed}`;
      skillCtxRef.current = null;
    }

    messagesRef.current.push({ role: 'user', content: userContent });
    let systemPrompt = buildSystemPrompt(vaultPath, personaRef.current);

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

    try {
      const stream = agentLoop(messagesRef.current, toolsRef.current, systemPrompt, {
        executeTool: execTool,
        thinking: thinkingRef.current,
      });

      let firstText = true;
      let responseText = '';
      let thinkingText = '';

      for await (const event of stream) {
        switch (event.type) {
          case 'thinking_delta':
            if (firstText) {
              setIsThinking(false);
              addLine('', 'label');
              firstText = false;
            }
            thinkingText += event.text;
            break;
          case 'text_delta':
            if (firstText) {
              setIsThinking(false);
              addLine('', 'label');
              firstText = false;
            }
            // When first text arrives after thinking, flush accumulated thinking
            if (thinkingText) {
              addLine(thinkingText, 'thinking');
              thinkingText = '';
            }
            responseText += event.text;
            streamingRef.current = responseText;
            setStreamingTick(t => t + 1);
            break;
          case 'tool_start':
            setIsThinking(false);
            if (firstText) { addLine('', 'label'); firstText = false; }
            const summaries = {
              Read: () => `Reading ${(event.input.file_path || '').split('/').pop()}`,
              Write: () => `Writing ${(event.input.file_path || '').split('/').pop()}`,
              Edit: () => `Editing ${(event.input.file_path || '').split('/').pop()}`,
              Bash: () => `Running: ${(event.input.command || '').slice(0, 50)}`,
              Glob: () => `Searching for ${event.input.pattern}`,
              Grep: () => `Searching for "${(event.input.pattern || '').slice(0, 30)}"`,
            };
            const summary = (summaries[event.name] || (() => event.name))();
            addLine(summary, 'tool');
            setIsThinking(true);
            break;
          case 'tool_result':
            setIsThinking(false);
            addLine(`${event.name} done`, event.success ? 'tool_done' : 'tool_error');
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
          case 'done':
            setIsThinking(false);
            if (responseText) {
              // Clear streaming ref SYNCHRONOUSLY before committing to static
              // This prevents Ink from rendering both in the same frame
              streamingRef.current = '';
              addLine(responseText, 'text');
              setStreamingTick(t => t + 1);

              // Post-response suggestions — only after skill runs, not every message
              interactionCountRef.current++;
              if (lastSkillRef.current) {
                const suggestions = getResponseSuggestions(responseText, lastSkillRef.current, usedCommandsRef.current);
                if (suggestions.length > 0) {
                  addLine(suggestions.join('  ·  '), 'hint');
                }
              }
              lastSkillRef.current = null;

              // Onboarding breadcrumb every 3rd interaction
              if (interactionCountRef.current % 3 === 0) {
                const tip = getOnboardingTip(usedCommandsRef.current);
                if (tip) {
                  addLine(`Tip: ${tip.cmd} — ${tip.tip}`, 'tip');
                }
              }

              responseText = '';
            }
            break;
        }
      }
    } catch (err) {
      setIsThinking(false);
      addLine(`Unexpected error: ${err.message}`, 'error');
    }
  }, [vaultPath, addLine]);

  const { stdout } = useStdout();
  const cols = stdout?.columns || 80;

  // ── Render ─────────────────────────────────────────────────
  return e(Box, { flexDirection: 'column' },

    // ── Static area: committed messages (rendered once, scroll up) ───
    e(Static, { items: items },
      (item) => {
        if (item.type === 'user') return e(Box, { key: item.id, paddingLeft: 3, marginTop: 1 }, e(Text, null, `> ${item.text}`));
        if (item.type === 'label') return e(Box, { key: item.id, paddingLeft: 3 },
          e(Text, { color: CYAN }, '\u25CF '), e(Text, { color: DIM_BLUE }, 'vennie'),
        );
        if (item.type === 'tool') return e(Box, { key: item.id, paddingLeft: 5 }, e(Text, { color: DIM_BLUE }, `\u26A1 ${item.text}`));
        if (item.type === 'tool_done') return e(Box, { key: item.id, paddingLeft: 5 }, e(Text, { color: ACCENT_BLUE }, `\u2713 ${item.text}`));
        if (item.type === 'tool_error') return e(Box, { key: item.id, paddingLeft: 5 }, e(Text, { color: 'red' }, `\u2717 ${item.text}`));
        if (item.type === 'error') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: 'red', bold: true }, `\u2717 ${item.text}`));
        if (item.type === 'system') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: DIM_BLUE }, item.text));
        if (item.type === 'question') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: '#d787ff' }, `? ${item.text}`));
        if (item.type === 'suggestion') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: DIM_BLUE }, `\u2192 `), e(Text, { color: CYAN }, item.text));
        if (item.type === 'hint') return e(Box, { key: item.id, paddingLeft: 3, marginTop: 1 }, e(Text, { color: DIM }, `next: ${item.text}`));
        if (item.type === 'tip') return e(Box, { key: item.id, paddingLeft: 3 }, e(Text, { color: YELLOW }, `\u2728 ${item.text}`));
        if (item.type === 'thinking') return e(Box, { key: item.id, paddingLeft: 5 }, e(Text, { color: DIM }, `[thinking] ${item.text.slice(0, 200)}${item.text.length > 200 ? '...' : ''}`));
        // text (response) — render with markdown formatting
        return e(Box, { key: item.id, paddingLeft: 3 }, e(MarkdownText, { text: item.text, indent: '' }));
      }
    ),

    // ── Dynamic area: streaming text (only this re-renders) ──────
    streamingRef.current ? e(Box, { paddingLeft: 3 }, e(MarkdownText, { text: streamingRef.current, indent: '' })) : null,

    // ── Spinner (always right above input separator) ────────
    isThinking ? e(SpinnerWidget, { startTime: thinkingStart }) : null,

    // ── Separator ────────────────────────────────────────────
    e(Box, null, e(Text, { color: DIM_BLUE }, '\u2500'.repeat(cols))),

    // ── Input ────────────────────────────────────────────────
    e(Box, { paddingLeft: 3 },
      e(Text, { color: CYAN, bold: true }, '> '),
      e(TextInput, { value: input, onChange: handleInputChange, onSubmit: handleSubmit, focus: !isThinking }),
    ),

    // ── Bottom separator ─────────────────────────────────────
    e(Box, null, e(Text, { color: DIM_BLUE }, '\u2500'.repeat(cols))),

    // ── Autocomplete or idle hint (below input) ──────────────
    showComplete
      ? e(Autocomplete, { commands: allCommands, filter: completeFilter, onSelect: handleAutocompleteSelect })
      : (idleHint && !input && !isThinking && !streamingRef.current)
        ? e(Box, { paddingLeft: 3 }, e(Text, { color: DIM }, `try: ${idleHint}`))
        : e(Text, null, ''),
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

async function startInkApp(vaultPath, version) {
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

  console.log();
  for (let i = 0; i < MASCOT_LINES.length; i++) {
    console.log(`   ${fgV}${MASCOT_LINES[i]}${reset}  ${infoLines[i] || ''}`);
  }
  console.log();

  // Start MCP
  let mcpResult = { tools: [], callTool: null, shutdown: () => {} };
  try { mcpResult = await startMCPServers(vaultPath); } catch {}

  const builtInTools = getToolDefinitions();
  const allTools = [...builtInTools, ...mcpResult.tools];

  // Vault pulse — show accumulated value
  let pulseMsg = '';
  try {
    const pulse = getVaultPulse(vaultPath);
    pulseMsg = pulse.message;
  } catch {}

  console.log(`   ${fgDim}${allTools.length} tools ready \u00B7 /help for commands${reset}`);
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
    { name: 'simulate', description: 'Roleplay as a stakeholder from your vault' },
    { name: 'patterns', description: 'Analyse your decision-making patterns' },
    { name: 'who', description: 'Find expertise: /who knows about <topic>' },
    { name: 'radar', description: 'Competitive intelligence radar' },
    { name: 'gym', description: 'Product sense training exercise' },
    { name: 'shipped', description: 'Capture a shipment for career evidence' },
    { name: 'career', description: 'View your career timeline and skill matrix' },
    { name: 'challenge', description: 'Adversarial analysis: what are you missing?' },
    { name: 'cost', description: 'Show session cost breakdown' },
    { name: 'clear', description: 'Clear conversation history' },
    { name: 'quit', description: 'Exit Vennie' },
  ];
  const skillCommands = listSkills(vaultPath).map(s => ({ name: s.name, description: s.description }));
  const allCommands = [...builtInCommands, ...skillCommands].sort((a, b) => a.name.localeCompare(b.name));

  // Generate welcome suggestions based on vault state
  const welcomeData = getWelcomeSuggestions(vaultPath);

  // Morning brief — auto-generated, zero-prompt value
  let morningBrief = null;
  try {
    if (shouldShowBrief(vaultPath)) {
      morningBrief = generateMorningBrief(vaultPath);
    }
  } catch {}

  // Render Ink app — Static component ensures committed output doesn't re-render
  render(e(App, {
    vaultPath,
    version,
    initialTools: allTools,
    initialMcp: mcpResult,
    initialCommands: allCommands,
    welcomeData,
    morningBrief,
  }));
}

module.exports = { startInkApp };
