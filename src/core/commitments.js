'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Commitment Tracker + Follow-Up Engine ──────────────────────────────
// Detects promises and commitments in conversation, persists them as JSONL,
// and generates follow-up nudges. The #1 differentiator from stateless AI.

// ── Date Helpers ────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function todayDate() {
  return new Date(today() + 'T00:00:00');
}

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Parse relative and absolute date expressions into YYYY-MM-DD.
 * Handles: "by Friday", "this week", "next Monday", "end of month",
 * "tomorrow", "in 2 days", "April 15", "2026-04-15", etc.
 */
function parseDueDate(text) {
  if (!text) return null;
  const now = new Date();
  const currentYear = now.getFullYear();

  // Absolute ISO date
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  // "April 15", "Jan 3", etc.
  const monthNames = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11,
  };
  const monthDayMatch = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/i);
  if (monthDayMatch) {
    const month = monthNames[monthDayMatch[1].toLowerCase().slice(0, 3)];
    const day = parseInt(monthDayMatch[2], 10);
    if (month !== undefined && day >= 1 && day <= 31) {
      const d = new Date(currentYear, month, day);
      if (d < now) d.setFullYear(currentYear + 1);
      return d.toISOString().split('T')[0];
    }
  }

  const lower = text.toLowerCase();

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  // "today"
  if (/\btoday\b/.test(lower)) {
    return today();
  }

  // "in N days/weeks"
  const inNMatch = lower.match(/\bin\s+(\d+)\s+(day|week|month)s?\b/);
  if (inNMatch) {
    const n = parseInt(inNMatch[1], 10);
    const unit = inNMatch[2];
    const d = new Date(now);
    if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'week') d.setDate(d.getDate() + n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0];
  }

  // "by Friday", "next Monday", "this Thursday"
  const dayNames = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const dayMatch = lower.match(/\b(?:by|next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const targetDay = dayNames[dayMatch[1]];
    const currentDay = now.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7; // always look forward
    if (/\bnext\b/.test(dayMatch[0]) && diff <= 7) diff += 7; // "next" means the one after this week
    const d = new Date(now);
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  // "this week" / "end of week"
  if (/\b(?:this\s+week|end\s+of\s+(?:the\s+)?week|eow)\b/.test(lower)) {
    const d = new Date(now);
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntilFriday);
    return d.toISOString().split('T')[0];
  }

  // "end of month" / "eom"
  if (/\b(?:end\s+of\s+(?:the\s+)?month|eom)\b/.test(lower)) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return d.toISOString().split('T')[0];
  }

  return null;
}

// ── Commitment Detection Patterns ──────────────────────────────────────

// Self-commitments: things the user promised to do
const SELF_PATTERNS = [
  // "I'll send the doc to Sarah"
  /\bI['']ll\s+(.{8,80})/i,
  // "I need to review the proposal"
  /\bI\s+need\s+to\s+(.{8,80})/i,
  // "I should follow up with Brett"
  /\bI\s+should\s+(.{8,80})/i,
  // "I'm going to refactor the API"
  /\bI['']m\s+going\s+to\s+(.{8,80})/i,
  // "let me draft that email"
  /\blet\s+me\s+(.{8,80})/i,
  // "I promised Sarah I'd..."
  /\bI\s+promised\s+(\w+)\s+I['']d\s+(.{8,80})/i,
  // "I committed to shipping by Friday"
  /\bI\s+committed\s+to\s+(.{8,80})/i,
  // "I owe Sarah the pricing doc"
  /\bI\s+owe\s+(\w+)\s+(.{8,80})/i,
  // "I told Sarah I'd send it"
  /\bI\s+told\s+(\w+)\s+I['']d\s+(.{8,80})/i,
  // "action item: review the deck"
  /\baction\s+item:\s*(.{8,80})/i,
  // "TODO: update the spec"
  /\bTODO:\s*(.{8,80})/i,
  // "remind me to call Brett"
  /\bremind\s+me\s+to\s+(.{8,80})/i,
];

