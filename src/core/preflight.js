'use strict';

const fs = require('fs');
const path = require('path');

// ── Pre-flight Context Gathering ────────────────────────────────────────────
// Silently gathers relevant vault context before sending the user's message
// to the agent. The user sees no tool calls — just a magically informed response.

// ── Constants ───────────────────────────────────────────────────────────────

const PEOPLE_INTERNAL = '05-Areas/People/Internal';
const PEOPLE_EXTERNAL = '05-Areas/People/External';
const PROJECTS_DIR = '04-Projects';
const TASKS_FILE = '03-Tasks/Tasks.md';
const MEETINGS_DIR = '00-Inbox/Meetings';

const MAX_CONTEXT_CHARS = 12000; // ~3000 tokens
const MAX_PEOPLE = 2;
const MAX_PERSON_LINES = 50;
const MAX_PROJECT_LINES = 30;
const MAX_TASK_LINES = 30;

// Common words that look like names but aren't
const NAME_STOPWORDS = new Set([
  'The', 'And', 'But', 'For', 'With', 'From', 'This', 'That', 'What',
  'When', 'Where', 'Which', 'How', 'Who', 'Why', 'Will', 'Would', 'Could',
  'Should', 'Can', 'May', 'Might', 'Must', 'Have', 'Has', 'Had', 'Been',
  'Just', 'Like', 'Also', 'Still', 'About', 'After', 'Before', 'Into',
  'Over', 'Under', 'Then', 'Than', 'Some', 'Any', 'All', 'Each', 'Every',
  'Both', 'Few', 'More', 'Most', 'Other', 'Such', 'Only', 'Same', 'Very',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Today', 'Tomorrow', 'Yesterday', 'Sprint', 'Quarter', 'Week',
  'Good', 'Great', 'Nice', 'Sure', 'Thanks', 'Please', 'Hello', 'Hey',
  'Deal', 'Product', 'Project', 'Meeting', 'Task', 'Action', 'Next',
]);

// Triggers for task context
const TASK_TRIGGERS = /\b(task|tasks|priority|priorities|work on|todo|to-do|backlog|what should|focus)\b/i;

// Triggers for decision context
const DECISION_TRIGGERS = /\b(decision|decided|chose|choice|why did we|past choices)\b/i;

// Triggers for meeting context
const MEETING_TRIGGERS = /\b(meeting|call|chat|sync|spoke|talked|discussed|1[:\-]1|standup|check-in)\b/i;

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely read first N lines of a file. Returns empty string on any error.
 */
function readLines(filePath, maxLines) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    return lines.slice(0, maxLines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Safely check if a path exists.
 */
function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * List files in a directory (non-recursive). Returns [] on error.
 */
function listDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Escape XML special characters.
 */
function escXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Name Extraction ─────────────────────────────────────────────────────────

/**
 * Extract likely person names from text.
 * Looks for capitalized two-word sequences like "Sarah Chen" or "Brett Baker".
 *
 * @param {string} text - Input text
 * @returns {Array<{ name: string, filename: string }>}
 */
function extractMentionedNames(text) {
  if (!text) return [];

  const results = [];
  const seen = new Set();

  // Two-word capitalized names
  const pattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const first = m[1];
    const last = m[2];

    // Skip if either word is a stopword
    if (NAME_STOPWORDS.has(first) || NAME_STOPWORDS.has(last)) continue;

    const name = `${first} ${last}`;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      name,
      filename: `${first}_${last}.md`,
    });
  }

  return results;
}

// ── Project Keyword Extraction ──────────────────────────────────────────────

/**
 * Extract likely project references from text.
 * Looks for capitalized multi-word phrases, words after "project"/"initiative".
 *
 * @param {string} text - Input text
 * @returns {string[]} - Candidate project names/keywords
 */
