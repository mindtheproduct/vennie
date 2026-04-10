# Vennie

**Your AI Product Operating System**

An AI-native CLI that makes product managers superhuman. Built by [Mind the Product](https://mindtheproduct.com).

<!-- Demo GIF here -->

---

## What is Vennie?

Vennie is a terminal-based AI agent built specifically for product people. It's not a wrapper around ChatGPT — it has its own agent loop, local vault, tool system, and 28 built-in skills. It remembers your career, your stakeholders, your decisions, and how you think.

- **Zero-prompt value** — open Vennie and your day is already triaged. Morning brief, priority focus, pending decisions. No typing required.
- **Stakeholder simulation** — `/simulate Sarah Chen` and Vennie roleplays as Sarah, using her actual meeting history and communication style from your vault.
- **Decision pattern analysis** — after 50 decisions, Vennie tells you your biases: "You consistently choose speed over thoroughness."
- **Career compound interest** — ship a feature, it flows to evidence, to STAR stories, to your resume, to interview prep. Automatic.
- **Product sense gym** — daily PM exercises that build judgment, not just productivity. 50+ scenarios with streak tracking.
- **Competitive radar** — track competitors, scan for changes, surface intel during strategy sessions.
- **Writing in your voice** — voice-trained content for LinkedIn, PRDs, stakeholder updates that sounds like you wrote it.
- **Everything local** — your data stays on your machine. No cloud. No accounts.

## Quick Start

```bash
# Install globally
npm install -g vennie

# Set up your API key
vennie setup

# Create your vault and start
vennie init
```

### One-command install (macOS / Linux)

```bash
curl -fsSL https://vennie.ai/install | bash
```

### Requirements

- **Node.js 18+**
- **Anthropic API key** ([get one here](https://console.anthropic.com/settings/keys))
- **Python 3.8+** (optional, for MCP server integrations)

## Commands

### Built-in

| Command | What it does |
|---------|-------------|
| `/brief` | Morning brief — your day triaged before you type |
| `/simulate <name>` | Roleplay a real stakeholder from your vault |
| `/patterns` | Analyse your decision-making patterns and biases |
| `/challenge <plan>` | Adversarial "what am I missing?" from 5 angles |
| `/who knows about <topic>` | Find expertise across your network |
| `/radar` | Competitive intelligence radar |
| `/gym` | Product sense training exercise |
| `/shipped <what>` | Capture a shipment → career evidence pipeline |
| `/career` | View career timeline and skill matrix |
| `/log <type> <text>` | Quick capture: decision, win, idea, or note |
| `/search <query>` | BM25 keyword search across your vault |
| `/think` | Toggle extended thinking (deeper reasoning) |
| `/model` | Switch between Sonnet, Opus, and Haiku |
| `/persona` | Browse and activate PM personas |

### Skills (28 built-in)

| Skill | What it does |
|-------|-------------|
| `/daily-plan` | Plan your day with priorities and context |
| `/coach` | Career coaching — growth edges, blind spots, trajectory |
| `/prd` | Write a PRD through conversation |
| `/linkedin` | Draft posts in your trained voice |
| `/landscape` | Map the competitive landscape |
| `/strategy` | Market analysis and positioning |
| `/decision` | Log and structure a decision |
| `/wins` | Capture career wins and achievements |
| `/meeting-prep` | Prep for any meeting with full context |
| `/process-meetings` | Process meeting notes → people pages, actions, projects |
| `/weekly-review` | Reflect on the week |
| `/news` | Today's product/AI signal |
| `/voice train` | Teach Vennie your writing style |
| `/resume` | Build your resume from accumulated evidence |
| `/interview-prep` | Practice with realistic scenarios |
| `/1on1` | Prep for manager check-ins |

And 12 more — run `/help` to see all.

## What Happens Under the Hood

Vennie has an **intelligence layer** that works silently:

- **Auto-context injection** — every message is enriched with relevant people, projects, and decisions from your vault. Vennie knows who Sarah is, what the API migration status is, and what you decided last week about pricing — without you mentioning any of it.
- **Intent detection** — say "I need to prep for my meeting with Sarah" and Vennie suggests `/meeting-prep` automatically. No need to memorise commands.
- **Session memory** — conversations are summarised and persisted. Next time you open Vennie, it remembers what you discussed yesterday.
- **Persona memory** — each PM persona accumulates observations about you. After 10 sessions, the Growth PM persona knows your recurring blind spots.
- **Prompt caching** — system prompts are cached for ~90% cost reduction on multi-turn conversations.

## Architecture

```
vennie/
├── bin/vennie.js          # CLI entry point
├── src/
│   ├── app.js             # Ink (React for terminals) UI
│   ├── agent.js           # Claude agent loop with streaming
│   ├── tools.js           # Built-in tools (Read, Write, Bash, etc.)
│   ├── skills.js          # Skill loader
│   ├── mcp.js             # MCP server manager
│   ├── suggestions.js     # Contextual suggestion engine
│   ├── intent.js          # Natural language → skill detection
│   ├── search.js          # BM25 vault search with caching
│   ├── memory.js          # Session memory persistence
│   ├── persona-memory.js  # Per-persona observation accumulation
│   ├── morning-brief.js   # Auto-generated morning brief
│   ├── stakeholder-sim.js # Stakeholder roleplay from vault data
│   ├── decision-patterns.js # Decision history analysis
│   ├── auto-context.js    # Automatic vault context injection
│   ├── network-recall.js  # Expertise search across people
│   ├── competitive-radar.js # Competitor tracking
│   ├── product-gym.js     # PM training exercises
│   ├── ship-to-story.js   # Career evidence pipeline
│   └── vault-pulse.js     # Vault stats and quick capture
├── .vennie/
│   ├── skills/            # Built-in skills (28 markdown files)
│   ├── personas/          # PM personas (7 archetypes)
│   └── mcp/               # MCP server configs
├── vault-template/        # Template for new vaults
├── VENNIE.md              # System prompt
└── package.json
```

## Privacy

- All data stored locally in your vault folder
- No accounts, no cloud sync
- Your Anthropic API key is stored in `~/.config/vennie/env` (not in the vault)
- Anonymous telemetry is opt-out — disable with one command

## Contributing

Vennie is open source. Contributions welcome.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `vennie doctor` to verify
5. Submit a pull request

**Areas where we'd love help:**
- New PM personas for the marketplace
- MCP integrations for product tools (Jira, Linear, Figma)
- Skills for specific product workflows
- Translations and localisation

## License

CC BY-NC 4.0 — free for personal and non-commercial use. See [LICENSE](LICENSE) for details.

---

Built by [Mind the Product](https://mindtheproduct.com). The product management community of 300,000+ product people worldwide.

[vennie.ai](https://vennie.ai) | [GitHub](https://github.com/mindtheproduct/vennie) | [Mind the Product](https://mindtheproduct.com)
