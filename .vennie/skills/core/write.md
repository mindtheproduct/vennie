---
name: write
description: Write newsletters, blog posts, articles, and internal docs in your voice
context: main
tags: [brand]
integrations: []
---

# Content Writing

Help the user write long-form content — newsletters, blog posts, articles, internal docs. In their voice, not yours.

## How to Start

Two questions:

1. "What do you want to write about?"
2. "Who's reading it?"

The audience shapes everything. An internal RFC reads differently from a public blog post reads differently from a newsletter to 5,000 subscribers.

Then:
- "What's the one thing you want the reader to walk away thinking?"
- "Do you have a rough outline or are we starting from scratch?"
- "What tone? Technical? Conversational? Authoritative? Vulnerable?"

## Source Material

Pull from the user's vault for substance:
- `03-Decisions/` — decisions make great blog posts ("Why we chose X over Y")
- `06-Evidence/Wins/` — wins with stories behind them
- `06-Evidence/Learnings/` — lessons learned are content gold
- `04-Projects/` — project context for technical content

"You made an interesting decision about [X] last month. That could be a strong blog post — the reasoning behind it is the kind of thing people share."

## Writing Process

**1. Outline First**
- Don't jump to prose. Get the structure right.
- Present the outline, get buy-in, then write.
- Every section should earn its place. If you can't say why a section matters, cut it.

**2. Draft**
- Use `voice.yaml` throughout — match their writing style
- Write the way they talk, not the way AI talks
- Specific > generic. Concrete > abstract. Stories > assertions.
- Short sentences for impact. Longer ones for flow. Mix them.

**3. Feedback Loop**
- Present the draft
- Ask: "What feels right? What feels off? What's missing?"
- Revise based on feedback
- Repeat until they're happy. Don't be precious.

## Content Types

**Blog Post:**
- Hook readers in the first paragraph or lose them
- One core idea, explored thoroughly
- End with something memorable, not a summary

**Newsletter:**
- Personality up front. People subscribe to people, not publications.
- Scannable — headers, bold, short paragraphs
- One call-to-action, not five

**Internal Doc / RFC:**
- Context first. Assume the reader has less context than you think.
- Decision-oriented — what are you proposing and why?
- Acknowledge trade-offs explicitly

**Article / Thought Piece:**
- Needs a fresh angle. "Here's what everyone gets wrong about [X]" is overdone but works when the insight is real.
- Support claims with evidence, not vibes
- Respect the reader's intelligence

## Things to Avoid

- Corporate jargon ("leverage", "synergize", "move the needle" — unless used ironically)
- AI-sounding phrases ("In today's rapidly evolving landscape...")
- Unnecessary hedging ("I think that maybe perhaps...")
- Burying the lead — say the interesting thing first

## Saving

- Blog posts: `07-Brand/Blog/YYYY-MM-DD-[title].md`
- Newsletter: `07-Brand/Newsletter/YYYY-MM-DD-[title].md`
- Talks/presentations: `07-Brand/Talks/YYYY-MM-DD-[title].md`
- Internal docs: wherever makes sense for the project

## End With

"Draft saved to [path]. Before you publish: read the first paragraph out loud. If it doesn't hook you, rewrite it. The rest of the piece is strong — the opening is what determines if anyone reads it."
