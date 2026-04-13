'use strict';

// ── ANSI Escape Codes ───────────────────────────────────────────────────────
// Minimal dependency rendering — raw ANSI only, no chalk/ink/blessed.

const ESC = '\x1b[';

const style = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  inverse: `${ESC}7m`,
  strikethrough: `${ESC}9m`,
};

const fg = {
  black: `${ESC}30m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  grey: `${ESC}90m`,
  // Extended blue palette
  lightBlue: `${ESC}38;5;111m`,
  skyBlue: `${ESC}38;5;117m`,
  deepBlue: `${ESC}38;5;69m`,
  softBlue: `${ESC}38;5;153m`,
  accentBlue: `${ESC}38;5;75m`,
  dimBlue: `${ESC}38;5;67m`,
};

const bg = {
  grey: `${ESC}48;5;236m`,
  darkBlue: `${ESC}48;5;17m`,
  inputBg: `${ESC}48;5;235m`,
};

// ── Layout Constants ───────────────────────────────────────────────────────

const PAD = '   '; // left padding for all output
const PAD_RIGHT = '   '; // right margin
const COLS = () => process.stdout.columns || 80;
const CONTENT_WIDTH = () => COLS() - PAD.length - PAD_RIGHT.length; // usable text width

// ── Mascot ─────────────────────────────────────────────────────────────────
// Simple, cute, works in every terminal font

const fgV = `${ESC}38;5;44m`;  // vennie cyan

const MASCOT = [
  `${fgV}  ▄██████▄${style.reset}`,
  `${fgV}  █▀▀██▀▀█${style.reset}`,
  `${fgV} ▌████████▐${style.reset}`,
  `${fgV}  ▀██████▀${style.reset}`,
  `${fgV}    ▀  ▀${style.reset}`,
];

const MASCOT_TINY = `${fgV}█${style.reset}`;

// ── Word Wrap ──────────────────────────────────────────────────────────────
// Wraps text to fit within content area, preserving padding

function wordWrap(text, width) {
  if (!width || width < 20) width = 76;
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    // Strip ANSI for length counting
    const stripped = (current + ' ' + word).replace(/\x1b\[[0-9;]*m/g, '');
    if (stripped.length > width && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Dividers ───────────────────────────────────────────────────────────────

function thinLine(width) {
  return `${fg.dimBlue}${'─'.repeat(width || CONTENT_WIDTH())}${style.reset}`;
}

function dottedLine(width) {
  return `${fg.dimBlue}${'·'.repeat(width || COLS() - 4)}${style.reset}`;
}

// ── Spinner ─────────────────────────────────────────────────────────────────
// Animated spinner with rotating fun messages (like Claude Code's vibes).

const SPINNER_FRAMES = ['◜', '◠', '◝', '◞', '◡', '◟'];

const THINKING_MESSAGES = [
  'thinking',
  'chewing on that',
  'consulting the product gods',
  'brewing ideas',
  'channelling your inner CPO',
  'connecting the dots',
  'reading the room',
  'processing vibes',
  'this is a good question actually',
  'crunching product wisdom',
  'asking the right questions',
  'sketching a mental model',
  'looking at this from all angles',
  'weighing trade-offs',
  'sharpening the strategy',
  'pulling threads',
  'synthesising',
  'going deep',
  'mulling it over',
  'finding the signal',
];

let spinnerInterval = null;
let spinnerFrame = 0;
let spinnerMsgIdx = 0;
let spinnerMsgCounter = 0;

function startSpinner(msg) {
  if (spinnerInterval) return;
  spinnerFrame = 0;
  spinnerMsgCounter = 0;
  spinnerMsgIdx = Math.floor(Math.random() * THINKING_MESSAGES.length);
  process.stdout.write('\x1b[?25l'); // hide cursor

  const useRandomMessages = !msg;
  const getMessage = () => useRandomMessages ? THINKING_MESSAGES[spinnerMsgIdx % THINKING_MESSAGES.length] : msg;

  spinnerInterval = setInterval(() => {
    const frame = SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length];
    const currentMsg = getMessage();
    process.stdout.write(`\r\x1b[K${PAD}${fg.skyBlue}${frame}${style.reset} ${fg.dimBlue}${currentMsg}${style.reset}`);
    spinnerFrame++;
    spinnerMsgCounter++;

    // Rotate message every ~3 seconds (37 frames × 80ms ≈ 3s)
    if (useRandomMessages && spinnerMsgCounter % 37 === 0) {
      spinnerMsgIdx++;
    }
  }, 80);
}

function stopSpinner() {
  if (!spinnerInterval) return;
  clearInterval(spinnerInterval);
  spinnerInterval = null;
  process.stdout.write('\r\x1b[K'); // clear spinner line
  process.stdout.write('\x1b[?25h'); // show cursor
}

// ── Markdown-ish Rendering ──────────────────────────────────────────────────

let inCodeBlock = false;
let codeBlockLang = '';
let lineBuffer = '';

function renderDelta(text) {
  for (const ch of text) {
    if (ch === '\n') {
      renderLine(lineBuffer);
      lineBuffer = '';
      process.stdout.write('\n');
    } else {
      lineBuffer += ch;
    }
  }
}

function flushRender() {
  if (lineBuffer.length > 0) {
    renderLine(lineBuffer);
    lineBuffer = '';
  }
  inCodeBlock = false;
  codeBlockLang = '';
}

function renderLine(line) {
  process.stdout.write(`\r\x1b[K`);

  // Code block toggle
  if (line.trimStart().startsWith('```')) {
    inCodeBlock = !inCodeBlock;
    if (inCodeBlock) {
      codeBlockLang = line.trimStart().slice(3).trim();
      const label = codeBlockLang ? ` ${codeBlockLang} ` : '';
      process.stdout.write(`${PAD}${PAD}${fg.dimBlue}┌${label}${'─'.repeat(Math.max(0, COLS() - 10 - label.length))}${style.reset}`);
    } else {
      process.stdout.write(`${PAD}${PAD}${fg.dimBlue}└${'─'.repeat(COLS() - 10)}${style.reset}`);
      codeBlockLang = '';
    }
    return;
  }

  // Inside code block
  if (inCodeBlock) {
    process.stdout.write(`${PAD}${PAD}${fg.dimBlue}│${style.reset} ${fg.grey}${line}${style.reset}`);
    return;
  }

  // Headings
  const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const text = headingMatch[2];
    if (level === 1) {
      process.stdout.write(`${PAD}${style.bold}${fg.skyBlue}${text}${style.reset}`);
    } else if (level === 2) {
      process.stdout.write(`${PAD}${style.bold}${fg.lightBlue}${text}${style.reset}`);
    } else {
      process.stdout.write(`${PAD}${style.bold}${fg.dimBlue}${text}${style.reset}`);
    }
    return;
  }

  // Bullets
  if (line.match(/^\s*[-*]\s/)) {
    const indent = line.match(/^(\s*)/)[1];
    const content = line.replace(/^\s*[-*]\s/, '');
    process.stdout.write(`${PAD}${indent}  ${fg.accentBlue}•${style.reset} ${renderInline(content)}`);
    return;
  }

  // Numbered lists
  if (line.match(/^\s*\d+\.\s/)) {
    const match = line.match(/^(\s*)(\d+\.)\s(.*)/);
    if (match) {
      process.stdout.write(`${PAD}${match[1]}  ${fg.accentBlue}${match[2]}${style.reset} ${renderInline(match[3])}`);
      return;
    }
  }

  // Horizontal rule
  if (line.match(/^---+$/)) {
    process.stdout.write(`${PAD}${thinLine(Math.min(40, COLS() - 8))}`);
    return;
  }

  // Empty line
  if (line.trim() === '') {
    return;
  }

  // Default — apply inline formatting with word wrap
  const formatted = renderInline(line);
  const wrapped = wordWrap(formatted, CONTENT_WIDTH());
  for (let i = 0; i < wrapped.length; i++) {
    if (i > 0) process.stdout.write(`\n`);
    process.stdout.write(`${PAD}${wrapped[i]}`);
  }
}

