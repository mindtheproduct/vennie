---
name: talk
description: Prepare conference talks from outline to CFP submission
context: main
tags: [brand]
integrations: []
---

# Conference Talk Preparation

Help the user build a conference talk — from a vague idea to a polished outline and CFP submission.

## How to Start

"What do you want to talk about? Rough idea is fine — we'll shape it."

Then dig in:
- "Who's the audience? (Developers, PMs, designers, mixed?)"
- "What level? (Intro, intermediate, advanced?)"
- "What's the one thing you want people to remember walking out?"
- "Do you have a conference in mind, or building a general talk?"

## Building the Talk

### Find the Angle

Every good talk needs a fresh angle. Help them find it:

- "What do you know about this topic that most people don't?"
- "What's the contrarian take? What does the industry get wrong?"
- "What's the story? (Talks without stories are lectures. Lectures are boring.)"

Pull from their vault:
- `03-Decisions/` — decisions with interesting reasoning make great talk material
- `06-Evidence/` — real examples and metrics add credibility
- `04-Projects/` — project war stories are audience favorites

### Structure

Use this framework (adapt as needed):

1. **Hook (2 min):** Start with a story, a surprising stat, or a provocative question. NOT "Hi, I'm [name] and I work at [company]." Nobody cares yet. Make them care first.

2. **The Problem (5 min):** Set up the tension. What's broken? What's hard? What does the audience struggle with?

3. **The Framework/Insight (10-15 min):** Your core content. The thing they came to learn. Structure it in 3 parts (audiences remember 3 things, not 7).

4. **Real Example (5 min):** Show, don't tell. Walk through a real case from your work. Warts and all — audiences trust speakers who show failures.

5. **Application (3 min):** "Here's how you can use this Monday morning." Make it practical.

6. **Close (2 min):** Callback to the opening hook. Don't end with Q&A — end with your strongest moment.

### The Abstract (for CFP submissions)

A good abstract:
- Opens with the problem the audience faces (not what you'll cover)
- Promises specific, actionable takeaways
- Shows credibility without bragging
- Is 150-250 words (most CFPs have limits)

Template:
```
[Problem statement — the pain the audience knows]

[What you learned / discovered / built that addresses it]

In this talk, you'll learn:
- [Takeaway 1 — specific and actionable]
- [Takeaway 2]
- [Takeaway 3]

[One line of credibility — why you're the right person to give this talk]
```

Write 2-3 abstract variants — different angles on the same talk. Some CFP reviewers respond to different hooks.

## Cross-Reference

Check for relevant CFPs:
- "Any conferences coming up in your space?"
- If they mention a specific conference, research deadlines and themes
- "mtpcon has an open CFP — want me to draft a submission?"

## Output

```markdown
# Talk: [Title]
**Speaker:** [user]
**Duration:** [length]
**Audience:** [who]
**Status:** Draft

## Abstract
[CFP-ready abstract]

## Outline
### 1. Hook
[What you'll open with]

### 2. The Problem
[Setup and tension]

### 3. Core Content
#### Part A: [subtitle]
#### Part B: [subtitle]
#### Part C: [subtitle]

### 4. Real Example
[The story you'll tell]

### 5. Application
[Practical takeaways]

### 6. Close
[How you'll end]

## Key Stories / Examples
[Specific anecdotes and data points to reference]

## Slide Notes
[Rough notes for key slides]
```

## Saving

- Save to `07-Brand/Talks/YYYY-MM-DD-[title].md`
- Save abstract variants separately if drafting for CFP

## End With

"Outline saved. The strongest part of this talk is [X]. If you only have time to rehearse one section, rehearse the opening — nail the first 2 minutes and the audience is yours for the rest."
