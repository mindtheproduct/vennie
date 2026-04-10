---
name: weekly-review
description: Review the week — what shipped, what didn't, wins, and next week's focus
context: main
tags: [system]
integrations: []
---

# Weekly Review

End the week with clarity. Review what happened, capture what matters, and set up next week.

## The Process

### 1. Review the Week

Pull together what happened:

**From daily plans (`00-Inbox/Daily_Plans/`):**
- What was planned vs what actually happened
- Patterns — did anything consistently get pushed?
- "You planned [X] items across the week. [N] got done, [N] carried forward."

**From projects (`04-Projects/`):**
- What moved forward?
- What's stalled?
- Any status changes?

**From decisions (`03-Decisions/`):**
- Decisions made this week
- Decisions due for review

**From tasks (`03-Tasks/`):**
- Completed tasks
- New tasks added
- Overdue items

### 2. Wins Capture

Run the wins capture flow (same as `/wins`):
- "What shipped this week?"
- "Any metrics move?"
- "Anyone say something nice?"
- "Decisions you're proud of?"

Save wins to `06-Evidence/Wins/`

### 3. Reflections

Ask thoughtful questions — not busywork:

- "What was the hardest thing this week? How did you handle it?"
- "Anything you'd do differently?"
- "Any patterns you're noticing? (Good or concerning)"
- "Did you work on the right things, or did urgency hijack your priorities?"

### 4. Review Decision Outcomes

Check for decisions whose review dates are this week or overdue:
- Pull up the original decision
- "How did [decision] play out?"
- Update status: Validated, Revised, or Reversed
- Capture learnings

### 5. Check Goal Progress

Review quarterly goals from `01-Goals/`:
- Progress against key results
- On track / at risk / behind
- "You're [X] weeks into the quarter. Are you [assessment]?"

### 6. Update Personality Model

If you've observed new patterns this week:
- Update `personality-model.md` with new observations
- Only add genuine insights, not routine observations

### 7. Brand Content Suggestions

From this week's wins, suggest potential content:
- "Your [win] could make a good LinkedIn post — the [specific angle] is interesting."
- "The decision around [X] has a good story behind it. Worth a blog post?"

Save suggestions, don't push. Not every week needs content.

### 8. Set Next Week's Focus

Based on everything reviewed:
- "What are your top 3 priorities for next week?"
- Check alignment with quarterly goals
- Flag any upcoming deadlines or events
- Save to `02-Focus/` for next week

## Output

```markdown
# Weekly Review — Week of [date]

## Summary
[2-3 sentence overview of the week]

## Shipped
- [what got done]

## Carried Forward
- [what didn't get done and why]

## Wins Captured
- [N] wins saved to evidence folder

## Decisions Made
- [decisions this week, with links]

## Goal Progress
- [goal status updates]

## Reflections
[Key takeaways from the week]

## Next Week's Focus
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]
```

## Saving

- Save review to `06-Evidence/Learnings/YYYY-WNN-weekly-review.md`
- Update `02-Focus/` with next week's priorities
- Update any project statuses that changed
- Update goal progress in `01-Goals/`

## Tone

Honest but not harsh. This is reflection, not self-flagellation.

"Solid week. You shipped [X] and made progress on [Y]. The thing that kept slipping was [Z] — worth thinking about whether it's actually a priority or just feels like one."

## End With

"Week reviewed. [N] wins captured, [N] decisions logged, next week's focus is set. Enjoy your weekend."