function renderInline(text) {
  let result = text;

  // Bold: **text**
  result = result.replace(/\*\*(.+?)\*\*/g, `${style.bold}$1${style.reset}`);

  // Italic: *text*
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${style.italic}$1${style.reset}`);

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, `${fg.skyBlue}$1${style.reset}`);

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${style.underline}${fg.accentBlue}$1${style.reset} ${fg.dimBlue}($2)${style.reset}`);

  return result;
}

// ── Tool Display (Rich Cards) ──────────────────────────────────────────────

const TIER_ICONS = {
  auto: `${fg.dimBlue}●${style.reset}`,
  confirm: `${fg.yellow}◆${style.reset}`,
  approve: `${fg.red}▲${style.reset}`,
};

function renderToolStart(name, input, meta = {}) {
  if (name === 'AskUser') return;

  const summaries = {
    Read: () => `Reading ${shortenPath(input.file_path)}`,
    Write: () => `Writing ${shortenPath(input.file_path)}`,
    Edit: () => `Editing ${shortenPath(input.file_path)}`,
    Bash: () => `Running: ${(input.command || '').slice(0, 60)}${(input.command || '').length > 60 ? '…' : ''}`,
    Glob: () => `Searching for ${input.pattern}`,
    Grep: () => `Searching for "${(input.pattern || '').slice(0, 30)}"`,
    WebFetch: () => `Fetching ${(input.url || '').slice(0, 40)}`,
    WebSearch: () => `Searching the web`,
  };

  const summary = (summaries[name] || (() => name))();
  const tierIcon = TIER_ICONS[meta.tier] || TIER_ICONS.auto;
  const progress = meta.total > 1 ? ` ${fg.dimBlue}[${meta.index + 1}/${meta.total}]${style.reset}` : '';

  process.stdout.write(`${PAD}  ${tierIcon} ${fg.skyBlue}${name}${style.reset} ${fg.dimBlue}${summary}${style.reset}${progress}\n`);
}

