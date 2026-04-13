'use strict';

const fs = require('fs');
const path = require('path');
const { agentLoop, buildSystemPrompt, getToolTier } = require('../core/agent.js');
const { getToolDefinitions, executeTool } = require('../core/tools.js');
const { startMCPServers } = require('../core/mcp.js');

// ── ANSI helpers for stderr output ─────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg) {
  process.stderr.write(msg + '\n');
}

// ── Headless Agent Runner ──────────────────────────────────────────────────

/**
 * Run the agent loop headlessly — no Ink, no React, just stdout/stderr.
 *
 * @param {object} options
 * @param {string} options.prompt - The user prompt to send
 * @param {string} options.vaultPath - Path to the Vennie vault
 * @param {boolean} [options.yes=false] - Auto-approve all tool tiers
 * @param {string|null} [options.output=null] - File path to write output to
 * @param {string|null} [options.persona=null] - Active persona name
 * @returns {Promise<string>} The final assistant text response
 */
async function runHeadless(options) {
  const { prompt, vaultPath, yes = false, output = null, persona = null } = options;

  if (!prompt) {
    log(`${c.red}Error:${c.reset} No prompt provided.`);
    process.exit(1);
  }

  if (!vaultPath || !fs.existsSync(vaultPath)) {
    log(`${c.red}Error:${c.reset} Vault not found at ${vaultPath || '(none)'}`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log(`${c.red}Error:${c.reset} ANTHROPIC_API_KEY not set. Run: vennie setup`);
    process.exit(1);
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(vaultPath, persona);

  // Load built-in tools
  const builtinTools = getToolDefinitions();

  // Start MCP servers (suppress render.js import errors in headless mode)
  let mcpTools = [];
  let mcpCallTool = null;
  let mcpShutdown = () => {};

  try {
    const mcp = await startMCPServers(vaultPath);
    mcpTools = mcp.tools;
    mcpCallTool = mcp.callTool;
    mcpShutdown = mcp.shutdown;
    if (mcpTools.length > 0) {
      log(`${c.dim}MCP: ${mcpTools.length} tools from ${new Set(mcpTools.map(t => t._server)).size} server(s)${c.reset}`);
    }
  } catch (err) {
    log(`${c.yellow}Warning:${c.reset} MCP startup failed: ${err.message}`);
  }

  const allTools = [...builtinTools, ...mcpTools];

  // Tool execution context
  const toolContext = {
    vaultPath,
    mcpCallTool,
    // AskUser in headless mode: auto-respond or skip
    askUser: async (question) => {
      log(`${c.magenta}? ${question}${c.reset}`);
      if (yes) {
        log(`${c.dim}  (auto-approved via --yes)${c.reset}`);
        return { response: 'yes' };
      }
      return { response: '(skipped — headless mode, use --yes to auto-respond)' };
    },
  };

  // Permission checker
  const checkPermission = async (toolName, toolInput, tier) => {
    if (yes) return true; // --yes approves everything
    if (tier === 'auto') return true;
    if (tier === 'confirm') return true; // Allow writes in headless (vault-scoped)
    // 'approve' tier (Bash) — skip unless --yes
    log(`${c.yellow}Skipped:${c.reset} ${toolName} (requires --yes for approve-tier tools)`);
    return false;
  };

  // Build messages
  const messages = [{ role: 'user', content: prompt }];

  // Execute tool wrapper
  const executeToolFn = async (name, input) => {
    return executeTool(name, input, toolContext);
  };

  // Run the agent loop
  let fullText = '';

  log(`${c.dim}Model: ${process.env.VENNIE_MODEL || 'claude-sonnet-4-6'}${c.reset}`);
  log('');

  try {
    for await (const event of agentLoop(messages, allTools, systemPrompt, {
      executeTool: executeToolFn,
      checkPermission,
    })) {
      switch (event.type) {
        case 'text_delta':
          process.stdout.write(event.text);
          fullText += event.text;
          break;

        case 'thinking_delta':
          // Suppress thinking in headless mode
          break;

        case 'tool_start': {
          const inputPreview = summarizeToolInput(event.name, event.input);
          log(`${c.cyan}tool:${c.reset} ${event.name} ${c.dim}${inputPreview}${c.reset}`);
          break;
        }

        case 'tool_result': {
          const status = event.success ? `${c.green}ok${c.reset}` : `${c.red}err${c.reset}`;
          const duration = event.duration ? ` ${c.dim}${event.duration}ms${c.reset}` : '';
          log(`  ${status}${duration}`);
          break;
        }

        case 'usage':
          log('');
          log(`${c.dim}Tokens: ${event.inputTokens.toLocaleString()} in / ${event.outputTokens.toLocaleString()} out — $${event.cost.toFixed(4)}${c.reset}`);
          break;

        case 'error':
          log(`${c.red}Error:${c.reset} ${event.message}`);
          break;

        case 'done':
          break;

        // Ignore other event types (turn_progress, checkpoint, citations)
      }
    }
  } finally {
    mcpShutdown();
  }

  // Ensure trailing newline on stdout
  if (fullText && !fullText.endsWith('\n')) {
    process.stdout.write('\n');
  }

  // Write output file if requested
  if (output) {
    const outputPath = path.resolve(output);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, fullText, 'utf8');
    log(`${c.green}Saved:${c.reset} ${outputPath}`);
  }

  return fullText;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a compact one-liner summary of tool input for stderr.
 */
function summarizeToolInput(toolName, input) {
  if (!input) return '';

  switch (toolName) {
    case 'Read':
      return truncate(input.file_path || '', 80);
    case 'Write':
      return `${truncate(input.file_path || '', 60)} (${(input.content || '').length} chars)`;
    case 'Edit':
      return truncate(input.file_path || '', 80);
    case 'Bash':
      return truncate(input.command || '', 80);
    case 'Glob':
      return `${input.pattern || ''} ${input.path ? 'in ' + truncate(input.path, 40) : ''}`.trim();
    case 'Grep':
      return `/${input.pattern || ''}/ ${input.path ? 'in ' + truncate(input.path, 40) : ''}`.trim();
    case 'WebFetch':
      return truncate(input.url || '', 80);
    case 'AskUser':
      return truncate(input.question || '', 60);
    default:
      // MCP tools — show first key-value pair
      if (toolName.startsWith('mcp__')) {
        const keys = Object.keys(input);
        if (keys.length === 0) return '';
        const first = keys[0];
        return `${first}=${truncate(String(input[first]), 50)}`;
      }
      return '';
  }
}

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

// ── Read stdin pipe ────────────────────────────────────────────────────────

/**
 * Read all data from stdin (when piped).
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  runHeadless,
  readStdin,
};
