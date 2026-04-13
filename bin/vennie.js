#!/usr/bin/env node

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── ANSI Colors ──────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const log = {
  info: (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`),
  ok: (msg) => console.log(`${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
  error: (msg) => console.error(`${c.red}✗${c.reset} ${msg}`),
  step: (msg) => console.log(`\n${c.bold}${c.magenta}→${c.reset} ${c.bold}${msg}${c.reset}`),
  banner: (msg) => console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}\n`),
};

// ── Paths ────────────────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.config', 'vennie');
const VAULT_PATH_FILE = path.join(CONFIG_DIR, 'vault-path');
const ENV_FILE = path.join(CONFIG_DIR, 'env');
const DEFAULT_VAULT = path.join(os.homedir(), 'Vennie');
const VENNIE_ROOT = path.resolve(__dirname, '..');

// Load saved env vars (API keys etc)
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVaultPath() {
  if (fs.existsSync(VAULT_PATH_FILE)) {
    const p = fs.readFileSync(VAULT_PATH_FILE, 'utf8').trim();
    if (p && fs.existsSync(p)) return p;
  }
  if (fs.existsSync(DEFAULT_VAULT)) return DEFAULT_VAULT;
  return null;
}

function setVaultPath(vaultPath) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(VAULT_PATH_FILE, vaultPath, 'utf8');
}

function which(cmd) {
  try {
    return execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function printHelp() {
  console.log(`
${c.bold}${c.cyan}Vennie${c.reset} — The Product Career Operating System

${c.bold}Usage:${c.reset}
  ${c.green}vennie${c.reset}              Start a session (default)
  ${c.green}vennie setup${c.reset}        Set up your API key (first time)
  ${c.green}vennie init${c.reset}         Create a new vault and run onboarding
  ${c.green}vennie status${c.reset}       Quick status check
  ${c.green}vennie log${c.reset}          Quick capture (decision/win/idea/task/note)
  ${c.green}vennie brief${c.reset}        Print your morning brief
  ${c.green}vennie search${c.reset}       Search your vault
  ${c.green}vennie update${c.reset}       Check for and apply updates
  ${c.green}vennie desktop${c.reset}      Launch the desktop app
  ${c.green}vennie doctor${c.reset}       Health check (dependencies, MCP servers, hooks)
  ${c.green}vennie watch${c.reset}        Watch inbox for new files and auto-process
  ${c.green}vennie run${c.reset} ${c.dim}"prompt"${c.reset}  Run a prompt headlessly (no UI)
  ${c.green}vennie history${c.reset}      Browse and resume past sessions
  ${c.green}vennie help${c.reset}         Show this help message

${c.bold}Session resume:${c.reset}
  ${c.green}vennie -c${c.reset}           Resume the most recent session (--continue)
  ${c.green}vennie -H${c.reset}           Browse past sessions interactively (--history)
  ${c.green}vennie --session${c.reset} ${c.dim}<id>${c.reset}  Resume a specific session by ID

${c.bold}Run mode:${c.reset}
  ${c.green}vennie run${c.reset} "research competitors"           Run prompt, stream to stdout
  ${c.green}vennie run --yes${c.reset} "update the radar"         Auto-approve all tools
  ${c.green}vennie run -o out.md${c.reset} "write a PRD"          Save output to file
  ${c.dim}cat notes.txt | vennie run "extract action items"   Pipe input as context${c.reset}
  ${c.dim}echo "top priority?" | vennie                       Pipe triggers run mode${c.reset}

${c.bold}Model flags:${c.reset}
  ${c.green}--opus${c.reset}              Use Opus 4.6 (smartest, most expensive)
  ${c.green}--sonnet${c.reset}            Use Sonnet 4.6 (balanced — default)
  ${c.green}--haiku${c.reset}             Use Haiku 4.5 (fastest, cheapest)

${c.dim}By Mind the Product — https://vennie.ai${c.reset}
`);
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdSetup() {
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  log.banner('🐙 Vennie Setup');

  (async () => {
    // Check existing key
    if (process.env.ANTHROPIC_API_KEY) {
      const key = process.env.ANTHROPIC_API_KEY;
      const masked = key.slice(0, 10) + '...' + key.slice(-4);
      log.ok(`API key already configured: ${c.dim}${masked}${c.reset}`);
      const change = await ask(`\n  Want to change it? (y/N) `);
      if (change.toLowerCase() !== 'y') {
        console.log(`\n  You're good. Run ${c.green}vennie init${c.reset} to create your vault.\n`);
        rl.close();
        return;
      }
    }

    console.log(`\n  Vennie needs an Anthropic API key to work.`);
    console.log(`  Get one at: ${c.cyan}https://console.anthropic.com/settings/keys${c.reset}\n`);

    const key = await ask(`  ${c.bold}Paste your API key:${c.reset} `);

    if (!key || !key.startsWith('sk-ant-')) {
      log.error('That doesn\'t look right — Anthropic keys start with sk-ant-');
      rl.close();
      process.exit(1);
    }

    // Save to ~/.config/vennie/env
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(ENV_FILE, `ANTHROPIC_API_KEY=${key}\n`, { mode: 0o600 });
    process.env.ANTHROPIC_API_KEY = key;

    log.ok('API key saved');
    console.log(`  ${c.dim}Stored in ~/.config/vennie/env (private, not in your vault)${c.reset}`);

    // Ask about model preference
    console.log(`\n  ${c.bold}Which model do you want to use?${c.reset}`);
    console.log(`  ${c.cyan}1${c.reset} Claude Sonnet 4.6 ${c.dim}(fast, cheap — recommended)${c.reset}`);
    console.log(`  ${c.cyan}2${c.reset} Claude Opus 4.6 ${c.dim}(smartest, more expensive)${c.reset}`);
    console.log(`  ${c.cyan}3${c.reset} Claude Haiku 4.5 ${c.dim}(fastest, cheapest)${c.reset}\n`);

    const modelChoice = await ask(`  Choice (1/2/3): `);
    const models = {
      '1': 'claude-sonnet-4-6',
      '2': 'claude-opus-4-6',
      '3': 'claude-haiku-4-5-20251001',
    };
    const model = models[modelChoice] || models['1'];

    // Append model to env file
    let envContent = fs.readFileSync(ENV_FILE, 'utf8');
    envContent += `VENNIE_MODEL=${model}\n`;
    fs.writeFileSync(ENV_FILE, envContent, { mode: 0o600 });

    log.ok(`Model set to ${c.bold}${model}${c.reset}`);

    console.log(`\n  ${c.green}${c.bold}You're all set!${c.reset}`);
    console.log(`  Run ${c.green}vennie init${c.reset} to create your vault and start onboarding.\n`);

    rl.close();
  })();
}

