'use strict';

const fs = require('fs');
const path = require('path');

// ── Session Learnings System ──────────────────────────────────────────────
// Append-only JSONL store for structured learnings extracted from sessions.
// Replaces markdown-based Session_Learnings with something queryable and
// auto-injectable into system prompts.

const LEARNINGS_FILE = '.vennie/learnings.jsonl';

const VALID_TYPES = new Set([
  'preference',
  'mistake',
  'pattern',
  'workflow',
  'person_context',
  'skill_tip',
]);

// ── Helpers ───────────────────────────────────────────────────────────────

function getLearningsPath(vaultPath) {
  return path.join(vaultPath, LEARNINGS_FILE);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read all learnings from the JSONL file.
 * Returns an array of parsed objects. Skips malformed lines.
 */
function readAllLearnings(vaultPath) {
  const filePath = getLearningsPath(vaultPath);
  if (!fs.existsSync(filePath)) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const entries = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

// ── Core Exports ──────────────────────────────────────────────────────────

/**
 * Append a structured learning to the JSONL file.
 *
 * @param {string} vaultPath - Root of the Vennie vault
 * @param {object} learning
 * @param {string} learning.type - One of VALID_TYPES
 * @param {string[]} learning.tags - Freeform tags (person names, project names, topics)
 * @param {string} learning.context - Situation that produced this learning
 * @param {string} learning.learning - The actual insight
 * @param {string} [learning.source] - Where it came from (skill name, conversation, etc.)
 * @param {string} [learning.session_id] - Session identifier
 */
function appendLearning(vaultPath, learning) {
  try {
    const filePath = getLearningsPath(vaultPath);
    ensureDir(filePath);

    const entry = {
      timestamp: new Date().toISOString(),
      type: VALID_TYPES.has(learning.type) ? learning.type : 'pattern',
      tags: Array.isArray(learning.tags) ? learning.tags : [],
      context: learning.context || '',
      learning: learning.learning || '',
      source: learning.source || 'session',
      session_id: learning.session_id || null,
    };

    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  } catch {
    return null;
  }
}

/**
 * Query learnings by tags, type, or text search.
 *
 * @param {string} vaultPath
 * @param {object} query
 * @param {string[]} [query.tags] - Filter by any matching tag (OR)
 * @param {string} [query.type] - Filter by learning type
 * @param {string} [query.text] - Free-text search across context + learning fields
 * @param {number} [query.limit=10] - Max results
 * @param {string} [query.since] - ISO date string — only return learnings after this date
 * @returns {object[]} Matching entries sorted by recency (newest first)
 */
function queryLearnings(vaultPath, query = {}) {
  try {
    let entries = readAllLearnings(vaultPath);

    // Filter by type
    if (query.type) {
      entries = entries.filter(e => e.type === query.type);
    }

    // Filter by tags (OR match — any tag overlap)
    if (query.tags && query.tags.length > 0) {
      const queryTags = new Set(query.tags.map(t => t.toLowerCase()));
      entries = entries.filter(e =>
        e.tags.some(t => queryTags.has(t.toLowerCase()))
      );
    }

    // Filter by text (case-insensitive search in context + learning)
    if (query.text) {
      const needle = query.text.toLowerCase();
      entries = entries.filter(e =>
        (e.context && e.context.toLowerCase().includes(needle)) ||
        (e.learning && e.learning.toLowerCase().includes(needle))
      );
    }

    // Filter by date
    if (query.since) {
      const sinceDate = new Date(query.since).getTime();
      entries = entries.filter(e => new Date(e.timestamp).getTime() >= sinceDate);
    }

    // Sort by recency (newest first)
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply limit
    const limit = query.limit || 10;
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Smart retrieval for injection into system prompts.
 * Scores learnings by relevance (tag overlap, recency decay, type priority).
 *
 * @param {string} vaultPath
 * @param {object} context
 * @param {string[]} [context.personNames] - People mentioned in the conversation
 * @param {string[]} [context.projectNames] - Projects referenced
 * @param {string} [context.skillName] - Active skill (slash command)
 * @param {string} [context.topic] - General topic of the conversation
 * @returns {string[]} Top 5 most relevant learnings as formatted strings
 */
function getRelevantLearnings(vaultPath, context = {}) {
  try {
    const entries = readAllLearnings(vaultPath);
    if (entries.length === 0) return [];

    const now = Date.now();
    const DAY_MS = 86400000;

    // Build a set of context terms for matching
    const contextTerms = new Set();
    if (context.personNames) context.personNames.forEach(n => contextTerms.add(n.toLowerCase()));
    if (context.projectNames) context.projectNames.forEach(n => contextTerms.add(n.toLowerCase()));
    if (context.skillName) contextTerms.add(context.skillName.toLowerCase());

    const topicWords = context.topic
      ? context.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      : [];

    // Type priority weights
    const typePriority = {
      preference: 1.2,
      mistake: 1.1,
      person_context: 1.0,
      skill_tip: 1.0,
      workflow: 0.9,
      pattern: 0.8,
    };

    // Score each entry
    const scored = entries.map(entry => {
      let score = 0;

      // Tag overlap score
      const entryTags = entry.tags.map(t => t.toLowerCase());
      for (const tag of entryTags) {
        if (contextTerms.has(tag)) score += 3;
      }

      // Topic word match in learning text
      if (topicWords.length > 0) {
        const text = `${entry.context} ${entry.learning}`.toLowerCase();
        for (const word of topicWords) {
          if (text.includes(word)) score += 1;
        }
      }

      // Skill match bonus
      if (context.skillName && entry.source === context.skillName) {
        score += 2;
      }

      // Type priority
      score *= (typePriority[entry.type] || 0.8);

      // Recency decay
      const ageDays = (now - new Date(entry.timestamp).getTime()) / DAY_MS;
      if (ageDays > 90) {
        score *= 0.3;
      } else if (ageDays > 30) {
        score *= 0.6;
      } else {
        score *= 1.0;
      }

      return { entry, score };
    });

    // Filter out zero-score entries, sort by score, take top 5
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => formatSingleLearning(s.entry));
  } catch {
    return [];
  }
}

/**
 * Analyze a conversation's messages to detect learnings.
 * Called at session end for auto-save.
 *
 * @param {object[]} messages - Conversation messages array
 * @returns {object[]} Array of learning objects ready to append
 */
function extractSessionLearnings(messages) {
  try {
    if (!messages || messages.length < 2) return [];

    const learnings = [];

    // Extract text content from messages
    const userMessages = messages
      .filter(m => m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content);

    const assistantMessages = messages
      .filter(m => m.role === 'assistant')
      .map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
        }
        return '';
      });

    // Detect corrections — user saying "no", "not that", "actually", "I meant"
    const correctionPatterns = [
      /\bno[,.]?\s+(not\s+)?that/i,
      /\bactually\s+I\s+(meant|want)/i,
      /\bthat'?s\s+not\s+(what|right|correct)/i,
      /\bI\s+(didn'?t|don'?t)\s+mean/i,
      /\bwrong\b.*\binstead\b/i,
      /\bno[,.]?\s+I\s+(want|need|prefer)/i,
    ];

    for (let i = 0; i < userMessages.length; i++) {
      const msg = userMessages[i];
      for (const pattern of correctionPatterns) {
        if (pattern.test(msg)) {
          learnings.push({
            type: 'mistake',
            tags: [],
            context: `User corrected the assistant: "${msg.slice(0, 200)}"`,
            learning: `Correction detected — review what was assumed vs. what user actually wanted.`,
            source: 'session-extraction',
          });
          break; // One learning per message
        }
      }
    }

    // Detect preference expressions
    const preferencePatterns = [
      /\bI\s+(prefer|like|want)\s+(.{10,80})/i,
      /\balways\s+(use|do|make|keep)\s+(.{10,80})/i,
      /\bnever\s+(use|do|make|show)\s+(.{10,80})/i,
      /\bdon'?t\s+(ever|always)\s+(.{10,80})/i,
      /\bfrom\s+now\s+on[,.]?\s+(.{10,80})/i,
      /\bremember\s+that\s+(.{10,80})/i,
    ];

    for (const msg of userMessages) {
      for (const pattern of preferencePatterns) {
        const match = msg.match(pattern);
        if (match) {
          const detail = match[0].slice(0, 150);
          learnings.push({
            type: 'preference',
            tags: [],
            context: `User expressed preference during conversation`,
            learning: detail,
            source: 'session-extraction',
          });
          break;
        }
      }
    }

    // Detect workflow discoveries — user teaching the assistant about their workflow
    const workflowPatterns = [
      /\bwhen\s+I\s+(do|run|use|start)\s+(.{10,100})/i,
      /\bmy\s+workflow\s+(is|involves|starts)\s+(.{10,100})/i,
      /\bI\s+usually\s+(do|run|start|check)\s+(.{10,80})/i,
      /\bthe\s+way\s+I\s+(.{10,80})/i,
    ];

    for (const msg of userMessages) {
      for (const pattern of workflowPatterns) {
        const match = msg.match(pattern);
        if (match) {
          learnings.push({
            type: 'workflow',
            tags: [],
            context: `User described their workflow`,
            learning: match[0].slice(0, 200),
            source: 'session-extraction',
          });
          break;
        }
      }
    }

    // Deduplicate by learning text
    const seen = new Set();
    return learnings.filter(l => {
      const key = l.learning.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

/**
 * Format an array of learnings into a concise system prompt section.
 *
 * @param {string[]} learnings - Formatted learning strings (from getRelevantLearnings)
 * @returns {string} Formatted prompt section, or empty string if no learnings
 */
function formatLearningsForPrompt(learnings) {
  if (!learnings || learnings.length === 0) return '';
  return `## Relevant Learnings\n${learnings.map(l => `- ${l}`).join('\n')}`;
}

// ── Internal Helpers ──────────────────────────────────────────────────────

function formatSingleLearning(entry) {
  const typeLabel = `[${entry.type}]`;
  const tagStr = entry.tags.length > 0 ? ` (${entry.tags.join(', ')})` : '';
  return `${typeLabel}${tagStr} ${entry.learning}`;
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  appendLearning,
  queryLearnings,
  getRelevantLearnings,
  extractSessionLearnings,
  formatLearningsForPrompt,
};
