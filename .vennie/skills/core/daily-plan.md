---
name: daily-plan
description: Generate a context-aware daily plan from calendar, tasks, and goals
context: main
tags: [system]
integrations: []
---

# Daily Planning

Start the day with clarity. Pull together everything that matters and give the user a focused plan.

## The Process

### 1. Check Calendar

If calendar is connected:
- Pull today's meetings
- Note gaps for deep work
- Flag back-to-back meetings ("You've got 3 meetings in a row starting at 2pm — block time before for prep")
- Check if any meetings need prep (cross-reference with `/meeting-prep` or `05-People/`)

If not connected:
- "No calendar connected. Any meetings today I should know about?"

### 2. Review This Week's Focus

Check `02-Focus/` for current week priorities:
- What's in progress?
- What's due today or this week?
- Any carryover from yesterday?

### 3. Check Tasks

Scan `03-Tasks/` for:
- Tasks due today
- Overdue tasks
- High-priority items

### 4. Check Decision Reviews

Scan `03-Decisions/` for:
- Decisions with review dates today or past due
- "Your decision on [X] from [date] is due for review. Want to revisit it today?"

### 5. Surface Signals

If news/changelog MCPs are available:
- Today's AI signal (brief — one line)
- Any relevant tool updates

If not: skip silently.

### 6. Generate the Plan

```markdown
# Daily Plan — [Today's Date, Day of Week]

## Today's Meetings
- [Time] — [Meeting] with [people] ([prep needed?])
- [Time] — [Meeting] with [people]
- Deep work windows: [gaps]

## Top 3 Focus Items
1. [Most important thing today — tied to weekly/quarterly goals]
2. [Second priority]
3. [Third priority]

## Also On the Radar
- [Lower priority items]
- [Quick tasks that can fill gaps]

## Decision Reviews Due
- [Any pending reviews]

## Signal
[One-line AI/tool signal if available]
```

### Prioritisation Logic

Rank focus items by:
1. **Deadline pressure** — what's due soonest?
2. **Goal alignment** — what moves quarterly goals forward?
3. **Blocking others** — what's someone else waiting on?
4. **Energy match** — suggest deep work for morning, admin for afternoon (adjust to user's patterns)

### The Question

After presenting the plan, ask:

"Does this feel right for today? Anything to add, cut, or reprioritise?"

If they adjust, update the plan. If they're good, save it.

## Saving

- Save to `00-Inbox/Daily_Plans/YYYY-MM-DD.md`
- If yesterday's plan exists, check for incomplete items and carry them forward (flag them: "Carried from yesterday")

## Tone

Morning energy. Brief. Actionable. Not overwhelming.

"Good morning. Here's your day."

Not: "Here is a comprehensive overview of today's scheduled activities and prioritised action items."

## End With

"You've got [N] meetings and [N] focus items. Your best deep work window is [time range]. Make it count."
