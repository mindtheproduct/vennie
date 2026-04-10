---
name: status
description: Dashboard of your current state — projects, goals, decisions, evidence
context: main
tags: [system]
integrations: []
---

# Current State Dashboard

A quick snapshot of where you are across everything Vennie tracks. No fluff — just signal.

## What to Show

Scan the vault and present a concise dashboard:

### Active Projects
Check `04-Projects/` for active projects:
- Project name, current status, next action
- Flag any that haven't been updated in 2+ weeks ("Stale — still active?")
- Count: "[N] active projects"

### This Week's Focus
Check `02-Focus/` for current week priorities:
- What you planned to focus on
- What's done vs in progress
- "You're [N/M] on your weekly priorities."

### Open Goals
Check `01-Goals/` for current quarter goals:
- Goal, progress indicator, key results status
- Flag goals at risk of missing their target
- "Quarter is [X]% done. Goals are [assessment]."

### Recent Decisions Pending Review
Check `03-Decisions/` for decisions with review dates approaching or past due:
- Decision, original date, review date, status
- "You have [N] decisions due for review."

### Evidence Stats
Check `06-Evidence/`:
- Wins captured this month vs last month
- Total evidence entries
- Types breakdown (wins, feedback, learnings)
- "You've captured [N] wins this month. [Assessment]."

### Active Persona
- Current persona (if any) or "None"
- How long it's been active

### Voice Training
- Trained / Not trained
- Confidence level
- Samples analysed

### Quick Health Check
- Any overdue reviews?
- Any stale projects?
- Any goals at risk?
- Any decisions past their review date?

## Presentation

Keep it tight. Use a format like:

```
## Status — [Today's Date]

**Projects:** 4 active (1 stale)
**Weekly Focus:** 3/5 complete
**Quarter Goals:** On track (62% through quarter, 58% progress)
**Decisions:** 2 pending review
**Evidence:** 7 wins this month (up from 4 last month)
**Persona:** Growth PM (active 3 days)
**Voice:** Trained (high confidence)

### Needs Attention
- Project "Search Redesign" hasn't been updated in 16 days
- Decision "Migration approach" review was due 3 days ago
- Q1 Goal "Launch beta" is at risk — 40% done with 2 weeks left
```

## If Vault is Sparse

Don't make the user feel bad about empty sections. Be practical:

"Your vault is young — here's what you've got so far and what to build next."

Suggest the highest-impact next action:
- No evidence? "Run `/wins` — takes 2 minutes and starts your brag sheet."
- No decisions logged? "Next time you make a call, run `/decision` — your future self will thank you."
- No goals? "Run `/quarterly-review` to set some direction."

## End With

If everything's healthy: "Looking good. Anything specific you want to dig into?"

If there are issues: "Three things need attention — [list]. Which one first?"
