---
name: user-interview-prep
description: Prepare user research interviews through forcing questions about what you actually need to learn
context: main
tags: [product, research]
integrations: []
---

# User Interview Prep

Most user interviews are wasted. Not because the PM asked bad questions — because they didn't know what decision the research was supposed to inform. They walk in with a vague sense of "learn about the user" and walk out with a vague sense of "that was interesting." Nothing changes.

This skill fixes that. Before you write a single interview question, you answer four forcing questions about the research itself. Then we build the guide.

## How to Start

"What are you trying to learn? Not 'about the user' — what specific thing do you need to understand that you don't right now?"

If they give you a research topic, push for the decision behind it:

"OK, you want to understand [topic]. What decision will that understanding inform? What are you going to do differently based on what you hear?"

## The Four Forcing Questions

### 1. What Decision Will This Research Inform?

"Be specific. What will you decide — or decide differently — based on these interviews?"

**Why this matters:** Research without a decision is tourism. It feels productive but produces nothing actionable. If they can't name the decision, they're not ready to do interviews. They might need to think more first, and that's fine.

**Go deeper if needed:**
- "If the interviews told you [outcome A], what would you do? What about [outcome B]?"
- "Who is waiting on this research to make a call?"
- "What happens if the interviews are inconclusive? What's your fallback?"

### 2. What Do You Currently Believe?

"What's your hypothesis? What do you think is true right now, before talking to anyone?"

**Why this matters:** Every researcher has a bias. The honest ones name it upfront. By articulating the hypothesis, you create something the interviews can challenge. Without it, confirmation bias runs silently and you only hear what you expect.

**Go deeper if needed:**
- "How confident are you in that belief? Where did it come from?"
- "What would you need to hear to change your mind?"
- "If you're right, does that change what questions you'd ask?"

### 3. If the Interviews Contradict Your Hypothesis, What Would You Do Differently?

"Imagine every single person you interview says the opposite of what you expect. What changes?"

**Why this matters:** If the answer is "nothing would change," don't do the interviews. This question tests whether the research has actual stakes. If contradictory evidence wouldn't alter the plan, the decision has already been made and the interviews are performance.

**Go deeper if needed:**
- "Would you actually change course, or would you explain away the data?"
- "What would it take — how many people saying the same thing — for you to reverse your assumption?"
- "Is there a version of the findings that would make you uncomfortable? That's probably what you need to listen for."

### 4. Who Are You NOT Talking To?

"Who might have a completely different perspective that you're not including in this research?"

**Why this matters:** Selection bias kills research. PMs talk to their most accessible users, their most vocal users, or their most friendly users. The people who don't respond to interview requests, who already churned, or who use the product differently than expected — those are often the most valuable conversations.

**Go deeper if needed:**
- "Are you only talking to power users? What about people who signed up and never came back?"
- "Are you only talking to people who match your hypothesis? What about the edge cases?"
- "Is there a segment you're avoiding because the conversation would be harder?"

## Building the Interview Guide

Once the forcing questions are answered, build a guide structured for actual conversation — not a survey read aloud.

### Opening (5 minutes)

Warm-up questions that build rapport and establish context. These aren't throwaway — they set the tone and give you background that makes later questions richer.

- "Tell me about your role — what does a typical week look like?"
- "How does [product/domain] fit into your work?"
- "Walk me through the last time you [relevant activity]."

**The golden opener:** "Tell me about the last time you..." — this gets specific stories, not hypothetical answers.

### Core Questions (20 minutes)

Tied directly to the research goal and hypothesis. Open-ended, non-leading, anchored in past behavior not future speculation.

Generate 5-7 core questions based on:
- The decision the research informs
- The hypothesis being tested
- The user segment being interviewed

**Structure each question:**
```
**Question:** [Open-ended question about past behavior]
**What you're listening for:** [The signal that matters]
**Follow-up probe:** [If the answer is surface-level]
**Red flag:** [Answer that might indicate confirmation bias]
```

**Core question principles:**
- Ask about the past, not the future. "Tell me about the last time..." not "Would you ever..."
- Ask about behavior, not opinions. "What did you do?" not "What do you think about?"
- Ask about specifics, not generalities. "Walk me through Tuesday" not "How do you usually..."

### Follow-Up Probes (Use Throughout)

Pre-loaded probes for when answers are too surface-level:

- "Tell me more about that."
- "What happened next?"
- "How did that make you feel?" (use sparingly — but it works)
- "You said [exact phrase] — what did you mean by that?"
- "Was that typical, or was something different about that time?"
- "What would have made that easier?"
- "Who else was involved? What was their experience?"

### Questions to AVOID

Generate a short list of questions the interviewer should NOT ask, specific to this research:

- **Leading questions:** "Don't you think [feature] would help?" — puts the answer in their mouth
- **Yes/no questions:** "Do you like the current experience?" — gets a one-word answer and kills the conversation
- **Hypotheticals:** "Would you use a feature that..." — people are terrible at predicting their own behavior
- **Compound questions:** "How do you feel about X and what would you change about Y?" — they'll only answer one
- **Solution pitches disguised as questions:** "What if we built [your idea]?" — you're selling, not learning

### Closing (5 minutes)

- "Is there anything I didn't ask about that you think is important?"
- "Who else should I talk to about this?" (referral — often your best leads)
- "Can I follow up if I have questions after reviewing my notes?"

## Research Tips (Include in Output)

End the guide with practical reminders:

- **The best interview question is silence.** After they answer, wait 3 seconds. They'll often add the most important thing.
- **Record if you can.** Ask permission. Notes are lossy. Recordings let you catch things you missed.
- **Write your key takeaways within 30 minutes.** Memory degrades fast. The insight you don't write down is the one you'll forget.
- **Look for surprises, not confirmations.** If everything they said matches your hypothesis, you either got lucky or you were listening selectively.
- **5 interviews is usually enough.** You'll start hearing patterns by interview 3. If interview 5 still surprises you, do 3 more.

## Output Format

```markdown
# User Interview Guide: [Research Topic]
**Researcher:** [user's name]
**Date:** [today]
**Decision this informs:** [from Question 1]
**Hypothesis:** [from Question 2]

## Interview Setup
- **Target participants:** [who, how many, from which segments]
- **Duration:** [suggested length]
- **Format:** [remote/in-person, recorded/not]

## Opening Questions
[3-4 warm-up questions]

## Core Questions
[5-7 questions with probes and listening-for notes]

## Follow-Up Probes
[Reusable probes for going deeper]

## Questions to Avoid
[3-5 specific anti-patterns for this research]

## Closing
[Wrap-up questions]

## Analysis Plan
- **What confirms the hypothesis:** [specific signals]
- **What contradicts the hypothesis:** [specific signals]
- **What would be surprising:** [unexpected findings to watch for]
- **Blind spots to watch for:** [from Question 4 — who we're not talking to]

## Research Tips
[Practical interview reminders]
```

## Saving

- Save to `04-Projects/[project-name]/Interview_Guide_YYYY-MM-DD.md` if project exists
- Otherwise save to `00-Inbox/Ideas/YYYY-MM-DD-interview-guide-[topic].md`
- Save as artifact (type: `prep_doc`, skill: `user-interview-prep`)

## End With

"Your guide is ready. Remember: the interview is about them, not your idea. If you catch yourself explaining or selling, stop and ask another question. The most valuable thing they'll say is probably something you didn't expect to hear. Good luck."
