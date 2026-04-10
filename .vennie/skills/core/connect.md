---
name: connect
description: Set up MCP integrations with guided configuration
context: main
tags: [system]
integrations: []
---

# MCP Connection Setup

Connect external tools to Vennie via MCP servers. Each connection gives Vennie access to data and actions in that tool.

## Commands

### `/connect` — Show All Integrations

Display available integrations and their status:

```
## Connected
- [tool] — last synced [date], [status]

## Available
- Jira — project tracking, sprint data, ticket management
- Linear — issue tracking, project updates, cycle data
- Slack — messages, channels, threads (read-only by default)
- GitHub — repos, PRs, issues, commits
- Google Calendar — events, scheduling
- Notion — pages, databases
- Figma — files, components, comments

## Not Yet Supported
- [tools on the roadmap]

Run `/connect [tool]` to set up a new connection.
```

### `/connect [tool]` — Guided Setup

For each tool, walk through:

**1. Explain What Vennie Will Access**
Be transparent:
- "Connecting Jira gives Vennie read access to your projects, sprints, and tickets. Vennie can also create and update tickets on your behalf."
- "Connecting Slack gives Vennie read access to channels you're in. No write access by default."
- Explain data privacy: "Data stays local. Vennie uses MCP to talk to [tool]'s API — nothing is sent to third parties."

**2. Gather Credentials**
Guide through whatever auth the tool needs:
- API token generation (with step-by-step instructions and links)
- OAuth flow (if supported)
- Workspace/instance URL
- Any required scopes or permissions

Be specific: "Go to [URL] → Settings → API Tokens → Create New Token with these scopes: [list]"

**3. Configure**
- Store configuration in `.vennie/mcp/[tool].yaml`
- Never store raw API tokens in yaml — use environment variables or a secrets manager
- Set up the MCP server entry in the appropriate config

**4. Test the Connection**
- Make a simple read request to verify it works
- "Connected! I can see [N] projects in your Jira instance."
- If it fails, diagnose and help fix: "Auth failed — double-check your API token has [scope] permission."

**5. Initial Sync (if applicable)**
- "Want me to pull in your current [projects/issues/etc]? This helps me understand your work context."
- Sync to appropriate vault locations

## Tool-Specific Guides

### Jira
- Needs: instance URL, email, API token
- Token URL: https://id.atlassian.com/manage-profile/security/api-tokens
- Scopes: read:jira-work, write:jira-work (optional)
- Syncs: projects, sprints, tickets assigned to user

### Linear
- Needs: API key
- Token URL: Linear Settings → API → Personal API Keys
- Syncs: issues, projects, cycles

### Slack
- Needs: workspace URL, user token or bot token
- Read-only by default for safety
- Syncs: recent messages from specified channels

### GitHub
- Needs: personal access token
- Token URL: GitHub Settings → Developer Settings → Personal Access Tokens
- Scopes: repo (read), issues (read/write)
- Syncs: repos, PRs, issues

### Google Calendar
- Needs: OAuth setup
- Guide through Google Cloud Console credentials
- Syncs: today's and upcoming events

## Managing Connections

- **Status check:** `/connect` shows all connections and their health
- **Disconnect:** "Disconnect [tool]" — removes config, confirms deletion
- **Update credentials:** "Update [tool] connection" — re-auth without losing config
- **Troubleshoot:** If a connection fails, diagnose common issues (expired tokens, permission changes, API limits)

## Saving

- Configs saved to `.vennie/mcp/[tool].yaml`
- Connection status tracked in `.vennie/config/connections.yaml`

## End With

"[Tool] is connected and working. Here's what I can do with it now: [list 2-3 practical examples]. Try asking me something about your [tool] data."
