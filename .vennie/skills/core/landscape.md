---
name: landscape
description: Competitive landscape analysis with scraping and positioning
context: main
tags: [intelligence]
integrations: []
---

# Competitive Landscape

Research and analyse the competitive landscape for a product or market. Turn scattered knowledge into structured intelligence.

## How to Start

"What product or market are we mapping? And what do you need — a quick snapshot or a deep analysis?"

Then:
- "Who are the competitors you already know about?"
- "What dimensions matter most? (Features, pricing, positioning, market share, tech stack?)"
- "Is this for a specific decision? (Entering a market, positioning, differentiation, fundraising?)"

## Research Process

### Gather Intelligence

For each competitor:

**From their website:**
- Product description and positioning
- Pricing model (if public)
- Key features and differentiators
- Target audience signals
- Recent blog posts / launches

**From public sources:**
- G2 / Capterra reviews (sentiment, strengths, weaknesses)
- Crunchbase (funding, team size, growth signals)
- News and press mentions
- Social media presence and engagement
- Job postings (reveals priorities and tech stack)

**From the user's knowledge:**
- "What do you know about [competitor] that isn't public?"
- Win/loss context from deals
- Customer feedback comparing products

Use scraping tools if available to gather data. Escalate through methods as needed for blocked sites.

### Analyse

**Positioning Map:**
- Plot competitors on relevant axes (e.g., enterprise vs SMB, feature-rich vs simple)
- Identify whitespace — where is nobody competing?
- Find the crowded middle — where is everyone piled up?

**Feature Comparison:**

| Feature | You | Competitor A | Competitor B | Competitor C |
|---------|-----|-------------|-------------|-------------|
| ...     | ... | ...         | ...         | ...         |

**Positioning Analysis:**
- What's each competitor's core narrative?
- Where do they overlap?
- What claims can you make that they can't?

**Strengths & Weaknesses:**
For each competitor:
- What they do better than you
- What you do better than them
- Where they're vulnerable

## Output

```markdown
# Competitive Landscape: [Market/Product]
**Date:** [today]
**Prepared for:** [context/decision]

## Market Overview
[Brief state of the market — size, growth, trends]

## Competitor Matrix

| | You | [A] | [B] | [C] |
|---|---|---|---|---|
| Positioning | | | | |
| Target Market | | | | |
| Pricing | | | | |
| Key Strength | | | | |
| Key Weakness | | | | |

## Detailed Analysis

### [Competitor A]
**What they do:** [overview]
**Positioning:** [their narrative]
**Strengths:** [what they do well]
**Weaknesses:** [where they're vulnerable]
**Recent moves:** [launches, hires, funding]

### [Competitor B]
...

## Positioning Gaps
[Where the opportunity is — unserved segments, unmet needs, positioning whitespace]

## Recommendations
[What to do with this intelligence — positioning moves, feature priorities, messaging angles]
```

## Updating Existing Landscapes

If a landscape doc already exists in `08-Resources/Industry/`:
- Compare against the existing analysis
- Highlight what changed
- Update the document with new intelligence
- Note the update date

## Saving

- Save to `08-Resources/Industry/Landscape_[market].md`
- Link to relevant projects if this informs product decisions

## End With

"Landscape saved. The biggest opportunity I see is [gap]. The biggest threat is [competitor move]. Want to turn any of this into a strategy conversation?"
