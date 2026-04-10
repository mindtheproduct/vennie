'use strict';

const fs = require('fs');
const path = require('path');

// ── Vault Pulse ───────────────────────────────────────────────────────────
// Shows accumulated value in the user's vault — people tracked, projects,
// decisions made, meetings captured. Also provides quick capture (/log)
// for decisions, wins, ideas, and notes.

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Count .md files in a directory (optionally recursive).
 * Returns 0 if the directory doesn't exist.
 */
function countMdFiles(dir, recursive) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      count++;
    } else if (recursive && entry.isDirectory()) {
      count += countMdFiles(path.join(dir, entry.name), true);
    }
  }
  return count;
}

/**
 * Count files matching a pattern in a directory (recursive).
 */
function countFilesMatching(dir, test) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && test(entry.name)) {
      count++;
    } else if (entry.isDirectory()) {
      count += countFilesMatching(full, test);
    }
  }
  return count;
}

/**
 * Count lines matching a regex in a file. Returns 0 if file doesn't exist.
 */
function countLinesMatching(filePath, regex) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    if (regex.test(line)) count++;
  }
  return count;
}

/**
 * Count lines matching a regex across all .md files in a directory (recursive).
 */
function countLinesInDir(dir, regex) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.md')) {
      count += countLinesMatching(full, regex);
    } else if (entry.isDirectory()) {
      count += countLinesInDir(full, regex);
    }
  }
  return count;
}

/**
 * Get the earliest mtime among all files in a directory tree,
 * or fall back to the directory's own ctime.
 */
function getVaultAge(vaultPath) {
  let earliest = null;

  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      // Skip hidden dirs other than .vennie
      if (entry.isDirectory() && entry.name.startsWith('.') && entry.name !== '.vennie') continue;
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          if (!earliest || stat.mtimeMs < earliest) earliest = stat.mtimeMs;
        } catch { /* skip */ }
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  }

  walk(vaultPath);

  if (!earliest) {
    try {
      earliest = fs.statSync(vaultPath).ctimeMs;
    } catch {
      earliest = Date.now();
    }
  }

  return Math.max(1, Math.ceil((Date.now() - earliest) / (1000 * 60 * 60 * 24)));
}

// ── Vault Pulse ───────────────────────────────────────────────────────────

/**
 * Scan the vault and return stats + a human-readable summary.
 *
 * @param {string} vaultPath - Absolute path to the vault root
 * @returns {{ stats: object, message: string, detail: string }}
 */
function getVaultPulse(vaultPath) {
  // People — recursive under 05-Areas/People/
  const people = countMdFiles(path.join(vaultPath, '05-Areas', 'People'), true);

  // Projects — top-level .md in 04-Projects/
  const projects = countMdFiles(path.join(vaultPath, '04-Projects'), false);

  // Decisions — files with "decision" in the name + lines starting with "- **Decision:**"
  const decisionFiles = countFilesMatching(vaultPath, (name) =>
    /decision/i.test(name) && name.endsWith('.md')
  );
  const decisionLines = countLinesInDir(vaultPath, /^- \*\*Decision:\*\*/);
  const decisions = decisionFiles + decisionLines;

  // Meetings — files in 00-Inbox/Meetings/ plus any .md matching YYYY-MM-DD pattern
  const inboxMeetings = countMdFiles(path.join(vaultPath, '00-Inbox', 'Meetings'), false);
  const processedMeetings = countFilesMatching(vaultPath, (name) =>
    /^\d{4}-\d{2}-\d{2}/.test(name) && name.endsWith('.md')
  );
  const meetings = inboxMeetings + processedMeetings;

  // Wins — .md in evidence/wins folders + lines matching win/achievement patterns
  const winsFiles = countFilesMatching(vaultPath, (name) => name.endsWith('.md'));
  const evidenceWins =
    countMdFiles(path.join(vaultPath, '05-Areas', 'Career', 'Evidence'), true) +
    countMdFiles(path.join(vaultPath, '00-Inbox', 'Wins'), false);
  const winLines = countLinesInDir(vaultPath, /^- .*(win|achievement|shipped|launched|accomplished)/i);
  const wins = evidenceWins + winLines;

  // Tasks — from 03-Tasks/Tasks.md
  const tasksFile = path.join(vaultPath, '03-Tasks', 'Tasks.md');
  const totalTasks = countLinesMatching(tasksFile, /^- \[[ x]\]/);
  const completedTasks = countLinesMatching(tasksFile, /^- \[x\]/);

  // Sessions — files in .vennie/memory/
  const sessionsDir = path.join(vaultPath, '.vennie', 'memory');
  let sessions = 0;
  if (fs.existsSync(sessionsDir)) {
    sessions = fs.readdirSync(sessionsDir).filter((f) => !f.startsWith('.')).length;
  }

  // Vault age
  const vaultAge = getVaultAge(vaultPath);

  const stats = {
    people,
    projects,
    decisions,
    meetings,
    wins,
    totalTasks,
    completedTasks,
    sessions,
    vaultAge,
  };

  // Build message based on vault age
  let message;
  if (vaultAge <= 3) {
    message = 'Getting started \u2014 every interaction makes Vennie smarter';
  } else if (vaultAge <= 7) {
    message = `Building momentum \u2014 ${people} people, ${projects} projects, ${meetings} meetings tracked`;
  } else if (vaultAge <= 30) {
    message = `Your vault is growing \u2014 ${people} people, ${projects} projects, ${meetings} meetings, ${decisions} decisions`;
  } else {
    const months = Math.floor(vaultAge / 30);
    const label = months === 1 ? '1 month' : `${months} months`;
    message = `${label} of context \u2014 ${people} people, ${projects} projects, ${meetings} meetings. Vennie knows your world.`;
  }

  // Detailed breakdown for /status
  const detail = [
    `People:     ${people}`,
    `Projects:   ${projects}`,
    `Decisions:  ${decisions}`,
    `Meetings:   ${meetings}`,
    `Wins:       ${wins}`,
    `Tasks:      ${completedTasks}/${totalTasks} completed`,
    `Sessions:   ${sessions}`,
    `Vault age:  ${vaultAge} day${vaultAge === 1 ? '' : 's'}`,
  ].join('\n');

  return { stats, message, detail };
}

