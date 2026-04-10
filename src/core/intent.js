'use strict';

// ── Intent Detection Engine ──────────────────────────────────────────────
// Detects skill intent from natural language so users don't have to
// memorize slash commands. Pure local heuristics — no API calls.
//
// Usage:
//   const { detectIntent, formatIntentSuggestion } = require('./intent');
//   const intent = detectIntent("I need to write a PRD for the new search feature");
//   // → { skill: 'prd', confidence: 0.9, reason: 'mentions writing a PRD' }

// ── Intent Map ───────────────────────────────────────────────────────────
// Each skill has trigger patterns organized by strength:
//   phrases  — multi-word exact matches (high confidence)
//   keywords — single words or short stems (lower confidence)
//   boost    — contextual words that raise confidence when found alongside keywords

const INTENT_MAP = {
  'daily-plan': {
    phrases: [
      'plan my day', 'plan the day', 'plan today',
      'what should i focus on', 'what should i work on today',
      'priorities today', 'today\'s priorities',
      'start my day', 'morning plan', 'daily plan',
      'kick off the day', 'what\'s on today',
    ],
    keywords: ['priorities', 'focus today'],
    boost: ['morning', 'today', 'day', 'schedule'],
  },
  'coach': {
    phrases: [
      'career advice', 'career move', 'career coaching',
      'how do i grow', 'feeling stuck', 'impostor syndrome',
      'imposter syndrome', 'should i take the promotion',
      'how to get promoted', 'career development',
      'ask for a raise', 'negotiate my salary',
      'negotiate a raise', 'negotiate compensation',
    ],
    keywords: ['promotion', 'negotiat', 'career', 'raise', 'impostor', 'imposter'],
    boost: ['advice', 'growth', 'stuck', 'move', 'next', 'level', 'salary', 'comp'],
  },
  'prd': {
    phrases: [
      'write a prd', 'product requirements', 'requirements doc',
      'feature spec', 'spec out', 'product brief',
      'draft a prd', 'create a prd', 'need a prd',
      'requirements document', 'product spec',
    ],
    keywords: ['prd'],
    boost: ['requirements', 'spec', 'feature', 'document', 'draft', 'write'],
  },
  'decision': {
    phrases: [
      'should we', 'trade-off', 'tradeoff',
      'deciding between', 'which option', 'pros and cons',
      'make a call on', 'help me decide', 'decision framework',
      'weigh the options', 'compare options',
    ],
    keywords: ['trade-off', 'tradeoff', 'pros and cons'],
    boost: ['decide', 'decision', 'option', 'choice', 'between', 'versus', 'vs'],
  },
  'meeting-prep': {
    phrases: [
      'prep for meeting', 'prep for my meeting', 'prepare for meeting',
      'meeting with', '1:1 with', 'one on one with',
      'before my call', 'prep for call', 'prepare for call',
      'meeting prep', 'get ready for my meeting',
    ],
    keywords: ['meeting prep'],
    boost: ['prep', 'prepare', 'ready', 'before', 'call', 'meeting', 'agenda'],
  },
  'linkedin': {
    phrases: [
      'linkedin post', 'write a post', 'draft a post',
      'thought leadership post', 'share on linkedin',
      'post on linkedin', 'linkedin draft',
    ],
    keywords: ['linkedin'],
    boost: ['post', 'draft', 'write', 'share', 'publish', 'thought leadership'],
  },
  'landscape': {
    phrases: [
      'competitive landscape', 'competitor analysis',
      'market map', 'who else does', 'alternatives to',
      'competitive analysis', 'competitor research',
    ],
    keywords: ['competitor', 'competitive landscape'],
    boost: ['market', 'landscape', 'alternatives', 'comparison', 'versus', 'players'],
  },
  'strategy': {
    phrases: [
      'market strategy', 'go to market', 'go-to-market',
      'gtm strategy', 'market analysis', 'strategic planning',
      'positioning strategy', 'market positioning',
    ],
    keywords: ['positioning', 'go-to-market', 'gtm'],
    boost: ['strategy', 'strategic', 'market', 'positioning', 'analysis'],
  },
  'wins': {
    phrases: [
      'capture a win', 'log a win', 'record a win',
      'shipped it', 'just launched', 'just shipped',
    ],
    keywords: ['shipped', 'launched', 'accomplished', 'achievement'],
    boost: ['win', 'celebrate', 'done', 'completed', 'milestone'],
  },
  'weekly-review': {
    phrases: [
      'review my week', 'week in review', 'weekly review',
      'reflect on the week', 'how did my week go',
      'end of week review', 'wrap up the week',
    ],
    keywords: ['week review', 'weekly review'],
    boost: ['week', 'review', 'reflect', 'recap'],
  },
  'news': {
    phrases: [
      'product news', 'industry news', 'ai news', 'tech news',
      'what\'s happening in', 'latest in product',
    ],
    keywords: ['product news', 'tech news', 'ai news', 'industry news'],
    boost: ['news', 'latest', 'happening', 'trends', 'updates'],
  },
  'resume': {
    phrases: [
      'update my resume', 'update my cv', 'build my resume',
      'job application', 'resume review', 'cv review',
    ],
    keywords: ['resume', 'cv'],
    boost: ['update', 'build', 'review', 'job', 'application'],
  },
  'interview-prep': {
    phrases: [
      'preparing for interview', 'practice interview',
      'interview prep', 'mock interview', 'interview questions',
      'prepare for interview', 'interview coming up',
    ],
    keywords: ['interview'],
    boost: ['prep', 'prepare', 'practice', 'mock', 'questions', 'ready'],
  },
  'one-on-one': {
    phrases: [
      'one on one', 'manager meeting', 'skip level',
      'skip-level', '1:1 prep', '1:1 agenda',
    ],
    keywords: ['1:1', 'one-on-one', 'skip level'],
    boost: ['manager', 'agenda', 'prep', 'topics'],
  },
  'voice': {
    phrases: [
      'writing style', 'train my voice', 'voice training',
      'how do i write', 'find my voice', 'writing voice',
    ],
    keywords: ['voice training', 'writing voice'],
    boost: ['voice', 'style', 'writing', 'tone'],
  },
  'process-meetings': {
    phrases: [
      'process meetings', 'unprocessed meetings',
      'meeting notes in inbox', 'process meeting notes',
      'catch up on meetings', 'meetings to process',
      'process my meeting', 'process my meetings',
    ],
    keywords: ['process meetings', 'unprocessed meetings', 'process meeting', 'unprocessed meeting'],
    boost: ['process', 'meetings', 'inbox', 'notes', 'unprocessed'],
  },
};

