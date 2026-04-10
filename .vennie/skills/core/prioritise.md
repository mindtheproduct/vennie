---
name: prioritise
description: Score and rank features using proven prioritisation frameworks
context: main
tags: [product]
integrations: []
---

# Prioritisation Framework

Help the user take a messy list of ideas and turn it into a ranked, defensible priority list.

## How to Start

"What are you trying to prioritise? Dump the list — messy is fine. We'll sort it out."

Get the list first. Don't explain frameworks before you have items to work with.

## Pick the Framework

Once you have the list, offer framework choices:

- **RICE** (Reach, Impact, Confidence, Effort) — best for data-informed teams with usage metrics
- **ICE** (Impact, Confidence, Ease) — simpler, good for smaller teams or early-stage
- **MoSCoW** (Must, Should, Could, Won't) — best for scope conversations with stakeholders
- **Custom weighting** — "Want to weight certain factors more heavily? We can build your own."

If they don't have a preference, default to RICE. It's the most rigorous without being overkill.

## Scoring Process

Go through each item one at a time. For each:

1. **State the item clearly** — make sure you both agree on what it actually is
2. **Score each dimension** — ask the user for their estimate, push back if it seems off
3. **Challenge the scores:**
   - "You gave that a 3 on impact — what changes if we don't build it? Is the answer really 'a lot'?"
   - "Confidence of 80%? What evidence are you basing that on?"
   - "That effort estimate feels low. Are you accounting for QA, edge cases, and deployment?"
4. **Note the rationale** — why this score, not just what it is

## Key Challenges

Throughout the process, push on:

- **Effort bias** — people underestimate effort on things they're excited about
- **Impact inflation** — everything is "high impact" until you compare them
- **Confidence overstatement** — "We think users want this" vs "Users told us they want this" are very different confidence levels
- **Recency bias** — the loudest customer request isn't always the most important one

## The Uncomfortable Question

After scoring, ask: "You deprioritised [bottom items]. What are you betting WON'T happen as a result?"

This forces them to own the trade-offs explicitly, not just celebrate the winners.

## Output

Generate a ranked priority list:

```markdown
# Prioritisation: [Context]
**Date:** [today]
**Framework:** [RICE/ICE/MoSCoW/Custom]
**Items evaluated:** [N]

## Ranked List

| Rank | Item | Score | Key Rationale |
|------|------|-------|---------------|
| 1    | ...  | ...   | ...           |

## Trade-off Analysis
- By choosing [top items], you're betting that [assumption]
- By deferring [bottom items], you're accepting the risk that [consequence]

## Decision
[What the user decided to do, in their words]

## Review Date
[When to revisit this prioritisation]
```

## Saving

- Save to `03-Decisions/YYYY-MM-DD-prioritisation-[context].md`
- Link to any relevant projects in `04-Projects/`

## End With

"Your top 3 are: [list]. The one I'd watch most closely is [X] because [reason]. Want to turn the top items into project briefs or specs?"
