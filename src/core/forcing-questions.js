'use strict';

// ── Forcing Questions ─────────────────────────────────────────────────────
// Reusable question sets that other skills can import to adopt the Socratic
// forcing-questions pattern. Each set is a sequence of questions designed to
// create clarity through progressive depth — not templates to fill in.
//
// Usage:
//   const { QUESTION_SETS, detectQuestionContext, formatForcingQuestion } = require('./forcing-questions');
//   const set = QUESTION_SETS.product_decision;
//   set.questions.forEach((q, i) => console.log(formatForcingQuestion(q, i + 1, set.questions.length)));

// ── Question Sets ─────────────────────────────────────────────────────────

const QUESTION_SETS = {
  product_decision: {
    name: 'Product Decision',
    description: 'Questions for any product decision — what to build, how to build it, whether to build it at all',
    questions: [
      {
        question: "What's the actual problem you're trying to solve? Not the feature — the problem.",
        purpose: 'Separates solution-thinking from problem-thinking. Most decisions start with a solution.',
        followUp: "If you couldn't build anything, how would you describe this problem to someone outside the company?",
      },
      {
        question: 'What evidence do you have that this is worth solving? What happens if you do nothing?',
        purpose: 'Forces honesty about signal strength. Gut feel is valid — but call it what it is.',
        followUp: "Is that evidence or is that one loud customer? What would convince your biggest skeptic?",
      },
      {
        question: 'Who specifically is affected? Can you name real people?',
        purpose: 'Grounds abstract "users" in real humans with real context.',
        followUp: "Are those people representative, or are they your loudest/most accessible users?",
      },
      {
        question: "If you ship this, what measurable outcome are you betting on?",
        purpose: "Every feature is a bet. This forces the PM to state what they expect to change.",
        followUp: "How will you know in 30 days if this was the right call?",
      },
      {
        question: "What are you NOT doing by doing this? What's the opportunity cost?",
        purpose: "Every yes is a dozen invisible nos. Names what gets sacrificed.",
        followUp: "If your team had twice the capacity, would this still be number one?",
      },
      {
        question: "What's the cheapest way to test whether this works before building the full thing?",
        purpose: "The fastest path to learning is not the fastest path to shipping.",
        followUp: "Could you learn the same thing with a prototype, a survey, or a conversation?",
      },
    ],
  },

  prioritization: {
    name: 'Prioritization',
    description: 'Questions for deciding what to build next — cuts through politics and pet projects',
    questions: [
      {
        question: "If you could only ship ONE thing this quarter, what would it be and why?",
        purpose: "Constraint reveals priority. Removes the comfort of 'we can do both.'",
        followUp: "Is that the thing with the most impact, or the thing you're most excited about? Are they the same?",
      },
      {
        question: "What's on this list because someone important asked for it, not because the data supports it?",
        purpose: "Surfaces political priorities disguised as product priorities.",
        followUp: "What would happen if you pushed back on that? What's the actual risk?",
      },
      {
        question: "Which of these items has the strongest evidence of user need?",
        purpose: "Forces a ranking by evidence strength, not enthusiasm.",
        followUp: "What kind of evidence? Data, user feedback, support tickets, gut feel? Be honest about which.",
      },
      {
        question: "What's the cost of delay for each item? Which one gets more expensive to build the longer you wait?",
        purpose: "Time-sensitivity changes priority. Some things compound, others don't.",
        followUp: "Is anything on this list only urgent because of an artificial deadline?",
      },
      {
        question: "If this roadmap fails and you look back in 6 months, which item's absence will hurt the most?",
        purpose: "Inversion — failure mode thinking applied to prioritization.",
        followUp: "Is that the same item you ranked first? If not, why not?",
      },
      {
        question: "What would your most frustrated user say about this priority order?",
        purpose: "External perspective check. Internal priorities often diverge from user needs.",
        followUp: "Have you actually asked a user what they'd prioritize? What did they say?",
      },
    ],
  },

  strategy: {
    name: 'Strategic Direction',
    description: 'Questions for big-picture strategy decisions — market positioning, vision, long-term bets',
    questions: [
      {
        question: "What's your theory of the market? What do you believe about how this space evolves?",
        purpose: "Every strategy rests on assumptions about the future. Name them.",
        followUp: "What would have to be true for that theory to be wrong?",
      },
      {
        question: "Where are you choosing to be different, and where are you choosing to be the same as competitors?",
        purpose: "Strategy is about deliberate trade-offs, not being better at everything.",
        followUp: "Are your users choosing you for the things you're different at, or despite them?",
      },
      {
        question: "What are you optimizing for? Growth, retention, revenue, or something else? Pick one.",
        purpose: "You can't optimize for everything. Forcing a single metric reveals true priority.",
        followUp: "If optimizing for that metric hurts the others, are you OK with that?",
      },
      {
        question: "What's the 3-year version of this that makes the current plan feel small?",
        purpose: "Checks if current strategy is a stepping stone to something bigger or just tactical.",
        followUp: "Is your current work building toward that, or is it a detour?",
      },
      {
        question: "What's the competitive move that would scare you most? What would you do if they made it tomorrow?",
        purpose: "Reveals vulnerability and tests defensive positioning.",
        followUp: "Are you building defensively or offensively? Is that the right posture?",
      },
      {
        question: "If you had to explain this strategy to a new hire in 2 sentences, what would you say?",
        purpose: "If you can't say it simply, you haven't finished thinking about it.",
        followUp: "Would your team give the same 2 sentences? Try asking them.",
      },
    ],
  },

  launch: {
    name: 'Go-to-Market / Launch',
    description: 'Questions for launch planning — cuts through launch theatre and focuses on what actually matters',
    questions: [
      {
        question: "Who is the day-one user and how will they find out this exists?",
        purpose: "Launches fail when 'build it and they will come' is the actual distribution plan.",
        followUp: "Is that a hope or a plan? What's the specific channel and message?",
      },
      {
        question: "What does a successful first week look like? Not in press mentions — in user behavior.",
        purpose: "Vanity metrics (press, social buzz) feel good but don't predict success.",
        followUp: "What number would make you worried on day 7? What number would make you confident?",
      },
      {
        question: "What's the onboarding experience for someone who's never heard of you?",
        purpose: "The gap between 'signed up' and 'got value' is where most launches actually fail.",
        followUp: "Have you watched someone go through it who wasn't on the team? What happened?",
      },
      {
        question: "What happens when something goes wrong on launch day? What's the plan?",
        purpose: "Something will go wrong. Teams that plan for it recover. Teams that don't panic.",
        followUp: "Who's on call? What's the rollback plan? What's the communication plan?",
      },
      {
        question: "What's the internal narrative you need stakeholders to believe after launch?",
        purpose: "Internal perception of a launch matters as much as external reality. Shape it deliberately.",
        followUp: "Are you setting expectations appropriately, or are you over-promising to get buy-in?",
      },
      {
        question: "What will you do differently if adoption is 10x what you expect? What about 0.1x?",
        purpose: "Plans for the base case are easy. Plans for outliers reveal preparedness.",
        followUp: "At what point would you call this launch a failure and pivot?",
      },
    ],
  },

  hiring: {
    name: 'Team / Hiring Decision',
    description: 'Questions for hiring, team structure, and people decisions',
    questions: [
      {
        question: "What problem are you solving by hiring this role? What happens if you don't fill it?",
        purpose: "Not every gap needs a hire. Sometimes the answer is process, tooling, or reprioritization.",
        followUp: "Could an existing team member grow into this, or is this genuinely new capability?",
      },
      {
        question: "What does this person need to accomplish in their first 90 days for the hire to be a success?",
        purpose: "Vague role definitions lead to vague hires. Specificity in outcomes attracts the right people.",
        followUp: "Are those outcomes realistic for someone ramping into a new company and team?",
      },
      {
        question: "Who on your current team will this person's success depend on most?",
        purpose: "Hires don't succeed in isolation. Identifies the critical integration points.",
        followUp: "Does that person have capacity to support onboarding, or are they already stretched?",
      },
      {
        question: "What's the trade-off you're making by hiring for this profile vs. a different one?",
        purpose: "Every hire is a bet on a specific skill set. Name what you're not getting.",
        followUp: "If this person is great at the core job but bad at [adjacent skill], is that OK?",
      },
      {
        question: "What would make you regret this hire in 6 months?",
        purpose: "Forces articulation of failure modes beyond 'not a culture fit.'",
        followUp: "Is that a risk you can mitigate in the interview process, or is it a gamble?",
      },
      {
        question: "If you had the budget but couldn't hire, what would you do instead?",
        purpose: "The constraint removes the default answer and reveals alternatives.",
        followUp: "Is hiring actually the highest-leverage use of that budget?",
      },
    ],
  },
};