// Other-commitments: things someone promised the user
const OTHER_PATTERNS = [
  // "Sarah said she'd review it"
  /\b([A-Z][a-z]+)\s+said\s+(?:she|he|they)['']d\s+(.{8,80})/,
  // "Sarah will send the doc"
  /\b([A-Z][a-z]+)\s+will\s+(.{8,80})/,
  // "Sarah promised to review"
  /\b([A-Z][a-z]+)\s+promised\s+(?:to\s+)?(.{8,80})/,
  // "Sarah is going to check"
  /\b([A-Z][a-z]+)\s+is\s+going\s+to\s+(.{8,80})/,
  // "Sarah needs to approve"
  /\b([A-Z][a-z]+)\s+needs?\s+to\s+(.{8,80})/,
  // "waiting on Sarah for the review"
  /\bwaiting\s+on\s+([A-Z][a-z]+)\s+(?:for\s+)?(.{8,80})/i,
];

// Words that get falsely matched as person names in OTHER_PATTERNS
const NAME_BLOCKLIST = new Set([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'Someone', 'Everyone', 'Anyone', 'Nobody', 'Something', 'Everything',
  'Maybe', 'Perhaps', 'Actually', 'Basically', 'Currently', 'Honestly',
  'The', 'This', 'That', 'There', 'Here', 'What', 'When', 'Where',
]);

// Vague phrases that shouldn't be commitments (need specificity)
const VAGUE_PHRASES = [
  /\bI should probably\b/i,
  /\bI should think about\b/i,
  /\bmaybe I should\b/i,
  /\bI might\b/i,
  /\bI could\b/i,
  /\bwe should consider\b/i,
];

/**
 * Check if a commitment text has enough specificity to be worth tracking.
 * Returns true if it mentions a person, deliverable, or timeframe.
 */
function isSpecificEnough(text) {
  // Check for vague prefixes
  for (const pattern of VAGUE_PHRASES) {
    if (pattern.test(text)) return false;
  }

  const hasPersonName = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(text);
  const hasDeliverable = /\b(docs?|documents?|emails?|reports?|proposals?|specs?|decks?|slides?|designs?|redesigns?|reviews?|feedback|updates?|plans?|briefs?|drafts?|analysis|code|pr|pull request|posts?|articles?|presentations?|demos?|dashboards?|migrations?|roadmaps?)\b/i.test(text);
  const hasTimeframe = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|this week|next week|end of|by |before |after |deadline|asap|urgent)\b/i.test(text);
  const hasAction = /\b(send|review|writ|creat|updat|check|follow.up|prepar|schedul|book|call|email|messag|shar|post|submit|approv|sign|finish|complet|ship|deploy|fix|build)\w*/i.test(text);

  // Must have at least 2 specificity signals
  const signals = [hasPersonName, hasDeliverable, hasTimeframe, hasAction].filter(Boolean).length;
  return signals >= 2;
}

/**
 * Extract person names from commitment text.
 */
