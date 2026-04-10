'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Tool Definitions ────────────────────────────────────────────────────────
// These are the built-in tools Vennie exposes to Claude, similar to Claude Code's
// own tool set but scoped to what Vennie needs.

function getToolDefinitions() {
  return [
    {
      name: 'Read',
      description: 'Read a file from the filesystem. Returns content with line numbers.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to read' },
          offset: { type: 'integer', description: 'Start line number (0-indexed). Omit to read from beginning.' },
          limit: { type: 'integer', description: 'Max number of lines to return. Omit to read the whole file.' },
        },
        required: ['file_path'],
      },
    },
    {
      name: 'Write',
      description: 'Write content to a file. Creates the file and any parent directories if they don\'t exist. Overwrites existing content.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to write' },
          content: { type: 'string', description: 'The full content to write to the file' },
        },
        required: ['file_path', 'content'],
      },
    },
    {
      name: 'Edit',
      description: 'Replace an exact string in a file. The old_string must appear exactly once in the file. Use for surgical edits.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the file to edit' },
          old_string: { type: 'string', description: 'The exact string to find and replace (must be unique in the file)' },
          new_string: { type: 'string', description: 'The replacement string' },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
    {
      name: 'Bash',
      description: 'Execute a shell command and return stdout + stderr. Use for running scripts, git commands, etc.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          timeout: { type: 'integer', description: 'Timeout in milliseconds (default: 120000)', default: 120000 },
        },
        required: ['command'],
      },
    },
    {
      name: 'Glob',
      description: 'Find files matching a glob pattern. Returns file paths sorted by modification time.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.md", "src/**/*.js")' },
          path: { type: 'string', description: 'Directory to search in. Defaults to vault root.' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'Grep',
      description: 'Search file contents using regex. Returns matching file paths and line content.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'File or directory to search in' },
          glob: { type: 'string', description: 'File type filter glob (e.g., "*.md", "*.yaml")' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'WebFetch',
      description: 'Fetch content from a URL. Returns text content, truncated to 50k characters.',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
    {
      name: 'WebSearch',
      description: 'Search the web (stub — not yet configured).',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'AskUser',
      description: 'Ask the user a question and wait for their typed response. Use when you need clarification or confirmation.',
      input_schema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask the user' },
        },
        required: ['question'],
      },
    },
  ];
}

// ── Tool Executors ──────────────────────────────────────────────────────────
// Each function takes (input, context) where context provides { vaultPath, readline }.