function cmdInit() {
  log.banner('🐙 Vennie — New Vault Setup');

  // Check for Anthropic API key — guide to setup if missing
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('No API key found.');
    console.log(`\n  Run ${c.green}vennie setup${c.reset} first — it takes 30 seconds.\n`);
    process.exit(1);
  }
  log.ok('Anthropic API key configured');

  // Determine vault location
  let vaultPath = DEFAULT_VAULT;
  const argIdx = process.argv.indexOf('--path');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    vaultPath = path.resolve(process.argv[argIdx + 1]);
  }

  if (fs.existsSync(vaultPath) && fs.existsSync(path.join(vaultPath, 'CLAUDE.md'))) {
    log.warn(`Vault already exists at ${c.bold}${vaultPath}${c.reset}`);
    log.info(`Run ${c.green}vennie${c.reset} to start a session.`);
    return;
  }

  log.step('Creating vault structure');

  // Copy vault template
  const templateDir = path.join(VENNIE_ROOT, 'vault-template');
  if (!fs.existsSync(templateDir)) {
    log.error(`Vault template not found at ${templateDir}`);
    log.info('Your Vennie installation may be corrupted. Try reinstalling.');
    process.exit(1);
  }

  copyDirSync(templateDir, vaultPath);

  // Copy VENNIE.md to vault as CLAUDE.md (Vennie reads CLAUDE.md as system prompt)
  const venniemd = path.join(VENNIE_ROOT, 'VENNIE.md');
  if (fs.existsSync(venniemd)) {
    fs.copyFileSync(venniemd, path.join(vaultPath, 'CLAUDE.md'));
  }

  // Copy .vennie config directory
  const vennieConfigSrc = path.join(VENNIE_ROOT, '.vennie');
  const vennieConfigDest = path.join(vaultPath, '.vennie');
  if (fs.existsSync(vennieConfigSrc)) {
    copyDirSync(vennieConfigSrc, vennieConfigDest);
  }

  // Copy core/ directory (MCP servers + paths)
  const coreSrc = path.join(VENNIE_ROOT, 'core');
  const coreDest = path.join(vaultPath, 'core');
  if (fs.existsSync(coreSrc)) {
    copyDirSync(coreSrc, coreDest);
  }

  // Create core vault directories
  const dirs = [
    '00-Inbox',
    '00-Inbox/Meetings',
    '00-Inbox/Ideas',
    '01-Quarter_Goals',
    '02-Week_Priorities',
    '03-Tasks',
    '04-Projects',
    '05-Areas',
    '05-Areas/People',
    '05-Areas/People/Internal',
    '05-Areas/People/External',
    '05-Areas/Companies',
    '05-Areas/Career',
    '05-Areas/Career/Evidence',
    '06-Resources',
    '06-Resources/Industry',
    '07-Archives',
    '08-Resources',
    '08-Resources/Industry',
    'System/Session_Learnings',
  ];

  for (const dir of dirs) {
    fs.mkdirSync(path.join(vaultPath, dir), { recursive: true });
  }

  // Create placeholder files
  fs.writeFileSync(path.join(vaultPath, '03-Tasks', 'Tasks.md'), '# Tasks\n\n*No tasks yet. Use Vennie to create your first task.*\n', 'utf8');
  fs.writeFileSync(path.join(vaultPath, '01-Quarter_Goals', 'Quarter_Goals.md'), '# Quarter Goals\n\n*Set your first quarter goals with `/quarter-plan`.*\n', 'utf8');
  fs.writeFileSync(path.join(vaultPath, '02-Week_Priorities', 'Week_Priorities.md'), '# Week Priorities\n\n*Set your weekly priorities with `/week-plan`.*\n', 'utf8');

  // Save vault path
  setVaultPath(vaultPath);

  log.ok(`Vault created at ${c.bold}${vaultPath}${c.reset}`);
  log.step('Launching Vennie');

  // Launch Vennie's own CLI for onboarding
  const version = (() => {
    try { return require(path.join(VENNIE_ROOT, 'package.json')).version; }
    catch { return '0.1.0'; }
  })();

  const { startInkApp } = require('../src/cli/app.js');
  startInkApp(vaultPath, version);
}

