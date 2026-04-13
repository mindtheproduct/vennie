'use strict';

// ── Red Team Module ────────────────────────────────────────────────────────
// Builds adversarial prompts and detects opportunities for red-team analysis.
// Pure logic — no API calls. Prompts are consumed by the existing agent loop.

// ── Strategy/Decision Patterns ─────────────────────────────────────────────

const STRATEGY_PATTERNS = [
  /\bwe decided\b/i, /\bthe plan is\b/i, /\bwe['']re going to\b/i,
  /\bthe strategy is\b/i, /\bwe['']ll\b/i, /\bgoing with\b/i,
  /\bour approach\b/i, /\bthe roadmap\b/i, /\bwe['']re betting on\b/i,
  /\bcommitting to\b/i, /\bfinal call\b/i,
];

const LAUNCH_PATTERNS = [
  /\blaunch(?:ing)?\b/i, /\bship(?:ping)?\b/i, /\bgo(?:ing)? live\b/i,
  /\broll(?:ing)? out\b/i, /\breleas(?:e|ing)\b/i, /\bgo-to-market\b/i,
  /\bGTM\b/, /\bGA\b/, /\bbeta release\b/i,
];

const COMMITMENT_PATTERNS = [
  /\bhir(?:e|ing)\b/i, /\bnew role\b/i, /\breorg\b/i,
  /\bpivot(?:ing)?\b/i, /\bshut(?:ting)? down\b/i, /\bsunsett?ing\b/i,
  /\bkill(?:ing)?\b/i, /\bdeprecating\b/i, /\bmajor investment\b/i,
  /\brais(?:e|ing) (?:a |the )?(?:round|funding|capital)\b/i,
  /\bpartnership with\b/i, /\bacquisition\b/i,
];

const PRIORITISATION_PATTERNS = [
  /\bprioritis(?:e|ing)\b/i, /\bprioritiz(?:e|ing)\b/i,
  /\btrade-?off\b/i, /\bcut(?:ting)?\b/i, /\bdeprioritis(?:e|ing)\b/i,
  /\bstack rank\b/i, /\bbetting on .+ over\b/i,
  /\bfocus(?:ing)? on\b/i, /\bdoubl(?:e|ing) down\b/i,
];

// ── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build a system prompt overlay for red team mode.
 *
 * @param {Array<{ role: string, content: string }>} conversationHistory - Recent messages (last 5-10 exchanges)
 * @param {string} [focus] - Optional focus area (e.g. "the pricing decision", "the launch timeline")
 * @returns {string} System prompt for adversarial analysis
 */
function buildRedTeamPrompt(conversationHistory, focus) {
  try {
    // Extract the last 10 exchanges max
    const recent = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-10)
      : [];

    const contextSummary = recent
      .filter(msg => msg && msg.content)
      .map(msg => `[${msg.role || 'unknown'}]: ${typeof msg.content === 'string' ? msg.content.slice(0, 500) : ''}`)
      .join('\n');

    const focusClause = focus
      ? `\n\nFOCUS AREA: The user specifically wants you to challenge "${focus}". Prioritise this above all other threads.`
      : '';

    return `You are now operating in RED TEAM mode. Your sole objective is adversarial analysis of the decisions and plans discussed in this conversation.

CONVERSATION CONTEXT (recent exchanges):
${contextSummary}
${focusClause}

ADVERSARIAL ANALYSIS INSTRUCTIONS:

1. IDENTIFY IMPLICIT ASSUMPTIONS
   - What is being taken for granted?
   - What market, timing, resource, and organisational assumptions underpin the plan?
   - Rate each: Safe, Risky, or Untested

2. APPLY INVERSION THINKING
   - "What would have to be true for this to fail?"
   - "It's 6 months from now and this failed. Write the post-mortem."
   - Consider the strongest version of every rejected alternative

3. CONSIDER MISSING STAKEHOLDERS
   - Who hasn't been consulted but should be?
   - Whose incentives are misaligned with this plan?
   - What does the customer/user who WON'T benefit think?

4. CHALLENGE TIMELINES AND RESOURCES
   - Timelines are typically 1.5-2x optimistic. Apply that lens.
   - What's competing for the same resources?
   - What happens if a key person is unavailable?

5. DETECT COGNITIVE BIASES
   - Survivorship bias: Are you only looking at cases where this worked?
   - Confirmation bias: Are ambiguous signals being read as supportive?
   - Sunk cost fallacy: Is momentum being confused with merit?
   - Anchoring: Is the first option getting undue weight?
   - Planning fallacy: Are estimates based on best-case scenarios?

6. SECOND-ORDER EFFECTS
   - If this succeeds, what new problems does it create?
   - What gets neglected while focus is here?
   - How does this change the competitive landscape?

TONE: Respectful but relentless. You are not trying to be right — you are trying to make the plan stronger. Be specific, not vague. Reference concrete details from the conversation.

OUTPUT: Follow the structured format from the /red-team skill — Assumptions, Failure Modes, Blind Spots, Strongest Counter-Argument, Revised Confidence.`;
  } catch (err) {
    // Fallback to a minimal prompt if something goes wrong
    return `You are in RED TEAM mode. Challenge every assumption, decision, and plan from the recent conversation. Be adversarial but respectful. Identify implicit assumptions, failure modes, blind spots, the strongest counter-argument, and give a revised confidence assessment.`;
  }
}

// ── Opportunity Detection ──────────────────────────────────────────────────

/**
 * Detect when a red team suggestion would be valuable.
 * Returns true when the response contains strategy decisions, launch plans,
 * major commitments, or prioritisation calls.
 *
 * @param {string} responseText - The AI's response text to scan
 * @returns {{ shouldSuggest: boolean, reason: string }}
 */
function detectRedTeamOpportunity(responseText) {
  try {
    if (!responseText || typeof responseText !== 'string') {
      return { shouldSuggest: false, reason: '' };
    }

    // Check for short responses — not worth nudging on
    if (responseText.length < 150) {
      return { shouldSuggest: false, reason: '' };
    }

    // Check each pattern group with priority
    const checks = [
      { patterns: COMMITMENT_PATTERNS, reason: 'major commitment detected' },
      { patterns: LAUNCH_PATTERNS, reason: 'launch or release plan detected' },
      { patterns: STRATEGY_PATTERNS, reason: 'strategic decision detected' },
      { patterns: PRIORITISATION_PATTERNS, reason: 'prioritisation call detected' },
    ];

    for (const { patterns, reason } of checks) {
      for (const pattern of patterns) {
        if (pattern.test(responseText)) {
          return { shouldSuggest: true, reason };
        }
      }
    }

    return { shouldSuggest: false, reason: '' };
  } catch {
    return { shouldSuggest: false, reason: '' };
  }
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { buildRedTeamPrompt, detectRedTeamOpportunity };
