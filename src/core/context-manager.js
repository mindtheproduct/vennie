'use strict';

const fs = require('fs');
const path = require('path');

// ── Context Manager ─────────────────────────────────────────────────────────
// Smart context window management inspired by Claude Code:
//   - @file syntax for explicit file injection
//   - Sliding window with summaries (not just truncation)
//   - Session save/resume with conversation snapshots

// ── @file Syntax ──────────────────────────────────────────────────────────

/**
 * Parse @file references from user input.
 * Supports: @filename.md, @path/to/file.md, @People/Sarah_Chen.md
 *
 * @param {string} input - User's message text
 * @param {string} vaultPath - Root vault directory
 * @returns {{ cleanInput: string, files: Array<{ path: string, content: string, filename: string }> }}
 */
function parseFileReferences(input, vaultPath) {
  const filePattern = /@([\w./-]+\.(?:md|yaml|yml|json|txt|js|py|csv|tsv))/g;
  const files = [];
  const matches = [...input.matchAll(filePattern)];

  for (const match of matches) {
    const ref = match[1];
    // Try exact path first, then search common locations
    const candidates = [
      path.join(vaultPath, ref),
      path.join(vaultPath, '03-Tasks', ref),
      path.join(vaultPath, '05-Areas/People', ref),
      path.join(vaultPath, '05-Areas/People/Internal', ref),
      path.join(vaultPath, '05-Areas/People/External', ref),
      path.join(vaultPath, '04-Projects', ref),
      path.join(vaultPath, '00-Inbox/Meetings', ref),
      path.join(vaultPath, '02-Week_Priorities', ref),
      path.join(vaultPath, '01-Quarter_Goals', ref),
      path.join(vaultPath, 'System', ref),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          const content = fs.readFileSync(candidate, 'utf8');
          const filename = path.basename(candidate);
          // Truncate very large files
          const maxChars = 20000;
          const truncated = content.length > maxChars
            ? content.slice(0, maxChars) + `\n\n... (truncated, ${content.length} chars total)`
            : content;
          files.push({ path: candidate, content: truncated, filename });
        } catch {}
        break;
      }
    }
  }

  // Remove @file references from the input for cleaner messages
  const cleanInput = input.replace(filePattern, '').replace(/\s{2,}/g, ' ').trim();

  return { cleanInput, files };
}

/**
 * Format injected file context for the system prompt.
 */
function formatFileContext(files) {
  if (files.length === 0) return '';

  const blocks = files.map(f =>
    `<injected_file path="${f.path}" filename="${f.filename}">\n${f.content}\n</injected_file>`
  );

  return `\n---\n## Injected Files (user referenced with @)\n\n${blocks.join('\n\n')}`;
}

// ── Session Persistence ────────────────────────────────────────────────────

/**
 * Save a conversation session snapshot to disk.
 */
function saveSession(vaultPath, sessionData) {
  const sessionsDir = path.join(vaultPath, '.vennie', 'sessions');
  if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

  const id = sessionData.id || `session-${Date.now()}`;
  const snapshot = {
    id,
    timestamp: new Date().toISOString(),
    model: sessionData.model || 'unknown',
    messageCount: sessionData.messages?.length || 0,
    cost: sessionData.cost || 0,
    // Store only the last N messages to keep file size reasonable
    messages: (sessionData.messages || []).slice(-30),
    persona: sessionData.persona || null,
    summary: sessionData.summary || null,
  };

  const filePath = path.join(sessionsDir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  return filePath;
}

/**
 * Load a saved session.
 */
function loadSession(vaultPath, sessionId) {
  const filePath = path.join(vaultPath, '.vennie', 'sessions', `${sessionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * List recent sessions.
 */
function listSessions(vaultPath, limit = 10) {
  const sessionsDir = path.join(vaultPath, '.vennie', 'sessions');
  if (!fs.existsSync(sessionsDir)) return [];

  try {
    return fs.readdirSync(sessionsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8'));
        return {
          id: data.id,
          timestamp: data.timestamp,
          messageCount: data.messageCount,
          cost: data.cost,
          summary: data.summary,
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Resume a session — returns messages and metadata to restore state.
 */
function resumeSession(vaultPath, sessionId) {
  const session = loadSession(vaultPath, sessionId);
  if (!session) return null;

  return {
    messages: session.messages || [],
    persona: session.persona,
    cost: session.cost || 0,
    summary: session.summary,
  };
}

// ── Smart Compaction ────────────────────────────────────────────────────────

/**
 * Enhanced message compaction that preserves important context.
 * Unlike simple truncation, this:
 *   1. Keeps system-critical first messages
 *   2. Summarizes middle turns into a context block
 *   3. Preserves all recent exchanges
 *   4. Tracks tool results that contained important data
 *
 * @param {object[]} messages
 * @param {object} options
 * @returns {object[]}
 */
function smartCompact(messages, options = {}) {
  const maxChars = options.maxChars || 480000; // ~120k tokens
  const keepRecent = options.keepRecent || 20;
  const keepFirst = options.keepFirst || 2;

  // Estimate total size
  const totalChars = messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + content.length;
  }, 0);

  if (totalChars <= maxChars) return messages;

  if (messages.length <= keepFirst + keepRecent) return messages;

  const first = messages.slice(0, keepFirst);
  const middle = messages.slice(keepFirst, -keepRecent);
  const recent = messages.slice(-keepRecent);

  // Build a summary of the middle section
  const middleSummary = summarizeMessages(middle);

  const summaryMessage = {
    role: 'user',
    content: `[Context from earlier in this conversation (${middle.length} messages compacted):\n${middleSummary}\n\nThe conversation continues with the most recent exchanges below.]`,
  };

  return [...first, summaryMessage, ...recent];
}

/**
 * Generate a brief summary of compacted messages.
 */
function summarizeMessages(messages) {
  const topics = new Set();
  const toolsUsed = new Set();
  const filesAccessed = new Set();

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

    // Extract tool names
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') toolsUsed.add(block.name);
        if (block.type === 'tool_result') {
          try {
            const parsed = JSON.parse(block.content || '{}');
            if (parsed.path) filesAccessed.add(parsed.path.split('/').pop());
          } catch {}
        }
      }
    }

    // Extract rough topics from user messages
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const words = msg.content.split(/\s+/).slice(0, 10).join(' ');
      if (words.length > 5) topics.add(words);
    }
  }

  const parts = [];
  if (topics.size > 0) parts.push(`Topics discussed: ${[...topics].slice(0, 5).join('; ')}`);
  if (toolsUsed.size > 0) parts.push(`Tools used: ${[...toolsUsed].join(', ')}`);
  if (filesAccessed.size > 0) parts.push(`Files accessed: ${[...filesAccessed].slice(0, 10).join(', ')}`);

  return parts.join('\n') || 'General conversation';
}

module.exports = {
  parseFileReferences,
  formatFileContext,
  saveSession,
  loadSession,
  listSessions,
  resumeSession,
  smartCompact,
};
