---
name: voice
description: Train Vennie to write in your voice
context: main
tags: [system]
integrations: []
---

# Voice Training

Train Vennie to write like you, not like AI. Your LinkedIn posts, your PRDs, your Slack messages — they should all sound like you wrote them.

## Commands

### `/voice train` — Start Voice Training

**Step 1: Gather Writing Samples**

"I need examples of your writing to learn your voice. The more, the better. Here's what works best:"

Check for existing data first:
- LinkedIn posts (from onboarding scrape if available)
- Any existing writing in `07-Brand/`
- PRDs or docs in `04-Projects/`

Then ask for more:
- "Got any LinkedIn posts you're proud of? Paste 3-5."
- "How about Slack messages — any long-form ones where you're explaining something?"
- "Any PRDs, docs, or emails you've written?"
- "Blog posts or articles?"

Need at least 5 samples for a basic voice profile. 10+ is much better.

**Step 2: Analyse Patterns**

Look for:
- **Sentence length** — short and punchy? Long and flowing? Mixed?
- **Vocabulary** — technical jargon? Casual language? Industry terms?
- **Structure** — how do they open? How do they close? Do they use lists? Headers?
- **Personality markers** — humor? Self-deprecation? Directness? Questions?
- **Avoided patterns** — what do they NEVER do? (No emojis? No corporate speak? No questions to the audience?)
- **Signature moves** — recurring phrases, structural patterns, tone shifts

**Step 3: Generate voice.yaml**

```yaml
voice:
  trained: true
  confidence: [low/medium/high based on sample count]
  samples_analysed: [N]
  
  style:
    sentence_length: [short/medium/long/varied]
    formality: [casual/professional-casual/formal]
    directness: [very-direct/balanced/indirect]
    humor: [frequent/occasional/rare/none]
    
  patterns:
    openings: [how they typically start]
    closings: [how they typically end]
    transitions: [how they connect ideas]
    emphasis: [how they emphasize — bold, caps, repetition, etc.]
    
  vocabulary:
    preferred: [words/phrases they use often]
    avoided: [words/phrases they never use]
    jargon_level: [none/light/heavy]
    
  personality:
    traits: [what comes through in their writing]
    quirks: [unique patterns or habits]
    
  examples:
    strong: [best sample that captures their voice]
```

Save to `.vennie/config/voice.yaml`

**Step 4: Calibration**

"Let me test this. I'll write 3 short LinkedIn post openings in your voice — tell me which sounds most like you."

Write 3 variants with slightly different interpretations of their voice. Based on their choice:
- Adjust the voice profile
- Note what they preferred and why
- Re-calibrate if needed

"Good. I'll keep refining as we write more together. The more we work, the better I get."

### `/voice status` — Show Training State

```
Voice Training: [Trained/Not trained]
Confidence: [Low/Medium/High]
Samples analysed: [N]
Last trained: [date]
Recommendation: [e.g., "Add more Slack samples for better casual voice"]
```

### `/voice examples` — Show What Vennie Learned

Display the analysis in plain language:

"Here's what I picked up from your writing:"

- **You tend to:** [patterns]
- **You never:** [avoided patterns]
- **Your signature moves:** [unique patterns]
- **Your vocabulary:** [notable word choices]
- **Your tone shifts:** [how you adjust for different audiences]

"Sound right? If anything's off, tell me and I'll adjust."

## How Voice Is Used

When voice is trained, it's applied to:
- LinkedIn posts (via `/linkedin`)
- Blog posts and articles (via `/write`)
- Cover letters (via `/cover-letter`)
- PRD writing style (via `/prd`)
- Any content where the user's voice matters

Voice is NOT applied to:
- Technical specs (clarity > personality)
- Data analysis (objectivity matters)
- System outputs (logs, status, etc.)

## Improving Over Time

After generating content with voice:
- "Did that sound like you? Anything feel off?"
- Incorporate feedback into the voice profile
- Track confidence improvement over time