function renderToolResult(name, result, success, meta = {}) {
  if (name === 'AskUser') return;

  const duration = meta.duration ? `${fg.dimBlue} ${meta.duration}ms${style.reset}` : '';
  const tokens = meta.resultTokens ? `${fg.dimBlue} · ~${(meta.resultTokens / 1000).toFixed(1)}k tokens${style.reset}` : '';

  if (success) {
    process.stdout.write(`${PAD}  ${fg.accentBlue}✓${style.reset} ${fg.dimBlue}${name}${duration}${tokens}${style.reset}\n`);

    // Show preview if available
    if (meta.preview) {
      const previewLines = meta.preview.split('\n').slice(0, 3);
      for (const line of previewLines) {
        process.stdout.write(`${PAD}    ${fg.grey}${line.slice(0, CONTENT_WIDTH() - 6)}${style.reset}\n`);
      }
    }
  } else {
    const errMsg = typeof result === 'string' ? result : (result?.error || 'Unknown error');
    process.stdout.write(`${PAD}  ${fg.red}✗ ${name}: ${errMsg.slice(0, 80)}${duration}${style.reset}\n`);
  }
}

// ── Turn Progress ────────────────────────────────────────────────────────

function renderTurnProgress(turn, maxTurns, toolCount) {
  const bar = `${fg.dimBlue}─── step ${turn}/${maxTurns}`;
  const tools = toolCount > 1 ? ` (${toolCount} tools)` : '';
  process.stdout.write(`${PAD}${bar}${tools} ${'─'.repeat(Math.max(0, CONTENT_WIDTH() - 20 - tools.length))}${style.reset}\n`);
}

// ── Checkpoint ──────────────────────────────────────────────────────────

function renderCheckpoint(message) {
  process.stdout.write(`\n${PAD}${fg.skyBlue}◎${style.reset} ${fg.dimBlue}${message}${style.reset}\n\n`);
}

// ── Citations ───────────────────────────────────────────────────────────

function renderCitations(sources) {
  if (!sources || sources.length === 0) return;

  process.stdout.write(`\n${PAD}${fg.dimBlue}${'─'.repeat(Math.min(40, CONTENT_WIDTH()))}${style.reset}\n`);
  process.stdout.write(`${PAD}${fg.dimBlue}Sources:${style.reset}\n`);

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const num = `[${i + 1}]`;
    let label = '';
    switch (s.type) {
      case 'file':
        label = `${s.filename} (${s.lines})`;
        break;
      case 'search':
        label = `Search: "${s.pattern}" (${s.matchCount} matches in ${s.files.length} files)`;
        break;
      case 'glob':
        label = `${s.fileCount} files matching ${s.pattern}`;
        break;
      default:
        label = s.type;
    }
    process.stdout.write(`${PAD}  ${fg.dimBlue}${num}${style.reset} ${fg.grey}${label}${style.reset}\n`);
  }
}

