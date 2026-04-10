---
name: brag
description: Compile evidence into formatted brag sheets for any audience
context: main
tags: [career]
integrations: []
---

# Brag Sheet Generator

Turn your evidence trail into a polished document you can use for reviews, promotions, job applications, or just reminding yourself you're good at this.

## How to Start

"What do you need this for? That'll shape how I format it."

Options:
- **Markdown** — clean reference document
- **PDF-ready** — formatted for sharing with managers or HR
- **Resume bullets** — punchy, quantified one-liners
- **LinkedIn narrative** — story-driven, audience-friendly
- **Promotion packet** — structured case for leveling up

Then ask about scope:
- "What time period? Last quarter, last 6 months, this year, everything?"
- "Any specific skills or projects to highlight?"
- "Is there a particular audience? (Manager, skip-level, hiring committee?)"

## Data Sources

Pull from:

- `06-Evidence/Wins/` — captured wins with metrics
- `06-Evidence/Feedback/` — praise and recognition
- `06-Evidence/Learnings/` — growth evidence
- `03-Decisions/` — judgment and ownership evidence
- `04-Projects/` — project outcomes and scope

## Compilation Process

1. **Gather all evidence** in the specified time period
2. **Rank by strength:**
   - Tier 1: Metrics-backed impact (revenue, users, performance)
   - Tier 2: Qualitative impact with stakeholder validation
   - Tier 3: Activity and contribution (shipped, built, designed)
3. **Group by theme:** Impact, Leadership, Technical, Growth, Collaboration
4. **Write the narrative:** Connect individual wins into a coherent story of growth and impact

## Strengthening Weak Evidence

For wins without metrics, suggest:
- "This win could be stronger with a metric — do you have the numbers?"
- "'Improved the onboarding flow' becomes 'Improved onboarding flow, reducing drop-off by 15%' — can you check?"
- "You mentioned [stakeholder] was happy. Got a quote or Slack message?"

Don't inflate — just help them articulate the impact that already exists.

## Output Formats

### Resume Bullets
```
- Shipped [feature] serving [N] users, resulting in [X]% improvement in [metric]
- Led [initiative] across [N] teams, delivering [outcome] [timeframe]
- Identified and resolved [problem], saving [time/money/effort]
```

### LinkedIn Narrative
Conversational, first-person, uses the user's voice (from voice.yaml if trained). Tells a story, not a list.

### Promotion Packet
Structured against leveling criteria. For each competency:
- Evidence of meeting next-level expectations
- Specific examples with context and impact
- Growth trajectory showing readiness

### PDF-Ready
Clean headers, professional formatting, scannable. One page if possible, two max.

## Saving

- Save to `06-Evidence/Brag_Sheets/YYYY-MM-DD-[context].md`
- Keep previous brag sheets — they're useful for tracking trajectory

## End With

"Your brag sheet covers [time period] with [N] wins. Strongest evidence: [top 2-3 items]. If you want this to be even stronger, the quickest improvement would be [adding metrics to X / getting a quote from Y / connecting Z to a business outcome]."