function cmdStart(resumedSession) {
  const vaultPath = getVaultPath();

  if (!vaultPath) {
    log.warn('No Vennie vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to create one.`);
    process.exit(1);
  }

  // Check for Anthropic API key
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('No API key found.');
    console.log(`\n  Run ${c.green}vennie setup${c.reset} first — it takes 30 seconds.\n`);
    process.exit(1);
  }

  const version = (() => {
    try { return require(path.join(VENNIE_ROOT, 'package.json')).version; }
    catch { return '0.1.0'; }
  })();

  const { startInkApp } = require('../src/cli/app.js');
  startInkApp(vaultPath, version, resumedSession || null);
}

function cmdContinue() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    log.warn('No Vennie vault found.');
    process.exit(1);
  }

  const { listSessions, resumeSession } = require('../src/core/context-manager.js');
  const sessions = listSessions(vaultPath, 1);
  if (sessions.length === 0) {
    log.warn('No saved sessions to resume.');
    log.info('Start a new session with just `vennie`.');
    process.exit(1);
  }

  const session = resumeSession(vaultPath, sessions[0].id);
  if (!session) {
    log.error('Failed to load session.');
    process.exit(1);
  }

  log.ok(`Resuming: ${sessions[0].summary || sessions[0].id}`);
  cmdStart(session);
}