// ── Thinking Display ────────────────────────────────────────────────────

function renderThinkingBlock(text, { collapsed = true } = {}) {
  const maxShow = collapsed ? 200 : text.length;
  const display = text.slice(0, maxShow);
  const truncated = text.length > maxShow;

  process.stdout.write(`\n${PAD}${fg.dimBlue}┌─ thinking ─${style.reset}\n`);

  const lines = display.split('\n');
  for (const line of lines) {
    const wrapped = wordWrap(line, CONTENT_WIDTH() - 4);
    for (const wl of wrapped) {
      process.stdout.write(`${PAD}${fg.dimBlue}│${style.reset} ${style.dim}${fg.grey}${wl}${style.reset}\n`);
    }
  }

  if (truncated) {
    process.stdout.write(`${PAD}${fg.dimBlue}│ ... (${text.length} chars total)${style.reset}\n`);
  }
  process.stdout.write(`${PAD}${fg.dimBlue}└${'─'.repeat(Math.min(40, CONTENT_WIDTH() - 2))}${style.reset}\n\n`);
}

// ── Permission Prompt ───────────────────────────────────────────────────

function renderPermissionPrompt(description, tier) {
  const icon = tier === 'approve' ? `${fg.red}▲` : `${fg.yellow}◆`;
  const options = tier === 'approve' ? 'Y/n/always/never' : 'Y/n/always';

  process.stdout.write(`\n${PAD}${icon} ${style.bold}Permission required${style.reset}\n`);
  process.stdout.write(`${PAD}  ${fg.grey}${description}${style.reset}\n`);
  process.stdout.write(`${PAD}  ${fg.dimBlue}[${options}]${style.reset} `);
}

// ── Status Line ─────────────────────────────────────────────────────────

let statusLineEnabled = false;
let statusLineData = {};

function enableStatusLine() {
  statusLineEnabled = true;
}

function updateStatusLine(data) {
  statusLineData = { ...statusLineData, ...data };
  if (!statusLineEnabled) return;
  drawStatusLine();
}

function drawStatusLine() {
  const cols = COLS();
  const parts = [];

  if (statusLineData.model) {
    const shortModel = statusLineData.model
      .replace('claude-', '')
      .replace('-20250514', '')
      .replace('-4-6', ' 4.6')
      .replace('-4-5-20251001', ' 4.5');
    parts.push(`${fg.cyan}${shortModel}${style.reset}`);
  }

  if (statusLineData.toolCount) {
    parts.push(`${fg.dimBlue}${statusLineData.toolCount} tools${style.reset}`);
  }

  if (statusLineData.cost !== undefined && statusLineData.cost > 0) {
    parts.push(`${fg.dimBlue}$${statusLineData.cost.toFixed(4)}${style.reset}`);
  }

  if (statusLineData.inputTokens) {
    const inK = (statusLineData.inputTokens / 1000).toFixed(1);
    const outK = ((statusLineData.outputTokens || 0) / 1000).toFixed(1);
    parts.push(`${fg.dimBlue}${inK}k↑ ${outK}k↓${style.reset}`);
  }

  if (statusLineData.sessionTime) {
    const mins = Math.floor(statusLineData.sessionTime / 60000);
    parts.push(`${fg.dimBlue}${mins}m${style.reset}`);
  }

  if (statusLineData.vaultPath) {
    parts.push(`${fg.dimBlue}${shortenPath(statusLineData.vaultPath)}${style.reset}`);
  }

  const sep = `${fg.dimBlue} │ ${style.reset}`;
  const line = parts.join(sep);

  // Write to bottom of terminal: save cursor, move to last row, write, restore
  process.stdout.write(`\x1b7\x1b[${process.stdout.rows || 24};0H\x1b[K ${line}\x1b8`);
}

function clearStatusLine() {
  if (!statusLineEnabled) return;
  statusLineEnabled = false;
  process.stdout.write(`\x1b7\x1b[${process.stdout.rows || 24};0H\x1b[K\x1b8`);
}

