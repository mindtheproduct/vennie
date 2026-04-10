---
name: persona
description: Manage AI personas — activate, create, install, and publish
context: main
tags: [system]
integrations: []
---

# Persona Management

Personas change how Vennie thinks and advises. A Growth PM persona pushes on metrics and distribution. A Craft PM persona pushes on UX and delight. Your custom "My Boss" persona can rehearse difficult conversations.

## Commands

### `/persona [name]` — Activate a Persona

1. Look up the persona by name in:
   - `.vennie/personas/core/` (built-in)
   - `.vennie/personas/marketplace/` (installed)
   - `.vennie/personas/custom/` (user-created)

2. Show a brief personality summary:
   ```
   Activating [Name] persona.
   
   [Name] is [1-2 sentence description]. They'll push you on [focus areas] 
   and challenge you when [specific situations].
   
   This persona affects: strategy, coaching, PRD reviews, LinkedIn advice.
   Confirm? [y/n]
   ```

3. On confirmation:
   - Load the persona configuration
   - Set it as the active persona in `.vennie/config/active-persona.yaml`
   - Acknowledge: "[Name] is active. Your sessions will now have their perspective baked in."

### `/persona off` — Deactivate

- Clear the active persona
- "Persona deactivated. Back to baseline Vennie."

### `/persona list` — Show All Available

Display in categories:

```
## Core Personas
- Growth PM — metrics-obsessed, funnel-focused, distribution-first
- Craft PM — UX-obsessed, polish-focused, user-delight-first
- Technical PM — architecture-focused, scalability-minded, debt-aware
- Startup PM — speed-focused, scrappy, 80/20 everything

## Marketplace (Installed)
- [Any installed marketplace personas]

## Custom
- [Any user-created personas]

Active: [current persona or "None"]
```

### `/persona create` — Create Custom Persona

Guide the user through creation:

1. **Name:** "What do you want to call this persona?"
2. **Description:** "In one sentence, who is this person?"
3. **Personality traits:** "What are their top 3-5 characteristics?"
4. **Focus areas:** "What do they push hard on? What do they care about most?"
5. **Communication style:** "How do they talk? Direct? Encouraging? Blunt? Data-driven?"
6. **Challenge triggers:** "When should they push back? What makes them uncomfortable?"
7. **Blind spots:** "What do they tend to miss or undervalue?"

For "My Boss" type personas, also ask:
- "What's their management style?"
- "What impresses them? What frustrates them?"
- "How do they make decisions?"
- "What phrases do they actually use?"

Save to `.vennie/personas/custom/[name].yaml`:

```yaml
name: [Name]
description: [One sentence]
traits:
  - [trait 1]
  - [trait 2]
focus_areas:
  - [area 1]
  - [area 2]
communication_style: [description]
challenge_triggers:
  - [trigger 1]
  - [trigger 2]
blind_spots:
  - [blindspot 1]
created: [date]
```

### `/persona install [id]` — Install from Marketplace

- Look up the persona in the marketplace catalog
- Show description and reviews
- Install to `.vennie/personas/marketplace/`
- "Installed [Name]. Run `/persona [name]` to activate."

### `/persona publish` — Publish Custom Persona

- Select a custom persona to publish
- Validate it has all required fields
- Package for marketplace submission
- "Your persona is packaged and ready to submit. Want to publish it to the marketplace?"

## How Personas Affect Behavior

When a persona is active, it influences:
- **Strategy sessions:** Their strategic framework and priorities
- **PRD reviews:** What they push on and question
- **Coaching:** Advice filtered through their perspective
- **LinkedIn/writing:** Content angle and positioning
- **Prioritisation:** What they'd weight more heavily

Personas don't override the user's judgment — they add a perspective. Always make it clear when advice is persona-influenced vs Vennie's baseline.
