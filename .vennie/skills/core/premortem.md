---
name: premortem
description: "It's 6 months from now and this project failed. Why?" — forward-looking risk analysis through forcing questions
context: main
tags: [product, strategy]
integrations: []
---

# Premortem

The project shipped. It failed. You're sitting in the retro, looking back at obvious warning signs everyone ignored. That's where we're starting — from the failure, working backwards.

This is different from `/red-team`. Red-team tears apart your plan as it exists now. Premortem makes you live in the future where it already failed and asks you to explain why. It's harder to be defensive about something that "already happened."

## How to Start

Look at conversation context. If a project or initiative is being discussed, use it. If the user invoked `/premortem [topic]`, use that.

If the context isn't clear, ask one question:

"What project or initiative should we do the premortem on?"

Once you have the target, set the scene:

"OK. It's [6 months from today's date]. [Project name] shipped on time. The team executed well. And it failed. Not a catastrophic explosion — just a slow, disappointing fade. Usage is low, stakeholders are frustrated, and someone's asking 'why did we build this?' in the retro. Let's figure out what went wrong."

## The Five Questions

### 1. The Failure Story

"What went wrong? Tell me the story of how this failed."

**Why this matters:** This is intentionally open-ended. Let them narrate a failure scenario in their own words. The first thing they reach for reveals their deepest anxiety about the project. That's signal.

**Follow-up probes:**
- "That's one scenario. What's a completely different way it could fail?"
- "You jumped to a technical failure. What about a people failure?"
- "What if the execution was perfect but the premise was wrong?"

### 2. The Most Likely Reason

"Of everything you just described — pick ONE. The single most likely reason for failure."

**Why this matters:** Lists of risks are comforting because they distribute anxiety. Forcing a single choice concentrates it. The thing they pick tells you where to focus mitigation energy. If they resist picking one, push harder — "You're in the retro. Your VP asks what happened. You have one sentence."

**Follow-up probes:**
- "Why that one over the others?"
- "What makes you think that's not already happening?"
- "If you told your team this was the #1 risk, would they agree or be surprised?"

### 3. The Embarrassing Reason

"Now tell me the embarrassing one. The reason you don't want to say out loud. The one that's about politics, ego, or a truth nobody wants to name."

**Why this matters:** Every project has a hidden failure mode that lives in the space between what people say in meetings and what they say in the hallway after. Maybe the exec sponsor doesn't actually care. Maybe the team doesn't believe in it. Maybe you're building it because a competitor did, not because users need it. This question surfaces what candid conversation can't.

**Follow-up probes:**
- "If you shared that in a team standup, what would happen?"
- "Is anyone else aware of this risk, or is it just you?"
- "What would it take to address this directly?"

### 4. The Early Warning Signs

"If this failure is going to happen, what would you see in the first 2 weeks after launch that would tell you it's starting?"

**Why this matters:** Most failures announce themselves early. Teams just don't know what to look for — or they explain away the early signals. Define the canaries now so they can't be rationalized later.

**Follow-up probes:**
- "What metric would you check on day 3?"
- "What's the difference between 'slow start' and 'actually failing'? Where's the line?"
- "Who would notice first — you, your users, or your stakeholders?"

### 5. The One Thing

"What's one thing you could do THIS WEEK to reduce the biggest risk you identified?"

**Why this matters:** Premortems are useless if they stay theoretical. This question bridges imagination to action. The constraint of "this week" prevents grandiose mitigation plans that never happen.

**Follow-up probes:**
- "Is that the easiest thing or the most impactful thing? Are they the same?"
- "What would it cost you to do that? Time, political capital, awkward conversations?"
- "If you don't do it this week, will you do it at all?"

## Your Style

- **Serious but not grim.** This exercise should feel illuminating, not depressing. You're preventing failure, not predicting it.
- **Challenge comfort.** If their failure story is too mild or too technical, push for the uncomfortable version.
- **Name the avoidance.** If they're dodging Question 3, say so: "You're giving me the safe answer. What's the real one?"
- **Practical above all.** Every insight should connect to something they can actually do.

## If a Persona is Active

The persona shapes which failure modes get the most attention:
- **Growth PM:** Adoption and activation failures, metric misses
- **Craft PM:** UX failures, edge cases, user disappointment
- **Enterprise PM:** Stakeholder failures, political risks, compliance gaps
- **Startup PM:** Market timing, resource exhaustion, premature scaling

## Output

After the five questions, synthesize into a premortem document:

```markdown
# Premortem: [Project Name]
**Date:** [today]
**Timeframe:** 6 months from now

## Failure Scenario
[Narrative summary of how it fails, in their words]

## Risk Register

| # | Risk | Likelihood | Impact | Type |
|---|------|-----------|--------|------|
| 1 | [Most likely failure] | High | [H/M/L] | [execution/adoption/political/market/technical] |
| 2 | [Embarrassing failure] | [H/M/L] | [H/M/L] | [type] |
| 3 | [Other identified risk] | [H/M/L] | [H/M/L] | [type] |

## Early Warning Signs
- **Week 1-2:** [What to watch for]
- **Month 1:** [What to watch for]
- **Month 3:** [What to watch for]

## Mitigations
| Risk | Mitigation | Owner | Timeline |
|------|-----------|-------|----------|
| [#1 risk] | [Specific action] | [User or TBD] | This week |
| [#2 risk] | [Specific action] | [TBD] | [Timeline] |

## The Honest Truth
[One paragraph: the thing this project needs to survive, stated plainly]
```

## Saving

- Save as artifact (type: `analysis`, skill: `premortem`)
- Save to `04-Projects/[project-name]/Premortem_YYYY-MM-DD.md` if the project folder exists
- Otherwise save to `00-Inbox/Ideas/YYYY-MM-DD-premortem-[topic].md`
- If a decision log exists for this project in `03-Decisions/`, link the premortem as context

## Pairs With

- **`/red-team`** — Red-team is "what's wrong with the plan right now." Premortem is "what could go wrong in the future." Use both for comprehensive risk coverage.
- **`/prd`** — Run a premortem on the PRD before sharing it with stakeholders. Better to find the holes yourself.
- **`/office-hours`** — If the premortem surfaces fundamental uncertainty about the problem, pivot to an office-hours session.

## End With

"This isn't pessimism — it's preparation. The one risk I'd lose sleep over: [biggest risk]. The one thing to do this week: [specific action]. Everything else is insurance."
