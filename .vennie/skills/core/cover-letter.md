---
name: cover-letter
description: Generate authentic cover letters tailored to specific roles
context: main
tags: [career, brand]
integrations: []
---

# Cover Letter Generator

Write a cover letter that sounds like the user, not like a template. A good cover letter does one thing: makes someone want to read your resume.

## Requirements

You need two things:
1. **Job posting** — URL or pasted text
2. **Resume context** — from `08-Resources/` or generated via `/resume`

If either is missing, ask for it. Don't write a generic cover letter — that's worse than no cover letter.

## Parse the Job Posting

Extract:
- Company name, role, team
- Key requirements (must-haves vs nice-to-haves)
- Company values or culture signals
- Problems they're trying to solve (read between the lines)
- Hiring manager name if visible

## Build the Letter

### Opening (2-3 sentences)
- Don't start with "I am writing to express my interest in..." — that's dead on arrival
- Start with WHY this role at THIS company. What specifically drew you?
- Be specific. "I've been following your work on [X]" beats "I'm excited about your mission"
- If you have a connection to the company (used the product, know someone, attended their talk), lead with it

### Body (2-3 paragraphs)
- Map your strongest evidence to their top requirements
- Tell a brief story, not a list. The resume has the list.
- Show you understand THEIR problem and explain how you solve it
- Pull from `06-Evidence/` for concrete examples with metrics
- One paragraph on what you've done. One on why it matters for them.

### Close (2-3 sentences)
- Specific about next steps ("I'd love to discuss how my experience with [X] could help your team with [Y]")
- Confident but not arrogant
- No "I look forward to hearing from you" — it's filler

## Voice

Use `voice.yaml` if trained. The cover letter should sound like the user at their most articulate — not stiff, not casual, just authentic and clear.

If no voice training: write in a professional-but-human tone. No corporate speak. No AI tell-phrases.

## Things to Avoid

- Starting every paragraph with "I"
- Rehashing the resume — the letter complements it, doesn't repeat it
- Being generic — if you could send this to 10 companies unchanged, it's bad
- Over-explaining gaps or weaknesses — save that for the interview
- Being longer than one page. 300-400 words is ideal.

## Output

Present the cover letter as clean text, ready to paste.

Also provide:
- **Match analysis:** How well the user's evidence maps to the role requirements
- **Interview prep note:** "They'll probably ask about [X] — here's your best story for that"

## Saving

- Save to `08-Resources/Cover_Letters/YYYY-MM-DD-[company]-[role].md`

## End With

"Cover letter saved. It leads with your [strongest hook] and maps directly to their need for [key requirement]. Read it out loud once — if any sentence sounds like AI wrote it, flag it and I'll rewrite it in your voice."
