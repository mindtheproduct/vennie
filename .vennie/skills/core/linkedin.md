---
name: linkedin
description: LinkedIn post writing, profile review, and content strategy
context: main
tags: [brand]
integrations: []
---

# LinkedIn Management

Help the user build their professional brand on LinkedIn. Not cringe corporate content — authentic, useful posts that sound like a human wrote them.

## Sub-Commands

The user might say:
- "Write a post" or "Help me write a LinkedIn post"
- "Review my profile"
- "Content strategy" or "What should I post about?"
- "Improve my headline"

Handle each conversationally.

## Write a Post

**Start with the seed:**
"What do you want to write about? A recent win, a lesson learned, a hot take, something you built?"

If they're stuck, suggest from recent data:
- Recent wins from `06-Evidence/`
- Decisions from `03-Decisions/` that have good stories
- Learnings from `06-Evidence/Learnings/`
- "You shipped [X] last week — there's probably a post in there."

**Drafting principles:**
- Use `voice.yaml` if trained — the post should sound like them, not like AI
- Hook in the first line. LinkedIn truncates after ~3 lines. Make people click "see more."
- One idea per post. Not three.
- Specific beats generic. "I shipped a feature" is boring. "I shipped a feature that 2,000 users tried in the first hour and I watched the error rate spike to 40%" is a story.
- End with engagement, not a question. Questions feel forced. Observations invite conversation.
- No hashtag spam. 3 max, relevant ones only.
- No emojis as bullet points. We're not doing that.

**Structure options:**
- **Story post:** Hook → Context → Tension → Resolution → Takeaway
- **Hot take:** Contrarian statement → Evidence → Nuance → "Here's what I think"
- **Lesson learned:** Situation → What went wrong/right → What I'd do differently
- **Behind the scenes:** What we shipped → How it actually happened → What surprised us

**After drafting:** Present the draft and ask for feedback. Iterate until they're happy. Don't be precious about your first draft.

## Review My Profile

Ask them to paste their profile text or share the URL. Then provide:

**Headline:**
- Is it clear what you do and for whom?
- Does it differentiate you from 10,000 other people with the same title?
- Suggestion: [Role] helping [audience] do [thing] | [Proof point]

**About section:**
- First 3 lines matter most (visible before "see more")
- Should answer: What do you do? Why should I care? What's your angle?
- Personal voice > corporate bio

**Experience:**
- Are entries impact-focused or responsibility-focused?
- "Managed a team of 5" < "Led a team that shipped [X], growing [metric] by Y%"

**Overall impression:**
- Would someone landing here know what you're about in 10 seconds?
- Is there a clear narrative thread?

Be honest. A roast with specific improvements beats a polite "looks good."

## Content Strategy

Generate a 4-week content calendar based on:
- Recent work and wins
- Industry topics they care about
- Skills they want to be known for
- Audience they want to attract

```markdown
# LinkedIn Content Calendar
**Weeks of:** [date range]

## Week 1
- **Post:** [Topic] — [Type: story/take/lesson/BTS]
- **Hook idea:** [First line]

## Week 2...
```

Aim for 1-2 posts per week. Consistency > volume.

## Improve My Headline

Ask about:
- What role they're in
- What they want to be known for
- Who they want to attract (recruiters, peers, customers?)

Generate 3-5 options ranging from safe to bold. Let them pick.

## If a Persona is Active

Filter LinkedIn advice through that persona's lens. Different personas have different brand strategies.

## Saving

- Save drafts to `07-Brand/LinkedIn/YYYY-MM-DD-[topic].md`
- Save content calendar to `07-Brand/LinkedIn/Content_Calendar.md`

## End With

For posts: "Draft saved. Read it once more tomorrow morning before posting — fresh eyes catch weird phrasing."

For profiles: "Here are the 3 changes that'll make the biggest difference, ranked by impact: [list]."
