---
name: product-brief
description: Extract a product brief through forcing questions — the conversation IS the work
context: main
tags: [product]
integrations: []
---

# Product Brief

You're not here to fill in a template. Templates create busywork — someone stares at "Problem Statement: ___" for 20 minutes, writes something vague, and moves on feeling productive. That's not what this is.

You're here to have a conversation that produces a brief. The brief is the output, not the input. By the time the document is generated, all the hard thinking is done.

## How to Start

Don't show a template. Don't explain the format. Just start:

"Tell me what you're thinking about building. Don't worry about structure — just tell me what it is and why it matters."

Let them talk. Then begin the six questions. Go in order. Each one builds on the last.

## The Six Forcing Questions

### 1. Who Is This For and What's Their Current Pain?

"Who specifically is this for, and what's hurting them right now?"

**Why this matters:** "Users" is not an answer. Neither is a segment name. Push for a real person or a vivid archetype. The pain needs to be concrete — not "they struggle with" but "they spend 45 minutes every Monday doing X manually and it makes them want to quit."

**Go deeper if needed:**
- "What are they doing today instead? The workaround IS your competitor."
- "How painful is this? On a scale from 'mild annoyance' to 'actively losing money/time/sanity'?"
- "How many of these people exist? Dozens, hundreds, thousands?"

### 2. Why Now? What Changed?

"Why now? What changed that makes this urgent instead of something for the backlog?"

**Why this matters:** Timing is the hidden variable in product decisions. Something changed — a market shift, a competitor move, new data, executive pressure, a customer escalation. Name it. If nothing changed, this isn't urgent and should probably stay in the backlog. That's OK — but be honest about it.

**Go deeper if needed:**
- "If we waited 6 months, what would be different?"
- "Is this driven by opportunity or by fear? Both are valid — but they lead to different urgency."
- "What's the cost of doing nothing for one more quarter?"

### 3. What Does Success Look Like in Numbers?

"If this works exactly as you hope, what changes? Give me a number."

**Why this matters:** "Better experience" is not success. "Users are happier" is not success. Success is measurable, falsifiable, and time-bound. Push for a specific metric, a specific direction, and a specific timeframe. If they can't articulate success in numbers, they don't know what they're building yet.

**Go deeper if needed:**
- "What's the leading indicator you'd check in week 1?"
- "What's the lagging indicator that tells you this was the right bet in 3 months?"
- "If the metric moves but users say they hate it, what do you do?"

### 4. What's the Simplest Version That Tests the Hypothesis?

"Strip everything away. What's the smallest thing you could build that would tell you if the core idea works?"

**Why this matters:** The gap between "minimum viable" and "what the PM actually wants to build" is where scope creep lives. Push them to find the atomic unit — the single feature or change that validates the core bet. Everything else is v2 until proven otherwise.

**Go deeper if needed:**
- "You just described v3. What's v0.1?"
- "If engineering said 'you have 2 weeks,' what would you cut?"
- "Could you test the riskiest assumption without building anything?"

### 5. What Could Go Wrong?

"What's the most likely way this fails?"

**Why this matters:** Optimism is a product manager's default state and their biggest blind spot. Force them to name the failure modes — not hypothetically, but specifically. Technical risk, adoption risk, political risk, timing risk.

**Go deeper if needed:**
- "You gave me the technical risk. What about the human risk?"
- "What if it works technically but nobody adopts it?"
- "What would your biggest skeptic say about this plan?"

### 6. Who Needs to Be Convinced and What Do They Care About?

"Who needs to say yes for this to happen, and what do they actually care about?"

**Why this matters:** Products don't fail in code — they fail in alignment. The best PRD in the world is useless if the stakeholder who controls resources doesn't believe in it. Identify the decision-makers, understand their incentives, and tailor the argument.

**Go deeper if needed:**
- "What's their biggest concern likely to be?"
- "Do they care about the user problem or the business outcome? Speak their language."
- "Who's the silent blocker — the person who won't say no but will slow things down?"

## After the Questions — Generate the Brief

Now synthesize everything into a clean, opinionated product brief. The brief should feel like a document written by someone who deeply understands the problem — because by now, they do.

```markdown
# Product Brief: [Title]
**Author:** [user's name from profile]
**Date:** [today]
**Status:** Draft

## The Problem
[2-3 sentences. Crystal clear. No solution language. Written so someone outside the team would understand why this matters.]

## Who It Affects
[Specific user segment with context on current behavior, pain level, and scale]

## Why Now
[What changed. The urgency driver. What happens if we wait.]

## Proposed Approach
[The simplest version that tests the hypothesis. What we're building first and why.]

## Success Metrics
| Metric | Current | Target | Timeframe |
|--------|---------|--------|-----------|
| [Primary metric] | [baseline or "unknown"] | [target] | [timeframe] |
| [Leading indicator] | [baseline] | [target] | [timeframe] |

## What We're NOT Building (v1)
[Explicitly scoped out. The things that came up in conversation and were deliberately deferred.]

## Risks
| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| [Most likely failure] | High | [Specific action] |
| [Second risk] | Medium | [Specific action] |

## Stakeholder Map
| Person/Role | Their Concern | How We Address It |
|-------------|--------------|-------------------|
| [Decision-maker] | [What they care about] | [How the brief speaks to it] |

## Open Questions
[Things that came up during the conversation that still need answers]

## Recommended Next Step
[One specific action. Not "align with stakeholders" — something concrete and time-bound.]
```

## If a Persona is Active

Apply their lens to the questions:
- **Growth PM:** Push harder on metrics, activation funnel, and experiment design
- **Craft PM:** Push harder on user empathy, design quality, and delight
- **Enterprise PM:** Push harder on stakeholder alignment, scale, and compliance
- **Startup PM:** Push harder on speed, learning velocity, and resource constraints

## If Voice is Trained

Write the brief in the user's voice. A brief that sounds like the author gets championed. A brief that sounds like AI gets forwarded without context.

## Saving

- Save to `04-Projects/[project-name]/Product_Brief_[topic].md`
- If no project folder exists, create one or save to `00-Inbox/Ideas/`
- Save as artifact (type: `brief`, skill: `product-brief`)
- Capture any decisions surfaced during the conversation to `03-Decisions/`

## End With

"Your brief is saved. The strongest part: [X]. The part that needs more evidence before you pitch it: [Y]. Want to run a `/premortem` on this before sharing it?"
