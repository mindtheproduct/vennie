'use strict';

// ── Conversation Phase Detection ──────────────────────────────────────────
// Tracks conversation phase to adjust nudge/suggestion behavior.
// Pure in-memory state — no file I/O, no persistence.

const PHASES = {
  quick: 'quick',
  opening: 'opening',
  working: 'working',
  deep: 'deep',
  winding_down: 'winding_down',
};

const PHASE_INSTRUCTIONS = {
  quick: 'Quick question — give a concise answer without starting a whole session.',
  deep: 'The user is deeply engaged. Be substantive, skip pleasantries, match their depth.',
  winding_down: 'This session is winding down. Offer a brief summary of what was discussed and suggest concrete next steps.',
};

/** Determine the current conversation phase from session metrics. */
function detectPhase({ turnCount, lastInputLength, avgInputLength, activeSkill, timeSinceStart }) {
  // Quick — turn 1, short question-like input (<15 words)
  if (turnCount === 1 && lastInputLength > 0 && lastInputLength / 5.5 < 15) {
    return { phase: PHASES.quick, shouldNudge: false, shouldSuggestWrapUp: false, instruction: PHASE_INSTRUCTIONS.quick };
  }

  // Winding down — long sessions or shrinking inputs
  const inputsShrinking = avgInputLength > 0 && lastInputLength < avgInputLength * 0.5 && turnCount > 5;
  if (turnCount > 15 || (timeSinceStart > 1800000 && turnCount > 5) || (inputsShrinking && turnCount > 8)) {
    return { phase: PHASES.winding_down, shouldNudge: true, shouldSuggestWrapUp: true, instruction: PHASE_INSTRUCTIONS.winding_down };
  }

  // Deep — extended sessions, active skill, or substantial inputs
  if (turnCount >= 8 || activeSkill || avgInputLength > 100) {
    return { phase: PHASES.deep, shouldNudge: false, shouldSuggestWrapUp: false, instruction: PHASE_INSTRUCTIONS.deep };
  }

  // Working — mid-conversation engagement (turns 3-7)
  if (turnCount >= 3) {
    return { phase: PHASES.working, shouldNudge: false, shouldSuggestWrapUp: false };
  }

  // Opening — first couple of turns
  return { phase: PHASES.opening, shouldNudge: true, shouldSuggestWrapUp: false };
}

/** Should a nudge with the given priority be shown in the current phase? */
function shouldShowNudge(phase, triggerPriority) {
  switch (phase) {
    case PHASES.opening: return true;
    case PHASES.working: return triggerPriority <= 2;
    case PHASES.deep: return false;
    case PHASES.winding_down: return triggerPriority <= 2;
    case PHASES.quick: return false;
    default: return true;
  }
}

/** Get a system prompt instruction for the current phase (or empty string). */
function getPhaseInstruction(phase) {
  return PHASE_INSTRUCTIONS[phase] || '';
}

/** Create a stateful phase tracker for a session. */
function createPhaseTracker() {
  let turnCount = 0;
  let totalInputLength = 0;
  let lastInputLength = 0;
  let lastResponseLength = 0;
  let startTime = null;
  let activeSkill = null;

  return {
    /** Record a turn — pass inputLength for user input, responseLength for AI response. */
    recordTurn(inputLength, responseLength) {
      if (!startTime) startTime = Date.now();
      if (inputLength != null) {
        turnCount++;
        lastInputLength = inputLength;
        totalInputLength += inputLength;
      }
      if (responseLength != null) {
        lastResponseLength = responseLength;
      }
    },

    setActiveSkill(skill) { activeSkill = skill || null; },

    getPhase() {
      if (turnCount === 0) return { phase: PHASES.opening, shouldNudge: true, shouldSuggestWrapUp: false };
      return detectPhase({
        turnCount, lastInputLength,
        avgInputLength: totalInputLength / turnCount,
        activeSkill,
        timeSinceStart: startTime ? Date.now() - startTime : 0,
        lastResponseLength,
      });
    },

    getTurnCount() { return turnCount; },
    getAvgInputLength() { return turnCount > 0 ? totalInputLength / turnCount : 0; },
    getSessionDuration() { return startTime ? Date.now() - startTime : 0; },
  };
}

module.exports = { detectPhase, shouldShowNudge, getPhaseInstruction, createPhaseTracker };