function cmdResumeSession(sessionId) {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    log.warn('No Vennie vault found.');
    process.exit(1);
  }

  const { resumeSession } = require('../src/core/context-manager.js');
  const session = resumeSession(vaultPath, sessionId);
  if (!session) {
    log.error(`Session not found: ${sessionId}`);
    process.exit(1);
  }

  log.ok(`Resuming: ${session.summary || sessionId}`);
  cmdStart(session);
}

function cmdHistory() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    log.warn('No Vennie vault found.');
    process.exit(1);
  }

  const { listSessions, resumeSession } = require('../src/core/context-manager.js');
  const sessions = listSessions(vaultPath, 20);
  if (sessions.length === 0) {
    log.warn('No saved sessions.');
    log.info('Start a session with `vennie` — sessions are auto-saved on exit.');
    process.exit(0);
  }

  log.banner('Session History');
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const date = new Date(s.timestamp).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
    const topic = s.summary || 'Untitled';
    const costStr = s.cost > 0 ? ` · $${s.cost.toFixed(4)}` : '';
    console.log(`  ${c.cyan}${String(i + 1).padStart(2)}${c.reset}  ${c.dim}${date}${c.reset}  ${topic} ${c.dim}(${s.messageCount} msgs${costStr})${c.reset}`);
  }

  console.log();
  const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`  ${c.bold}Resume session (number) or Enter to cancel:${c.reset} `, (answer) => {
    rl.close();
    const idx = parseInt(answer, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= sessions.length) {
      if (answer.trim()) log.warn('Invalid selection.');
      process.exit(0);
    }

    const session = resumeSession(vaultPath, sessions[idx].id);
    if (!session) {
      log.error('Failed to load session.');
      process.exit(1);
    }

    log.ok(`Resuming: ${sessions[idx].summary || sessions[idx].id}`);
    cmdStart(session);
  });
}