function extractProjectKeywords(text) {
  if (!text) return [];

  const results = [];
  const seen = new Set();

  // Words following "project", "initiative", "workstream"
  const contextPattern = /\b(?:project|initiative|workstream)\s+["']?([A-Z][a-zA-Z\s]*?)["']?(?:\s|[.,!?]|$)/gi;
  let m;
  while ((m = contextPattern.exec(text)) !== null) {
    const name = m[1].trim();
    if (name.length > 2 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      results.push(name);
    }
  }

  // Capitalized multi-word phrases (3+ chars each word, 2-4 words)
  const phrasePattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3})\b/g;
  while ((m = phrasePattern.exec(text)) !== null) {
    const phrase = m[1];
    const words = phrase.split(/\s+/);
    // Skip if all words are stopwords or common names (already handled by person extraction)
    const allStop = words.every(w => NAME_STOPWORDS.has(w));
    if (allStop) continue;

    const key = phrase.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(phrase);
    }
  }

  // Quoted terms
  const quotedPattern = /["']([^"']{3,40})["']/g;
  while ((m = quotedPattern.exec(text)) !== null) {
    const term = m[1].trim();
    if (!seen.has(term.toLowerCase())) {
      seen.add(term.toLowerCase());
      results.push(term);
    }
  }

  return results;
}

// ── Person Context ──────────────────────────────────────────────────────────

/**
 * Look up a person page and extract key context.
 */
function getPersonContext(vaultPath, nameInfo) {
  const dirs = [
    path.join(vaultPath, PEOPLE_INTERNAL),
    path.join(vaultPath, PEOPLE_EXTERNAL),
  ];

  for (const dir of dirs) {
    const filePath = path.join(dir, nameInfo.filename);
    if (!fileExists(filePath)) continue;

    const content = readLines(filePath, MAX_PERSON_LINES);
    if (!content) continue;

    // Extract key fields from frontmatter/content
    const role = extractField(content, 'Role') || extractField(content, 'role') || '';
    const company = extractField(content, 'Company') || extractField(content, 'company') || '';
    const lastMeeting = extractLastMeetingRef(content);
    const keyContext = extractKeyContext(content);

    return {
      type: 'person',
      name: nameInfo.name,
      filePath,
      role,
      company,
      lastMeeting,
      keyContext,
    };
  }

  // Try fuzzy first-name match
  const firstName = nameInfo.name.split(' ')[0].toLowerCase();
  for (const dir of dirs) {
    const files = listDir(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const base = file.replace('.md', '').toLowerCase();
      if (base.startsWith(firstName + '_')) {
        const filePath = path.join(dir, file);
        const content = readLines(filePath, MAX_PERSON_LINES);
        if (!content) continue;

        const role = extractField(content, 'Role') || extractField(content, 'role') || '';
        const company = extractField(content, 'Company') || extractField(content, 'company') || '';
        const realName = file.replace('.md', '').replace(/_/g, ' ');

        return {
          type: 'person',
          name: realName,
          filePath,
          role,
          company,
          lastMeeting: extractLastMeetingRef(content),
          keyContext: extractKeyContext(content),
        };
      }
    }
  }

  return null;
}

function extractField(content, field) {
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'mi');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function extractLastMeetingRef(content) {
  const meetingLines = content.match(/[-*]\s+\[?\[?\d{4}-\d{2}-\d{2}[^\]]*\]?\]?[^\n]*/g);
  if (!meetingLines || !meetingLines.length) return '';
  const last = meetingLines[meetingLines.length - 1].replace(/^[-*]\s+/, '').trim();
  return last.slice(0, 120);
}

function extractKeyContext(content) {
  // Look for lines under "## Context", "## Key Context", "## Notes" sections
  const contextSections = /^##\s+(Context|Key Context|Notes|Relationship)\s*$/mi;
  const match = contextSections.exec(content);
  if (!match) return '';

  const afterMatch = content.slice(match.index + match[0].length);
  const lines = afterMatch.split('\n');
  const contextLines = [];
  for (const line of lines) {
    if (line.startsWith('## ')) break; // next section
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('---')) {
      contextLines.push(trimmed);
    }
    if (contextLines.length >= 3) break;
  }
  return contextLines.join(' ').slice(0, 200);
}

