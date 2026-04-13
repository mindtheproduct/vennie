'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
};

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WATCH_DIRS = [
  '00-Inbox/Meetings',
  '00-Inbox/Ideas',
  '00-Inbox/Decisions',
];

const SETTLE_DELAY_MS = 2000; // Wait for file to finish writing
const PROCESSED_FILE = '.vennie/watch-processed.json';

// ── Logging ──────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const log = {
  event: (msg) => console.log(`${c.dim}[${timestamp()}]${c.reset} ${msg}`),
  ok: (msg) => console.log(`${c.dim}[${timestamp()}]${c.reset} ${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.dim}[${timestamp()}]${c.reset} ${c.yellow}⚠${c.reset} ${msg}`),
  error: (msg) => console.error(`${c.dim}[${timestamp()}]${c.reset} ${c.red}✗${c.reset} ${msg}`),
  agent: (msg) => console.log(`${c.dim}[${timestamp()}]${c.reset} ${c.magenta}◆${c.reset} ${msg}`),
};

// ── Processed File Tracking ──────────────────────────────────────────────────

function loadProcessed(vaultPath) {
  const fp = path.join(vaultPath, PROCESSED_FILE);
  try {
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    }
  } catch {
    // Corrupted file — start fresh
  }
  return {};
}

function saveProcessed(vaultPath, processed) {
  const fp = path.join(vaultPath, PROCESSED_FILE);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fp, JSON.stringify(processed, null, 2), 'utf8');
}

function markProcessed(vaultPath, processed, filePath) {
  const rel = path.relative(vaultPath, filePath);
  processed[rel] = {
    processedAt: new Date().toISOString(),
    size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
  };
  saveProcessed(vaultPath, processed);
}

function isProcessed(vaultPath, processed, filePath) {
  const rel = path.relative(vaultPath, filePath);
  return !!processed[rel];
}

// ── File Type Detection ──────────────────────────────────────────────────────

function detectFileType(filePath, vaultPath) {
  const rel = path.relative(vaultPath, filePath);
  const lower = rel.toLowerCase();

  if (lower.includes('inbox/meetings') || lower.includes('meeting')) {
    return 'meeting';
  }
  if (lower.includes('inbox/ideas') || lower.includes('idea')) {
    return 'idea';
  }
  if (lower.includes('inbox/decisions') || lower.includes('decision')) {
    return 'decision';
  }

  return 'unknown';
}

// ── Processing Queue ─────────────────────────────────────────────────────────

class ProcessingQueue {
  constructor(vaultPath, options = {}) {
    this.vaultPath = vaultPath;
    this.dryRun = options.dryRun || false;
    this.queue = [];
    this.processing = false;
    this.processed = loadProcessed(vaultPath);
  }

  enqueue(filePath) {
    if (isProcessed(this.vaultPath, this.processed, filePath)) {
      log.event(`${c.dim}Skipping already processed: ${path.basename(filePath)}${c.reset}`);
      return;
    }

    // Avoid duplicates in queue
    if (this.queue.some(item => item.filePath === filePath)) {
      return;
    }

    this.queue.push({ filePath, enqueuedAt: Date.now() });
    log.event(`Queued: ${c.bold}${path.basename(filePath)}${c.reset}`);

    if (!this.processing) {
      this._processNext();
    }
  }

  async _processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift();

    try {
      await this._processFile(item.filePath);
    } catch (err) {
      log.error(`Failed to process ${path.basename(item.filePath)}: ${err.message}`);
    }

