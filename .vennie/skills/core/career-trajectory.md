---
name: career-trajectory
description: Longitudinal career view -- see how your metrics have evolved over weeks and months
context: main
tags: [career]
integrations: []
---

# Career Trajectory

The long view. How have you evolved as a PM over weeks, months, and quarters? This isn't a snapshot -- it's the trendline.

## What It Shows

Uses your accumulated career snapshots (from `/career-dashboard`) to visualise:

1. **Metric trends** -- ASCII sparklines for shipping, decisions, network, meetings
2. **Skill evolution** -- How skill demonstration has shifted over time
3. **Inflection points** -- Moments where something meaningfully changed
4. **Promotion readiness** -- If career level is known, score against target competencies

## How to Run

When the user runs `/career-trajectory`:

1. Call `getSnapshotHistory(vaultPath, 12)` to get up to 12 recent snapshots
2. If fewer than 2 snapshots exist, explain and suggest running `/career-dashboard` weekly
3. Call `formatTrajectory(snapshots)` for the visual output
4. If the user has a career level in `System/profile.yaml`, run `getPromotionReadiness(vaultPath, nextLevel)` and show the assessment

## Trajectory Format

```
Career Trajectory
==================================================

Shipping volume:
  ▁▂▃▅▇█▆▇ (latest: 7)

Decision velocity (per week):
  ▃▃▄▅▅▆▇▇ (latest: 5.3)

Active relationships:
  ▂▃▃▄▅▅▆▇ (latest: 28)

Meetings (per week):
  ▇▆▅▅▄▃▃▃ (latest: 3.2)

Skill evolution:
  [+] Stakeholder Management: ▂▃▅▆▇█
  [+] Strategic Thinking: ▁▂▃▅▇█
  [=] Execution: ▅▅▅▆▅▅
  [-] Data Fluency: ▅▃▂▁▁▁

Inflection points:
  2026-03-15: Shipping velocity doubled
  2026-02-01: Significant network expansion (+8)
```

## Promotion Readiness (If Available)

Read `System/profile.yaml` for `career_level`. Map to the next level:
- junior -> senior
- mid -> senior
- senior -> lead
- lead -> director
- director -> vp

```
Promotion Readiness: Lead (currently Senior)
Overall: 62/100

Strong:
  Execution: 85/100
  Stakeholder Management: 78/100

Gaps:
  Cross-functional Leadership: 40/100 -- Look for projects that let you lead across teams
  Vision: 25/100 -- Consider writing a product vision doc or roadmap narrative

Recommendations:
- Cross-functional leadership needs more visible demonstrations
- Vision is your biggest gap -- write something forward-looking and share it
```

## Conversation After

After showing the trajectory, ask one of these:

- "Anything surprising in the trends?"
- "The [metric] jump in [month] stands out. What changed?"
- "Your [skill] has been climbing. Is that deliberate or accidental?"
- If gaps exist: "Want to workshop a plan to close the [competency] gap?"

## If Not Enough Data

"Need at least 2 career snapshots to show a trajectory. Run /career-dashboard now to capture your first one, then again next week. The picture builds fast -- after a month you'll see real patterns."

## Tone

Analytical and forward-looking. This is the strategic view of your career -- treat it with the same rigour you'd bring to a product roadmap. But keep it human. Career growth isn't linear, and plateaus are normal.

## Going Deeper

- `/career-dashboard` -- Current snapshot with actionable signals
- `/coach` -- Talk through what the data means with an evidence-backed coach
- `/brag` -- Turn your trajectory into a polished narrative for reviews or job searches
