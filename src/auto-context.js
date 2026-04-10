'use strict';

const fs = require('fs');
const path = require('path');

// ── Auto-Context Injection ────────────────────────────────────────────────
// Before sending a message to Claude, search the vault for relevant context
// and inject it automatically. This is what makes Vennie feel like it
// "knows everything."

// ── Constants ─────────────────────────────────────────────────────────────

const PEOPLE_INTERNAL = '05-Areas/People/Internal';
const PEOPLE_EXTERNAL = '05-Areas/People/External';
const PROJECTS_DIR = '04-Projects';
const DECISIONS_DIR = '00-Inbox/Decisions';
const MEETINGS_DIR = '00-Inbox/Meetings';
const SEARCH_INDEX = '.vennie/search-index.json';

const MAX_CONTEXT_CHARS = 2000;
const RECENT_DAYS = 14;

// Words that look capitalised but aren't names/projects
const STOPWORDS = new Set([
  'the', 'and', 'but', 'for', 'with', 'from', 'this', 'that', 'what',
  'when', 'where', 'which', 'how', 'who', 'why', 'will', 'would', 'could',
  'should', 'can', 'may', 'might', 'must', 'have', 'has', 'had', 'been',
  'being', 'are', 'was', 'were', 'did', 'does', 'done', 'not', 'yes', 'no',
  'hey', 'hi', 'hello', 'thanks', 'please', 'just', 'like', 'also', 'still',
  'about', 'after', 'before', 'between', 'into', 'over', 'under', 'then',
  'than', 'some', 'any', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'such', 'only', 'same', 'very', 'really', 'well',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'today', 'tomorrow', 'yesterday',
]);

// Generic messages that don't need context
const GENERIC_PATTERNS = [
  /^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening)\b/i,
  /^how are you/i,
  /^thanks?(\s|$|!)/i,
  /^(ok|okay|sure|got it|sounds good|yes|no|yep|nope)\b/i,
  /^\/\w+/,  // slash commands handled by their own context
];

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Safely check if a path exists (no throw).
 */
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

/**
 * Safely read a file, returning empty string on failure.
 */
function safeRead(filePath, maxBytes) {
  try {
    if (maxBytes) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(maxBytes);
      const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
      fs.closeSync(fd);
      return buf.toString('utf8', 0, bytesRead);
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * List .md files in a directory (non-recursive).
 */
function listMdFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

/**
 * List subdirectories in a directory.
 */
function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

/**
 * Check if a file was modified within the last N days.
 */
function isRecent(filePath, days) {
  try {
    const stat = fs.statSync(filePath);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return stat.mtimeMs >= cutoff;
  } catch {
    return false;
  }
}

/**
 * Extract a frontmatter field value from markdown content.
 */
function extractField(content, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'mi');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

/**
 * Extract the first N characters of body content (after frontmatter).
 */
function extractBody(content, maxChars) {
  let body = content;
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) body = content.slice(endIdx + 3);
  }
  return body.slice(0, maxChars).trim();
}

// ── Entity Extraction ─────────────────────────────────────────────────────

/**
 * Extract named entities from user message: capitalised words/phrases,
 * project names, technical terms.
 */
function extractEntities(message) {
  const names = [];
  const topics = [];

  // Match capitalised name-like sequences (2+ words or single proper nouns)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let m;
  while ((m = namePattern.exec(message)) !== null) {
    const candidate = m[1];
    const words = candidate.split(/\s+/);
    const isStop = words.every(w => STOPWORDS.has(w.toLowerCase()));
    if (!isStop) names.push(candidate);
  }

  // Single capitalised words that might be names (not at sentence start)
  const singleCap = /(?:^|[.!?]\s+)\s*([A-Z][a-z]+)|(?<=\s)([A-Z][a-z]{2,})/g;
  while ((m = singleCap.exec(message)) !== null) {
    const word = m[2]; // only mid-sentence capitals
    if (word && !STOPWORDS.has(word.toLowerCase())) {
      topics.push(word);
    }
  }

  // Quoted terms
  const quoted = /["']([^"']+)["']/g;
  while ((m = quoted.exec(message)) !== null) {
    topics.push(m[1]);
  }

  // Technical/project-sounding terms (hyphenated or multi-word with context)
  const techTerms = /\b((?:[A-Z][a-zA-Z]*[-_])+[A-Z][a-zA-Z]*)\b/g;
  while ((m = techTerms.exec(message)) !== null) {
    topics.push(m[1]);
  }

  return {
    names: [...new Set(names)],
    topics: [...new Set(topics)],
  };
}

// ── Person Lookup ─────────────────────────────────────────────────────────