// ── Error Recovery ──────────────────────────────────────────────────────

function renderRetryPrompt(toolName, errorMessage) {
  process.stdout.write(`\n${PAD}${fg.red}✗ ${toolName} failed:${style.reset} ${fg.grey}${errorMessage.slice(0, 60)}${style.reset}\n`);
  process.stdout.write(`${PAD}  ${fg.dimBlue}Retry? [Y/n]${style.reset} `);
}

function renderFallbackNotice(from, to) {
  process.stdout.write(`${PAD}  ${fg.dimBlue}↪ ${from} unavailable, using ${to} instead${style.reset}\n`);
}

// ── Status & Chrome ─────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const fgSparkle = `${ESC}38;5;228m`; // warm yellow for sparkles

const REST = [
  `${fgV}  ▄██████▄  ${style.reset}`,
  `${fgV}  █▀▀██▀▀█  ${style.reset}`,
  `${fgV} ▌████████▐ ${style.reset}`,
  `${fgV}  ▀██████▀  ${style.reset}`,
  `${fgV}    ▀  ▀    ${style.reset}`,
];

const WELCOME_FRAMES = [
  REST,
  [
    `${fgSparkle} ✦${fgV} ▄██████▄ ${fgSparkle}✦${style.reset}`,
    `${fgV}  █▀▀██▀▀█  ${style.reset}`,
    `${fgV} ▌████████▐ ${style.reset}`,
    `${fgV}  ▀██████▀  ${style.reset}`,
    `${fgV}    ▀  ▀    ${style.reset}`,
  ],
  [
    `${fgSparkle} ✧${fgV} ▄██████▄ ${fgSparkle}✧${style.reset}`,
    `${fgSparkle}✦ ${fgV}█▀▀██▀▀█${fgSparkle} ✦${style.reset}`,
    `${fgV} ▌████████▐ ${style.reset}`,
    `${fgV}  ▀██████▀  ${style.reset}`,
    `${fgV}    ▀  ▀    ${style.reset}`,
  ],
  [
    `${fgSparkle} ·${fgV} ▄██████▄ ${fgSparkle}·${style.reset}`,
    `${fgV}  █▀▀██▀▀█  ${style.reset}`,
    `${fgV} ▌████████▐ ${style.reset}`,
    `${fgV}  ▀██████▀  ${style.reset}`,
    `${fgV}    ▀  ▀    ${style.reset}`,
  ],
  REST,
];

async function renderWelcome(version, { model, vaultPath } = {}) {
  const modelName = model || process.env.VENNIE_MODEL || 'claude-sonnet-4-20250514';
  const displayPath = vaultPath ? shortenPath(vaultPath) : process.cwd();

  const infoLines = [
    `${style.bold}${fg.cyan}Vennie${style.reset} ${fg.dimBlue}v${version}${style.reset}`,
    `${fg.dimBlue}${modelName} · API Usage${style.reset}`,
    `${fg.dimBlue}${displayPath}${style.reset}`,
    ``,
    ``,
  ];

  const rows = WELCOME_FRAMES[0].length;

  // Draw initial frame
  console.log();
  for (let i = 0; i < rows; i++) {
    console.log(`${PAD}${WELCOME_FRAMES[0][i]}  ${infoLines[i] || ''}`);
  }

  // Animate
  for (let f = 1; f < WELCOME_FRAMES.length; f++) {
    await sleep(f === 3 ? 250 : 150);
    process.stdout.write(`\x1b[${rows}A`);
    for (let i = 0; i < rows; i++) {
      process.stdout.write(`\r\x1b[K${PAD}${WELCOME_FRAMES[f][i]}  ${infoLines[i] || ''}\n`);
    }
  }

  console.log();
}

// ── Buddy Companion ────────────────────────────────────────────────────────
// Persistent little character that sits near the input, like Scorch in Claude Code.

let currentBuddyPose = 'idle';
let buddyAnimInterval = null;

