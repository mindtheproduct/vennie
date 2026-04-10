---
name: decision
description: Capture decisions with context, options, rationale, and review dates
context: main
tags: [product]
integrations: []
---

# Decision Capture

Decisions are the most valuable artifact a product person creates. Features ship and metrics change, but decisions — and the reasoning behind them — are how you get better over time.

## When This Triggers

- User runs `/decision [topic]`
- Auto-detected during other conversations when a clear decision is being made

## The Conversation

Walk through these naturally. Don't make it feel like a form.

**Context:**
"What prompted this decision? What's the situation?"
- Get the background. Why is this decision needed now?
- What pressure or opportunity created it?

**Options Considered:**
"What were the options on the table?"
- List all options, including ones they rejected early
- For each: what was the upside? The downside?
- "Was there an option you dismissed too quickly? Why?"

**The Decision:**
"So what did you decide?"
- State it clearly and specifically
- "Is this a one-way door or a two-way door?" (Reversible or not?)

**Rationale:**
"Why this option over the others?"
- What evidence influenced the decision?
- What assumptions are you making?
- "What would have to be true for this to be the wrong call?"

**Expected Outcome:**
"What should happen as a result of this decision?"
- Specific, observable outcomes
- Timeline: when will you know if it worked?

**Review Date:**
"When should we revisit this?"
- Default: 30 days
- Adjust based on decision type (tactical: 2 weeks, strategic: 90 days)

## Output

```markdown
# Decision: [Title]
**Date:** [today]
**Status:** Active
**Review Date:** [date]
**Reversibility:** [One-way / Two-way]

## Context
[What prompted this decision]

## Options Considered
1. **[Option A]** — [Pros] / [Cons]
2. **[Option B]** — [Pros] / [Cons]
3. **[Option C]** — [Pros] / [Cons]

## Decision
[Clear statement of what was decided]

## Rationale
[Why this option — evidence, assumptions, reasoning]

## Expected Outcome
[What should happen, by when]

## Assumptions
- [Key assumptions that must hold true]

## Related
- People: [linked person pages]
- Projects: [linked projects]
```

## Saving

- Save to `03-Decisions/YYYY-MM-DD-[topic-slug].md`
- Link to relevant people in `05-People/`
- Link to relevant projects in `04-Projects/`
- If the decision relates to an active project, add a reference in the project file too

## After Saving

"Decision captured. I'll flag this for review on [review date]. If the assumptions change before then, just say 'revisit [topic] decision' and we'll check in early."

## Review Reminders

When the review date arrives (surfaced during `/daily-plan` or `/weekly-review`):
- Pull up the original decision
- Ask: "How did this play out? Were your assumptions correct?"
- Update status: Validated, Revised, or Reversed
- Capture the outcome as a learning
