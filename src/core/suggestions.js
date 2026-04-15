'use strict';

const fs = require('fs');
const path = require('path');
const { getTriggerWeights } = require('./feedback-signals');

// ── Suggestion Engine ─────────────────────────────────────────────────────
// Powers contextual suggestions throughout Vennie:
//   1. Smart welcome suggestions based on vault state
//   2. Post-response next actions based on what just happened
//   3. Idle prompt hints for discovery
//   4. Skill chaining (what to do after a skill completes)
//   5. Onboarding breadcrumbs for unused features

// ── Skill Chain Map ───────────────────────────────────────────────────────
// After skill X completes, suggest skill Y

const SKILL_CHAINS = {
  'daily-plan': [
    { cmd: '/meeting-prep', reason: 'prep for your next meeting' },
    { cmd: '/news', reason: 'catch up on product/AI news' },
  ],
  'weekly-review': [
    { cmd: '/week-plan', reason: 'plan next week while it\'s fresh' },
    { cmd: '/wins', reason: 'capture this week\'s wins' },
  ],
  'week-plan': [
    { cmd: '/daily-plan', reason: 'start today\'s plan' },
  ],
  'process-meetings': [
    { cmd: '/daily-plan', reason: 'fold meeting actions into your plan' },
  ],
  'prd': [
    { cmd: '/strategy', reason: 'validate with a competitive lens' },
    { cmd: '/prioritise', reason: 'score and rank features' },
  ],
  'strategy': [
    { cmd: '/prd', reason: 'write the PRD' },
    { cmd: '/decision', reason: 'log the strategic call' },
  ],
  'landscape': [
    { cmd: '/prd', reason: 'write a PRD based on this' },
    { cmd: '/decision', reason: 'log a strategic call' },
    { cmd: '/strategy', reason: 'go deeper on positioning' },
  ],
  'linkedin': [
    { cmd: '/voice train', reason: 'improve voice calibration from this draft' },
  ],
  'coach': [
    { cmd: '/wins', reason: 'capture wins you mentioned' },
    { cmd: '/1on1', reason: 'prep for your next manager check-in' },
  ],
  '1on1': [
    { cmd: '/coach', reason: 'debrief and plan career moves' },
  ],
  'news': [
    { cmd: '/linkedin', reason: 'draft a take on something you read' },
    { cmd: '/strategy', reason: 'pressure-test your positioning' },
  ],
  'interview-prep': [
    { cmd: '/resume', reason: 'update your resume with STAR stories' },
    { cmd: '/brag', reason: 'generate an accomplishments summary' },
  ],
};

// ── Topic → Suggestion Map ────────────────────────────────────────────────
// Keywords in the response that trigger contextual suggestions

const TOPIC_SUGGESTIONS = [
  {
    keywords: ['competitor', 'competition', 'market', 'positioning', 'landscape'],
    suggestions: [
      { cmd: '/landscape', label: 'map the competitive landscape' },
      { cmd: '/strategy', label: 'run a strategic analysis' },
    ],
  },
  {
    keywords: ['prd', 'requirements', 'spec', 'feature', 'build'],
    suggestions: [
      { cmd: '/prd', label: 'write a PRD' },
      { cmd: '/prioritise', label: 'prioritise features' },
    ],
  },
  {
    keywords: ['career', 'promotion', 'review', 'growth', 'level'],
    suggestions: [
      { cmd: '/coach', label: 'career coaching session' },
      { cmd: '/review-prep', label: 'prep for performance review' },
    ],
  },
  {
    keywords: ['meeting', '1:1', 'one-on-one', 'manager', 'check-in'],
    suggestions: [
      { cmd: '/1on1', label: 'prep for your 1:1' },
      { cmd: '/meeting-prep', label: 'prep for the meeting' },
    ],
  },
  {
    keywords: ['linkedin', 'post', 'content', 'writing', 'article', 'blog'],
    suggestions: [
      { cmd: '/linkedin', label: 'draft a LinkedIn post' },
      { cmd: '/write', label: 'write long-form content' },
    ],
  },
  {
    keywords: ['decision', 'trade-off', 'choose', 'bet', 'direction'],
    suggestions: [
      { cmd: '/decision', label: 'log this decision with context' },
    ],
  },
  {
    keywords: ['talk', 'conference', 'speaking', 'presentation', 'cfp'],
    suggestions: [
      { cmd: '/talk', label: 'develop a conference talk' },
    ],
  },
  {
    keywords: ['experiment', 'test', 'hypothesis', 'a/b', 'validate'],
    suggestions: [
      { cmd: '/discovery', label: 'plan a discovery sprint' },
    ],
  },
];