    // Process next in queue
    this._processNext();
  }

  async _processFile(filePath) {
    // Wait for file to settle (finish writing)
    await new Promise(resolve => setTimeout(resolve, SETTLE_DELAY_MS));

    if (!fs.existsSync(filePath)) {
      log.warn(`File disappeared before processing: ${path.basename(filePath)}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      log.warn(`Empty file, skipping: ${path.basename(filePath)}`);
      return;
    }

    const fileType = detectFileType(filePath, this.vaultPath);
    const fileName = path.basename(filePath);

    log.event(`Processing ${c.cyan}${fileType}${c.reset}: ${c.bold}${fileName}${c.reset}`);

    if (this.dryRun) {
      log.ok(`${c.yellow}[dry-run]${c.reset} Would process ${fileType}: ${fileName} (${content.length} chars)`);
      this._showDryRunSummary(fileType, filePath, content);
      markProcessed(this.vaultPath, this.processed, filePath);
      return;
    }

    switch (fileType) {
      case 'meeting':
        await this._processMeeting(filePath, content);
        break;
      case 'idea':
        this._processIdea(filePath, content);
        break;
      case 'decision':
        this._processDecision(filePath, content);
        break;
      default:
        log.event(`Unknown file type for ${fileName} — logged but not processed`);
        break;
    }

    // Run auto-link-people if available
    this._runAutoLink(filePath);

    markProcessed(this.vaultPath, this.processed, filePath);
    log.ok(`Done: ${c.bold}${fileName}${c.reset}`);
  }

  _showDryRunSummary(fileType, filePath, content) {
    const lines = content.split('\n').filter(l => l.trim());
    const preview = lines.slice(0, 5).map(l => `    ${c.dim}${l.slice(0, 80)}${c.reset}`).join('\n');
    console.log(`${c.dim}  Type: ${fileType}${c.reset}`);
    console.log(`${c.dim}  Lines: ${lines.length}${c.reset}`);
    console.log(`${c.dim}  Preview:${c.reset}`);
    console.log(preview);

    if (fileType === 'meeting') {
      console.log(`${c.dim}  Agent would: extract action items, update person pages, create tasks${c.reset}`);
    } else if (fileType === 'decision') {
      console.log(`${c.dim}  Agent would: extract decision details and context${c.reset}`);
    }
  }

  async _processMeeting(filePath, content) {
    const fileName = path.basename(filePath, '.md');

    log.agent('Running agent to process meeting notes...');

    const prompt = [
      `Process this meeting note file: ${filePath}`,
      '',
      'The file content is:',
      '---',
      content,
      '---',
      '',
      'Please:',
      '1. Extract action items and create tasks in 03-Tasks/Tasks.md',
      '2. Identify people mentioned — update or create person pages in 05-Areas/People/',
      '3. Link to relevant projects in 04-Projects/',
      '4. Suggest follow-ups',
      '5. Add a summary section at the top of the meeting note if one doesn\'t exist',
    ].join('\n');

    await this._runAgent(prompt);
  }

  _processIdea(filePath, content) {
    const fileName = path.basename(filePath, '.md');
    const firstLine = content.split('\n').find(l => l.trim()) || fileName;
    log.ok(`Idea captured: ${c.cyan}${firstLine.replace(/^#\s*/, '').slice(0, 80)}${c.reset}`);
  }

  _processDecision(filePath, content) {
    const fileName = path.basename(filePath, '.md');
    const lines = content.split('\n').filter(l => l.trim());
    const title = (lines[0] || fileName).replace(/^#\s*/, '');

    log.ok(`Decision logged: ${c.cyan}${title.slice(0, 80)}${c.reset}`);

    // Extract key details from common decision doc patterns
    const contextLine = lines.find(l => /context|background|why/i.test(l));
    const outcomeLine = lines.find(l => /decision|outcome|chosen|selected/i.test(l));

    if (contextLine) {
      log.event(`  Context: ${c.dim}${contextLine.replace(/^[#*\-\s]+/, '').slice(0, 80)}${c.reset}`);
    }
    if (outcomeLine) {
      log.event(`  Outcome: ${c.dim}${outcomeLine.replace(/^[#*\-\s]+/, '').slice(0, 80)}${c.reset}`);
    }
  }

  async _runAgent(prompt) {
    try {
      const { agentLoop, buildSystemPrompt } = require('../core/agent.js');
      const { getToolDefinitions, executeTool } = require('../core/tools.js');

      const systemPrompt = buildSystemPrompt(this.vaultPath, null);
      const tools = getToolDefinitions();
      const messages = [{ role: 'user', content: prompt }];

      const toolContext = { vaultPath: this.vaultPath };

      const loop = agentLoop(messages, tools, systemPrompt, {
        executeTool: (name, input) => executeTool(name, input, toolContext),
        maxTurns: 15,
      });

      let textOutput = '';

      for await (const event of loop) {
        switch (event.type) {
          case 'text_delta':
            textOutput += event.text;
            break;
          case 'tool_start':
            log.agent(`${c.dim}Tool: ${event.name}${c.reset}`);
            break;
          case 'tool_result':
            if (!event.success) {
              log.warn(`Tool ${event.name} failed`);
            }
            break;
          case 'error':
            log.error(`Agent error: ${event.message}`);
            break;
          case 'usage':
            log.event(`${c.dim}Tokens: ${event.inputTokens}in/${event.outputTokens}out ($${event.cost.toFixed(4)})${c.reset}`);
            break;
          case 'done':
            break;
        }
      }

      // Print a condensed summary of agent output
      if (textOutput.trim()) {
        const summary = textOutput.trim().split('\n').slice(0, 10);
        for (const line of summary) {
          log.agent(`${c.dim}${line.slice(0, 120)}${c.reset}`);
        }
        if (textOutput.trim().split('\n').length > 10) {
          log.agent(`${c.dim}... (${textOutput.trim().split('\n').length} lines total)${c.reset}`);
        }
      }
    } catch (err) {
      log.error(`Agent failed: ${err.message}`);
    }
  }

  _runAutoLink(filePath) {
    // Check multiple possible locations for the auto-link script
    const scriptPaths = [
      path.join(this.vaultPath, '.scripts', 'auto-link-people.cjs'),
      path.join(this.vaultPath, '.vennie', 'scripts', 'auto-link-people.cjs'),
    ];

    for (const scriptPath of scriptPaths) {
      if (fs.existsSync(scriptPath)) {
        try {
          log.event(`${c.dim}Running auto-link on ${path.basename(filePath)}${c.reset}`);
          execSync(`node "${scriptPath}" "${filePath}"`, {
            cwd: this.vaultPath,
            timeout: 15000,
            encoding: 'utf8',
          });
          log.ok(`Auto-linked people in ${path.basename(filePath)}`);
        } catch (err) {
          log.warn(`Auto-link failed: ${err.message}`);
        }
        return;
      }
    }
    // No auto-link script found — that's fine, skip silently
  }
}

// ── File Watcher ─────────────────────────────────────────────────────────────

class VaultWatcher {
  constructor(vaultPath, dirs, options = {}) {
    this.vaultPath = vaultPath;
    this.dirs = dirs;
    this.dryRun = options.dryRun || false;
    this.watchers = [];
    this.queue = new ProcessingQueue(vaultPath, { dryRun: this.dryRun });

    // Track recently seen events to debounce fs.watch duplicates
    this._recentEvents = new Map();
  }

  start() {
    console.log();
    console.log(`${c.bold}${c.cyan}  Vennie Watch${c.reset}${this.dryRun ? `  ${c.yellow}(dry-run)${c.reset}` : ''}`);
    console.log(`${c.dim}  ${'─'.repeat(48)}${c.reset}`);
    console.log();

    let watchingCount = 0;

    for (const dir of this.dirs) {
      const absDir = path.resolve(this.vaultPath, dir);

      if (!fs.existsSync(absDir)) {
        // Create the directory so we can watch it
        fs.mkdirSync(absDir, { recursive: true });
        log.event(`Created directory: ${c.dim}${dir}${c.reset}`);
      }

      try {
        const watcher = fs.watch(absDir, { persistent: true }, (eventType, filename) => {
          if (!filename || !filename.endsWith('.md')) return;

          const filePath = path.join(absDir, filename);

          // Debounce: fs.watch fires multiple events per file change
          const key = filePath;
          const now = Date.now();
          const lastSeen = this._recentEvents.get(key);
          if (lastSeen && now - lastSeen < 3000) return;
          this._recentEvents.set(key, now);

          // Clean up old entries periodically
          if (this._recentEvents.size > 100) {
            for (const [k, v] of this._recentEvents) {
              if (now - v > 10000) this._recentEvents.delete(k);
            }
          }

          // Only process files that exist (ignore deletions)
          if (!fs.existsSync(filePath)) return;

          log.event(`Detected: ${c.bold}${filename}${c.reset} in ${c.dim}${dir}${c.reset}`);
          this.queue.enqueue(filePath);
        });

        this.watchers.push(watcher);
        watchingCount++;
        log.ok(`Watching: ${c.bold}${dir}${c.reset}`);
      } catch (err) {
        log.error(`Failed to watch ${dir}: ${err.message}`);
      }
    }

    if (watchingCount === 0) {
      log.error('No directories could be watched. Exiting.');
      process.exit(1);
    }

    console.log();
    log.event(`Waiting for new .md files... ${c.dim}(Ctrl+C to stop)${c.reset}`);
    console.log();

    // Scan for unprocessed existing files
    this._scanExisting();
  }

  _scanExisting() {
    let found = 0;

    for (const dir of this.dirs) {
      const absDir = path.resolve(this.vaultPath, dir);
      if (!fs.existsSync(absDir)) continue;

      try {
        const files = fs.readdirSync(absDir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const filePath = path.join(absDir, file);
          if (!isProcessed(this.vaultPath, this.queue.processed, filePath)) {
            found++;
            log.event(`Found unprocessed: ${c.bold}${file}${c.reset}`);
            this.queue.enqueue(filePath);
          }
        }
      } catch {
        // Directory read error — skip
      }
    }

    if (found > 0) {
      log.event(`${c.cyan}${found}${c.reset} unprocessed file${found > 1 ? 's' : ''} found — processing now`);
    }
  }

  stop() {
    console.log();
    log.event('Shutting down watchers...');

    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
    }

    this.watchers = [];
    log.ok('Watch stopped.');
    console.log();
  }
}

// ── CLI Entry Point ──────────────────────────────────────────────────────────

function startWatch(vaultPath, args = []) {
  // Parse args
  let dirs = DEFAULT_WATCH_DIRS;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dirs' && args[i + 1]) {
      dirs = args[i + 1].split(',').map(d => d.trim()).filter(Boolean);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  const watcher = new VaultWatcher(vaultPath, dirs, { dryRun });

  // Graceful shutdown
  const shutdown = () => {
    watcher.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  watcher.start();
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { startWatch };
