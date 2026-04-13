# Vennie

**The AI Product Career Operating System**

An AI-native CLI + desktop app that makes product managers superhuman. Not a chatbot — a system that learns how you think, tracks what you commit to, and makes you better at your job every week. Built by [Mind the Product](https://mindtheproduct.com).

<!-- Demo GIF here -->

---

## What is Vennie?

Vennie is an AI agent built specifically for product people. It has its own agent loop, local vault, tool system, and 35+ built-in skills. It remembers your career, your stakeholders, your decisions, and how you think — and it gets smarter with every session.

Available as a **terminal CLI** or a **native desktop app** (macOS, Windows, Linux).

### What makes it different from Claude Code / ChatGPT?

| | Claude Code | Vennie |
|---|---|---|
| **Memory** | Starts fresh each session | Accumulates learnings across 100+ sessions |
| **Accountability** | Answers when asked | Follows up when you don't ("You promised Sarah the pricing doc 5 days ago") |
| **Career tracking** | None | Longitudinal skill matrix, shipping velocity, promotion readiness |
| **Domain expertise** | General-purpose | Opinionated PM philosophy baked into every response |
| **Proactive** | Passive | Detects decisions, people, wins, and tasks — nudges you to capture them |
| **Skill chaining** | Manual | Meeting prep artifact flows into post-meeting processing automatically |

### Core capabilities

- **Zero-prompt value** — open Vennie and your day is already triaged. Morning brief, priority focus, pending decisions. No typing required.
- **Learn by doing** — Vennie suggests the next step after every response. No slash command memorisation needed. Type `1`, `2`, or `3` to act.
- **Forcing questions over templates** — `/office-hours` doesn't give you a template. It asks 6 hard questions that make you think harder. Then synthesises the output.
- **Stakeholder simulation** — `/simulate Sarah Chen` roleplays as Sarah using her actual meeting history and communication style from your vault.
- **Decision pattern analysis** — after 50 decisions, Vennie tells you your biases: "You consistently choose speed over thoroughness."
- **Career compound interest** — ship a feature, it flows to evidence, to STAR stories, to your resume, to interview prep. Automatic.
- **Commitment tracking** — Vennie auto-detects promises you make ("I'll send Sarah the doc by Friday") and follows up when you don't.
- **Red team your thinking** — `/red-team` runs a structured adversarial analysis. `/premortem` imagines the project failed and asks why.
- **Product sense gym** — daily PM exercises that build judgment, not just productivity. 50+ scenarios with streak tracking.
- **Competitive radar** — track competitors, scan for changes, surface intel during strategy sessions.
- **Writing in your voice** — voice-trained content for LinkedIn, PRDs, stakeholder updates that sounds like you wrote it.
- **Session learnings** — Vennie extracts what it learned about you from every conversation and auto-injects relevant learnings into future sessions.
- **PM philosophy** — opinionated principles ("Shipped > Perfect", "Decisions over discussions") injected into every interaction. User-editable.
- **Everything local** — your data stays on your machine. No cloud. No accounts.

## Desktop App

Vennie ships with a native Electron desktop app — a Cursor-grade, near-black interface designed specifically for product work.

### Launch

```bash
# Development
vennie desktop:dev

# Production build
vennie desktop:build
```

### Views

| View | Shortcut | What it does |
|------|----------|-------------|
| **Chat** | `⌘1` | AI conversation with artifacts panel, slash autocomplete, message reactions |
| **Threads** | `⌘2` | Saved conversations — pin, search, resume any past thread |
| **Focus** | `⌘3` | Distraction-free writing canvas with inline AI assist (highlight → expand/improve/challenge) |
| **Dashboard** | `⌘4` | Morning brief, vault pulse, quick actions |
| **Activity** | `⌘5` | Timeline of everything Vennie touched — meetings, tasks, people, files |
| **People** | `⌘6` | Your network as a grid — search, filter internal/external, click into full person pages |
| **Vault** | `⌘7` | File tree browser with markdown preview |
| **Skills** | `⌘8` | All 35+ skills categorised with one-click launch |
| **Settings** | `⌘9` | Theme, model, API key, persona, extended thinking |

### Chat features

- **Artifacts panel** — large code blocks, tables, and documents auto-open in a resizable side panel. Copy, save to vault, expand/collapse.
- **Slash autocomplete** — type `/` for inline skill menu with keyboard navigation
- **Context chips** — attach files, people, or projects as context before sending
- **Message reactions** — thumbs up/down on any response
- **Inline actions** — hover any response → copy, save to vault, branch, open as artifact
- **Branch conversations** — fork from any message into a new thread
- **Message grouping** — consecutive tool calls collapse into "5 completed" summaries
- **Breathing avatar** — V avatar glows during thinking. Alive, not loading.

### Design

- **Near-black dark mode** (#09090B) — Cursor-grade, opinionated
- **52px icon rail sidebar** — no labels, just icons grouped semantically
- **Floating input** with accent glow ring on focus
- **Surface differentiation** over borders — cards use color, not lines
- **Glassmorphic command palette** via `⌘K`
- **24px status bar** — connection, MCPs, vault items, model, version
- **Light mode** included for the heathens

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

## CLI Commands

```
vennie              Start a session (default)
vennie setup        Set up your API key (first time)
vennie init         Create a new vault and run onboarding
vennie status       Quick status check
vennie log          Quick capture (decision/win/idea/task/note)
vennie brief        Print your morning brief
vennie search       Search your vault
vennie update       Check for and apply updates
vennie desktop      Launch the desktop app
vennie doctor       Health check (dependencies, MCP servers, hooks)
vennie watch        Watch inbox for new files and auto-process
vennie run "prompt" Run a prompt headlessly (no UI)
vennie history      Browse and resume past sessions
vennie help         Show this help message
```

### Session resume

```
vennie -c              Resume the most recent session
vennie -H              Browse past sessions interactively
vennie --session <id>  Resume a specific session by ID
```

### Run mode (scripting / automation)

```bash
vennie run "research competitors"                    # Stream to stdout
vennie run --yes "update the radar"                  # Auto-approve all tools
vennie run -o out.md "write a PRD"                   # Save output to file
cat notes.txt | vennie run "extract action items"    # Pipe input as context
echo "top priority?" | vennie                        # Pipe triggers run mode
```

### Model flags

```
--opus      Use Opus 4.6 (smartest, most expensive)
--sonnet    Use Sonnet 4.6 (balanced — default)
--haiku     Use Haiku 4.5 (fastest, cheapest)
```

Smart routing is automatic: Haiku for quick questions, Sonnet for skills, Opus for strategy. Override with flags when needed.

## Built-in Commands

| Command | What it does |
|---------|-------------|
| `/brief` | Morning brief — your day triaged before you type |
| `/simulate <name>` | Roleplay a real stakeholder from your vault |
| `/patterns` | Analyse your decision-making patterns and biases |
| `/who knows about <topic>` | Find expertise across your network |
| `/radar` | Competitive intelligence radar |
| `/gym` | Product sense training exercise |
| `/shipped <what>` | Capture a shipment → career evidence pipeline |
| `/career` | View career timeline and skill matrix |
| `/log <type> <text>` | Quick capture: decision, win, idea, or note |
| `/search <query>` | BM25 keyword search across your vault |
| `/commitments` | View open commitments and follow-ups |
| `/think` | Toggle extended thinking (deeper reasoning) |
| `/model` | Switch between Sonnet, Opus, and Haiku |
| `/persona` | Browse and activate PM personas |

## Skills (35+)

### Daily workflow

| Skill | What it does |
|-------|-------------|
| `/daily-plan` | Plan your day with priorities and context |
| `/weekly-review` | Reflect on the week |
| `/retro` | Deep retrospective: decision audit, per-person breakdowns, pattern recognition |

### Strategic thinking

| Skill | What it does |
|-------|-------------|
| `/office-hours` | 6 Socratic forcing questions — like 30 min with a senior PM mentor |
| `/red-team` | Adversarial analysis: assumptions, failure modes, blind spots, counter-arguments |
| `/challenge` | Quick 3-5 bullet counter-arguments to stress-test a decision |
| `/premortem` | "It's 6 months from now and this failed. Why?" |
| `/strategy` | Market analysis and positioning |
| `/landscape` | Map the competitive landscape |
| `/decision` | Log and structure a decision |

### Product work

| Skill | What it does |
|-------|-------------|
| `/product-brief` | Conversational brief writing — questions first, document after |
| `/prd` | Write a PRD through conversation |
| `/user-interview-prep` | Research interview guide with forcing questions about your hypothesis |
| `/prioritise` | RICE scoring, stack ranking, trade-off analysis |

### Meetings & people

| Skill | What it does |
|-------|-------------|
| `/meeting-prep` | Prep for any meeting with full context |
| `/process-meetings` | Process notes → people pages, actions, projects |
| `/1on1` | Prep for manager check-ins |

### Career development

| Skill | What it does |
|-------|-------------|
| `/coach` | Career coaching — growth edges, blind spots, trajectory |
| `/wins` | Capture career wins and achievements |
| `/resume` | Build your resume from accumulated evidence |
| `/interview-prep` | Practice with realistic scenarios |
| `/linkedin` | Draft posts in your trained voice |
| `/voice train` | Teach Vennie your writing style |

### And more

`/news`, `/spec`, `/talk`, `/connect`, `/negotiate`, `/cover-letter`, `/brag`, `/status`, `/write`, `/review-prep`, `/quarterly-review` — run `/help` to see all.

## How Vennie Learns

### Session learnings

Every conversation is mined for corrections, preferences, and workflow discoveries. These are stored in `.vennie/learnings.jsonl` and auto-injected into future sessions when relevant.

```
"Last time you prepped for Sarah, you forgot to check the decision log."
"You prefer bullet points over paragraphs for meeting summaries."
```

### Skill artifact chaining

Skills write intermediate artifacts that downstream skills auto-detect:

```
/meeting-prep → writes prep doc → /process-meetings reads it to score coverage
/daily-plan → writes plan → /daily-review reads it to check what got done
/week-plan → writes priorities → /weekly-review + /retro read them for reflection
```

### Progressive onboarding

Vennie reveals capabilities at natural moments across your first 15+ sessions:

1. First person mentioned → suggests creating a people page
2. First decision detected → introduces decision logging
3. First meeting reference → suggests meeting prep
4. After 5+ sessions → introduces voice training
5. After career milestones → introduces evidence capture
6. After 10+ sessions → introduces frameworks (RICE, decision journals)

### Proactive triggers

Vennie detects these in conversation and nudges you:

- **Person without a page** → "Sarah doesn't have a page yet — want me to create one?"
- **Decision detected** → "Sounds like a decision was made — want me to log it?"
- **Win/achievement** → "That sounds like a win — want me to capture it as evidence?"
- **Task/commitment** → "Spotted a potential task — want me to create it?"
- **Big strategic call** → "That's a big call — want to stress-test it with /red-team?"

### PM Philosophy

`System/pm-philosophy.md` is injected into every system prompt, contextually:

- **Decisions** → Core Beliefs + Thinking Tools (reversibility test, 10/10/10 rule)
- **Strategy** → Core Beliefs + Anti-Patterns ("Let's align" without a decision to make)
- **Reviews** → Growth Signals (you're growing when you kill your own features)

Edit the file to make it yours.

## Intelligence Layer

Vennie has systems that work silently behind every interaction:

- **Auto-context injection** — every message is enriched with relevant people, projects, and decisions from your vault
- **Intent detection** — say "I need to prep for my meeting with Sarah" and Vennie suggests `/meeting-prep` automatically
- **Smart model routing** — Haiku for quick questions, Sonnet for skills, Opus for strategy. Automatic.
- **Tool routing** — person lookups use the dedicated MCP tool (not blind vault grep). Most queries resolve in 1-3 tool calls.
- **Interactive frameworks** — RICE scoring, Decision Journals, Stakeholder Maps triggered conversationally when Vennie detects the right context
- **Ambient insights** — data-driven observations about work patterns (~30% of sessions)
- **Conversation tracking** — detects circular discussions and suggests structured approaches
- **Session memory** — conversations summarised and persisted. Resume any past session.
- **Persona memory** — each PM persona accumulates observations about you
- **Prompt caching** — ~90% cost reduction on multi-turn conversations

## Architecture

```
vennie/
├── bin/vennie.js              # CLI entry point + commands
├── src/
│   ├── cli/
│   │   ├── app.js             # Ink (React for terminals) UI
│   │   ├── render.js          # Terminal rendering + markdown
│   │   ├── run.js             # Headless agent runner
│   │   └── watch.js           # File watcher for inbox
│   ├── core/
│   │   ├── agent.js           # Claude agent loop (max 12 turns)
│   │   ├── context-tiers.js   # Tiered system prompt with tool routing
│   │   ├── tools.js           # Built-in tools (Read, Write, Bash, etc.)
│   │   ├── skills.js          # Skill loader
│   │   ├── mcp.js             # MCP server manager
│   │   ├── suggestions.js     # Contextual action engine
│   │   ├── proactive.js       # Proactive trigger detection
│   │   ├── frameworks.js      # Interactive PM frameworks
│   │   ├── progressive-onboarding.js  # Milestone-based discovery
│   │   ├── ambient-insights.js # Work pattern analytics
│   │   ├── learnings.js       # Session learnings (JSONL)
│   │   ├── skill-artifacts.js # Skill artifact chaining
│   │   ├── philosophy.js      # PM philosophy injection
│   │   ├── commitments.js     # Commitment tracker + follow-ups
│   │   ├── red-team.js        # Adversarial analysis engine
│   │   ├── retro.js           # Deep retrospective data
│   │   ├── forcing-questions.js # Reusable question sets
│   │   ├── model-router.js    # Smart model routing
│   │   ├── hooks.js           # Pre/post skill hooks
│   │   ├── intent.js          # Natural language → skill detection
│   │   ├── search.js          # BM25 vault search
│   │   ├── memory.js          # Session memory persistence
│   │   ├── context-manager.js # Session persistence + resume
│   │   ├── conversation-tracker.js # In-session state
│   │   ├── persona-memory.js  # Per-persona observations
│   │   ├── morning-brief.js   # Auto-generated morning brief
│   │   ├── stakeholder-sim.js # Stakeholder roleplay
│   │   ├── decision-patterns.js # Decision history analysis
│   │   ├── network-recall.js  # Expertise search
│   │   ├── competitive-radar.js # Competitor tracking
│   │   ├── product-gym.js     # PM training exercises
│   │   ├── ship-to-story.js   # Career evidence pipeline
│   │   └── vault-pulse.js     # Vault stats + quick capture
│   └── desktop/
│       ├── main/
│       │   ├── index.js       # Electron main process
│       │   └── ipc.js         # IPC bridge to agent
│       ├── preload.js         # Context-isolated preload
│       └── renderer/
│           ├── App.jsx        # Root with 9-view routing
│           ├── main.jsx       # Entry point
│           ├── styles.css     # Tailwind v4 + design tokens
│           ├── components/
│           │   ├── Sidebar.jsx        # 52px icon rail
│           │   ├── TitleBar.jsx       # Minimal frameless bar
│           │   ├── StatusBar.jsx      # Ambient status (24px)
│           │   ├── CommandPalette.jsx # ⌘K glassmorphic palette
│           │   ├── ArtifactPanel.jsx  # Side panel for artifacts
│           │   ├── SlashMenu.jsx      # Inline skill autocomplete
│           │   ├── ContextChips.jsx   # Attachable context pills
│           │   └── MarkdownRenderer.jsx
│           ├── views/
│           │   ├── ChatView.jsx       # Chat + artifacts + reactions
│           │   ├── ThreadsView.jsx    # Saved conversations
│           │   ├── FocusView.jsx      # Writing canvas + AI assist
│           │   ├── DashboardView.jsx  # Brief + vault pulse
│           │   ├── ActivityView.jsx   # Timeline
│           │   ├── PeopleView.jsx     # Network grid
│           │   ├── VaultView.jsx      # File browser
│           │   ├── SkillsView.jsx     # Skill catalog
│           │   └── SettingsView.jsx   # Preferences
│           └── lib/
│               ├── ThemeProvider.jsx  # Light/dark/system
│               └── utils.js          # cn() + fuzzyScore()
├── .vennie/
│   ├── skills/core/           # Built-in skills (35+ markdown files)
│   ├── personas/              # PM personas (7 archetypes)
│   ├── artifacts/             # Skill artifacts (auto-cleaned)
│   ├── learnings.jsonl        # Session learnings
│   ├── commitments.jsonl      # Commitment tracker
│   └── mcp/                   # MCP server configs
├── System/
│   ├── pm-philosophy.md       # PM principles (user-editable)
│   └── profile.yaml           # User profile
├── vault-template/            # Template for new vaults
├── VENNIE.md                  # System prompt + personality
├── CHANGELOG.md               # Version history
└── package.json
```

## MCP Servers

Vennie uses Model Context Protocol servers for structured work management:

| Server | Tools |
|--------|-------|
| **work** | `lookup_person`, `search_people`, `create_decision`, `list_decisions`, `create_goal`, `set_weekly_focus`, `get_work_summary`, `create_project` |
| **career** | Career evidence, skill tracking, trajectory analysis |
| **persona** | Persona loading and memory |
| **brand** | Voice training and content generation |
| **network** | People index and expertise search |
| **news** | Industry news and competitive intel |
| **changelog** | Version history and update checking |

## Privacy

- All data stored locally in your vault folder
- No accounts, no cloud sync
- Your Anthropic API key is stored in `~/.config/vennie/env` (not in the vault)
- Anonymous telemetry is opt-out — disable with one command
- Learnings, commitments, and artifacts are all local JSONL files you can inspect and delete

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
- Forcing question sets for new contexts
- Translations and localisation

## License

CC BY-NC 4.0 — free for personal and non-commercial use. See [LICENSE](LICENSE) for details.

---

Built by [Mind the Product](https://mindtheproduct.com). The product management community of 300,000+ product people worldwide.

[vennie.ai](https://vennie.ai) | [GitHub](https://github.com/mindtheproduct/vennie) | [Mind the Product](https://mindtheproduct.com)