// ── Idle Hints ────────────────────────────────────────────────────────────
// Rotating hints shown when the user hasn't typed anything

const IDLE_HINTS = [
  { text: '/daily-plan to plan your day', weight: 10 },
  { text: '/coach for career sparring', weight: 8 },
  { text: '/linkedin to draft a post in your voice', weight: 7 },
  { text: '/prd to write a product requirements doc', weight: 8 },
  { text: '/landscape for competitive intelligence', weight: 6 },
  { text: '/persona list to spar with different PM archetypes', weight: 7 },
  { text: '/news for today\'s product/AI signal', weight: 6 },
  { text: '/strategy for market analysis', weight: 5 },
  { text: '/1on1 to prep for your next manager check-in', weight: 6 },
  { text: '/voice train to teach me your writing style', weight: 5 },
  { text: '/model to switch between Sonnet, Opus, and Haiku', weight: 3 },
  { text: 'just type what\'s on your mind', weight: 10 },
  { text: 'paste meeting notes and I\'ll extract actions', weight: 7 },
  { text: 'ask me to challenge an idea you\'re working on', weight: 6 },
  { text: '/help to see all available skills', weight: 4 },
];

// ── Feature Tracking (Onboarding Breadcrumbs) ─────────────────────────────

const FEATURE_TIPS = [
  { id: 'voice', cmd: '/voice train', tip: 'Teach me your writing style — I\'ll match it in every draft', requires: [] },
  { id: 'persona', cmd: '/persona list', tip: 'Spar with different PM archetypes (Growth PM, Enterprise PM, etc.)', requires: [] },
  { id: 'daily-plan', cmd: '/daily-plan', tip: 'Start your day with a plan — I\'ll check your calendar and priorities', requires: [] },
  { id: 'coach', cmd: '/coach', tip: 'Career coaching — weekly check-ins, promotion prep, decision sparring', requires: [] },
  { id: 'linkedin', cmd: '/linkedin', tip: 'Draft LinkedIn posts in your trained voice', requires: ['voice'] },
  { id: 'landscape', cmd: '/landscape', tip: 'Map competitors with real-time scraping and analysis', requires: [] },
  { id: 'prd', cmd: '/prd', tip: 'Write PRDs through conversation, not template filling', requires: [] },
  { id: 'news', cmd: '/news', tip: 'Get today\'s product/AI news filtered to what matters for you', requires: [] },
  { id: 'model', cmd: '/model', tip: 'Switch models mid-session — Opus for hard problems, Haiku for quick ones', requires: [] },
];

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Generate smart welcome suggestions based on vault state.
 * @param {string} vaultPath
 * @returns {{ suggestions: { cmd: string, reason: string }[], greeting: string }}
 */