const executors = {
  async Read(input, context) {
    const filePath = resolveToolPath(input.file_path, context.vaultPath);

    if (!fs.existsSync(filePath)) {
      return { error: `File not found: ${filePath}` };
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return { error: `Path is a directory, not a file: ${filePath}` };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    const offset = input.offset || 0;
    const limit = input.limit || lines.length;
    const slice = lines.slice(offset, offset + limit);

    // Add line numbers (1-indexed, matching cat -n)
    const numbered = slice.map((line, i) => `${offset + i + 1}\t${line}`).join('\n');

    return {
      content: numbered,
      total_lines: lines.length,
      showing: `${offset + 1}-${Math.min(offset + limit, lines.length)} of ${lines.length}`,
    };
  },

  async Write(input, context) {
    const filePath = resolveToolPath(input.file_path, context.vaultPath);

    // Create parent directories
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, input.content, 'utf8');

    return {
      success: true,
      path: filePath,
      bytes: Buffer.byteLength(input.content, 'utf8'),
    };
  },

  async Edit(input, context) {
    const filePath = resolveToolPath(input.file_path, context.vaultPath);

    if (!fs.existsSync(filePath)) {
      return { error: `File not found: ${filePath}` };
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Count occurrences
    const occurrences = content.split(input.old_string).length - 1;

    if (occurrences === 0) {
      return { error: `old_string not found in ${filePath}. Make sure it matches exactly, including whitespace and indentation.` };
    }

    if (occurrences > 1) {
      return { error: `old_string found ${occurrences} times in ${filePath}. It must be unique. Provide more surrounding context to disambiguate.` };
    }

    const newContent = content.replace(input.old_string, input.new_string);
    fs.writeFileSync(filePath, newContent, 'utf8');

    return {
      success: true,
      path: filePath,
    };
  },

  async Bash(input, context) {
    const timeout = input.timeout || 120000;

    try {
      const result = execSync(input.command, {
        cwd: context.vaultPath,
        timeout,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, VENNIE_VAULT: context.vaultPath },
        shell: '/bin/zsh',
      });

      // Truncate very long output
      const maxLen = 100000;
      if (result.length > maxLen) {
        return {
          output: result.slice(0, maxLen) + `\n\n... (truncated, ${result.length} total chars)`,
          truncated: true,
        };
      }

      return { output: result || '(no output)' };
    } catch (err) {
      // execSync throws on non-zero exit code
      const stdout = err.stdout || '';
      const stderr = err.stderr || '';
      return {
        error: `Command exited with code ${err.status || 'unknown'}`,
        stdout: stdout.slice(0, 50000),
        stderr: stderr.slice(0, 50000),
      };
    }
  },

  async Glob(input, context) {
    const searchPath = input.path || context.vaultPath;
    const pattern = input.pattern;

    try {
      // Use find for basic glob matching, ripgrep --files for more complex patterns
      // Try rg first (fast), fall back to find
      let cmd;
      if (pattern.includes('**')) {
        // Recursive glob — use find with -name on the last component
        const parts = pattern.split('/');
        const namePattern = parts[parts.length - 1];
        cmd = `find "${searchPath}" -name "${namePattern}" -type f 2>/dev/null | head -500 | sort`;
      } else {
        cmd = `find "${searchPath}" -name "${pattern}" -type f 2>/dev/null | head -500 | sort`;
      }

      const result = execSync(cmd, {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 5 * 1024 * 1024,
      }).trim();

      const files = result ? result.split('\n').filter(Boolean) : [];
      return {
        files,
        count: files.length,
        truncated: files.length === 500,
      };
    } catch (err) {
      return { files: [], count: 0, error: err.message };
    }
  },

  async Grep(input, context) {
    const searchPath = input.path || context.vaultPath;
    const pattern = input.pattern;

    try {
      // Prefer ripgrep if available, fall back to grep
      let cmd;
      const hasRg = (() => {
        try { execSync('which rg', { encoding: 'utf8' }); return true; } catch { return false; }
      })();

      if (hasRg) {
        cmd = `rg -n --max-count 100 --max-filesize 1M`;
        if (input.glob) cmd += ` --glob "${input.glob}"`;
        cmd += ` "${pattern}" "${searchPath}" 2>/dev/null`;
      } else {
        cmd = `grep -rn --max-count=100`;
        if (input.glob) cmd += ` --include="${input.glob}"`;
        cmd += ` "${pattern}" "${searchPath}" 2>/dev/null`;
      }

      const result = execSync(cmd, {
        encoding: 'utf8',
        timeout: 15000,
        maxBuffer: 5 * 1024 * 1024,
      }).trim();

      const lines = result ? result.split('\n').filter(Boolean) : [];
      return {
        matches: lines.slice(0, 200),
        count: lines.length,
        truncated: lines.length > 200,
      };
    } catch (err) {
      // grep exits 1 on no matches — that's fine
      if (err.status === 1) {
        return { matches: [], count: 0 };
      }
      return { matches: [], count: 0, error: err.message };
    }
  },

  async WebFetch(input, _context) {
    try {
      const response = await fetch(input.url, {
        headers: {
          'User-Agent': 'Vennie/0.1 (product-career-coach)',
          'Accept': 'text/html,application/json,text/plain',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const contentType = response.headers.get('content-type') || '';
      let text = await response.text();

      // Truncate to 50k chars
      const maxLen = 50000;
      if (text.length > maxLen) {
        text = text.slice(0, maxLen) + `\n\n... (truncated, ${text.length} total chars)`;
      }

      return {
        content: text,
        content_type: contentType,
        status: response.status,
      };
    } catch (err) {
      return { error: `Fetch failed: ${err.message}` };
    }
  },

  async WebSearch(_input, _context) {
    return {
      error: 'Web search is not yet configured. Use WebFetch with a specific URL instead.',
    };
  },

  async AskUser(input, context) {
    // Ink-based: use the askUser bridge if available
    if (context.askUser) {
      return context.askUser(input.question);
    }

    // Fallback: readline-based (legacy CLI)
    const rl = context.readline;
    if (!rl) {
      return { error: 'No readline interface available for user interaction.' };
    }

    const { fg, style } = require('./render.js');
    process.stdout.write(`\n  ${fg.magenta}?${style.reset} ${input.question}\n`);

    return new Promise((resolve) => {
      const { renderPrompt } = require('./render.js');
      renderPrompt(context.personaName);
      rl.once('line', (answer) => {
        resolve({ response: answer.trim() });
      });
    });
  },
};

// ── Main executor ───────────────────────────────────────────────────────────

async function executeTool(name, input, context) {
  // Check built-in tools first
  if (executors[name]) {
    return executors[name](input, context);
  }

  // Check MCP tools (prefixed with mcp__)
  if (name.startsWith('mcp__') && context.mcpCallTool) {
    return context.mcpCallTool(name, input);
  }

  return { error: `Unknown tool: ${name}` };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a tool path — if relative, resolve against vault root.
 */
function resolveToolPath(filePath, vaultPath) {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(vaultPath, filePath);
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getToolDefinitions,
  executeTool,
};
