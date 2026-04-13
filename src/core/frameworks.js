'use strict';

// ── Interactive Frameworks Engine ────────────────────────────────────────
// Conversational product frameworks that Vennie walks users through
// step by step. Instead of dumping templates, Vennie teaches by doing.
//
// Usage:
//   const { detectFramework, FRAMEWORKS } = require('./frameworks');
//   const fw = detectFramework("I need to prioritize my backlog");
//   // → { id: 'rice', name: 'RICE Prioritization', confidence: 0.9, ... }

// ── Framework Definitions ───────────────────────────────────────────────

const FRAMEWORKS = {
  rice: {
    name: 'RICE Prioritization',
    trigger: /\b(prioriti[sz]e|rank|what should i work on|backlog|what(?:'s| is) most important|stack rank|priority list|ordering|which (?:features?|items?|things?) first)\b/i,
    greeting: "Let's work through this with RICE scoring. I'll walk you through it.",
    systemPromptOverlay: `## Active Framework: RICE Prioritization

You are running an interactive RICE scoring session. Walk the user through scoring one item at a time.

**Process:**
1. Ask the user to list what they're prioritizing (or pull from their vault if available)
2. For each item, score these dimensions conversationally — one at a time, not all at once:
   - **Reach** (1-10): How many users/customers does this affect in a given time period?
   - **Impact** (1-3): How much does this move the needle for each person reached? (1 = minimal, 2 = moderate, 3 = massive)
   - **Confidence** (0-100%): How sure are you about these estimates? What evidence backs this up?
   - **Effort** (person-months): How long will this realistically take? Account for QA, edge cases, deployment.
3. Calculate RICE score: (Reach x Impact x Confidence) / Effort
4. After scoring 3-5 items, show the ranked list as a table
5. Challenge the scores — push back on effort optimism, impact inflation, and confidence without evidence
6. Ask: "You deprioritized [bottom items]. What are you betting WON'T happen as a result?"

**Rules:**
- Don't dump a table upfront — build it item by item through conversation
- Challenge scores that seem off: "You gave that high impact — what changes if you don't build it?"
- Use their actual tasks/projects from the vault if available
- When done, offer to save the prioritization to the vault`,
    steps: [
      'List items to prioritize',
      'Score each item on Reach, Impact, Confidence, Effort',
      'Calculate RICE scores',
      'Stack rank and challenge the results',
      'Capture trade-offs and save',
    ],
  },

  'decision-journal': {
    name: 'Decision Journal',
    trigger: /\b(should i|can(?:'t| not) decide|weighing options|trade[- ]?offs?|pros and cons|torn between|deciding between|which (?:option|way|approach)|help me decide|not sure (?:if|whether))\b/i,
    greeting: "Let's think through this decision properly. I'll help you structure it.",
    systemPromptOverlay: `## Active Framework: Decision Journal

You are running an interactive decision journal session. Help the user think through a decision step by step.

**Process:**
1. **State the decision clearly:** Ask them to articulate the decision in one sentence. If it's vague, help them sharpen it.
2. **List options:** What are the realistic options? Push for at least 3 (including "do nothing").
3. **For each option, explore:**
   - What's the best case outcome?
   - What's the worst case outcome?
   - What's the most likely outcome?
4. **Probe deeper:**
   - Is this reversible? (One-way door or two-way door?)
   - What's the time pressure? Does this need to be decided now?
   - What would you regret more — doing this or not doing this?
   - What would have to be true for each option to be the right call?
5. **Recommend:** Based on the analysis, share your recommendation and why
6. **Log:** Save the decision, reasoning, and expected outcomes to the vault with a review date

**Rules:**
- Don't jump to a recommendation — make them think through it first
- Ask about reversibility and time pressure early — it changes the stakes
- If they're overthinking a two-way door, call it out
- Log the decision with a review date (default: 30 days, adjust based on stakes)
- Save to the vault when done`,
    steps: [
      'State the decision clearly',
      'List all realistic options',
      'Explore best/worst/likely outcomes for each',
      'Assess reversibility and time pressure',
      'Recommend and log the decision',
    ],
  },

  'stakeholder-map': {
    name: 'Stakeholder Map',
    trigger: /\b(stakeholders?|who needs to know|buy[- ]?in|alignment|getting approval|who(?:'s| is) involved|political|navigate (?:the )?org|influence|sponsor|champions?)\b/i,
    greeting: "Let's build a stakeholder map. I'll help you figure out who matters and how to engage them.",
    systemPromptOverlay: `## Active Framework: Stakeholder Map

You are running an interactive stakeholder mapping session. Build a 2x2 influence/interest grid through conversation.

**Process:**
1. **Set context:** What initiative or decision are we mapping stakeholders for?
2. **Identify stakeholders:** Ask for names one at a time. For each person:
   - What's their role?
   - What do they care about in relation to this initiative?
   - **Interest level** (1-5): How much do they care about this?
   - **Influence level** (1-5): How much power do they have to help or block this?
3. **Plot the 2x2 grid:** After mapping 4-6 people, render an ASCII grid:
   - High Influence / High Interest → **Manage Closely** (key players)
   - High Influence / Low Interest → **Keep Satisfied** (powerful but disengaged)
   - Low Influence / High Interest → **Keep Informed** (enthusiastic supporters)
   - Low Influence / Low Interest → **Monitor** (minimal effort)
4. **Engagement strategy:** For each quadrant, suggest specific tactics:
   - Key Players: regular 1:1s, co-creation, early previews
   - Keep Satisfied: executive summaries, milestone updates
   - Keep Informed: group updates, async check-ins
   - Monitor: broadcast updates, no special attention
5. **Identify risks:** Who could become a blocker? Who's a potential champion?

**ASCII Grid Format:**
\`\`\`
                    HIGH INTEREST
                         |
    Keep Satisfied       |      Manage Closely
    (power, low care)    |      (key players)
                         |
  HIGH INFLUENCE --------+--------
                         |
    Monitor              |      Keep Informed
    (minimal effort)     |      (supporters)
                         |
                    LOW INTEREST
\`\`\`

**Rules:**
- Ask for stakeholders one at a time — don't ask for a big list
- Pull from person pages in the vault if they mention names Vennie knows
- Be specific about engagement tactics, not generic advice
- Save the map to the vault when done`,
    steps: [
      'Set context for the initiative',
      'Identify stakeholders one by one',
      'Assess interest and influence for each',
      'Plot the 2x2 grid',
      'Define engagement strategy per quadrant',
    ],
  },

  'user-story': {
    name: 'User Story Workshop',
    trigger: /\b(user stor(?:y|ies)|requirements?|what should we build|feature spec|acceptance criteria|as a user|job(?:s)? to be done|jtbd|use cases?)\b/i,
    greeting: "Let's workshop this into a solid user story. We'll start with who and why.",
    systemPromptOverlay: `## Active Framework: User Story Workshop

You are running an interactive user story workshop. Guide the user from a vague idea to a well-formed user story with acceptance criteria.

**Process:**
1. **Who is the user?** Not "users" — which specific person or persona? What's their context?
2. **What's their goal?** What are they trying to accomplish? Why does it matter to them?
3. **What's blocking them?** What's the current pain? What do they do today instead?
4. **Write the story together:**
   - Format: "As a [specific user], I want to [action] so that [outcome]"
   - Challenge vague stories: "That's a feature, not a goal. What does the user actually need?"
5. **Define acceptance criteria:**
   - Given [context], when [action], then [expected result]
   - Push for edge cases: "What if the user does X instead? What about empty states?"
   - Ask: "How would you demo this to stakeholders? Walk me through it."
6. **Estimate effort:**
   - T-shirt size (S/M/L/XL) is fine for now
   - Flag dependencies or unknowns that could blow up the estimate
7. **Capture related stories:** Often one story surfaces 2-3 related ones. Note them.

**Rules:**
- Start with the user and problem, not the solution
- Challenge solution-first thinking: "You're describing what to build. What problem does it solve?"
- Push for specific acceptance criteria, not hand-wavy descriptions
- If the story is too big, help break it down
- Save the story to the vault when done`,
    steps: [
      'Identify the specific user',
      'Clarify their goal and motivation',
      'Understand current blockers',
      'Write the user story',
      'Define acceptance criteria',
      'Estimate effort and flag unknowns',
    ],
  },

  retrospective: {
    name: 'Retrospective',
    trigger: /\b(retro(?:spective)?|what went well|what went wrong|lessons? learned|post[- ]?mortem|looking back|how did (?:it|that|the (?:sprint|project|launch)) go|debrief)\b/i,
    greeting: "Let's run a quick retro. I'll walk you through it — no sticky notes required.",
    systemPromptOverlay: `## Active Framework: Retrospective

You are running an interactive retrospective. Guide the user through structured reflection.

**Process:**
1. **Set context:** What are we retrospecting on? A sprint, a project, a launch, a quarter?
2. **What went well?** Ask for 3-5 things. Probe deeper: "Why did that go well? Was it luck or a repeatable process?"
3. **What didn't go well?** Ask for 3-5 things. Don't let them stay surface-level:
   - "That's a symptom. What caused it?"
   - "Was this predictable? Could you have seen it coming?"
   - "Who was affected? How badly?"
4. **What surprised you?** Good or bad. Surprises reveal blind spots.
5. **What will you do differently?** Convert insights into specific, actionable commitments:
   - Bad: "Communicate better"
   - Good: "Send weekly status updates to stakeholders every Friday by 4pm"
6. **Action items:** For each "do differently" item:
   - Who owns it?
   - What's the first concrete step?
   - When will you check if it's working?

**Rules:**
- Keep it blameless — focus on systems and processes, not individuals
- Push vague answers into specifics: "Be more careful" → "Add a checklist for X"
- If they only list negatives, push for positives too (and vice versa)
- End with energy — highlight the top action item and the biggest win
- Save the retro to the vault when done`,
    steps: [
      'Set the context (what are we reflecting on?)',
      'Capture what went well',
      'Capture what didn\'t go well',
      'Identify surprises',
      'Commit to specific changes',
      'Define action items with owners',
    ],
  },
};

// ── Framework Detection ─────────────────────────────────────────────────

/**
 * Detect if a user message triggers an interactive framework.
 *
 * @param {string} userMessage - Raw user input
 * @returns {{ id: string, framework: object, confidence: number } | null}
 */
function detectFramework(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return null;

  const text = userMessage.toLowerCase().trim();
  if (text.length < 5) return null;

  // Don't detect frameworks on slash commands
  if (text.startsWith('/')) return null;

  const matches = [];

  for (const [id, framework] of Object.entries(FRAMEWORKS)) {
    const match = framework.trigger.exec(text);
    if (match) {
      // Calculate confidence based on match quality
      let confidence = 0.7;

      // Longer messages with the trigger word are more intentional
      if (text.length > 30) confidence += 0.05;

      // Question marks suggest the user is asking for help
      if (text.includes('?')) confidence += 0.1;

      // Multiple trigger words in the same message boost confidence
      const allMatches = text.match(framework.trigger);
      if (allMatches && allMatches.length > 1) confidence += 0.1;

      // Check for strong intent signals
      const intentSignals = /\b(help me|walk me through|how (?:do|should) i|guide me|let(?:'s| us)|can (?:you|we))\b/i;
      if (intentSignals.test(text)) confidence += 0.1;

      // Cap at 0.95
      confidence = Math.min(confidence, 0.95);

      matches.push({ id, framework, confidence: Math.round(confidence * 100) / 100 });
    }
  }

  if (matches.length === 0) return null;

  // Return highest confidence match
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches[0];
}

/**
 * Format a framework detection result into a user-facing suggestion.
 *
 * @param {{ id: string, framework: object, confidence: number }} result
 * @returns {string}
 */
function formatFrameworkSuggestion(result) {
  if (!result) return '';
  return result.framework.greeting;
}

// ── Exports ─────────────────────────────────────────────────────────────

module.exports = { FRAMEWORKS, detectFramework, formatFrameworkSuggestion };