function extractPerson(text) {
  // Named patterns first ("I told Sarah...", "I owe Brett...")
  const namedMatch = text.match(/\b(?:told|owe|promised)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (namedMatch && !NAME_BLOCKLIST.has(namedMatch[1])) return namedMatch[1];

  // "to Sarah", "for Sarah", "with Sarah"
  const prepMatch = text.match(/\b(?:to|for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (prepMatch && !NAME_BLOCKLIST.has(prepMatch[1])) return prepMatch[1];

  // "send Sarah", "email Brett", "call Mike" — verb + name
  const verbNameMatch = text.match(/\b(?:send|email|call|message|tell|ask|ping|remind|update|share|show)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (verbNameMatch && !NAME_BLOCKLIST.has(verbNameMatch[1])) return verbNameMatch[1];

  return null;
}

// ── Core API ───────────────────────────────────────────────────────────

/**
 * Extract commitments from text.
 *
 * @param {string} text - Text to scan for commitments
 * @param {string} source - Where it was detected (e.g. "conversation", "meeting:2026-04-10")
 * @returns {Array<{text: string, owner: 'self'|'other', person?: string, source: string, detected_at: string, due?: string, status: 'open'}>}
 */
function extractCommitments(text, source = 'conversation') {
  if (!text || typeof text !== 'string') return [];

  const commitments = [];
  const seen = new Set(); // dedupe

  // Split into sentences for context
  const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 10);

  for (const sentence of sentences) {
    // Check self-commitment patterns
    for (const pattern of SELF_PATTERNS) {
      const match = sentence.match(pattern);
      if (!match) continue;

      // Extract the commitment text (last capture group)
      let commitText = match[match.length - 1].trim();
      // Clean up trailing punctuation and filler
      commitText = commitText.replace(/[,;]+$/, '').trim();
      if (commitText.length < 10) continue;

      // Check specificity
      if (!isSpecificEnough(sentence)) continue;

      const key = commitText.toLowerCase().slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);

      // Extract person if mentioned
      let person = null;
      // Special patterns that capture person name directly
      const promisedMatch = sentence.match(/\bI\s+(?:promised|told|owe)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
      if (promisedMatch && !NAME_BLOCKLIST.has(promisedMatch[1])) {
        person = promisedMatch[1];
      } else {
        person = extractPerson(sentence);
      }

      const due = parseDueDate(sentence);

      commitments.push({
        text: commitText,
        owner: 'self',
        ...(person && { person }),
        source,
        detected_at: new Date().toISOString(),
        ...(due && { due }),
        status: 'open',
      });
      break; // one commitment per sentence
    }

    // Check other-commitment patterns
    for (const pattern of OTHER_PATTERNS) {
      const match = sentence.match(pattern);
      if (!match) continue;

      const person = match[1];
      if (NAME_BLOCKLIST.has(person)) continue;

      const commitText = match[2].trim().replace(/[,;]+$/, '').trim();
      if (commitText.length < 10) continue;
      if (!isSpecificEnough(sentence)) continue;

      const key = `other:${person}:${commitText.toLowerCase().slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const due = parseDueDate(sentence);

      commitments.push({
        text: commitText,
        owner: 'other',
        person,
        source,
        detected_at: new Date().toISOString(),
        ...(due && { due }),
        status: 'open',
      });
      break;
    }
  }

  return commitments;
}

/**
 * Save a commitment to the JSONL store.
 *
 * @param {string} vaultPath - Path to the vault root
 * @param {object} commitment - Commitment object from extractCommitments
 * @returns {object} The saved commitment with generated id
 */
function saveCommitment(vaultPath, commitment) {
  try {
    const vennieDir = path.join(vaultPath, '.vennie');
    if (!fs.existsSync(vennieDir)) {
      fs.mkdirSync(vennieDir, { recursive: true });
    }

    const filePath = path.join(vennieDir, 'commitments.jsonl');

    const record = {
      id: `cmt-${shortId()}`,
      ...commitment,
      created_at: new Date().toISOString(),
    };

    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
    return record;
  } catch (err) {
    // Never crash the app
    return { ...commitment, id: `cmt-${shortId()}`, error: err.message };
  }
}

/**
 * Read all commitments from the JSONL store.
 */
function readAllCommitments(vaultPath) {
  try {
    const filePath = path.join(vaultPath, '.vennie', 'commitments.jsonl');
    if (!fs.existsSync(filePath)) return [];

    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
    const commitments = [];
    for (const line of lines) {
      try {
        commitments.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
    return commitments;
  } catch {
    return [];
  }
}

/**
 * Query open commitments with filtering and sorting.
 *
 * @param {string} vaultPath
 * @param {object} options - { owner?: 'self'|'other', person?: string, overdue?: boolean, limit?: number }
 * @returns {Array<object>}
 */
function getOpenCommitments(vaultPath, options = {}) {
  try {
    const { owner, person, overdue, limit } = options;
    const todayStr = today();
    let commitments = readAllCommitments(vaultPath).filter(c => c.status === 'open');

    if (owner) commitments = commitments.filter(c => c.owner === owner);
    if (person) commitments = commitments.filter(c => c.person && c.person.toLowerCase().includes(person.toLowerCase()));
    if (overdue) commitments = commitments.filter(c => c.due && c.due < todayStr);

    // Sort: overdue first, then by due date (soonest first), then by detection date (newest first)
    commitments.sort((a, b) => {
      const aOverdue = a.due && a.due < todayStr;
      const bOverdue = b.due && b.due < todayStr;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return (b.detected_at || '').localeCompare(a.detected_at || '');
    });

    if (limit) commitments = commitments.slice(0, limit);
    return commitments;
  } catch {
    return [];
  }
}

/**
 * Get all overdue commitments.
 */
function getOverdueCommitments(vaultPath) {
  return getOpenCommitments(vaultPath, { overdue: true });
}

/**
 * Mark a commitment as completed.
 *
 * @param {string} vaultPath
 * @param {string} id - Commitment ID (e.g. "cmt-a1b2c3d4")
 * @returns {boolean} Whether the commitment was found and updated
 */
function completeCommitment(vaultPath, id) {
  try {
    const filePath = path.join(vaultPath, '.vennie', 'commitments.jsonl');
    if (!fs.existsSync(filePath)) return false;

    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
    let found = false;
    const updated = lines.map(line => {
      try {
        const obj = JSON.parse(line);
        if (obj.id === id) {
          found = true;
          obj.status = 'done';
          obj.completed_at = new Date().toISOString();
          return JSON.stringify(obj);
        }
        return line;
      } catch {
        return line;
      }
    });

    if (found) {
      fs.writeFileSync(filePath, updated.join('\n') + '\n', 'utf8');
    }
    return found;
  } catch {
    return false;
  }
}

/**
 * Generate a follow-up nudge message for the user.
 * Checks overdue, soon-due (next 2 days), and stale (>7 days with no due date).
 *
 * @param {string} vaultPath
 * @returns {string|null} Formatted nudge string, or null if nothing to report
 */
function generateFollowUpNudge(vaultPath) {
  try {
    const todayStr = today();
    const todayMs = new Date(todayStr + 'T00:00:00').getTime();
    const twoDaysMs = todayMs + 2 * 24 * 60 * 60 * 1000;
    const twoDaysStr = new Date(twoDaysMs).toISOString().split('T')[0];
    const sevenDaysAgoMs = todayMs - 7 * 24 * 60 * 60 * 1000;

    const open = getOpenCommitments(vaultPath);
    if (open.length === 0) return null;

    const overdue = open.filter(c => c.due && c.due < todayStr);
    const soonDue = open.filter(c => c.due && c.due >= todayStr && c.due <= twoDaysStr);
    const stale = open.filter(c => {
      if (c.due) return false; // has a due date, handled above
      const detected = new Date(c.detected_at || c.created_at).getTime();
      return detected < sevenDaysAgoMs;
    });

    const lines = [];

    // Overdue — most urgent
    if (overdue.length > 0) {
      if (overdue.length === 1) {
        const c = overdue[0];
        const daysSince = Math.ceil((todayMs - new Date(c.due + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000));
        if (c.owner === 'self') {
          const personBit = c.person ? ` you'd send ${c.person}` : '';
          lines.push(`You mentioned${personBit} "${c.text.slice(0, 60)}" -- that was ${daysSince} day${daysSince === 1 ? '' : 's'} ago. Still on your radar?`);
        } else {
          lines.push(`${c.person || 'Someone'} was supposed to "${c.text.slice(0, 60)}" -- ${daysSince} day${daysSince === 1 ? '' : 's'} overdue. Worth following up?`);
        }
      } else {
        const selfOverdue = overdue.filter(c => c.owner === 'self');
        const otherOverdue = overdue.filter(c => c.owner === 'other');
        if (selfOverdue.length > 0) {
          lines.push(`${selfOverdue.length} commitment${selfOverdue.length === 1 ? '' : 's'} overdue:`);
          for (const c of selfOverdue.slice(0, 3)) {
            const personBit = c.person ? ` (${c.person})` : '';
            lines.push(`  - ${c.text.slice(0, 50)}${personBit}`);
          }
          if (selfOverdue.length > 3) lines.push(`  ... and ${selfOverdue.length - 3} more`);
        }
        if (otherOverdue.length > 0) {
          lines.push(`${otherOverdue.length} thing${otherOverdue.length === 1 ? '' : 's'} others owe you:`);
          for (const c of otherOverdue.slice(0, 2)) {
            lines.push(`  - ${c.person || 'Someone'}: ${c.text.slice(0, 50)}`);
          }
        }
        lines.push('Which ones still matter?');
      }
    }

    // Soon due
    if (soonDue.length > 0 && lines.length === 0) {
      const c = soonDue[0];
      const dueLabel = c.due === todayStr ? 'today' : 'soon';
      if (c.owner === 'self') {
        lines.push(`Heads up: "${c.text.slice(0, 60)}" is due ${dueLabel}.`);
      } else {
        lines.push(`${c.person || 'Someone'} has "${c.text.slice(0, 60)}" due ${dueLabel}.`);
      }
      if (soonDue.length > 1) {
        lines.push(`Plus ${soonDue.length - 1} more coming up in the next couple of days.`);
      }
    }

    // Stale (only if nothing more urgent)
    if (stale.length > 0 && lines.length === 0) {
      const c = stale[0];
      const daysOld = Math.ceil((todayMs - new Date(c.detected_at || c.created_at).getTime()) / (24 * 60 * 60 * 1000));
      if (c.owner === 'self') {
        lines.push(`"${c.text.slice(0, 60)}" has been open for ${daysOld} days with no due date. Still relevant?`);
      } else {
        lines.push(`${c.person || 'Someone'} mentioned "${c.text.slice(0, 60)}" ${daysOld} days ago. Worth a check-in?`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

/**
 * Get commitment stats for the dashboard.
 *
 * @param {string} vaultPath
 * @param {number} [days=30] - Look back period in days
 * @returns {{ total: number, completed: number, overdue: number, avgCompletionDays: number, byPerson: Object }}
 */
function getCommitmentStats(vaultPath, days = 30) {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString();
    const todayStr = today();

    const all = readAllCommitments(vaultPath).filter(c => (c.created_at || c.detected_at) >= cutoffStr);

    const completed = all.filter(c => c.status === 'done');
    const overdue = all.filter(c => c.status === 'open' && c.due && c.due < todayStr);

    // Average completion time
    let totalDays = 0;
    let countWithDates = 0;
    for (const c of completed) {
      if (c.completed_at && (c.created_at || c.detected_at)) {
        const start = new Date(c.created_at || c.detected_at).getTime();
        const end = new Date(c.completed_at).getTime();
        totalDays += (end - start) / (24 * 60 * 60 * 1000);
        countWithDates++;
      }
    }

    // By person
    const byPerson = {};
    for (const c of all) {
      if (c.person) {
        byPerson[c.person] = (byPerson[c.person] || 0) + 1;
      }
    }

    return {
      total: all.length,
      completed: completed.length,
      overdue: overdue.length,
      avgCompletionDays: countWithDates > 0 ? Math.round(totalDays / countWithDates * 10) / 10 : 0,
      byPerson,
    };
  } catch {
    return { total: 0, completed: 0, overdue: 0, avgCompletionDays: 0, byPerson: {} };
  }
}

/**
 * Get commitments involving a specific person (either direction).
 *
 * @param {string} vaultPath
 * @param {string} personName
 * @returns {Array<object>}
 */
function getCommitmentsForPerson(vaultPath, personName) {
  try {
    const lower = personName.toLowerCase();
    return readAllCommitments(vaultPath).filter(c =>
      c.status === 'open' && c.person && c.person.toLowerCase().includes(lower)
    );
  } catch {
    return [];
  }
}

module.exports = {
  extractCommitments,
  saveCommitment,
  getOpenCommitments,
  getOverdueCommitments,
  completeCommitment,
  generateFollowUpNudge,
  getCommitmentStats,
  getCommitmentsForPerson,
  parseDueDate,
};
