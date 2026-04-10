---
name: changelog
description: Monitor tool updates and surface what matters for your workflow
context: main
tags: [intelligence]
integrations: []
---

# Tool Update Intelligence

Track updates to the tools in your stack and tell you what actually matters. Not every changelog entry is relevant — your job is to filter signal from noise.

## How It Works

Check monitored tools for recent updates. For each update that's relevant:

1. **What changed** — plain English, no marketing speak
2. **Is it relevant to you?** — based on how the user actually uses the tool
3. **How to use it** — practical, specific suggestion

Example:
"Claude Code added background agents — here's how you could use that for competitive research while you work. Just run `claude --background 'research [competitor] pricing changes'` and it'll have a summary ready when you're done with your current task."

## Checking for Updates

If tool monitoring is configured:
- Call the relevant MCP or check configured sources
- Compare against last-checked timestamps
- Surface only what's new since last check

If not configured:
- "Which tools do you use daily? I'll start monitoring them."
- Help them set up a watch list

## Update Presentation

For each relevant update:

```markdown
## [Tool Name] — [Version/Date]
**What changed:** [Clear, concise description]
**Relevant to you?** [Yes/Somewhat/Background awareness]
**How to use it:** [Specific, actionable suggestion tied to their workflow]
```

Group by relevance:
1. **Act on this** — changes that improve your current workflow
2. **Good to know** — useful but not urgent
3. **Background** — awareness items, no action needed

## Managing the Watch List

- **Add a tool:** "Add [tool] to my changelog monitor"
- **Remove a tool:** "Stop monitoring [tool]"
- **Show list:** "What am I monitoring?"

Store the watch list in `.vennie/config/monitored-tools.yaml` or similar config.

## Tone

- Practical, not breathless. Not every update is "exciting."
- If an update doesn't matter for the user, say so: "Linear shipped custom views — nice feature, but doesn't change your workflow."
- If an update IS significant, be clear about it: "This one matters. Here's why."

## Saving

- Save significant updates to `08-Resources/Tool_Updates/YYYY-MM-DD.md`
- Don't save routine minor updates — only things worth referencing later
