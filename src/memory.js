'use strict';

const fs = require('fs');
const path = require('path');

// ── Session Memory ─────────────────────────────────────────────────────────
// Persists conversation context across sessions using lightweight markdown
// files. Summaries are extracted heuristically (no API calls) to keep costs
// at zero. Memory files live in `.vennie/memory/` inside the vault.

const MEMORY_DIR = '.vennie/memory';

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureMemoryDir(vaultPath) {
  const dir = path.join(vaultPath, MEMORY_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Format a date as relative label ("Today", "Yesterday", "3 days ago", etc.)
 */
function relativeLabel(dateStr) {
  const now = new Date();
  const then = new Date(dateStr + 'T00:00:00');
  const diffMs = now.setHours(0, 0, 0, 0) - then.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/**
 * Extract plain text from a message's content blocks.
 */
function extractText(message) {
  if (!message || !message.content) return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

// ── Extraction Heuristics ──────────────────────────────────────────────────

/**
 * Extract key topics from user messages. Looks at the first ~200 chars of
 * each user turn and picks the most descriptive noun phrases.
 */
function extractTopics(messages) {
  const userTexts = messages
    .filter((m) => m.role === 'user')
    .map(extractText)
    .filter(Boolean);

  // Collect candidate topics from first sentence of each user message
  const topics = new Set();
  for (const text of userTexts) {
    // Take first 300 chars to keep it manageable
    const snippet = text.slice(0, 300).toLowerCase();

    // Match common topic phrases after key verbs
    const patterns = [
      /(?:help|let's|want to|need to|can you|please)\s+(.{5,40?}?)(?:\.|$|\n|,)/gi,
      /(?:about|regarding|for|on)\s+(.{5,40?}?)(?:\.|$|\n|,)/gi,
      /(?:create|build|write|update|review|fix|add|set up|configure)\s+(.{3,40?}?)(?:\.|$|\n|,)/gi,
    ];

    for (const pat of patterns) {
      let match;
      while ((match = pat.exec(snippet)) !== null) {
        const topic = match[1].trim().replace(/['"]/g, '');
        if (topic.length >= 3 && topic.length <= 50) {
          topics.add(topic);
        }
      }
    }
  }

  // Cap at 5 topics
  return [...topics].slice(0, 5);
}

/**
 * Extract tool names used in the conversation.
 */
function extractToolsUsed(messages) {
  const tools = new Set();
  for (const msg of messages) {
    if (!msg.content || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'tool_use' && block.name) {
        tools.add(block.name);
      }
    }
  }
  return [...tools];
}

/**
 * Extract skill/command invocations (messages containing `/something`).
 */
function extractSkills(messages) {
  const skills = new Set();
  const userTexts = messages
    .filter((m) => m.role === 'user')
    .map(extractText)
    .filter(Boolean);

  for (const text of userTexts) {
    const matches = text.match(/\/[a-z][a-z0-9-]*/gi);
    if (matches) {
      for (const m of matches) {
        skills.add(m.toLowerCase());
      }
    }
  }
  return [...skills];
}

/**
 * Extract decisions and action items from assistant messages.
 * Looks for patterns like "decided", "action:", "todo:", "will do", etc.
 */
function extractDecisions(messages) {
  const decisions = [];
  const actions = [];

  const assistantTexts = messages
    .filter((m) => m.role === 'assistant')
    .map(extractText)
    .filter(Boolean);

  const allTexts = [
    ...assistantTexts,
    ...messages.filter((m) => m.role === 'user').map(extractText).filter(Boolean),
  ];

  for (const text of allTexts) {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();

      // Decision patterns
      if (
        /\b(decided|decision|agreed|conclusion)\b/i.test(lower) &&
        trimmed.length > 15 &&
        trimmed.length < 200
      ) {
        const clean = trimmed.replace(/^[-*•]\s*/, '').replace(/^\*\*.*?\*\*\s*/, '');
        if (clean.length > 10) decisions.push(clean);
      }

      // Action item patterns
      if (
        /\b(action\s*(?:item)?:|todo:|will do|next step|follow.?up|remind me|need to)\b/i.test(lower) &&
        trimmed.length > 10 &&
        trimmed.length < 200
      ) {
        const clean = trimmed.replace(/^[-*•]\s*/, '').replace(/^\*\*.*?\*\*\s*/, '');
        if (clean.length > 8) actions.push(clean);
      }
    }
  }

  return {
    decisions: [...new Set(decisions)].slice(0, 5),
    actions: [...new Set(actions)].slice(0, 5),
  };
}

/**
 * Extract people mentioned in the conversation.
 * Looks for capitalized names (2-3 word sequences) and @mentions.
 */
function extractPeople(messages) {
  const people = new Set();
  const allTexts = messages.map(extractText).filter(Boolean);
  const combined = allTexts.join('\n');

  // @mentions
  const atMentions = combined.match(/@([A-Z][a-z]+(?:[._][A-Z][a-z]+)*)/g);
  if (atMentions) {
    for (const m of atMentions) {
      people.add(m.replace('@', '').replace(/[._]/g, ' '));
    }
  }

  // Capitalized name sequences (Firstname Lastname pattern)
  // Avoid common false positives (months, days, tech terms, etc.)
  const stopWords = new Set([
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December',
    'The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where', 'Which',
    'How', 'Who', 'Why', 'Yes', 'No', 'Not', 'Also', 'Just', 'Here', 'There',
    'Claude', 'Vennie', 'React', 'Node', 'Next', 'True', 'False', 'None', 'Null',
    'API', 'URL', 'JSON', 'HTML', 'CSS', 'New', 'Old', 'All', 'Some', 'Any',
    'Key', 'Note', 'Action', 'Task', 'Done', 'Todo', 'Session', 'Summary',
    'Please', 'Thanks', 'Sure', 'Good', 'Great', 'Nice', 'Sorry', 'Will',
  ]);

  const namePattern = /\b([A-Z][a-z]{1,15})\s+([A-Z][a-z]{1,15})(?:\s+([A-Z][a-z]{1,15}))?\b/g;
  let match;
  while ((match = namePattern.exec(combined)) !== null) {
    const first = match[1];
    const last = match[2];
    if (stopWords.has(first) || stopWords.has(last)) continue;
    const name = match[3] && !stopWords.has(match[3])
      ? `${first} ${last} ${match[3]}`
      : `${first} ${last}`;
    people.add(name);
  }

  return [...people].slice(0, 10);
}

/**
 * Build a concise summary of a user message (first meaningful sentence).
 */
function summarizeUserMessages(messages) {
  const summaries = [];
  const userMsgs = messages.filter((m) => m.role === 'user');

  for (const msg of userMsgs) {
    const text = extractText(msg);
    if (!text) continue;
    // Take first line or first 120 chars
    const first = text.split('\n').find((l) => l.trim().length > 5);
    if (first) {
      const trimmed = first.trim().slice(0, 120);
      summaries.push(trimmed.endsWith('.') ? trimmed : trimmed);
    }
  }

  // Deduplicate and cap
  return [...new Set(summaries)].slice(0, 8);
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Save a session's conversation to a memory file.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {Array} messages - The conversation messages array
 * @param {Object} metadata - Session metadata
 * @param {string} metadata.model - Model used (e.g. 'claude-sonnet-4-6')
 * @param {number} metadata.cost - Estimated session cost in USD
 * @param {string|null} metadata.persona - Active persona name, or null
 * @returns {string} Path to the saved memory file
 */
function saveSessionMemory(vaultPath, messages, metadata = {}) {
  const dir = ensureMemoryDir(vaultPath);
  const now = new Date();

  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fileTimestamp = `${dateStr}-${timeStr.replace(':', '')}`;
  const filePath = path.join(dir, `${fileTimestamp}.md`);

  // Extract all the things
  const topics = extractTopics(messages);
  const toolsUsed = extractToolsUsed(messages);
  const skills = extractSkills(messages);
  const { decisions, actions } = extractDecisions(messages);
  const people = extractPeople(messages);
  const userSummaries = summarizeUserMessages(messages);

  // Build frontmatter
  const frontmatter = [
    '---',
    `date: ${dateStr}`,
    `time: "${timeStr}"`,
    `model: ${metadata.model || 'unknown'}`,
    `cost: ${typeof metadata.cost === 'number' ? metadata.cost.toFixed(4) : '0.0000'}`,
    `persona: ${metadata.persona || 'null'}`,
    `topics: [${topics.map((t) => `"${t}"`).join(', ')}]`,
    '---',
  ].join('\n');

  // Build session summary
  const summaryLines = [];

  if (userSummaries.length > 0) {
    for (const s of userSummaries.slice(0, 5)) {
      summaryLines.push(`- ${s}`);
    }
  }

  if (skills.length > 0) {
    summaryLines.push(`- Ran ${skills.join(', ')}`);
  }

  if (toolsUsed.length > 0) {
    summaryLines.push(`- Tools used: ${toolsUsed.join(', ')}`);
  }

  if (actions.length > 0) {
    for (const a of actions) {
      summaryLines.push(`- Action: ${a}`);
    }
  }

  // Ensure we have at least something
  if (summaryLines.length === 0) {
    summaryLines.push('- General conversation (no specific topics extracted)');
  }

  // Build sections
  const sections = [`${frontmatter}\n\n## Session Summary\n`];
  sections.push(summaryLines.join('\n'));

  if (decisions.length > 0) {
    sections.push('\n## Key Decisions\n');
    sections.push(decisions.map((d) => `- ${d}`).join('\n'));
  }

  if (people.length > 0) {
    sections.push('\n## People Referenced\n');
    sections.push(people.map((p) => `- ${p}`).join('\n'));
  }

  const content = sections.join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');

  return filePath;
}

/**
 * Load recent session memories for system prompt injection.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {Object} options
 * @param {number} options.days - How far back to look (default 7)
 * @param {number} options.maxTokens - Approximate character budget (default 2000)
 * @returns {string} Formatted summary of recent sessions
 */
function loadRecentMemories(vaultPath, options = {}) {
  const { days = 7, maxTokens = 2000 } = options;
  const dir = path.join(vaultPath, MEMORY_DIR);

  if (!fs.existsSync(dir)) return '';

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Read and filter memory files
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      // Filename format: YYYY-MM-DD-HHmm.md
      const dateStr = f.slice(0, 10);
      return dateStr >= cutoffStr;
    })
    .sort()
    .reverse(); // Most recent first

  if (files.length === 0) return '';

  // Read files, most recent first, within character budget
  let total = 0;
  const entries = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');

    // Extract just the body (after frontmatter)
    const body = content.replace(/^---[\s\S]*?---\n*/, '').trim();
    if (!body) continue;

    const needed = body.length + 20; // overhead for headers
    if (total + needed > maxTokens && entries.length > 0) break;

    entries.push({ file, body });
    total += needed;
  }

  return entries.map((e) => e.body).join('\n\n---\n\n');
}

/**
 * Get formatted memory context for system prompt injection.
 * Groups sessions by date with relative labels.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {Object} options
 * @param {number} options.days - How far back to look (default 7)
 * @param {number} options.maxTokens - Approximate character budget (default 2000)
 * @returns {string} Formatted context block or empty string
 */
function getMemoryContext(vaultPath, options = {}) {
  const { days = 7, maxTokens = 2000 } = options;
  const dir = path.join(vaultPath, MEMORY_DIR);

  if (!fs.existsSync(dir)) return '';

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => f.slice(0, 10) >= cutoffStr)
    .sort()
    .reverse();

  if (files.length === 0) return '';

  // Group by date
  const byDate = new Map();
  for (const file of files) {
    const dateStr = file.slice(0, 10);
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr).push(file);
  }

  const sections = ['## Recent Session Memory\n'];
  let total = sections[0].length;

  for (const [dateStr, dateFiles] of byDate) {
    const label = relativeLabel(dateStr);
    const header = `### ${label} (${dateStr})\n`;

    if (total + header.length > maxTokens && sections.length > 1) break;
    sections.push(header);
    total += header.length;

    for (const file of dateFiles) {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const body = content.replace(/^---[\s\S]*?---\n*/, '').trim();
      if (!body) continue;

      // Extract just the summary bullets (skip section headers for compactness)
      const bullets = body
        .split('\n')
        .filter((l) => l.startsWith('- '))
        .join('\n');

      if (!bullets) continue;

      const needed = bullets.length + 2;
      if (total + needed > maxTokens && sections.length > 2) break;

      sections.push(bullets);
      total += needed;
    }

    sections.push('');
  }

  const result = sections.join('\n').trim();
  return result || '';
}

/**
 * Delete session memory files older than the specified number of days.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {number} keepDays - Number of days to keep (default 30)
 * @returns {number} Number of files deleted
 */
function pruneOldMemories(vaultPath, keepDays = 30) {
  const dir = path.join(vaultPath, MEMORY_DIR);

  if (!fs.existsSync(dir)) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  let deleted = 0;

  for (const file of files) {
    const dateStr = file.slice(0, 10);
    // Only delete files whose date is parseable and before cutoff
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr) && dateStr < cutoffStr) {
      try {
        fs.unlinkSync(path.join(dir, file));
        deleted++;
      } catch (_) {
        // Skip files that can't be deleted (permissions, etc.)
      }
    }
  }

  return deleted;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  saveSessionMemory,
  loadRecentMemories,
  getMemoryContext,
  pruneOldMemories,
};