// ── Project Context ─────────────────────────────────────────────────────────

/**
 * Find and read project context matching keywords.
 */
function getProjectContext(vaultPath, keywords) {
  const projDir = path.join(vaultPath, PROJECTS_DIR);
  if (!fileExists(projDir)) return null;

  const entries = listDir(projDir);

  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase();

    // Check directories
    for (const entry of entries) {
      const entryLower = entry.toLowerCase().replace(/_/g, ' ');
      if (!entryLower.includes(kwLower) && !kwLower.includes(entryLower)) continue;

      const entryPath = path.join(projDir, entry);
      let stat;
      try { stat = fs.statSync(entryPath); } catch { continue; }

      if (stat.isDirectory()) {
        // Find main file in project directory
        const files = listDir(entryPath).filter(f => f.endsWith('.md'));
        const mainFile = files.find(f => /status|readme|overview/i.test(f)) || files[0];
        if (!mainFile) continue;

        const content = readLines(path.join(entryPath, mainFile), MAX_PROJECT_LINES);
        const status = extractField(content, 'Status') || extractField(content, 'status') || '';
        const nextMilestone = extractField(content, 'Next Milestone') || extractField(content, 'next_milestone') || '';

        return {
          type: 'project',
          name: entry.replace(/_/g, ' '),
          filePath: path.join(entryPath, mainFile),
          status,
          nextMilestone,
          summary: extractBodySummary(content, 150),
        };
      }

      if (stat.isFile() && entry.endsWith('.md')) {
        const content = readLines(entryPath, MAX_PROJECT_LINES);
        const status = extractField(content, 'Status') || '';

        return {
          type: 'project',
          name: entry.replace('.md', '').replace(/_/g, ' '),
          filePath: entryPath,
          status,
          nextMilestone: '',
          summary: extractBodySummary(content, 150),
        };
      }
    }
  }

  return null;
}

function extractBodySummary(content, maxChars) {
  let body = content;
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) body = content.slice(endIdx + 3);
  }
  return body.trim().slice(0, maxChars);
}

// ── Task Context ────────────────────────────────────────────────────────────

function getTaskContext(vaultPath) {
  const tasksPath = path.join(vaultPath, TASKS_FILE);
  if (!fileExists(tasksPath)) return null;

  const content = readLines(tasksPath, MAX_TASK_LINES);
  if (!content || content.trim().length < 10) return null;

  return {
    type: 'tasks',
    filePath: tasksPath,
    content: content.slice(0, 1500),
  };
}

// ── Meeting Context ─────────────────────────────────────────────────────────

/**
 * Find the most recent meeting note mentioning a person (by filename scan only).
 */
