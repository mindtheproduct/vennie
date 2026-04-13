'use strict';

// ── Conversation Tracker ─────────────────────────────────────────────────
// Lightweight in-memory session state. Tracks topics, people mentioned,
// decisions detected, and circular-conversation detection. No persistence
// — lives only for the current CLI session.

/**
 * Extract capitalized multi-word names from text.
 * Returns an array of unique name strings (e.g. "Sarah Chen").
 */
function extractNames(text) {
  if (!text) return [];
  // Match sequences of 2-3 capitalized words (first + last, optionally middle)
  const nameRe = /\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2})\b/g;
  const names = new Set();
  let match;
  while ((match = nameRe.exec(text)) !== null) {
    const candidate = match[1];
    // Filter out common false positives
    if (!COMMON_PHRASES.has(candidate)) {
      names.add(candidate);
    }
  }
  return [...names];
}

// Capitalized phrases that aren't people
const COMMON_PHRASES = new Set([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'New York', 'San Francisco', 'Los Angeles', 'United States', 'United Kingdom',
  'North America', 'South America', 'Product Manager', 'Vice President',
  'General Manager', 'Chief Executive', 'Chief Technology', 'Chief Product',
  'Human Resources', 'Customer Success', 'Open Source', 'Machine Learning',
  'Deep Learning', 'Action Items', 'Next Steps', 'Key Points',
  'Happy Monday', 'Good Morning', 'Good Afternoon', 'Good Evening',
  'Thank You', 'Well Done', 'Great Job', 'Google Docs', 'Google Sheets',
  'Pull Request', 'Code Review', 'Data Science', 'Project Manager',
]);

/**
 * Extract simple keyword tokens from text for topic tracking.
 */
function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'were', 'will', 'would',
  'could', 'should', 'about', 'their', 'there', 'which', 'what', 'when',
  'where', 'than', 'them', 'then', 'these', 'those', 'some', 'other',
  'into', 'more', 'also', 'just', 'like', 'does', 'very', 'your', 'here',
  'they', 'each', 'make', 'made', 'well', 'back', 'only', 'come', 'over',
  'such', 'take', 'long', 'much', 'good', 'know', 'want', 'give', 'most',
  'find', 'still', 'between', 'after', 'before', 'think', 'because',
]);

// Decision-language patterns
const DECISION_PATTERNS = [
  /\bdecided to\b/i, /\bgoing with\b/i, /\bchose\b/i,
  /\bthe plan is\b/i, /\bwe agreed\b/i, /\bwe.?ll go with\b/i,
  /\bdecision is\b/i, /\bfinal call\b/i,
];

/**
 * Create a new conversation tracker instance.
 * @returns {object} Tracker with addTurn, getTopicHistory, isCircular, etc.
 */
function createConversationTracker() {
  const turns = [];           // { userMessage, responseText, keywords, names, timestamp }
  const allPersons = new Map(); // name → count of mentions
  const allDecisions = [];      // { text, turn }
  const keywordHistory = [];    // array of keyword sets per turn (last 6)

  return {
    /**
     * Record a conversation turn.
     * @param {string} userMessage
     * @param {string} responseText
     */
    addTurn(userMessage, responseText) {
      const combined = `${userMessage || ''} ${responseText || ''}`;
      const names = extractNames(combined);
      const keywords = extractKeywords(combined);
      const timestamp = Date.now();

      turns.push({ userMessage, responseText, keywords, names, timestamp });

      // Track persons
      for (const name of names) {
        allPersons.set(name, (allPersons.get(name) || 0) + 1);
      }

      // Detect decisions in the combined text
      for (const pattern of DECISION_PATTERNS) {
        if (pattern.test(combined)) {
          // Extract the sentence containing the decision
          const sentences = combined.split(/[.!?\n]+/);
          for (const sentence of sentences) {
            if (pattern.test(sentence) && sentence.trim().length > 10) {
              allDecisions.push({ text: sentence.trim(), turn: turns.length });
              break; // one decision per pattern per turn
            }
          }
        }
      }

      // Track keywords for circularity detection (rolling window of 6)
      keywordHistory.push(new Set(keywords));
      if (keywordHistory.length > 6) keywordHistory.shift();
    },

    /**
     * Get recent topic keywords across the conversation.
     * @returns {string[]} Top keywords by frequency
     */
    getTopicHistory() {
      const freq = {};
      for (const turn of turns) {
        for (const kw of turn.keywords) {
          freq[kw] = (freq[kw] || 0) + 1;
        }
      }
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw]) => kw);
    },

    /**
     * Detect if the user is going in circles — same keywords
     * appearing across 3+ of the last 5 turns.
     * @returns {boolean}
     */
    isCircular() {
      // Need at least 6 turns before flagging circular — early conversations naturally repeat topic words
      if (keywordHistory.length < 6) return false;

      // Count how many keywords appear in 4+ of the last 6 turns
      const recent = keywordHistory.slice(-6);
      const allKw = new Set();
      for (const s of recent) for (const kw of s) allKw.add(kw);

      let repeated = 0;
      for (const kw of allKw) {
        const count = recent.filter(s => s.has(kw)).length;
        if (count >= 4) repeated++;
      }

      // If 5+ keywords appear in 4+ turns, likely genuinely circular (not just on-topic)
      return repeated >= 5;
    },

    /**
     * Get all persons mentioned across the conversation.
     * @returns {Map<string, number>} name → mention count
     */
    getPersonsMentioned() {
      return new Map(allPersons);
    },

    /**
     * Get decisions detected during the conversation.
     * @returns {{ text: string, turn: number }[]}
     */
    getDecisionsMade() {
      return [...allDecisions];
    },

    /**
     * Get the number of conversation turns.
     * @returns {number}
     */
    getTurnCount() {
      return turns.length;
    },

    /**
     * Get the user message from the last turn (for proactive detection context).
     * @returns {string|null}
     */
    getLastUserMessage() {
      if (turns.length === 0) return null;
      return turns[turns.length - 1].userMessage;
    },
  };
}

module.exports = { createConversationTracker };
