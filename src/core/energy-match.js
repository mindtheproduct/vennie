'use strict';

// ── Energy / Intent Matching ────────────────────────────────────────────────
// Pure text analysis to detect user energy level and provide tone guidance.
// No file I/O, no external deps — runs on every message, must be fast.

// ── Pattern Definitions ─────────────────────────────────────────────────────

const CASUAL_WORDS = /\b(hey|hi|yo|sup|whats up|what's up|howdy|hiya|heya|lol|lmao|haha|heh|nah|yep|yea|yeah|nope|chill|vibes|tbh|imo|idk|btw)\b/i;
const STRESS_WORDS = /\b(urgent|asap|deadline|behind|overwhelmed|too much|can't keep up|drowning|swamped|stressed|panicking|emergency|fire|sos|help me|falling behind|impossible|nightmare|crunch)\b/i;
const EXCITED_WORDS = /\b(shipped|launched|got it|we won|amazing|crushed it|nailed it|incredible|awesome|fantastic|brilliant|lets go|woohoo|hell yeah|pumped|stoked|huge|massive|killed it)\b/i;
const REFLECTIVE_WORDS = /\b(i've been thinking|i wonder|what if|the real question is|i've realized|it occurs to me|looking back|in hindsight|philosophically|fundamentally|i keep coming back to|been reflecting|been mulling)\b/i;
const GREETING_ONLY = /^(hey|hi|hello|yo|sup|what's up|whats up|howdy|hiya|morning|afternoon|evening|good morning|good afternoon|good evening)[\s!.?]*$/i;

// ── Instructions ────────────────────────────────────────────────────────────

const INSTRUCTIONS = {
  casual: "Match their casual energy. Be warm, conversational, use contractions. Don't launch into productivity mode unless they ask. If it's evening/weekend, acknowledge they're off the clock.",
  focused: "Professional but warm. Be direct, skip pleasantries after the first exchange. Focus on substance.",
  stressed: "They're under pressure. Be calm, structured, and action-oriented. Don't add to the overwhelm with long responses. Prioritize ruthlessly. If they seem scattered, help them focus on the ONE most important thing.",
  excited: "Match their excitement! Celebrate with them — they earned it. Then gently transition to capturing the win. Don't kill the vibe with productivity stuff.",
  reflective: "They're in reflective mode. Match their depth. Ask follow-up questions that go deeper, not wider. Don't rush to solutions — sometimes thinking IS the work.",
  neutral: '',
};

// ── Core Detection ──────────────────────────────────────────────────────────

/**
 * Detect energy/intent from user message text.
 *
 * @param {string} userMessage - Raw user input
 * @param {object} [options]
 * @param {number} [options.timeOfDay] - Hour (0-23)
 * @param {number} [options.dayOfWeek] - Day (0=Sun, 6=Sat)
 * @param {number} [options.turnCount] - Messages so far
 * @returns {{ energy: string, instruction: string, confidence: number }}
 */
function detectEnergy(userMessage, options = {}) {
  const msg = (userMessage || '').trim();
  if (!msg) return { energy: 'neutral', instruction: '', confidence: 0.3 };

  const { timeOfDay, dayOfWeek, turnCount } = options;
  const isEvening = typeof timeOfDay === 'number' && timeOfDay >= 19;
  const isNight = typeof timeOfDay === 'number' && timeOfDay >= 23;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const wordCount = msg.split(/\s+/).length;
  const isShort = wordCount <= 6;
  const isLong = wordCount > 100;
  const isLowercase = msg === msg.toLowerCase();
  const noPunctuation = !/[.!?;:]/.test(msg);
  const exclamationCount = (msg.match(/!/g) || []).length;
  const questionCount = (msg.match(/\?/g) || []).length;
  const hasAllCapsWord = /\b[A-Z]{2,}\b/.test(msg) && !/\b(API|CEO|CTO|PM|VP|OKR|Q[1-4]|AI|MCP|MTP|ASAP|SOS|PR|QA)\b/.test(msg);

  // Score each energy type
  const scores = { casual: 0, focused: 0, stressed: 0, excited: 0, reflective: 0 };

  // ── Casual signals ──
  if (CASUAL_WORDS.test(msg)) scores.casual += 0.3;
  if (GREETING_ONLY.test(msg)) scores.casual += 0.4;
  if (isLowercase && isShort) scores.casual += 0.2;
  if (noPunctuation && isShort) scores.casual += 0.15;
  if (isEvening) scores.casual += 0.15;
  if (isWeekend) scores.casual += 0.15;
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(msg)) scores.casual += 0.15;

  // ── Focused signals ──
  if (wordCount >= 8 && wordCount <= 80) scores.focused += 0.15;
  if (/\b(prepare|review|create|build|update|analyze|draft|plan|schedule|set up|check|look at|pull up)\b/i.test(msg)) scores.focused += 0.3;
  if (/\b(meeting|project|task|sprint|quarter|roadmap|stakeholder|deliverable|milestone|deadline|report|presentation|board)\b/i.test(msg)) scores.focused += 0.25;
  if (typeof timeOfDay === 'number' && timeOfDay >= 9 && timeOfDay <= 17 && dayOfWeek >= 1 && dayOfWeek <= 5) scores.focused += 0.1;

  // ── Stressed signals ──
  if (STRESS_WORDS.test(msg)) scores.stressed += 0.4;
  if (isShort && questionCount >= 2) scores.stressed += 0.2;
  if (/^help\b/i.test(msg) && wordCount <= 4) scores.stressed += 0.25;
  if (exclamationCount >= 1 && STRESS_WORDS.test(msg)) scores.stressed += 0.15;

  // ── Excited signals ──
  if (EXCITED_WORDS.test(msg)) scores.excited += 0.4;
  if (exclamationCount >= 2) scores.excited += 0.25;
  if (hasAllCapsWord && exclamationCount >= 1) scores.excited += 0.2;
  if (exclamationCount >= 1 && EXCITED_WORDS.test(msg)) scores.excited += 0.15;

  // ── Reflective signals ──
  if (REFLECTIVE_WORDS.test(msg)) scores.reflective += 0.35;
  if (isLong) scores.reflective += 0.2;
  if (isLong && questionCount <= 1) scores.reflective += 0.15;

  // Pick the highest-scoring energy
  let bestEnergy = 'neutral';
  let bestScore = 0;
  for (const [energy, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestEnergy = energy;
    }
  }

  // Threshold: need a minimum score to beat neutral
  if (bestScore < 0.3) {
    return { energy: 'neutral', instruction: '', confidence: 0.3 };
  }

  // Map score to confidence (capped at 0.95)
  const confidence = Math.min(0.95, Math.round((0.4 + bestScore) * 100) / 100);

  return {
    energy: bestEnergy,
    instruction: INSTRUCTIONS[bestEnergy],
    confidence,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get instruction string for an energy level.
 * @param {string} energy
 * @returns {string}
 */
function getEnergyInstruction(energy) {
  return INSTRUCTIONS[energy] || '';
}

/**
 * Detect time-of-day context for prompt enrichment.
 * @returns {{ timeOfDay: string, dayType: string, hint: string }}
 */
function detectTimeContext() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  let timeOfDay;
  if (hour < 6) timeOfDay = 'night';
  else if (hour < 12) timeOfDay = 'morning';
  else if (hour < 17) timeOfDay = 'afternoon';
  else timeOfDay = 'evening';

  const dayType = isWeekend ? 'weekend' : 'weekday';
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

  let hint = '';
  if (hour >= 23 || hour < 5) {
    hint = "Late night — keep it brief, they should probably sleep.";
  } else if (day === 5 && hour >= 17) {
    hint = "Friday evening — they're probably winding down.";
  } else if (day === 1 && hour < 12) {
    hint = "Monday morning — they might need a plan to start the week.";
  } else if (isWeekend) {
    hint = `${dayName} — they're off the clock, keep it light unless they bring work up.`;
  } else if (hour < 9) {
    hint = "Early morning — they're getting going, match that ramp-up energy.";
  }

  return { timeOfDay, dayType, hint };
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = { detectEnergy, getEnergyInstruction, detectTimeContext };
