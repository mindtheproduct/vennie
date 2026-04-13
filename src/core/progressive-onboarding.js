'use strict';

const fs = require('fs');
const path = require('path');

// ── Progressive Onboarding ───────────────────────────────────────────────
// Milestone-based feature discovery that drip-feeds capabilities when
// they're naturally relevant — teaching through "aha moments" instead
// of dumping all features at once.
//
// Storage: `.vennie/onboarding-milestones.json`
// Rules:
//   - At most 1 milestone per session
//   - Never repeat a shown milestone
//   - Only trigger when context naturally matches
//   - If user ignores or declines, mark as shown and move on

const MILESTONES_FILE = '.vennie/onboarding-milestones.json';

// ── Milestone Definitions ────────────────────────────────────────────────
// Each milestone has:
//   id          — unique key, tracked in milestones_shown
//   minConvo    — earliest conversation_count to trigger
//   maxConvo    — latest conversation_count (0 = no upper bound)
//   minDays     — minimum vault age in days (0 = any)
//   detect(ctx) — returns a match object or null
//   message(m)  — returns the hint string given the match

const MILESTONES = [
  {
    id: 'first_person',
    minConvo: 1,
    maxConvo: 3,
    minDays: 0,
    detect(ctx) {
      // Look for person name patterns: "meeting with <Name>", "<Name> said", etc.
      const personPatterns = [
        /(?:meeting|chat|call|sync|1[:\-]1|spoke|talked|met)\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:said|mentioned|asked|told|wants|needs|thinks|suggested)/,
        /(?:from|cc|@)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
      ];
      for (const pat of personPatterns) {
        const match = ctx.userMessage.match(pat);
        if (match && match[1] && match[1].length > 2) {
          return { name: match[1].trim() };
        }
      }
      return null;
    },
    message(m) {
      return `I can track people you work with — meetings, context, what they care about. Want me to create a page for ${m.name}?`;
    },
  },
  {
    id: 'first_decision',
    minConvo: 2,
    maxConvo: 5,
    minDays: 0,
    detect(ctx) {
      const decisionPatterns = [
        /(?:we\s+)?decided\s+(?:to|on|that)/i,
        /(?:going\s+(?:to\s+go\s+)?with|chose|picked|settled\s+on)/i,
        /(?:the\s+)?decision\s+(?:is|was)\s/i,
        /(?:let'?s\s+go\s+with|we(?:'re|\s+are)\s+going\s+(?:to|with))/i,
        /(?:trade-?off|weighed\s+(?:up|the))/i,
      ];
      for (const pat of decisionPatterns) {
        if (pat.test(ctx.userMessage) || pat.test(ctx.responseText)) {
          return {};
        }
      }
      return null;
    },
    message() {
      return "I can log decisions so future-you remembers why you chose this. Want me to save it?";
    },
  },
  {
    id: 'first_meeting',
    minConvo: 3,
    maxConvo: 7,
    minDays: 0,
    detect(ctx) {
      const meetingPatterns = [
        /(?:have|had|got|upcoming|next|before\s+(?:my|the))\s+(?:a\s+)?meeting/i,
        /(?:meeting|standup|stand-up|sync|retro|retrospective|planning)\s+(?:with|at|tomorrow|today|this)/i,
        /(?:1[:\-]1|one[- ]on[- ]one)\s+(?:with|tomorrow|today)/i,
        /prep(?:are)?\s+(?:for|me\s+for)\s+(?:my|the|a)\s+/i,
      ];
      for (const pat of meetingPatterns) {
        if (pat.test(ctx.userMessage)) {
          return {};
        }
      }
      return null;
    },
    message() {
      return "I can prep you for meetings — pull context on attendees, surface past discussions, suggest talking points. Try 'prep me for my next meeting'";
    },
  },
  {
    id: 'voice_training',
    minConvo: 5,
    maxConvo: 10,
    minDays: 0,
    detect(ctx) {
      // Time-based: trigger after enough conversations regardless of content
      // But boost if writing-related context appears
      const writingPatterns = [
        /(?:write|draft|post|article|blog|linkedin|email|message|comms)/i,
      ];
      // Always eligible in the window, but prefer writing context
      if (writingPatterns.some(p => p.test(ctx.userMessage) || p.test(ctx.responseText))) {
        return { hasWritingContext: true };
      }
      // Also trigger on pure conversation count (50% chance to avoid being pushy)
      if (ctx.conversationCount >= 7) {
        return {};
      }
      return null;
    },
    message() {
      return "I've seen enough of your writing to start learning your style. Want to train my voice on how you actually write? Say '/voice train'";
    },
  },
  {
    id: 'career_tracking',
    minConvo: 7,
    maxConvo: 15,
    minDays: 0,
    detect(ctx) {
      const winPatterns = [
        /(?:shipped|launched|released|completed|delivered|finished|closed|won|landed)/i,
        /(?:promoted|raise|review|performance|impact|achievement)/i,
        /(?:great\s+(?:job|work)|nailed\s+it|proud\s+of|big\s+win)/i,
      ];
      for (const pat of winPatterns) {
        if (pat.test(ctx.userMessage) || pat.test(ctx.responseText)) {
          return {};
        }
      }
      return null;
    },
    message() {
      return "Nice ship. I can track wins like this for your next review or promotion case. Want to set up career tracking?";
    },
  },
  {
    id: 'weekly_review',
    minConvo: 0,
    maxConvo: 0,
    minDays: 7,
    detect(ctx) {
      // Pure time-based — 7+ days of vault use
      if (ctx.vaultAgeDays >= 7) {
        return {};
      }
      return null;
    },
    message() {
      return "You've been using Vennie for a week. A 5-minute review can surface patterns you'd miss. Want to try '/weekly-review'?";
    },
  },
  {
    id: 'frameworks',
    minConvo: 10,
    maxConvo: 20,
    minDays: 0,
    detect(ctx) {
      const frameworkPatterns = [
        /(?:prioriti[sz]e|rank|score|compare|trade-?off|which\s+(?:one|should))/i,
        /(?:rice|ice|moscow|eisenhower|2x2|matrix|framework)/i,
        /(?:should\s+(?:we|I)\s+(?:do|build|focus|pick|choose))/i,
      ];
      for (const pat of frameworkPatterns) {
        if (pat.test(ctx.userMessage)) {
          return {};
        }
      }
      return null;
    },
    message() {
      return "I can walk you through frameworks like RICE or decision journals using your actual work — not abstract examples. Want to try?";
    },
  },
  {
    id: 'persona',
    minConvo: 15,
    maxConvo: 0,
    minDays: 0,
    detect() {
      // Pure conversation count gate — always eligible once past minConvo
      return {};
    },
    message() {
      return "I can adjust my coaching style. Some PMs want challenge, others want support. Try '/persona list' to explore.";
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function milestonesPath(vaultPath) {
  return path.join(vaultPath, MILESTONES_FILE);
}

function readMilestones(vaultPath) {
  const filePath = milestonesPath(vaultPath);
  if (!fs.existsSync(filePath)) {
    return {
      milestones_shown: [],
      conversation_count: 0,
      first_session: new Date().toISOString().slice(0, 10),
      features_discovered: [],
      last_milestone_session: 0,
    };
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      milestones_shown: [],
      conversation_count: 0,
      first_session: new Date().toISOString().slice(0, 10),
      features_discovered: [],
      last_milestone_session: 0,
    };
  }
}

function writeMilestones(vaultPath, data) {
  const dir = path.join(vaultPath, '.vennie');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(milestonesPath(vaultPath), JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Calculate vault age in days from first_session date.
 */
function vaultAgeDays(firstSession) {
  if (!firstSession) return 0;
  const start = new Date(firstSession);
  const now = new Date();
  return Math.max(0, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Check for a milestone to surface based on current conversation context.
 *
 * @param {string} vaultPath - Absolute path to the vault root
 * @param {{ userMessage: string, responseText: string }} conversationContext
 * @returns {{ id: string, message: string } | null} - At most 1 milestone, or null
 */
function checkMilestones(vaultPath, conversationContext) {
  const data = readMilestones(vaultPath);
  const shownSet = new Set(data.milestones_shown || []);
  const convoCount = data.conversation_count || 0;
  const ageDays = vaultAgeDays(data.first_session);

  // Don't show a milestone if we already showed one this session
  if (data.last_milestone_session === convoCount && convoCount > 0) {
    return null;
  }

  const ctx = {
    userMessage: conversationContext.userMessage || '',
    responseText: conversationContext.responseText || '',
    conversationCount: convoCount,
    vaultAgeDays: ageDays,
  };

  for (const milestone of MILESTONES) {
    // Already shown — skip
    if (shownSet.has(milestone.id)) continue;

    // Conversation count window check (0 = no bound)
    if (milestone.minConvo > 0 && convoCount < milestone.minConvo) continue;
    if (milestone.maxConvo > 0 && convoCount > milestone.maxConvo) continue;

    // Minimum vault age check
    if (milestone.minDays > 0 && ageDays < milestone.minDays) continue;

    // Context detection
    const match = milestone.detect(ctx);
    if (!match) continue;

    // Found a match — mark as shown and return it
    data.milestones_shown.push(milestone.id);
    data.last_milestone_session = convoCount;
    writeMilestones(vaultPath, data);

    return {
      id: milestone.id,
      message: milestone.message(match),
    };
  }

  return null;
}

/**
 * Increment the session/conversation count. Call on session start.
 *
 * @param {string} vaultPath - Absolute path to the vault root
 * @returns {number} The new conversation count
 */
function incrementSessionCount(vaultPath) {
  const data = readMilestones(vaultPath);
  data.conversation_count = (data.conversation_count || 0) + 1;
  if (!data.first_session) {
    data.first_session = new Date().toISOString().slice(0, 10);
  }
  writeMilestones(vaultPath, data);
  return data.conversation_count;
}

/**
 * Record that a feature/command has been discovered by the user.
 *
 * @param {string} vaultPath
 * @param {string} featureId - e.g. 'daily-plan', 'voice', 'persona'
 */
function markFeatureDiscovered(vaultPath, featureId) {
  const data = readMilestones(vaultPath);
  if (!data.features_discovered) data.features_discovered = [];
  if (!data.features_discovered.includes(featureId)) {
    data.features_discovered.push(featureId);
    writeMilestones(vaultPath, data);
  }
}

/**
 * Get current onboarding state (useful for debugging / status).
 *
 * @param {string} vaultPath
 * @returns {{ milestones_shown: string[], conversation_count: number, first_session: string, features_discovered: string[] }}
 */
function getOnboardingState(vaultPath) {
  return readMilestones(vaultPath);
}

module.exports = {
  checkMilestones,
  incrementSessionCount,
  markFeatureDiscovered,
  getOnboardingState,
  MILESTONES, // exported for testing
};