function getWelcomeSuggestions(vaultPath) {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toISOString().split('T')[0];
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Read user name from profile
  let userName = '';
  try {
    const profilePath = path.join(vaultPath, 'System', 'user-profile.yaml');
    if (fs.existsSync(profilePath)) {
      const profile = fs.readFileSync(profilePath, 'utf8');
      const nameMatch = profile.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      if (nameMatch) userName = nameMatch[1].split(' ')[0]; // First name only
    }
  } catch {}

  // Personalised time-based greeting
  const name = userName || '';
  let greeting;
  if (hour < 12) greeting = name ? `Good morning, ${name}` : 'Good morning';
  else if (hour < 17) greeting = name ? `Good afternoon, ${name}` : 'Good afternoon';
  else greeting = name ? `Good evening, ${name}` : 'Good evening';

  const suggestions = [];

  // Check if daily plan exists for today
  const dailyPlanPaths = [
    path.join(vaultPath, '02-Week_Priorities', `${today}.md`),
    path.join(vaultPath, '00-Inbox', `Daily_Plan_${today}.md`),
  ];
  const hasDailyPlan = dailyPlanPaths.some(p => fs.existsSync(p));
  if (!hasDailyPlan) {
    if (hour < 12) {
      suggestions.push({ cmd: '/daily-plan', reason: 'Plan your day before it plans you' });
    } else {
      suggestions.push({ cmd: '/daily-plan', reason: 'It\'s not too late to set intentions' });
    }
  }

  // Count unprocessed meetings
  const meetingsDir = path.join(vaultPath, '00-Inbox', 'Meetings');
  let unprocessedCount = 0;
  if (fs.existsSync(meetingsDir)) {
    try {
      const files = fs.readdirSync(meetingsDir).filter(f => f.endsWith('.md'));
      unprocessedCount = files.length;
    } catch {}
  }
  if (unprocessedCount > 0) {
    suggestions.push({
      cmd: '/process-meetings',
      reason: `${unprocessedCount} meeting${unprocessedCount > 1 ? 's' : ''} to extract insights from`,
    });
  }

  // Day-specific suggestions
  if (dayName === 'Monday') {
    suggestions.push({ cmd: '/week-plan', reason: 'Set the tone for the week' });
  } else if (dayName === 'Friday') {
    suggestions.push({ cmd: '/weekly-review', reason: 'Capture wins before the weekend' });
  }

  // Check for open tasks
  const tasksPath = path.join(vaultPath, '03-Tasks', 'Tasks.md');
  let openTasks = 0;
  if (fs.existsSync(tasksPath) && suggestions.length < 4) {
    try {
      const content = fs.readFileSync(tasksPath, 'utf8');
      openTasks = (content.match(/^- \[ \]/gm) || []).length;
      if (openTasks > 0) {
        suggestions.push({ cmd: 'What should I focus on right now?', reason: `${openTasks} open task${openTasks > 1 ? 's' : ''} — let\'s prioritise` });
      }
    } catch {}
  }

  // Afternoon/evening — review instead of plan
  if (hour >= 16 && suggestions.length < 4) {
    suggestions.push({ cmd: '/daily-review', reason: 'Reflect on what you shipped today' });
  }

  // Check if voice is trained (low-priority, fill slot)
  if (suggestions.length < 4) {
    const voicePath = path.join(vaultPath, 'System', 'voice.yaml');
    if (fs.existsSync(voicePath)) {
      try {
        const content = fs.readFileSync(voicePath, 'utf8');
        const confMatch = content.match(/confidence:\s*([\d.]+)/);
        if (confMatch && parseFloat(confMatch[1]) < 0.4) {
          suggestions.push({ cmd: '/voice train', reason: 'Sharpen your writing voice' });
        }
      } catch {}
    }
  }

  // Fill remaining slots with contextual suggestions
  const fillers = [
    { cmd: 'Help me think through a decision', reason: 'Structured thinking partner' },
    { cmd: '/coach', reason: 'Career sparring session' },
    { cmd: '/meeting-prep', reason: 'Prep for your next meeting' },
    { cmd: '/linkedin', reason: 'Draft a post in your voice' },
    { cmd: '/landscape', reason: 'Map the competitive landscape' },
    { cmd: 'What happened this week?', reason: 'Quick context refresh' },
  ];
  // Deterministic-ish daily rotation so they don't repeat
  const dayIndex = parseInt(today.replace(/-/g, ''), 10);
  while (suggestions.length < 4) {
    const pick = fillers[(dayIndex + suggestions.length) % fillers.length];
    if (!suggestions.some(s => s.cmd === pick.cmd)) {
      suggestions.push(pick);
    } else {
      break;
    }
  }

  // Cap at 4
  return { greeting, suggestions: suggestions.slice(0, 4) };
}

/**
 * Generate post-response suggestions based on what just happened.
 * @param {string} responseText - The full response text
 * @param {string|null} lastSkill - The skill that was just run (if any)
 * @param {string[]} usedCommands - Commands the user has used this session
 * @returns {string[]} Array of suggestion strings like "/prd to write a PRD"
 */
function getResponseSuggestions(responseText, lastSkill, usedCommands) {
  const suggestions = [];
  const seen = new Set();

  // 1. Skill chaining — if a skill just ran, suggest the next one
  if (lastSkill && SKILL_CHAINS[lastSkill]) {
    for (const chain of SKILL_CHAINS[lastSkill]) {
      if (!seen.has(chain.cmd)) {
        suggestions.push(`${chain.cmd} — ${chain.reason}`);
        seen.add(chain.cmd);
      }
    }
  }

  // 2. Topic-based suggestions from response content
  if (responseText) {
    const lower = responseText.toLowerCase();
    for (const topic of TOPIC_SUGGESTIONS) {
      if (topic.keywords.some(kw => lower.includes(kw))) {
        for (const s of topic.suggestions) {
          if (!seen.has(s.cmd)) {
            suggestions.push(`${s.cmd} — ${s.label}`);
            seen.add(s.cmd);
          }
        }
      }
    }
  }

  // 3. Skip suggestions for very short/casual responses (< 80 chars)
  if (suggestions.length === 0 && responseText && responseText.length < 80) {
    return [];
  }

  // 4. Rotating fallback if nothing matched on a longer response
  if (suggestions.length === 0) {
    const fallbacks = [
      'ask me to challenge or extend this',
      'try /daily-plan to plan your day',
      'paste meeting notes and I\'ll extract actions',
      '/coach for career sparring',
      '/prd to write a product requirements doc',
      'ask me to go deeper on anything above',
      '/landscape to map your competitive space',
    ];
    const pick = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    suggestions.push(pick);
  }

  // Cap at 3
  return suggestions.slice(0, 3);
}