// Mini block-art buddy matching the welcome mascot style
const BUDDY_POSES = {
  idle:    [' ▄████▄ ', ' █▀▀█▀▀█', '  ▀████▀'],
  happy:   [' ▄████▄✦', ' █▀▀█▀▀█', '  ▀████▀'],
  think:   [' ▄████▄·', ' █▀▀█▀▀█', '  ▀~~~~▀'],
  dance1:  ['♪▄████▄ ', ' █▀▀█▀▀█', ' ╱▀████▀'],
  dance2:  [' ▄████▄♪', ' █▀▀█▀▀█', '  ▀████▀╲'],
  dance3:  [' ▄████▄ ', '♪█▀▀█▀▀█♪', '  ▀████▀'],
  dance4:  [' ▄████▄♫', ' █▀▀█▀▀█', '  ▀████▀'],
  sleep:   [' ▄████▄ ', ' █──█──█', '  ▀████▀z'],
  love:    [' ▄████▄♥', ' █▀▀█▀▀█', '  ▀████▀'],
  sparkle: ['✧▄████▄✧', ' █▀▀█▀▀█', '  ▀████▀'],
  wave1:   [' ▄████▄/', ' █▀▀█▀▀█', '  ▀████▀'],
  wave2:   [' ▄████▄ ', ' █▀▀█▀▀█/', '  ▀████▀'],
  pet:     [' ▄████▄♥', ' █♥♥█♥♥█', '  ▀████▀'],
};

function renderBuddyRight(pose) {
  const lines = BUDDY_POSES[pose] || BUDDY_POSES.idle;
  const cols = COLS();

  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const pad = cols - stripped.length - 1;
    process.stdout.write(`\r\x1b[K${' '.repeat(Math.max(0, pad))}${fgV}${line}${style.reset}\n`);
  }
  // Name label
  const label = 'vennie';
  const labelPad = cols - label.length - 1;
  process.stdout.write(`\r\x1b[K${' '.repeat(Math.max(0, labelPad))}${fg.dimBlue}${label}${style.reset}\n`);
}

function setBuddyPose(pose) {
  currentBuddyPose = pose;
}

async function animateBuddy(animation, { onFrame } = {}) {
  const animations = {
    dance: {
      frames: ['dance1', 'dance2', 'dance3', 'dance4', 'dance1', 'dance2', 'dance3', 'dance4', 'happy'],
      delay: 250,
    },
    wave: {
      frames: ['wave1', 'wave2', 'wave1', 'wave2', 'idle'],
      delay: 300,
    },
    love: {
      frames: ['love', 'sparkle', 'love', 'sparkle', 'happy'],
      delay: 300,
    },
    pet: {
      frames: ['pet', 'love', 'pet', 'happy'],
      delay: 350,
    },
    sleep: {
      frames: ['idle', 'sleep', 'sleep', 'sleep', 'idle'],
      delay: 500,
    },
  };

  const anim = animations[animation];
  if (!anim) return;

  for (const pose of anim.frames) {
    currentBuddyPose = pose;
    if (onFrame) onFrame(pose);
    await sleep(anim.delay);
  }
}

// ── Input Box & Prompt ─────────────────────────────────────────────────────

function renderInputClose() {
  // Nothing — just let content flow
}

function renderPrompt(personaName, rl) {
  // Clean spacing before prompt, nothing else
  process.stdout.write('\n');
  if (rl) rl.prompt();
}

function renderError(msg) {
  console.log(`\n${PAD}${fg.red}${style.bold}✗ Error:${style.reset} ${fg.red}${msg}${style.reset}\n`);
}

function renderSystem(msg) {
  console.log(`${PAD}${fg.dimBlue}${msg}${style.reset}`);
}

function renderCost(inputTokens, outputTokens, cost) {
  const parts = [];
  if (inputTokens) parts.push(`${(inputTokens / 1000).toFixed(1)}k in`);
  if (outputTokens) parts.push(`${(outputTokens / 1000).toFixed(1)}k out`);
  if (cost > 0) parts.push(`$${cost.toFixed(4)}`);
  if (parts.length > 0) {
    process.stdout.write(`\n${PAD}${fg.dimBlue}${style.dim}[${parts.join(' · ')}]${style.reset}\n`);
  }
}