/**
 * Find a person page by name (case-insensitive, supports first name only).
 * Returns { filePath, name, role, context } or null.
 */
function findPersonPage(vaultPath, name) {
  const dirs = [
    path.join(vaultPath, PEOPLE_INTERNAL),
    path.join(vaultPath, PEOPLE_EXTERNAL),
  ];

  const nameLower = name.toLowerCase().replace(/\s+/g, '_');
  const firstName = name.split(/\s+/)[0].toLowerCase();

  for (const dir of dirs) {
    const files = listMdFiles(dir);
    for (const file of files) {
      const basename = path.basename(file, '.md').toLowerCase();

      // Exact match or first-name match
      if (basename === nameLower || basename.startsWith(firstName + '_')) {
        const content = safeRead(file, 4096);
        const role = extractField(content, 'Role') || extractField(content, 'role') || '';
        const company = extractField(content, 'Company') || extractField(content, 'company') || '';

        // Extract recent context: last meeting line, open actions
        const lastMeeting = extractLastMeeting(content);
        const actions = extractOpenActions(content);

        const contextParts = [];
        if (role) contextParts.push(role);
        if (company) contextParts.push(`at ${company}`);
        if (lastMeeting) contextParts.push(lastMeeting);
        if (actions.length) contextParts.push(`Open actions: ${actions.join('; ')}`);

        return {
          filePath: file,
          name: path.basename(file, '.md').replace(/_/g, ' '),
          role: role || (company ? `at ${company}` : ''),
          recentContext: contextParts.join('. ') || 'Person page exists, no recent context.',
        };
      }
    }
  }
  return null;
}

/**
 * Extract last meeting reference from a person page.
 */
function extractLastMeeting(content) {
  // Look for lines like "- [[2026-03-15 - Sprint Review]]" or "- 2026-03-15: ..."
  const meetingLines = content.match(/[-*]\s+\[?\[?\d{4}-\d{2}-\d{2}[^\]]*\]?\]?[^\n]*/g);
  if (!meetingLines || !meetingLines.length) return '';
  const last = meetingLines[meetingLines.length - 1].replace(/^[-*]\s+/, '').trim();
  return `Last met: ${last.slice(0, 100)}`;
}

/**
 * Extract open action items from a person page.
 */
function extractOpenActions(content) {
  const actions = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (/^\s*-\s+\[ \]/.test(line)) {
      actions.push(line.replace(/^\s*-\s+\[ \]\s*/, '').trim().slice(0, 80));
      if (actions.length >= 3) break;
    }
  }
  return actions;
}

// ── Project Lookup ────────────────────────────────────────────────────────

/**
 * Find a project matching a topic. Checks folder names and top-level .md files.
 */
function findProject(vaultPath, topic) {
  const projDir = path.join(vaultPath, PROJECTS_DIR);
  if (!exists(projDir)) return null;

  const topicLower = topic.toLowerCase();
  const dirs = listDirs(projDir);

  for (const dir of dirs) {
    if (dir.toLowerCase().includes(topicLower) || topicLower.includes(dir.toLowerCase().replace(/_/g, ' '))) {
      const folderPath = path.join(projDir, dir);
      // Try to read a status file or the first .md
      const files = listMdFiles(folderPath);
      const statusFile = files.find(f => /status|readme|overview/i.test(path.basename(f)));
      const target = statusFile || files[0];

      if (target) {
        const content = safeRead(target, 2048);
        const status = extractField(content, 'Status') || extractField(content, 'status') || 'unknown';
        const body = extractBody(content, 200);
        return {
          name: dir.replace(/_/g, ' '),
          status,
          recentUpdate: body || 'No recent update.',
        };
      }

      return { name: dir.replace(/_/g, ' '), status: 'unknown', recentUpdate: 'Project folder exists.' };
    }
  }

  // Also check top-level .md files in Projects
  const topLevelFiles = listMdFiles(projDir);
  for (const file of topLevelFiles) {
    const basename = path.basename(file, '.md').toLowerCase().replace(/_/g, ' ');
    if (basename.includes(topicLower) || topicLower.includes(basename)) {
      const content = safeRead(file, 2048);
      const status = extractField(content, 'Status') || 'unknown';
      return {
        name: path.basename(file, '.md').replace(/_/g, ' '),
        status,
        recentUpdate: extractBody(content, 200) || 'File exists.',
      };
    }
  }

  return null;
}

// ── Decision Search ───────────────────────────────────────────────────────

/**
 * Search for decisions related to a topic.
 */
