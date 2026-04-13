---
name: commitments
description: View, manage, and add commitments — things you owe others and things others owe you
context: main
tags: [system, accountability]
integrations: []
---

# Commitment Tracker

Show the user their open commitments and help them stay accountable.

## What To Show

### 1. Overdue Commitments (if any)

Show overdue items first, highlighted. For each:
- What was committed to
- Who it involves (if anyone)
- How many days overdue
- Where it was detected (conversation, meeting, etc.)

### 2. Open Commitments — Yours

Things the user has committed to doing. Sorted by:
1. Due date (soonest first)
2. Detection date (newest first)

For each, show: the commitment text, person involved, due date (or "no date"), and how old it is.

### 3. Open Commitments — Others

Things other people committed to doing for/with the user. Same format.

### 4. Quick Actions

After showing the list, offer:
- **Mark done:** "Done with #3" or "Mark 1, 4, 5 as complete"
- **Add new:** "Add commitment: send pricing doc to Sarah by Friday"
- **Clear stale:** "Drop #7 — no longer relevant"

Number each commitment so the user can reference them easily.

## Quick Add Format

If the user says something like:
- "Add commitment: send Sarah the pricing doc by Friday"
- "Track: Brett will review the proposal by next Monday"

Parse the commitment, detect owner (self vs other), extract person and due date, and save it.

## Stats (if asked)

If the user asks for stats or says `/commitments stats`:
- Total commitments in the last 30 days
- Completion rate
- Average time to complete
- Most frequent people involved
- Overdue count

## Tone

Be warm and helpful, not naggy. The goal is accountability, not guilt.
- "3 open commitments, 1 overdue. Here's where things stand:"
- Not: "WARNING: You have overdue commitments!"
