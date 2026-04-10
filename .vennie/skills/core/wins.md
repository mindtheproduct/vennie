---
name: wins
description: Quick weekly wins capture ritual (2-3 minutes)
context: main
tags: [career]
integrations: []
---

# Weekly Wins Capture

A fast, conversational ritual to capture what went well this week. Takes 2-3 minutes. Builds your evidence trail without feeling like homework.

## The Flow

Keep it light and quick. This isn't a review — it's a capture session.

**Question 1: "What shipped this week?"**
- Features, fixes, launches, docs, processes
- Doesn't have to be code — decisions, conversations, and unblocking others count
- "Even small things. Fixing that CI pipeline counts."

**Question 2: "Any metrics move?"**
- Numbers attached to your work
- User growth, performance improvements, bug reduction, revenue impact
- "Doesn't have to be a hockey stick. 'Reduced page load by 200ms' is a win."

**Question 3: "Anyone say something nice about your work?"**
- Slack messages, email replies, verbal praise, customer feedback
- "Your manager's 'nice work' in standup counts. Capture it."

**Question 4: "Any decisions you made that you're proud of?"**
- Times you chose the harder-but-right path
- Saying no to something, changing direction, making a tough call
- "Decisions are the most underrated career evidence."

**Question 5 (optional): "Anything else worth remembering?"**
- Moments of growth, new skills, stepping outside comfort zone
- Helping someone else succeed

## For Each Win

Auto-generate an evidence entry:

```markdown
## [Win Title]
**Date:** [date or date range]
**Type:** [Shipping / Metrics / Feedback / Decision / Growth]
**Description:** [1-2 sentences]
**Metric:** [if applicable]
**Stakeholders:** [people involved or who noticed]
**Project:** [linked project if applicable]
```

Call `career_server.capture_win()` for each win if the career MCP is available.

Link to relevant people pages in `05-People/` and projects in `04-Projects/`.

## Tone

Keep it upbeat but not cheesy:
- "That's a solid week."
- "The [specific win] is particularly strong — it shows [skill]."
- "Don't undersell the [thing they mentioned casually] — that's real impact."

If they say "nothing happened this week":
- Push gently: "Really? No decisions made? No one unblocked? Nothing shipped?"
- If genuinely quiet week: "Quiet weeks happen. The fact that you're building this habit means the wins pile up fast when things are moving."

## End With

"That's [N] wins this week. Your brag sheet is getting strong."

If notable patterns:
- "You're on a shipping streak — [N] weeks in a row with delivered work."
- "Lots of collaboration wins lately. Worth mentioning in your next 1:1."
- "First metrics-backed win in a while. These are gold for reviews."

## Saving

- Save each win to `06-Evidence/Wins/YYYY-MM-DD-[title-slug].md`
- Or append to a weekly wins file: `06-Evidence/Wins/YYYY-WNN-wins.md`
- Update any related project or person pages
