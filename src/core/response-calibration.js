'use strict';

// ── Response Length Calibration ─────────────────────────────────────────────
// Detects the appropriate response depth from user input and returns
// a system-prompt instruction that nudges the model toward the right length.
// Pure logic — no I/O, no external deps.

const BRIEF_INSTRUCTION = 'Keep your response concise — 1-3 sentences. No preamble, no bullet lists unless asked.';
const MEDIUM_INSTRUCTION = 'Respond in 1-2 focused paragraphs. Be direct, skip filler.';

// Patterns that signal the user wants depth
const DEPTH_PATTERNS = /\b(walk me through|explain|break down|analy[sz]e|deep dive|elaborate|tell me about|how should I think about|what('?s| is) (the|your) (strategy|approach|plan)|pros and cons)\b/i;

// Yes/no question starters
const YES_NO_PATTERN = /^(is |are |do |does |did |can |could |should |would |will |has |have |was |were )\b/i;

// Quick retrieval patterns
const QUICK_LOOKUP = /^(what('?s| is| are) my |show me |how many |list my |when('?s| is) )\b/i;

// Short affirmations / follow-ups
const AFFIRMATION = /^\s*(yes|yeah|yep|yup|no|nah|nope|ok|okay|sure|sounds good|do it|go ahead|perfect|thanks|got it|cool|right|exactly|agreed|correct|makes sense)\s*[.!?]?\s*$/i;

/**
 * Detect if this message is a follow-up in an ongoing conversation.
 * @param {string} userMessage
 * @param {object[]} [recentMessages] - Recent conversation messages
 * @returns {boolean}
 */
function detectFollowUp(userMessage, recentMessages) {
  if (!recentMessages || recentMessages.length < 3) return false;

  const msg = userMessage.trim().toLowerCase();
  const wordCount = msg.split(/\s+/).length;

  // Short replies in an active conversation are almost always follow-ups
  if (wordCount <= 6) return true;

  // References to prior context
  if (/\b(that|it|the one|this one|those|these|what you said|you mentioned|earlier|above)\b/i.test(msg)) {
    return true;
  }

  return false;
}

/**
 * Determine the ideal response calibration for a user message.
 * @param {string} userMessage
 * @param {object} [options]
 * @param {string|null} [options.activeSkill] - Currently active skill name
 * @param {number} [options.conversationLength] - Number of messages so far
 * @param {boolean} [options.isFollowUp] - Pre-computed follow-up flag
 * @returns {{ length: 'brief'|'medium'|'thorough', instruction: string, maxTokenHint: number }}
 */
function calibrateResponse(userMessage, options = {}) {
  const msg = userMessage.trim();
  const wordCount = msg.split(/\s+/).filter(Boolean).length;
  const isQuestion = msg.endsWith('?');
  const { activeSkill, conversationLength = 0, isFollowUp = false } = options;

  // ── Thorough: skills are always thorough ──
  if (activeSkill) {
    return { length: 'thorough', instruction: '', maxTokenHint: 800 };
  }

  // ── Thorough: explicit depth requests ──
  if (DEPTH_PATTERNS.test(msg)) {
    return { length: 'thorough', instruction: '', maxTokenHint: 800 };
  }

  // ── Thorough: long input (user put effort in) ──
  if (wordCount > 80) {
    return { length: 'thorough', instruction: '', maxTokenHint: 800 };
  }

  // ── Brief: affirmations and short confirmations ──
  if (AFFIRMATION.test(msg)) {
    return { length: 'brief', instruction: BRIEF_INSTRUCTION, maxTokenHint: 100 };
  }

  // ── Brief: short questions ──
  if (wordCount < 15 && isQuestion) {
    // Yes/no questions
    if (YES_NO_PATTERN.test(msg)) {
      return { length: 'brief', instruction: BRIEF_INSTRUCTION, maxTokenHint: 100 };
    }
    // Quick lookups
    if (QUICK_LOOKUP.test(msg)) {
      return { length: 'brief', instruction: BRIEF_INSTRUCTION, maxTokenHint: 100 };
    }
    // Any other short question
    return { length: 'brief', instruction: BRIEF_INSTRUCTION, maxTokenHint: 100 };
  }

  // ── Brief: short non-question input (<15 words) ──
  if (wordCount < 15) {
    return { length: 'brief', instruction: BRIEF_INSTRUCTION, maxTokenHint: 100 };
  }

  // ── Brief: follow-ups deep in conversation ──
  if (isFollowUp && conversationLength >= 7 && wordCount < 25) {
    return { length: 'brief', instruction: BRIEF_INSTRUCTION, maxTokenHint: 100 };
  }

  // ── Medium: everything else (15-80 words) ──
  return { length: 'medium', instruction: MEDIUM_INSTRUCTION, maxTokenHint: 300 };
}

/**
 * Simplified wrapper — returns just the instruction string.
 * @param {string} userMessage
 * @param {object} [options] - Same as calibrateResponse
 * @returns {string} Instruction to inject, or empty string for thorough
 */
function getResponseCalibration(userMessage, options) {
  return calibrateResponse(userMessage, options).instruction;
}

module.exports = { calibrateResponse, detectFollowUp, getResponseCalibration };