function findDecisions(vaultPath, topics) {
  const decDir = path.join(vaultPath, DECISIONS_DIR);
  if (!exists(decDir)) return [];

  const files = listMdFiles(decDir);
  const results = [];
  const topicLower = topics.map(t => t.toLowerCase());

  for (const file of files) {
    const basename = path.basename(file, '.md').toLowerCase();
    const matches = topicLower.some(t => basename.includes(t));
    if (!matches) continue;

    const content = safeRead(file, 1024);
    // Extract date from filename (YYYY-MM-DD prefix)
    const dateMatch = path.basename(file).match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : '';
    const summary = extractBody(content, 150);

    if (summary) {
      results.push({ date, summary });
    }
    if (results.length >= 3) break;
  }
  return results;
}

// ── Recent Meeting Search ─────────────────────────────────────────────────

/**
 * Search recent meetings for mentions of entities.
 */
function findRelatedMeetings(vaultPath, entities) {
  const meetDir = path.join(vaultPath, MEETINGS_DIR);
  if (!exists(meetDir)) return [];

  const files = listMdFiles(meetDir);
  const results = [];
  const searchTerms = [...entities.names, ...entities.topics].map(t => t.toLowerCase());
  if (!searchTerms.length) return [];

  // Filter to recent files first (fast stat check)
  const recentFiles = files.filter(f => isRecent(f, RECENT_DAYS));

  // Sort by mtime descending
  recentFiles.sort((a, b) => {
    try {
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    } catch { return 0; }
  });

  for (const file of recentFiles) {
    const content = safeRead(file, 4096);
    const contentLower = content.toLowerCase();
    const matched = searchTerms.some(t => contentLower.includes(t));
    if (!matched) continue;

    // Extract a relevant snippet
    const snippet = extractRelevantSnippet(content, searchTerms);
    const relPath = path.relative(vaultPath, file);

    results.push({ file: relPath, snippet });
    if (results.length >= 3) break;
  }

  return results;
}

/**
 * Extract a short snippet around the first match of any search term.
 */
function extractRelevantSnippet(content, terms) {
  const contentLower = content.toLowerCase();
  let bestIdx = -1;

  for (const term of terms) {
    const idx = contentLower.indexOf(term);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }

  if (bestIdx === -1) return '';

  const start = Math.max(0, bestIdx - 80);
  const end = Math.min(content.length, bestIdx + 120);
  let snippet = content.slice(start, end).replace(/\n/g, ' ').trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}

// ── Search Index (Optional Speed Boost) ───────────────────────────────────

/**
 * Check the search index for keyword matches if it exists.
 */
function searchIndex(vaultPath, keywords) {
  const indexPath = path.join(vaultPath, SEARCH_INDEX);
  if (!exists(indexPath)) return [];

  try {
    const index = JSON.parse(safeRead(indexPath));
    if (!index || !index.documents) return [];

    const kw = keywords.map(k => k.toLowerCase());
    const matches = [];

    for (const doc of index.documents) {
      const tokens = (doc.tokens || doc.keywords || []).map(t => t.toLowerCase());
      const score = kw.reduce((s, k) => s + (tokens.includes(k) ? 1 : 0), 0);
      if (score > 0) {
        matches.push({ file: doc.file || doc.path, score });
      }
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch {
    return [];
  }
}

// ── Main Exports ──────────────────────────────────────────────────────────

/**
 * Determine whether a message warrants context injection.
 * Returns true if the message references people, projects, or specific topics.
 */
function shouldInjectContext(message) {
  if (!message || typeof message !== 'string') return false;

  const trimmed = message.trim();
  if (trimmed.length < 5) return false;

  // Skip generic messages
  for (const pat of GENERIC_PATTERNS) {
    if (pat.test(trimmed)) return false;
  }

  // Check for named entities
  const entities = extractEntities(trimmed);
  if (entities.names.length > 0) return true;
  if (entities.topics.length > 0) return true;

  // Check for question words + nouns (likely asking about something specific)
  if (/\b(what|who|when|where|status|update|progress|latest)\b/i.test(trimmed) && trimmed.length > 20) {
    return true;
  }

  return false;
}

/**
 * Gather relevant vault context based on the user's message.
 *
 * @param {string} vaultPath - Absolute path to the Dex vault
 * @param {string} userMessage - The user's raw message
 * @returns {{ people: Array, projects: Array, decisions: Array, relatedNotes: Array, formatted: string }}
 */
function gatherContext(vaultPath, userMessage) {
  const result = {
    people: [],
    projects: [],
    decisions: [],
    relatedNotes: [],
    formatted: '',
  };

  if (!vaultPath || !userMessage) return result;
  if (!shouldInjectContext(userMessage)) return result;

  const entities = extractEntities(userMessage);

  // Also add raw lowercase keywords for broader matching
  const allKeywords = [
    ...entities.names.map(n => n.toLowerCase()),
    ...entities.topics.map(t => t.toLowerCase()),
    ...userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w)),
  ];
  const uniqueKeywords = [...new Set(allKeywords)];

  // ── People ──────────────────────────────────────────────────────────────
  const seenPeople = new Set();
  for (const name of entities.names) {
    if (seenPeople.has(name.toLowerCase())) continue;
    const person = findPersonPage(vaultPath, name);
    if (person) {
      seenPeople.add(name.toLowerCase());
      result.people.push(person);
    }
  }
  // Also try single-word topics as first names
  for (const topic of entities.topics) {
    if (seenPeople.has(topic.toLowerCase())) continue;
    const person = findPersonPage(vaultPath, topic);
    if (person) {
      seenPeople.add(topic.toLowerCase());
      result.people.push(person);
    }
  }

  // ── Projects ────────────────────────────────────────────────────────────
  const seenProjects = new Set();
  const projectTerms = [...entities.names, ...entities.topics, ...uniqueKeywords.filter(k => k.length > 4)];
  for (const term of projectTerms) {
    if (seenProjects.has(term.toLowerCase())) continue;
    const project = findProject(vaultPath, term);
    if (project) {
      seenProjects.add(term.toLowerCase());
      result.projects.push(project);
    }
    if (result.projects.length >= 3) break;
  }

  // ── Decisions ───────────────────────────────────────────────────────────
  result.decisions = findDecisions(vaultPath, uniqueKeywords.slice(0, 10));

  // ── Related Meetings ────────────────────────────────────────────────────
  result.relatedNotes = findRelatedMeetings(vaultPath, entities);

  // ── Search Index Boost ──────────────────────────────────────────────────
  if (!result.relatedNotes.length && uniqueKeywords.length) {
    const indexed = searchIndex(vaultPath, uniqueKeywords);
    for (const hit of indexed) {
      if (result.relatedNotes.length >= 3) break;
      result.relatedNotes.push({ file: hit.file, snippet: '(matched via search index)' });
    }
  }

  // ── Format ──────────────────────────────────────────────────────────────
  result.formatted = formatContextBlock(result);

  return result;
}