function cmdStatus() {
  const vaultPath = getVaultPath();

  log.banner('Vennie Status');

  // Vault
  if (vaultPath) {
    log.ok(`Vault: ${c.bold}${vaultPath}${c.reset}`);

    // Check profile
    const profilePath = path.join(vaultPath, 'System', 'profile.yaml');
    if (fs.existsSync(profilePath)) {
      const content = fs.readFileSync(profilePath, 'utf8');
      const nameMatch = content.match(/^name:\s*"?(.+?)"?\s*$/m);
      const onboardedMatch = content.match(/^onboarded:\s*(true|false)/m);
      if (nameMatch && nameMatch[1]) log.ok(`User: ${c.bold}${nameMatch[1]}${c.reset}`);
      if (onboardedMatch) {
        const onboarded = onboardedMatch[1] === 'true';
        if (onboarded) {
          log.ok('Onboarding: complete');
        } else {
          log.warn('Onboarding: incomplete — run `vennie init` to finish');
        }
      }
    }

    // Count files
    const countFiles = (dir) => {
      try {
        return fs.readdirSync(path.join(vaultPath, dir), { recursive: true })
          .filter(f => f.endsWith('.md')).length;
      } catch { return 0; }
    };

    const people = countFiles('05-Areas/People');
    const projects = countFiles('04-Projects');
    const meetings = countFiles('00-Inbox/Meetings');

    console.log(`\n  ${c.dim}People:${c.reset}   ${people} pages`);
    console.log(`  ${c.dim}Projects:${c.reset} ${projects} pages`);
    console.log(`  ${c.dim}Meetings:${c.reset} ${meetings} notes`);
  } else {
    log.warn('No vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to get started.`);
  }

  // API key
  console.log();
  if (process.env.ANTHROPIC_API_KEY) {
    const key = process.env.ANTHROPIC_API_KEY;
    const masked = key.slice(0, 10) + '...' + key.slice(-4);
    log.ok(`Anthropic API key: ${c.dim}${masked}${c.reset}`);
  } else {
    log.error('Anthropic API key: not set');
  }

  // Model
  const model = process.env.VENNIE_MODEL || 'claude-sonnet-4-6 (default)';
  log.info(`Model: ${c.bold}${model}${c.reset}`);

  // Python
  const python = which('python3') || which('python');
  if (python) {
    try {
      const ver = execSync('python3 --version 2>/dev/null || python --version', { encoding: 'utf8' }).trim();
      log.ok(`Python: ${ver}`);
    } catch {
      log.ok(`Python: found at ${python}`);
    }
  } else {
    log.warn('Python: not found (MCP servers won\'t work)');
  }

  console.log();
}

function cmdDoctor() {
  const vaultPath = getVaultPath();

  log.banner('Vennie Doctor');

  let issues = 0;
  let warnings = 0;

  // 1. Node version
  const nodeVer = process.versions.node.split('.').map(Number);
  if (nodeVer[0] >= 18) {
    log.ok(`Node.js ${process.versions.node}`);
  } else {
    log.error(`Node.js ${process.versions.node} — need 18+`);
    issues++;
  }

  // 2. Anthropic API key
  if (process.env.ANTHROPIC_API_KEY) {
    log.ok('ANTHROPIC_API_KEY is set');
  } else {
    log.error('ANTHROPIC_API_KEY not set — Vennie cannot talk to Claude');
    console.log(`    ${c.dim}export ANTHROPIC_API_KEY="sk-ant-..."${c.reset}`);
    issues++;
  }

  // 3. Anthropic SDK
  try {
    const sdk = require('@anthropic-ai/sdk');
    log.ok('@anthropic-ai/sdk installed');
  } catch {
    log.error('@anthropic-ai/sdk not installed — run: npm install');
    issues++;
  }

  // 4. MCP SDK (optional, for MCP server connections)
  try {
    require('@modelcontextprotocol/sdk/client/index.js');
    log.ok('@modelcontextprotocol/sdk installed');
  } catch {
    log.warn('@modelcontextprotocol/sdk not installed — MCP servers won\'t connect');
    warnings++;
  }

  // 5. Python (for MCP servers)
  const python = which('python3') || which('python');
  if (python) {
    try {
      const ver = execSync('python3 --version 2>&1 || python --version 2>&1', { encoding: 'utf8' }).trim();
      const match = ver.match(/(\d+)\.(\d+)/);
      if (match && (parseInt(match[1]) > 3 || (parseInt(match[1]) === 3 && parseInt(match[2]) >= 8))) {
        log.ok(`${ver}`);
      } else {
        log.warn(`${ver} — recommend Python 3.8+ for MCP servers`);
        warnings++;
      }
    } catch {
      log.warn('Could not determine Python version');
      warnings++;
    }
  } else {
    log.warn('Python not found — MCP servers require Python 3.8+');
    warnings++;
  }

  // 6. pip + Python packages
  if (which('pip3') || which('pip')) {
    log.ok('pip available');
  } else {
    log.warn('pip not found — needed for MCP server dependencies');
    warnings++;
  }

  const checkPyPkg = (pkg) => {
    try {
      execSync(`python3 -c "import ${pkg}" 2>/dev/null`, { encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  };

  for (const pkg of ['mcp', 'yaml']) {
    if (checkPyPkg(pkg)) {
      log.ok(`Python package: ${pkg === 'yaml' ? 'pyyaml' : pkg}`);
    } else {
      log.warn(`Python package missing: ${pkg === 'yaml' ? 'pyyaml' : pkg} — run: pip install ${pkg === 'yaml' ? 'pyyaml' : pkg}`);
      warnings++;
    }
  }

  // 7. Vault
  if (vaultPath) {
    log.ok(`Vault: ${vaultPath}`);

    // Check critical files
    const criticalFiles = [
      'System/profile.yaml',
      'System/philosophy.yaml',
      'System/voice.yaml',
      'System/personality-model.md',
    ];

    for (const f of criticalFiles) {
      const fp = path.join(vaultPath, f);
      if (fs.existsSync(fp)) {
        log.ok(`  ${f}`);
      } else {
        log.warn(`  ${f} — missing`);
        warnings++;
      }
    }

    // Check MCP configs
    const mcpDir = path.join(vaultPath, '.vennie', 'mcp');
    if (fs.existsSync(mcpDir)) {
      const configs = fs.readdirSync(mcpDir).filter(f => f.endsWith('.json'));
      log.ok(`  MCP configs: ${configs.length} found`);
    } else {
      log.warn('  MCP config directory missing');
      warnings++;
    }
  } else {
    log.warn('No vault found — run `vennie init`');
    warnings++;
  }

  // Summary
  console.log();
  if (issues === 0 && warnings === 0) {
    log.ok(`${c.bold}${c.green}All checks passed.${c.reset}`);
  } else {
    if (issues > 0) log.error(`${issues} issue${issues > 1 ? 's' : ''} found`);
    if (warnings > 0) log.warn(`${warnings} warning${warnings > 1 ? 's' : ''}`);
  }
  console.log();
}

function cmdDesktop() {
  log.banner('Vennie Desktop');

  let electronPath;
  try {
    electronPath = require('electron');
  } catch {
    log.error('Electron not installed.');
    log.info(`Install desktop dependencies: ${c.green}npm install${c.reset} in the Vennie directory`);
    process.exit(1);
  }

  const mainPath = path.join(VENNIE_ROOT, 'src', 'desktop', 'main', 'index.js');
  if (!fs.existsSync(mainPath)) {
    log.error('Desktop app not found. Make sure you have the full Vennie installation.');
    process.exit(1);
  }

  log.info('Launching desktop app...');
  const child = spawn(electronPath, [mainPath], {
    stdio: 'inherit',
    env: { ...process.env },
    detached: true,
  });
  child.unref();

  // Don't wait for the Electron process — let it run independently
  setTimeout(() => process.exit(0), 500);
}

function cmdLog() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    log.error('No Vennie vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to create one.`);
    process.exit(1);
  }

  // Collect everything after "log" as the input
  const logIdx = process.argv.indexOf('log');
  const rawInput = process.argv.slice(logIdx + 1).join(' ').trim();

  if (!rawInput) {
    log.error('Nothing to log.');
    console.log(`\n${c.bold}Usage:${c.reset}`);
    console.log(`  ${c.green}vennie log "decision: going with Stripe"${c.reset}`);
    console.log(`  ${c.green}vennie log "win: shipped the new onboarding flow"${c.reset}`);
    console.log(`  ${c.green}vennie log "idea: what if we added voice input"${c.reset}`);
    console.log(`  ${c.green}vennie log "task: review Q1 numbers by Friday"${c.reset}`);
    console.log(`  ${c.green}vennie log "note: Sarah mentioned Q2 reorg"${c.reset}`);
    console.log(`  ${c.green}vennie log "some quick note"${c.reset}  ${c.dim}(defaults to note)${c.reset}\n`);
    process.exit(1);
  }

  const { quickCapture, parseLogCommand } = require('../src/core/vault-pulse.js');

  // Parse type prefix — support "type: content" and "type content" formats
  let input = rawInput;
  // Normalize "type: content" → "type content" for the parser
  const colonMatch = input.match(/^(decision|win|idea|note|task):\s*/i);
  if (colonMatch) {
    input = colonMatch[1].toLowerCase() + ' ' + input.slice(colonMatch[0].length);
  }

  const { type, content } = parseLogCommand(input);

  if (!content) {
    log.error('Nothing to log — provide some text after the type.');
    process.exit(1);
  }

  try {
    const now = new Date();
    const time = now.toTimeString().slice(0, 5);
    const result = quickCapture(vaultPath, type, `[${time}] ${content}`);
    log.ok(`Logged ${c.bold}${type}${c.reset} to ${c.dim}${result.message.replace('Logged ' + type + ' in ', '')}${c.reset}`);
  } catch (err) {
    log.error(`Failed to log: ${err.message}`);
    process.exit(1);
  }
}

function cmdBrief() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    log.error('No Vennie vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to create one.`);
    process.exit(1);
  }

  const { generateMorningBrief } = require('../src/core/morning-brief.js');

  try {
    const brief = generateMorningBrief(vaultPath);

    // Print with ANSI colors for terminal
    console.log();
    console.log(`${c.bold}${c.cyan}  Morning Brief${c.reset}`);
    console.log(`${c.dim}  ${'-'.repeat(48)}${c.reset}`);
    console.log();
    console.log(`  ${c.bold}${c.yellow}Top Priority:${c.reset} ${brief.topPriority}`);

    for (const section of brief.sections) {
      console.log();
      console.log(`  ${c.bold}${c.magenta}${section.title}${c.reset}`);
      const contentLines = section.content.split('\n');
      for (const line of contentLines) {
        console.log(`  ${c.dim}${line}${c.reset}`);
      }
    }

    console.log();
  } catch (err) {
    log.error(`Failed to generate brief: ${err.message}`);
    process.exit(1);
  }
}

function cmdSearch() {
  const vaultPath = getVaultPath();
  if (!vaultPath) {
    log.error('No Vennie vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to create one.`);
    process.exit(1);
  }

  // Collect everything after "search" as the query
  const searchIdx = process.argv.indexOf('search');
  const query = process.argv.slice(searchIdx + 1).join(' ').trim();

  if (!query) {
    log.error('No search query provided.');
    console.log(`\n${c.bold}Usage:${c.reset}  ${c.green}vennie search "stakeholder alignment"${c.reset}\n`);
    process.exit(1);
  }

  const { searchVault } = require('../src/core/search.js');

  try {
    const results = searchVault(vaultPath, query, { topN: 10 });

    if (results.length === 0) {
      log.warn(`No results for "${query}"`);
      process.exit(0);
    }

    console.log();
    console.log(`${c.bold}${c.cyan}  Search: "${query}"${c.reset}  ${c.dim}(${results.length} result${results.length === 1 ? '' : 's'})${c.reset}`);
    console.log(`${c.dim}  ${'-'.repeat(48)}${c.reset}`);

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const scoreBar = c.dim + '[' + String(r.score.toFixed(2)).padStart(5) + ']' + c.reset;
      console.log();
      console.log(`  ${c.bold}${c.green}${i + 1}.${c.reset} ${c.bold}${r.file}${c.reset}  ${scoreBar}`);

      // Show a trimmed snippet (first 160 chars, single line)
      const snippet = r.snippet
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
      // Replace **bold** markers with ANSI bold for terminal
      const coloredSnippet = snippet.replace(/\*\*(.+?)\*\*/g, `${c.yellow}$1${c.dim}`);
      console.log(`     ${c.dim}${coloredSnippet}${c.reset}`);
    }

    console.log();
  } catch (err) {
    log.error(`Search failed: ${err.message}`);
    process.exit(1);
  }
}

function cmdUpdate() {
  log.banner('Vennie Update');

  log.info('Checking for updates...');

  try {
    const current = require(path.join(VENNIE_ROOT, 'package.json')).version;
    log.info(`Current version: ${c.bold}v${current}${c.reset}`);

    // Check npm registry
    try {
      const latest = execSync('npm view vennie version 2>/dev/null', { encoding: 'utf8' }).trim();
      if (latest && latest !== current) {
        log.info(`New version available: ${c.bold}${c.green}v${latest}${c.reset}`);
        log.step('Updating...');
        execSync('npm install -g vennie@latest', { stdio: 'inherit' });
        log.ok('Updated successfully!');
      } else {
        log.ok('Already on the latest version.');
      }
    } catch {
      log.warn('Could not check npm registry. Check your internet connection.');
      log.info(`You can update manually: ${c.green}npm install -g vennie@latest${c.reset}`);
    }
  } catch (err) {
    log.error(`Update failed: ${err.message}`);
  }

  console.log();
}

// ── Run (headless agent) ────────────────────────────────────────────────────

function cmdRun(runArgs) {
  const vaultPath = getVaultPath();

  if (!vaultPath) {
    log.error('No Vennie vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to create one.`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('No API key found.');
    console.log(`\n  Run ${c.green}vennie setup${c.reset} first — it takes 30 seconds.\n`);
    process.exit(1);
  }

  // Parse flags from runArgs
  let yes = false;
  let output = null;
  const promptParts = [];

  for (let i = 0; i < runArgs.length; i++) {
    const arg = runArgs[i];
    if (arg === '--yes' || arg === '-y') {
      yes = true;
    } else if (arg === '-o' || arg === '--output') {
      output = runArgs[++i] || null;
    } else {
      promptParts.push(arg);
    }
  }

  const cliPrompt = promptParts.join(' ').trim();

  const { runHeadless, readStdin } = require('../src/cli/run.js');

  // Check for piped stdin
  const isPiped = !process.stdin.isTTY;

  (async () => {
    let prompt = cliPrompt;

    if (isPiped) {
      const stdinData = await readStdin();
      if (stdinData) {
        // Combine: stdin becomes context, CLI args become the instruction
        if (prompt) {
          prompt = `${prompt}\n\n---\n\n${stdinData}`;
        } else {
          prompt = stdinData;
        }
      }
    }

    if (!prompt) {
      log.error('No prompt provided.');
      console.log(`\n${c.bold}Usage:${c.reset}  ${c.green}vennie run "your prompt here"${c.reset}\n`);
      process.exit(1);
    }

    try {
      await runHeadless({ prompt, vaultPath, yes, output });
      process.exit(0);
    } catch (err) {
      log.error(`Run failed: ${err.message}`);
      process.exit(1);
    }
  })();
}

// ── Watch (file watcher) ──────────────────────────────────────────────────────

function cmdWatch() {
  const vaultPath = getVaultPath();

  if (!vaultPath) {
    log.error('No Vennie vault found.');
    log.info(`Run ${c.green}vennie init${c.reset} to create one.`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('No API key found.');
    console.log(`\n  Run ${c.green}vennie setup${c.reset} first — it takes 30 seconds.\n`);
    process.exit(1);
  }

  // Pass remaining args after 'watch' to the watcher
  const watchArgs = process.argv.slice(process.argv.indexOf('watch') + 1);

  const { startWatch } = require('../src/cli/watch.js');
  startWatch(vaultPath, watchArgs);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  // ── Model override flags ──────────────────────────────────────
  // --opus, --sonnet, --haiku set VENNIE_MODEL before the app starts
  const MODEL_FLAGS = {
    '--opus': 'claude-opus-4-6',
    '--sonnet': 'claude-sonnet-4-6',
    '--haiku': 'claude-haiku-4-5-20251001',
  };

  for (const [flag, modelId] of Object.entries(MODEL_FLAGS)) {
    const idx = args.indexOf(flag);
    if (idx !== -1) {
      process.env.VENNIE_MODEL = modelId;
      args.splice(idx, 1); // Remove the flag so it doesn't confuse command parsing
      break; // Only one model flag allowed
    }
  }

  // Handle session resume flags
  if (args.includes('--continue') || args.includes('-c')) {
    cmdContinue();
    return;
  }
  if (args.includes('--history') || args.includes('-H')) {
    cmdHistory();
    return;
  }
  const sessionIdx = args.indexOf('--session');
  if (sessionIdx !== -1) {
    const sessionId = args[sessionIdx + 1];
    if (!sessionId) {
      log.error('Usage: vennie --session <session-id>');
      process.exit(1);
    }
    cmdResumeSession(sessionId);
    return;
  }

  let command = args[0] || 'start';

  // Detect piped stdin with no explicit command — treat as headless run
  if (!process.stdin.isTTY && (command === 'start' || !args[0])) {
    command = 'run';
  }

  switch (command) {
    case 'run':
      cmdRun(args.slice(1));
      break;
    case 'setup':
      cmdSetup();
      break;
    case 'init':
      cmdInit();
      break;
    case 'start':
      cmdStart();
      break;
    case 'history':
      cmdHistory();
      break;
    case 'desktop':
    case '--desktop':
      cmdDesktop();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'update':
      cmdUpdate();
      break;
    case 'doctor':
      cmdDoctor();
      break;
    case 'log':
      cmdLog();
      break;
    case 'brief':
      cmdBrief();
      break;
    case 'search':
      cmdSearch();
      break;
    case 'watch':
      cmdWatch();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    case '--version':
    case '-v':
      try {
        const pkg = require(path.join(VENNIE_ROOT, 'package.json'));
        console.log(`vennie v${pkg.version}`);
      } catch {
        console.log('vennie v0.1.0');
      }
      break;
    default:
      log.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main();
