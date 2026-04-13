---
name: career-dashboard
description: Career intelligence dashboard -- see your growth metrics, skill gaps, and trends at a glance
context: main
tags: [career]
integrations: []
---

# Career Dashboard

Your career at a glance. Not vanity metrics -- real signals about how you're growing as a product person.

## What It Shows

Run the career intelligence engine and display a formatted dashboard covering:

1. **Shipping velocity** -- What you've shipped this month, streak length
2. **Decision velocity** -- Decisions logged, weekly average, top categories
3. **Network health** -- Active relationships, new connections, neglected contacts
4. **Meeting load** -- Total meetings, trend direction, calendar health
5. **Skill matrix** -- Visual bars showing demonstrated skills with trend indicators
6. **Growth signals** -- What's going well and what needs attention

## How to Run

When the user runs `/career-dashboard`:

1. Call `buildCareerSnapshot(vaultPath)` from `src/core/career-intelligence.js`
2. Call `getSnapshotHistory(vaultPath, 1)` to get the previous snapshot
3. If a previous snapshot exists, call `comparePeriods(current, previous)` for insights
4. Display using `formatDashboard(snapshot, insights)`
5. Call `saveSnapshot(vaultPath, snapshot)` to persist the data point
6. Show the career brief via `generateCareerBrief(vaultPath)`

## Dashboard Format

```
Career Intelligence -- April 2026

Shipping: 4 this month  [3-week streak]
Decisions: 12 this month (5/week avg)
Network: 23 active relationships (+3 new)
Meetings: 18 (down -- more focused)

Skills demonstrated:
  ■■■■■■■■░░ Stakeholder Management (8)
  ■■■■■■░░░░ Strategic Thinking (6)
  ■■■░░░░░░░ Data Fluency (3) [!] declining
  ■■░░░░░░░░ System Design (2) [!] stale

Growth signals:
  [+] Decision velocity improved
  [+] Shipping consistently
  [!] Data fluency evidence thin
  [!] Haven't connected with Alex Chen in 6 weeks
```

## After the Dashboard

1. Show the one-paragraph career brief
2. If there are gaps or warnings, suggest 1-2 concrete actions:
   - "Your data fluency evidence is thin. Next time you make a metrics-based decision, capture it with /shipped."
   - "You haven't connected with [person] recently. Worth a quick check-in?"
3. If promotion readiness data exists in their profile, mention where they stand
4. Save the snapshot for longitudinal tracking

## If Not Enough Data

If the vault is new or sparse:

"Not much to show yet -- and that's fine. Here's how to build your career intelligence:
- Use /shipped after completing something meaningful
- Log decisions with /decision when you make a call
- Build person pages for people you work with regularly
- Run /career-dashboard weekly to track your trajectory over time"

## Tone

Motivating, not judgmental. Frame gaps as opportunities, not failures. Celebrate streaks and growth. Be specific -- "your stakeholder management is strong" beats "you're doing well."