/**
 * Format gathered context into a concise XML block for system prompt injection.
 * Keeps output under MAX_CONTEXT_CHARS.
 *
 * @param {{ people: Array, projects: Array, decisions: Array, relatedNotes: Array }} context
 * @returns {string}
 */
function formatContextBlock(context) {
  if (!context) return '';

  const { people, projects, decisions, relatedNotes } = context;
  const hasContent = people.length || projects.length || decisions.length || relatedNotes.length;
  if (!hasContent) return '';

  const parts = ['<vault_context>'];

  for (const p of people) {
    const attrs = [`name="${escXml(p.name)}"`];
    if (p.role) attrs.push(`role="${escXml(p.role)}"`);
    parts.push(`<person ${attrs.join(' ')}>${escXml(truncate(p.recentContext, 200))}</person>`);
  }

  for (const p of projects) {
    parts.push(`<project name="${escXml(p.name)}" status="${escXml(p.status)}">${escXml(truncate(p.recentUpdate, 200))}</project>`);
  }

  for (const d of decisions) {
    const dateAttr = d.date ? ` date="${escXml(d.date)}"` : '';
    parts.push(`<related_decision${dateAttr}>${escXml(truncate(d.summary, 150))}</related_decision>`);
  }

  for (const n of relatedNotes) {
    parts.push(`<related_note file="${escXml(n.file)}">${escXml(truncate(n.snippet, 150))}</related_note>`);
  }

  parts.push('</vault_context>');

  let output = parts.join('\n');

  // Trim from the end if over budget (drop related_notes first, then decisions)
  if (output.length > MAX_CONTEXT_CHARS) {
    output = trimContextBlock(parts, MAX_CONTEXT_CHARS);
  }

  return output;
}

/**
 * Progressively trim context block to fit within char limit.
 */
function trimContextBlock(parts, maxChars) {
  // Remove related_notes first, then decisions, then projects
  const priorities = ['<related_note', '<related_decision', '<project'];

  let filtered = [...parts];
  for (const prefix of priorities) {
    if (filtered.join('\n').length <= maxChars) break;
    filtered = filtered.filter(p => !p.startsWith(prefix));
  }

  let result = filtered.join('\n');
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 20) + '\n</vault_context>';
  }
  return result;
}

/**
 * Escape XML special characters.
 */
function escXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Truncate string to maxLen characters.
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen - 3) + '...';
}

// ── Module Exports ────────────────────────────────────────────────────────

module.exports = {
  gatherContext,
  formatContextBlock,
  shouldInjectContext,
};