// ── Context Detection ─────────────────────────────────────────────────────

/**
 * Keywords associated with each question set, used for auto-detection.
 */
const CONTEXT_KEYWORDS = {
  product_decision: [
    'build', 'feature', 'ship', 'should we', 'worth building',
    'problem', 'solution', 'user need', 'prd', 'product brief',
    'scope', 'mvp', 'v1', 'proposal',
  ],
  prioritization: [
    'prioriti', 'roadmap', 'backlog', 'rank', 'order', 'next',
    'trade-off', 'trade off', 'what to build', 'sequence',
    'sprint', 'quarter', 'capacity', 'resource',
  ],
  strategy: [
    'strategy', 'strategic', 'vision', 'direction', 'position',
    'market', 'competitor', 'long-term', 'long term', 'moat',
    'differentiat', 'north star',
  ],
  launch: [
    'launch', 'go-to-market', 'gtm', 'release', 'ship',
    'announce', 'rollout', 'roll out', 'beta', 'ga',
    'marketing', 'distribution', 'adoption',
  ],
  hiring: [
    'hire', 'hiring', 'role', 'team', 'headcount', 'recruit',
    'job description', 'candidate', 'interviewing', 'org structure',
    'reorg', 'capacity', 'scaling the team',
  ],
};

/**
 * Detect which question set is most relevant to a user message.
 *
 * @param {string} userMessage - The user's message or topic
 * @returns {{ set: string, confidence: number } | null}
 */