/**
 * Get a random idle hint.
 * @param {string[]} usedCommands - Commands already used (to weight unused higher)
 * @returns {string}
 */
function getIdleHint(usedCommands) {
  const usedSet = new Set(usedCommands.map(c => c.toLowerCase()));

  // Boost weight for unused commands
  const weighted = IDLE_HINTS.map(h => {
    const cmd = h.text.match(/^\/\S+/);
    const bonus = cmd && !usedSet.has(cmd[0]) ? 3 : 0;
    return { ...h, weight: h.weight + bonus };
  });

  // Weighted random selection
  const totalWeight = weighted.reduce((sum, h) => sum + h.weight, 0);
  let r = Math.random() * totalWeight;
  for (const h of weighted) {
    r -= h.weight;
    if (r <= 0) return h.text;
  }
  return weighted[0].text;
}

/**
 * Get an onboarding breadcrumb tip for an unused feature.
 * @param {string[]} usedCommands - Commands the user has used
 * @returns {{ cmd: string, tip: string } | null}
 */
function getOnboardingTip(usedCommands) {
  const usedSet = new Set(usedCommands.map(c => c.replace(/^\//, '').toLowerCase()));

  const unused = FEATURE_TIPS.filter(f => {
    if (usedSet.has(f.id)) return false;
    // Check prerequisites
    if (f.requires.length > 0 && !f.requires.every(r => usedSet.has(r))) return false;
    return true;
  });

  if (unused.length === 0) return null;

  // Pick a random unused feature
  return unused[Math.floor(Math.random() * unused.length)];
}

// ── Contextual Action Patterns ──────────────────────────────────────────
// Pattern-matched against response + user message to generate natural-language actions

const CONTEXTUAL_PATTERNS = [
  {
    id: 'person-mention',
    // Matches "Name said", "spoke with Name", "Name mentioned", "meeting with Name", etc.
    test: (resp, _msg) => {
      const m = resp.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g);
      if (!m) return null;
      // Filter out common non-person capitalized phrases
      const ignore = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
        'Good Morning', 'Good Afternoon', 'Good Evening', 'Action Items', 'Next Steps', 'Key Points',
        'Mind The Product', 'Product Manager', 'Daily Plan', 'Week Plan', 'Quarter Goals', 'LinkedIn Post']);
      const names = [...new Set(m)].filter(n => !ignore.has(n));
      if (names.length === 0) return null;
      return { name: names[0] };
    },
    actions: (ctx) => [
      { text: `Pull up ${ctx.name}'s context`, command: `What do I know about ${ctx.name}?` },
      { text: `Create a page for ${ctx.name}`, command: `Create a person page for ${ctx.name}` },
    ],
  },
  {
    id: 'meeting',
    test: (resp, msg) => {
      const lower = (resp + ' ' + msg).toLowerCase();
      return /\b(meeting|1:1|one-on-one|standup|sync|check-in|call with|spoke with|met with)\b/.test(lower) ? {} : null;
    },
    actions: () => [
      { text: 'Capture meeting notes', command: 'Help me capture notes from this meeting' },
      { text: 'Prep for the next one', command: '/meeting-prep' },
    ],
  },
  {
    id: 'decision',
    test: (resp, msg) => {
      const lower = (resp + ' ' + msg).toLowerCase();
      return /\b(decision|decided|trade-off|chose|choosing|bet on|direction|go with)\b/.test(lower) ? {} : null;
    },
    actions: () => [
      { text: 'Log this decision', command: '/decision' },
      { text: 'What are the trade-offs?', command: 'What are the trade-offs and risks of this decision?' },
    ],
  },
  {
    id: 'task',
    test: (resp, msg) => {
      const lower = (resp + ' ' + msg).toLowerCase();
      return /\b(task|todo|to-do|action item|follow.?up|need to|should do|reminder)\b/.test(lower) ? {} : null;
    },
    actions: () => [
      { text: 'Add this to my tasks', command: 'Create a task from what we just discussed' },
      { text: 'Show my open tasks', command: 'Show me my open tasks' },
    ],
  },
  {
    id: 'strategy',
    test: (resp, msg) => {
      const lower = (resp + ' ' + msg).toLowerCase();
      return /\b(strategy|strategic|prioriti[sz]|roadmap|competitive|positioning|market|vision)\b/.test(lower) ? {} : null;
    },
    actions: () => [
      { text: 'Run a prioritization exercise', command: '/prioritise' },
      { text: 'Map the competitive landscape', command: '/landscape' },
    ],
  },
  {
    id: 'writing',
    test: (resp, msg) => {
      const lower = (resp + ' ' + msg).toLowerCase();
      return /\b(write|draft|post|article|blog|content|linkedin|publish)\b/.test(lower) ? {} : null;
    },
    actions: () => [
      { text: 'Draft a LinkedIn post about this', command: '/linkedin' },
      { text: 'Write it in my voice', command: 'Draft this in my trained voice' },
    ],
  },
  {
    id: 'career',
    test: (resp, msg) => {
      const lower = (resp + ' ' + msg).toLowerCase();
      return /\b(career|promotion|achievement|accomplished|shipped|launched|impact|brag|evidence|performance review)\b/.test(lower) ? {} : null;
    },
    actions: () => [
      { text: 'Capture this as evidence', command: 'Capture this as career evidence' },
      { text: 'Add to my brag doc', command: 'Add this achievement to my brag doc' },
    ],
  },
];