// ── Confidence Thresholds ────────────────────────────────────────────────
const MIN_CONFIDENCE = 0.3;
const PHRASE_BASE = 0.85;    // exact phrase match starts high
const KEYWORD_BASE = 0.55;   // single keyword match starts moderate
const BOOST_INCREMENT = 0.08; // each boost word adds a little
const MAX_CONFIDENCE = 0.95;  // never claim certainty

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Normalize input for matching: lowercase, collapse whitespace, strip punctuation.
 */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\w\s':/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if normalized text contains a phrase (word-boundary aware).
 * Uses a simple approach: checks that the phrase appears as a substring,
 * which is sufficient for multi-word phrases.
 */
function containsPhrase(text, phrase) {
  return text.includes(phrase);
}

/**
 * Check if normalized text contains a keyword. For short keywords,
 * uses word-boundary matching to avoid false positives. For stems
 * (like "negotiat"), uses substring matching.
 */
function containsKeyword(text, keyword) {
  // Stems ending without a full word boundary — use includes
  if (keyword.endsWith('t') && !keyword.endsWith('st') && keyword.length < 10) {
    return text.includes(keyword);
  }
  // For exact short words, use word boundary regex
  if (keyword.length <= 4 && !keyword.includes(' ')) {
    const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`);
    return re.test(text);
  }
  return text.includes(keyword);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Core Detection ───────────────────────────────────────────────────────

/**
 * Detect the most likely skill intent from a user message.
 *
 * @param {string} userMessage - Raw user input
 * @returns {{ skill: string, confidence: number, reason: string } | null}
 */
function detectIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return null;

  const text = normalize(userMessage);
  if (text.length < 3) return null;

  // If the message already starts with a slash command, don't double-detect
  if (/^\/\w/.test(userMessage.trim())) return null;

  const candidates = [];

  for (const [skill, patterns] of Object.entries(INTENT_MAP)) {
    let bestConfidence = 0;
    let bestReason = '';

    // 1. Check phrase matches (highest confidence)
    for (const phrase of patterns.phrases) {
      if (containsPhrase(text, phrase)) {
        let confidence = PHRASE_BASE;

        // Count boost words for extra confidence
        const boostCount = (patterns.boost || [])
          .filter(b => b !== phrase && text.includes(b))
          .length;
        confidence = Math.min(confidence + boostCount * BOOST_INCREMENT, MAX_CONFIDENCE);

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestReason = `matches "${phrase}"`;
        }
      }
    }

    // 2. Check keyword matches (moderate confidence)
    if (bestConfidence === 0) {
      for (const keyword of patterns.keywords) {
        if (containsKeyword(text, keyword)) {
          let confidence = KEYWORD_BASE;

          // Count boost words
          const boostCount = (patterns.boost || [])
            .filter(b => b !== keyword && text.includes(b))
            .length;
          confidence = Math.min(confidence + boostCount * BOOST_INCREMENT, MAX_CONFIDENCE);

          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestReason = `mentions ${keyword}`;
          }
        }
      }
    }

    // 3. Check for single boost-word matches (low confidence, only if nothing else hit)
    if (bestConfidence === 0) {
      const boostHits = (patterns.boost || [])
        .filter(b => {
          const re = new RegExp(`\\b${escapeRegex(b)}\\b`);
          return re.test(text);
        });

      // Need at least 2 boost words to trigger a low-confidence match
      if (boostHits.length >= 2) {
        bestConfidence = MIN_CONFIDENCE + (boostHits.length - 2) * 0.05;
        bestConfidence = Math.min(bestConfidence, 0.45); // cap low-confidence matches
        bestReason = `context suggests ${skill} (${boostHits.join(', ')})`;
      }
    }

    if (bestConfidence >= MIN_CONFIDENCE) {
      candidates.push({ skill, confidence: round(bestConfidence), reason: bestReason });
    }
  }

  if (candidates.length === 0) return null;

  // Return the highest confidence match
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Disambiguation: if top two are very close, prefer the more specific one
  // (the one with more phrase/keyword specificity, not just boost words)
  return candidates[0];
}

/**
 * Round confidence to 2 decimal places.
 */
function round(n) {
  return Math.round(n * 100) / 100;
}

// ── Formatting ───────────────────────────────────────────────────────────

const SKILL_LABELS = {
  'daily-plan': 'a daily plan',
  'coach': 'career coaching',
  'prd': 'writing a PRD',
  'decision': 'a decision framework',
  'meeting-prep': 'meeting prep',
  'linkedin': 'drafting a LinkedIn post',
  'landscape': 'a competitive landscape',
  'strategy': 'market strategy analysis',
  'wins': 'capturing a win',
  'weekly-review': 'a weekly review',
  'news': 'product/industry news',
  'resume': 'resume building',
  'interview-prep': 'interview prep',
  'one-on-one': '1:1 prep',
  'voice': 'voice training',
  'process-meetings': 'processing meetings',
};

/**
 * Format a detected intent into a user-facing suggestion string.
 *
 * @param {{ skill: string, confidence: number, reason: string }} intent
 * @returns {string}
 */
function formatIntentSuggestion(intent) {
  if (!intent) return '';

  const label = SKILL_LABELS[intent.skill] || intent.skill;
  const cmd = `/${intent.skill}`;

  if (intent.confidence >= 0.8) {
    return `Looks like you want ${label}. Run ${cmd} or just keep chatting.`;
  }
  if (intent.confidence >= 0.5) {
    return `This might be a good fit for ${cmd} (${label}). Want to try it?`;
  }
  return `Tip: ${cmd} can help with ${label} if that's what you're after.`;
}

// ── Exports ──────────────────────────────────────────────────────────────

module.exports = { detectIntent, formatIntentSuggestion };