function getRecentMeetingForPerson(vaultPath, personName) {
  const meetDir = path.join(vaultPath, MEETINGS_DIR);
  if (!fileExists(meetDir)) return null;

  const files = listDir(meetDir).filter(f => f.endsWith('.md'));
  if (!files.length) return null;

  // Sort by filename descending (date prefix: YYYY-MM-DD)
  files.sort((a, b) => b.localeCompare(a));

  const nameParts = personName.toLowerCase().split(' ');
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];

  // Check filenames first (fast), then scan content of recent files
  for (const file of files.slice(0, 10)) {
    const fileLower = file.toLowerCase();
    if (fileLower.includes(firstName) || fileLower.includes(lastName)) {
      const filePath = path.join(meetDir, file);
      const content = readLines(filePath, 20);
      return {
        type: 'meeting',
        file: file.replace('.md', ''),
        filePath,
        snippet: content.slice(0, 300),
      };
    }
  }

  // Scan content of last 5 files for the person's name
  for (const file of files.slice(0, 5)) {
    const filePath = path.join(meetDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const contentLower = content.toLowerCase();
      if (contentLower.includes(firstName) && (nameParts.length < 2 || contentLower.includes(lastName))) {
        // Extract a snippet around the mention
        const idx = contentLower.indexOf(firstName);
        const start = Math.max(0, idx - 50);
        const end = Math.min(content.length, idx + 150);
        return {
          type: 'meeting',
          file: file.replace('.md', ''),
          filePath,
          snippet: content.slice(start, end).replace(/\n/g, ' ').trim(),
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

// ── Decision Context ────────────────────────────────────────────────────────

function getDecisionContext(vaultPath) {
  // Check multiple possible decision log locations
  const locations = [
    path.join(vaultPath, '00-Inbox', 'Decisions'),
    path.join(vaultPath, '06-Resources', 'Decisions'),
  ];

  for (const dir of locations) {
    if (!fileExists(dir)) continue;

    const files = listDir(dir).filter(f => f.endsWith('.md'));
    if (!files.length) continue;

    // Sort descending by name (date prefix)
    files.sort((a, b) => b.localeCompare(a));

    const entries = [];
    for (const file of files.slice(0, 5)) {
      const content = readLines(path.join(dir, file), 15);
      if (content) {
        entries.push({
          file: file.replace('.md', ''),
          summary: extractBodySummary(content, 120),
        });
      }
    }

    if (entries.length) {
      return { type: 'decisions', entries };
    }
  }

  return null;
}

// ── Format ──────────────────────────────────────────────────────────────────

/**
 * Format gathered context items into an XML block for system prompt injection.
 *
 * @param {object} gathered - Object with arrays of context items
 * @returns {string} Formatted XML context block
 */
function formatPreflightContext(gathered) {
  if (!gathered) return '';

  const { people, project, tasks, meeting, decisions } = gathered;
  const hasContent = (people && people.length) || project || tasks || meeting || decisions;
  if (!hasContent) return '';

  const parts = ['<preflight_context>'];
  let charCount = 22; // opening tag length

  // People
  if (people) {
    for (const p of people) {
      const lines = [];
      if (p.role) lines.push(`Role: ${p.role}${p.company ? ` at ${p.company}` : ''}`);
      else if (p.company) lines.push(`Company: ${p.company}`);
      if (p.lastMeeting) lines.push(`Last meeting: ${p.lastMeeting}`);
      if (p.keyContext) lines.push(`Key context: ${p.keyContext}`);

      const block = `<person name="${escXml(p.name)}">\n${lines.join('\n')}\n</person>`;
      if (charCount + block.length > MAX_CONTEXT_CHARS) break;
      parts.push(block);
      charCount += block.length;
    }
  }

  // Project
  if (project && charCount < MAX_CONTEXT_CHARS) {
    const lines = [];
    if (project.status) lines.push(`Status: ${project.status}`);
    if (project.nextMilestone) lines.push(`Next milestone: ${project.nextMilestone}`);
    if (project.summary) lines.push(project.summary);

    const block = `<project name="${escXml(project.name)}">\n${lines.join('\n')}\n</project>`;
    if (charCount + block.length <= MAX_CONTEXT_CHARS) {
      parts.push(block);
      charCount += block.length;
    }
  }

  // Tasks
  if (tasks && charCount < MAX_CONTEXT_CHARS) {
    const block = `<tasks>\n${tasks.content}\n</tasks>`;
    if (charCount + block.length <= MAX_CONTEXT_CHARS) {
      parts.push(block);
      charCount += block.length;
    }
  }

  // Meeting
  if (meeting && charCount < MAX_CONTEXT_CHARS) {
    const block = `<recent_meeting file="${escXml(meeting.file)}">\n${escXml(meeting.snippet)}\n</recent_meeting>`;
    if (charCount + block.length <= MAX_CONTEXT_CHARS) {
      parts.push(block);
      charCount += block.length;
    }
  }

  // Decisions
  if (decisions && charCount < MAX_CONTEXT_CHARS) {
    const decParts = decisions.entries.map(d =>
      `  <decision>${escXml(d.file)}: ${escXml(d.summary)}</decision>`
    );
    const block = `<recent_decisions>\n${decParts.join('\n')}\n</recent_decisions>`;
    if (charCount + block.length <= MAX_CONTEXT_CHARS) {
      parts.push(block);
      charCount += block.length;
    }
  }

  parts.push('</preflight_context>');
  return parts.join('\n');
}

// ── Main Function ───────────────────────────────────────────────────────────

/**
 * Gather pre-flight context from the vault based on the user's message.
 * Runs before the message is sent to the agent to enrich the system prompt.
 *
 * @param {string} vaultPath - Absolute path to the vault
 * @param {string} userMessage - The user's raw message
 * @param {object} [options]
 * @param {string[]} [options.recentMessages] - Recent conversation messages
 * @param {string} [options.activeSkill] - Currently active skill name
 * @param {string} [options.userName] - User's name to filter from person detection
 * @returns {{ context: string, sources: string[] }}
 */
function gatherPreflightContext(vaultPath, userMessage, options = {}) {
  const result = { context: '', sources: [] };

  try {
    if (!vaultPath || !userMessage || typeof userMessage !== 'string') return result;
    if (userMessage.trim().length < 3) return result;

    const gathered = {
      people: [],
      project: null,
      tasks: null,
      meeting: null,
      decisions: null,
    };

    // a. Person context
    const names = extractMentionedNames(userMessage);
    const userNameLower = (options.userName || '').toLowerCase();

    let peopleCount = 0;
    for (const nameInfo of names) {
      if (peopleCount >= MAX_PEOPLE) break;
      // Skip the user's own name
      if (userNameLower && nameInfo.name.toLowerCase() === userNameLower) continue;

      const personCtx = getPersonContext(vaultPath, nameInfo);
      if (personCtx) {
        gathered.people.push(personCtx);
        result.sources.push(personCtx.filePath);
        peopleCount++;
      }
    }

    // b. Project context
    const projectKeywords = extractProjectKeywords(userMessage);
    // Also use name-like phrases that didn't match people
    const unmatchedNames = names
      .filter(n => !gathered.people.some(p => p.name.toLowerCase() === n.name.toLowerCase()))
      .map(n => n.name);
    const allProjectKeywords = [...projectKeywords, ...unmatchedNames];

    if (allProjectKeywords.length > 0) {
      const projCtx = getProjectContext(vaultPath, allProjectKeywords);
      if (projCtx) {
        gathered.project = projCtx;
        result.sources.push(projCtx.filePath);
      }
    }

    // c. Recent decisions
    if (DECISION_TRIGGERS.test(userMessage)) {
      const decCtx = getDecisionContext(vaultPath);
      if (decCtx) {
        gathered.decisions = decCtx;
      }
    }

    // d. Task context
    if (TASK_TRIGGERS.test(userMessage)) {
      const taskCtx = getTaskContext(vaultPath);
      if (taskCtx) {
        gathered.tasks = taskCtx;
        result.sources.push(taskCtx.filePath);
      }
    }

    // e. Meeting context (person mentioned + meeting-related words)
    if (gathered.people.length > 0 && MEETING_TRIGGERS.test(userMessage)) {
      const firstPerson = gathered.people[0];
      const meetingCtx = getRecentMeetingForPerson(vaultPath, firstPerson.name);
      if (meetingCtx) {
        gathered.meeting = meetingCtx;
        result.sources.push(meetingCtx.filePath);
      }
    }

    // Format the gathered context
    result.context = formatPreflightContext(gathered);

  } catch {
    // Preflight should never crash or delay the response
    return { context: '', sources: [] };
  }

  return result;
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  gatherPreflightContext,
  extractMentionedNames,
  extractProjectKeywords,
  formatPreflightContext,
};
