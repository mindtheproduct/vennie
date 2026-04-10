#!/usr/bin/env node

'use strict';

const { execSync } = require('child_process');

// ── ANSI Colors ──────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = {
  ok: (msg) => console.log(`  ${c.green}\u2713${c.reset} ${msg}`),
  warn: (msg) => console.log(`  ${c.yellow}\u26A0${c.reset} ${msg}`),
  info: (msg) => console.log(`  ${c.cyan}\u2139${c.reset} ${msg}`),
};

function which(cmd) {
  try {
    return execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${c.bold}${c.cyan}  Vennie${c.reset} v1.0.0 — Post-install checks\n`);

let hasIssues = false;

// 1. Node version (already guaranteed by engines, but double-check)
const nodeVer = process.versions.node;
const major = parseInt(nodeVer.split('.')[0]);
if (major >= 18) {
  log.ok(`Node.js ${nodeVer}`);
} else {
  log.warn(`Node.js ${nodeVer} — Vennie works best with Node 18+`);
  hasIssues = true;
}

// 2. Python (optional — needed for MCP servers)
const python = which('python3') || which('python');
if (python) {
  try {
    const ver = execSync('python3 --version 2>/dev/null || python --version', { encoding: 'utf8' }).trim();
    log.ok(`${ver} ${c.dim}(optional — for MCP integrations)${c.reset}`);
  } catch {
    log.ok(`Python found ${c.dim}(optional — for MCP integrations)${c.reset}`);
  }
} else {
  log.info(`Python not found ${c.dim}(optional — only needed for MCP server integrations)${c.reset}`);
}

// 3. Install Python dependencies if Python is available
if (python) {
  const pip = which('pip3') || which('pip');
  if (pip) {
    try {
      execSync('pip3 install mcp pyyaml --quiet 2>/dev/null || pip install mcp pyyaml --quiet', {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });
      log.ok('Python packages: mcp, pyyaml');
    } catch {
      log.info(`Optional: ${c.cyan}pip install mcp pyyaml${c.reset} for MCP integrations`);
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log();

if (hasIssues) {
  console.log(`  ${c.yellow}Some optional dependencies are missing.${c.reset}\n`);
}

console.log(`  ${c.green}${c.bold}Ready!${c.reset}\n`);
console.log(`  ${c.bold}Get started:${c.reset}`);
console.log(`    ${c.green}vennie setup${c.reset}   Set up your Anthropic API key`);
console.log(`    ${c.green}vennie init${c.reset}    Create your vault and start onboarding`);
console.log(`    ${c.green}vennie${c.reset}         Start a session\n`);