function renderPersonaSwitch(name) {
  console.log();
  if (name) {
    console.log(`${PAD}${fg.deepBlue}${style.bold}Persona activated:${style.reset} ${fg.skyBlue}${name}${style.reset}`);
    console.log(`${PAD}${fg.dimBlue}Vennie will now respond as ${name}. Use /persona off to switch back.${style.reset}`);
  } else {
    console.log(`${PAD}${fg.dimBlue}Persona deactivated. Back to default Vennie.${style.reset}`);
  }
  console.log();
}

function renderResponseStart() {
  // Visual separator before Vennie's response
  process.stdout.write(`\n${PAD}${fg.cyan}●${style.reset} ${fg.dimBlue}vennie${style.reset}\n\n`);
}

function renderResponseEnd() {
  // Breathing room after response
  process.stdout.write('\n');
}

// ── Help (styled) ───────────────────────────────────────────────────────────

function renderHelp(skills) {
  const { spawnSync } = require('child_process');
  const w = COLS();
  const lines = [];

  lines.push('');
  lines.push(`${PAD}${thinLine(w - 4)}`);
  lines.push(`${PAD}${style.bold}${fg.skyBlue}Vennie Commands${style.reset}`);
  lines.push(`${PAD}${thinLine(w - 4)}`);
  lines.push('');

  const cmds = [
    ['/help', 'Show this help'],
    ['/status', 'Session status'],
    ['/cost', 'Token usage & cost this session'],
    ['/clear', 'Clear conversation history'],
    ['/persona [name]', 'Switch persona (or /persona off)'],
    ['/voice train', 'Train Vennie on your writing style'],
    ['/news', "Today's product signal"],
    ['/quit', 'Exit Vennie'],
  ];

  for (const [cmd, desc] of cmds) {
    const padded = cmd.padEnd(20);
    lines.push(`${PAD}  ${fg.accentBlue}${padded}${style.reset}${fg.grey}${desc}${style.reset}`);
  }

  if (skills && skills.length > 0) {
    lines.push('');
    lines.push(`${PAD}${thinLine(w - 4)}`);
    lines.push(`${PAD}${style.bold}${fg.skyBlue}Skills${style.reset} ${fg.dimBlue}(loaded as conversation context)${style.reset}`);
    lines.push(`${PAD}${thinLine(w - 4)}`);
    lines.push('');

    for (const s of skills) {
      const tag = s.tier === 'personal' ? ` ${fg.yellow}★${style.reset}` : '';
      const name = `/${s.name}`.padEnd(20);
      lines.push(`${PAD}  ${fg.accentBlue}${name}${style.reset}${fg.grey}${s.description || ''}${style.reset}${tag}`);
    }
  }

  lines.push('');
  lines.push(`${PAD}${thinLine(w - 4)}`);
  lines.push('');

  const content = lines.join('\n');
  const termRows = process.stdout.rows || 24;

  // If content fits in terminal, just print it
  if (lines.length <= termRows - 4) {
    process.stdout.write(content);
    return;
  }

  // Otherwise pipe through less for scrolling
  try {
    spawnSync('less', ['-R', '-F', '-X'], {
      input: content,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch {
    // Fallback: just print it all
    process.stdout.write(content);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortenPath(p) {
  if (!p) return '(unknown)';
  const home = require('os').homedir();
  if (p.startsWith(home)) return '~' + p.slice(home.length);
  return p;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Streaming
  renderDelta,
  flushRender,
  // Tools
  renderToolStart,
  renderToolResult,
  renderTurnProgress,
  renderCheckpoint,
  // Citations
  renderCitations,
  // Thinking
  renderThinkingBlock,
  // Permissions
  renderPermissionPrompt,
  // Status line
  enableStatusLine,
  updateStatusLine,
  clearStatusLine,
  // Error recovery
  renderRetryPrompt,
  renderFallbackNotice,
  // Chrome
  renderWelcome,
  renderPrompt,
  renderInputClose,
  renderResponseStart,
  renderResponseEnd,
  renderError,
  renderSystem,
  renderCost,
  renderPersonaSwitch,
  renderHelp,
  // Spinner
  startSpinner,
  stopSpinner,
  // Buddy
  setBuddyPose,
  animateBuddy,
  BUDDY_POSES,
  // Internals
  style,
  fg,
  PAD,
  MASCOT_TINY,
  thinLine,
  dottedLine,
  wordWrap,
  CONTENT_WIDTH,
};
