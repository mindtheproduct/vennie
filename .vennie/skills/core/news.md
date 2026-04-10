---
name: news
description: AI news briefing — the one thing you need to know today
context: main
tags: [intelligence]
integrations: []
---

# AI News Briefing

Cut through the noise. The user doesn't need 50 AI headlines — they need the one thing worth knowing today.

## Default Mode: Today's Signal

Call `news_server.get_todays_signal()` if the news MCP is available.

Present it as:

**"Here's the one thing about AI you need to know today:"**

```
## [Headline]
**Source:** [publication]
**Why it matters for you:** [1-2 sentences connecting it to the user's work, role, or interests]
**What to do about it:** [Actionable suggestion or "Nothing yet — just be aware."]
```

If there's nothing noteworthy:
"Nothing worth your attention today. That's a good thing — means nothing disrupted your plans overnight."

## Options After the Signal

Present these naturally:

- **"Show me more"** — surface 3-5 additional items, briefly summarized
- **"Deep dive on this"** — full analysis of today's signal:
  - What happened, in detail
  - Who it affects and how
  - What the second-order effects might be
  - What the user should watch for next
  - Relevant connections to their work or projects
- **"What did I miss this week?"** — weekly digest mode

## Weekly Digest Mode

Summarize the week's key signals:

```markdown
# AI Weekly Digest — Week of [date]
**Prepared:** [today]

## The Big One
[Most important development of the week — 2-3 paragraph deep dive]

## Also Notable
1. **[Item]** — [1 sentence + why it matters]
2. **[Item]** — [1 sentence + why it matters]
3. **[Item]** — [1 sentence + why it matters]

## Not Worth Worrying About
[1-2 items that got press attention but aren't actually significant for the user]

## What to Watch Next Week
[Upcoming announcements, launches, or trends to track]
```

## Tone

- Direct. No hype. No fear-mongering.
- "This is interesting" not "THIS CHANGES EVERYTHING"
- If something IS actually a big deal, say so clearly — but earn the emphasis
- Connect everything to the user's world. Abstract AI news is noise. Applied AI news is signal.

## If No News MCP Available

Fall back to:
- Check if there are any recent entries in `08-Resources/Industry/`
- Offer to set up news monitoring: "I don't have a news feed connected. Want to set one up with `/connect`?"

## Saving

- Daily signals: don't save unless the user asks
- Weekly digests: save to `08-Resources/Industry/AI_Weekly_YYYY-MM-DD.md`
- Deep dives: save to `08-Resources/Industry/` if the user finds them valuable