function detectQuestionContext(userMessage) {
  try {
    if (!userMessage || typeof userMessage !== 'string') return null;

    const lower = userMessage.toLowerCase();
    const scores = {};

    for (const [setName, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
      let hits = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) hits++;
      }
      if (hits > 0) {
        scores[setName] = hits;
      }
    }

    const entries = Object.entries(scores);
    if (entries.length === 0) return null;

    // Sort by hit count descending
    entries.sort((a, b) => b[1] - a[1]);
    const [bestSet, bestScore] = entries[0];

    // Confidence: normalize against total keywords in that set
    const totalKeywords = CONTEXT_KEYWORDS[bestSet].length;
    const confidence = Math.min(bestScore / Math.ceil(totalKeywords / 3), 1.0);

    return {
      set: bestSet,
      confidence: Math.round(confidence * 100) / 100,
    };
  } catch {
    return null;
  }
}

// ── Formatting ────────────────────────────────────────────────────────────

/**
 * Format a single forcing question for display in conversation.
 *
 * @param {{ question: string, purpose: string, followUp: string }} question
 * @param {number} step - Current step number (1-based)
 * @param {number} total - Total number of questions
 * @returns {string} Formatted question string
 */
function formatForcingQuestion(question, step, total) {
  try {
    if (!question || !question.question) return '';

    const lines = [];
    lines.push(`**Question ${step}/${total}: ${question.question}**`);
    lines.push(`_Why this matters: ${question.purpose}_`);

    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Format an entire question set as a readable overview.
 *
 * @param {string} setName - Key from QUESTION_SETS
 * @returns {string} Formatted overview, or empty string if set not found
 */
function formatQuestionSetOverview(setName) {
  try {
    const set = QUESTION_SETS[setName];
    if (!set) return '';

    const lines = [];
    lines.push(`## ${set.name}`);
    lines.push(`_${set.description}_`);
    lines.push('');

    set.questions.forEach((q, i) => {
      lines.push(`${i + 1}. **${q.question}**`);
      lines.push(`   _${q.purpose}_`);
    });

    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Get all available question set names with descriptions.
 *
 * @returns {{ name: string, key: string, description: string, questionCount: number }[]}
 */
function listQuestionSets() {
  try {
    return Object.entries(QUESTION_SETS).map(([key, set]) => ({
      key,
      name: set.name,
      description: set.description,
      questionCount: set.questions.length,
    }));
  } catch {
    return [];
  }
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  QUESTION_SETS,
  detectQuestionContext,
  formatForcingQuestion,
  formatQuestionSetOverview,
  listQuestionSets,
};