// Vault-state fallback suggestions when no pattern matches
function _getVaultFallbacks(vaultState) {
  const fallbacks = [];

  if (vaultState && vaultState.hasUnprocessedMeetings) {
    fallbacks.push({ text: 'Process your unprocessed meetings', command: '/process-meetings' });
  }
  if (vaultState && vaultState.hasTasks) {
    fallbacks.push({ text: 'Show my priorities', command: 'What should I focus on right now?' });
  }
  if (vaultState && !vaultState.hasDailyPlan) {
    fallbacks.push({ text: 'Plan your day', command: '/daily-plan' });
  }

  // Always available
  fallbacks.push({ text: 'What should I work on next?', command: 'Based on my tasks and priorities, what should I work on next?' });
  fallbacks.push({ text: 'Show me my priorities', command: 'Show me my current priorities and open tasks' });

  return fallbacks;
}

/**
 * Generate contextual action suggestions based on response content.
 * Returns 2-3 natural-language actions that auto-submit when selected.
 * When a vaultPath is provided, suggestions are weighted by learned feedback signals.
 *
 * @param {string} responseText - The AI response just shown
 * @param {string} userMessage - What the user asked
 * @param {{ hasUnprocessedMeetings?: boolean, hasTasks?: boolean, hasDailyPlan?: boolean }} vaultState - Current vault state
 * @param {string} [vaultPath] - Path to vault for feedback weight lookup
 * @returns {{ text: string, command: string, trigger?: string }[]} Array of 2-3 action suggestions
 */
function generateContextualActions(responseText, userMessage, vaultState, vaultPath) {
  if (!responseText || responseText.length < 40) return [];

  const matched = [];
  const seenIds = new Set();

  for (const pattern of CONTEXTUAL_PATTERNS) {
    const ctx = pattern.test(responseText, userMessage || '');
    if (ctx && !seenIds.has(pattern.id)) {
      seenIds.add(pattern.id);
      const actions = pattern.actions(ctx);
      // Tag each action with its trigger pattern id for feedback tracking
      for (const a of actions) {
        a.trigger = pattern.id;
      }
      matched.push(...actions);
    }
    if (matched.length >= 6) break; // collect more to allow weight-based sorting
  }

  if (matched.length > 0) {
    // Deduplicate by command
    const seen = new Set();
    let deduped = [];
    for (const a of matched) {
      if (!seen.has(a.command)) {
        seen.add(a.command);
        deduped.push(a);
      }
    }

    // Sort by learned trigger weights (higher weight = more likely to be acted on)
    if (vaultPath && deduped.length > 3) {
      try {
        const weights = getTriggerWeights(vaultPath);
        if (Object.keys(weights).length > 0) {
          deduped.sort((a, b) => {
            const wA = weights[a.trigger] != null ? weights[a.trigger] : 0.3;
            const wB = weights[b.trigger] != null ? weights[b.trigger] : 0.3;
            return wB - wA; // Higher weight first
          });
        }
      } catch {
        // Feedback weights are non-critical
      }
    }

    return deduped.slice(0, 3);
  }

  // Fallback to vault-state suggestions
  const fallbacks = _getVaultFallbacks(vaultState);
  // Pick 2 random fallbacks
  const shuffled = fallbacks.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

module.exports = {
  getWelcomeSuggestions,
  getResponseSuggestions,
  getIdleHint,
  getOnboardingTip,
  generateContextualActions,
  SKILL_CHAINS,
};