// ── Quick Capture (/log) ──────────────────────────────────────────────────

const VALID_TYPES = ['decision', 'win', 'idea', 'note'];

const TYPE_DIRS = {
  decision: path.join('00-Inbox', 'Decisions'),
  win: path.join('00-Inbox', 'Wins'),
  idea: path.join('00-Inbox', 'Ideas'),
  note: '00-Inbox',
};

/**
 * Parse a /log command string into type + content.
 *
 * @param {string} args - e.g. "decision We're going with option A"
 * @returns {{ type: string, content: string }}
 */
function parseLogCommand(args) {
  if (!args || !args.trim()) {
    return { type: 'note', content: '' };
  }

  const trimmed = args.trim();
  const spaceIdx = trimmed.indexOf(' ');

  if (spaceIdx === -1) {
    // Single word — could be a type with no content, or content with no type
    if (VALID_TYPES.includes(trimmed.toLowerCase())) {
      return { type: trimmed.toLowerCase(), content: '' };
    }
    return { type: 'note', content: trimmed };
  }

  const firstWord = trimmed.slice(0, spaceIdx).toLowerCase();
  const rest = trimmed.slice(spaceIdx + 1).trim();

  if (VALID_TYPES.includes(firstWord)) {
    return { type: firstWord, content: rest };
  }

  return { type: 'note', content: trimmed };
}

/**
 * Capture a quick log entry to the vault.
 *
 * @param {string} vaultPath - Absolute path to vault root
 * @param {string} type - One of: decision, win, idea, note
 * @param {string} content - The text to capture
 * @returns {{ file: string, message: string }}
 */
function quickCapture(vaultPath, type, content) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid log type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);

  const relDir = TYPE_DIRS[type];
  const absDir = path.join(vaultPath, relDir);
  fs.mkdirSync(absDir, { recursive: true });

  const filename = `${date}-${type}.md`;
  const filePath = path.join(absDir, filename);

  const frontmatter = [
    '---',
    `date: ${date}`,
    `time: "${time}"`,
    `type: ${type}`,
    '---',
    '',
    content,
    '',
  ].join('\n');

  // If file already exists for today, append instead of overwrite
  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, `\n---\n\n${content}\n`, 'utf8');
  } else {
    fs.writeFileSync(filePath, frontmatter, 'utf8');
  }

  return {
    file: filePath,
    message: `Logged ${type} in ${relDir}/`,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  getVaultPulse,
  quickCapture,
  parseLogCommand,
};
