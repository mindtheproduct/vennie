# Vennie Changelog

## v1.1.0 — 2026-04-11

### Commitment Tracker + Follow-Up Engine

- **`src/core/commitments.js`** — Auto-detects promises and commitments in conversation ("I'll send Sarah the pricing doc by Friday", "Brett said he'd review the proposal"). Tracks both your commitments and commitments others made to you.
- **Conservative detection** — Requires 2+ specificity signals (person name, deliverable, timeframe, action verb) to avoid noise. "I should probably think about..." won't trigger.
- **Due date parsing** — Handles "by Friday", "this week", "next Monday", "end of month", "tomorrow", "in 2 days", "April 15", and ISO dates.
- **Follow-up nudges on session start** — "You told Sarah you'd send the pricing doc — that was 5 days ago. Still on your radar?"
- **Proactive trigger** — When you mention a person with overdue commitments, Vennie nudges: "You owe Sarah the pricing doc (5 days overdue) — want to tackle that now?"
- **Morning brief integration** — Overdue and due-today commitments shown in the morning brief.
- **`/commitments` command** — View open commitments, mark done by number, quick-add, stats.

### Career Intelligence + Longitudinal Dashboard

- **`src/core/career-intelligence.js`** — Analytics engine that builds comprehensive career snapshots: skills (with trends), decisions, relationships (including neglected contacts), shipping velocity (with streaks), meetings, and growth metrics.
- **`/career-dashboard`** — Formatted terminal dashboard with ASCII progress bars, growth signals, and actionable suggestions. Auto-saves snapshot.
- **`/career-trajectory`** — Longitudinal view with ASCII sparkline trends, inflection point detection ("Your shipping velocity jumped in March when you started using decision journals"), and optional promotion readiness assessment.
- **Promotion readiness** — Scores competencies 0-100 for senior/lead/director/VP against vault evidence. Shows strengths, gaps, and recommendations.
- **Period comparison** — "Your decision velocity increased 40% (3/week → 5/week)", "You've added 6 new stakeholder relationships this month", "System Design hasn't appeared in your evidence log for 45 days."
- **Monday morning career pulse** — Auto-generates a snapshot on Mondays with the top insight, if the last snapshot is >6 days old.
- **Weekly review integration** — Career snapshot auto-generated and compared after every `/weekly-review`.

### Personality & Identity

- **Warmer personality** — Replaced aggressive "battle scars" identity with "that one colleague who genuinely cares." Vennie reads the room: vibes on a Friday night, pushes on a Monday morning.
- **Deeply personal responses** — Vennie now uses profile data (role, company, career level, projects) to ground every interaction. Generic responses fail the "swap test" — if you could swap in any user's name and it still works, it's too generic.
- **PM Philosophy injection** — New `System/pm-philosophy.md` injected contextually into every system prompt. Core beliefs like "Shipped > Perfect" and "Decisions over discussions" shape all advice. User-editable.

### CLI — New Commands & Modes

- **`vennie log`** — Quick capture from the terminal: `vennie log decision:`, `vennie log win:`, `vennie log idea:`, `vennie log task:`, `vennie log note:`
- **`vennie brief`** — Print your morning brief without starting a full session
- **`vennie search`** — Search your vault from the command line
- **`vennie run "prompt"`** — Headless mode. Run prompts without the interactive UI, stream to stdout. Supports `--yes` (auto-approve tools), `-o file.md` (save output), and stdin piping
- **`vennie watch`** — File watcher. Monitors `00-Inbox/` directories, auto-processes new `.md` files as they land
- **`vennie history`** — Browse and resume past sessions interactively
- **`vennie -c` / `--continue`** — Resume the most recent session
- **`vennie --session <id>`** — Resume a specific session by ID
- **`--opus` / `--sonnet` / `--haiku`** — Model override flags

### CLI — UX Improvements

- **Streaming stability** — Fixed terminal flashing during response streaming. Now uses plain text at ~8fps during stream, full markdown only on commit. Eliminated the expensive regex parsing that caused flickering.
- **Compact tool display** — Tool calls grouped and summarized like Claude Code: `✓ WebFetch ×3, WebSearch 2340ms` instead of verbose per-tool output. Active tools shown with elapsed time while running.
- **Table rendering** — Pipe-delimited markdown tables now render with proper columns, cyan headers, and aligned data in the terminal.
- **Content deduplication** — Fixed message repetition caused by race conditions in the streaming → Static commit pipeline. All segments now batch-committed in a single `setItems()` call.
- **Slash command fixes** — Fixed double-execution of commands (autocomplete + TextInput both firing), slash commands no longer echo as user input in chat history.
- **@file autocomplete** — Type `@` to autocomplete vault file paths. File content injected as context.
- **Multi-line input** — Shift+Enter for multi-line messages.

### Smart Model Routing

- **`src/core/model-router.js`** — Auto-routes to the right model based on intent: Haiku for quick questions, Sonnet for skills (default), Opus for strategy and complex analysis.
- Configurable via `.vennie/model-routing.yaml`

### Learn-by-Doing System (5 components)

Instead of relying on slash commands, Vennie now proactively guides users:

- **Contextual Actions** (`src/core/suggestions.js`) — Numbered 1/2/3 next-step suggestions after every response. Type a number to execute. Pattern-matched: person mentions, meetings, decisions, tasks, strategy, writing.
- **Proactive Triggers** (`src/core/proactive.js` + `src/core/conversation-tracker.js`) — Detects people without pages, decisions worth logging, wins worth capturing, tasks worth tracking, and meetings worth prepping. Shows warm nudges: "💡 Sarah doesn't have a page yet — want me to create one?"
- **Interactive Frameworks** (`src/core/frameworks.js`) — RICE scoring, Decision Journals, Stakeholder Maps, User Story Workshop, and Retrospectives triggered conversationally when Vennie detects the right context. Walks you through step-by-step instead of dumping a template.
- **Progressive Onboarding** (`src/core/progressive-onboarding.js`) — Milestone-based feature discovery. Reveals capabilities at natural moments over your first 15+ sessions. 8 milestones from first person mention to framework usage.
- **Ambient Insights** (`src/core/ambient-insights.js`) — Data-driven observations about your work patterns. ~30% of sessions get a subtle insight: "You've shipped 3 things this month but your decision log is empty — capturing the 'why' helps at review time."

### Session Learnings (JSONL)

- **`src/core/learnings.js`** — Structured append-only learnings at `.vennie/learnings.jsonl`. Auto-extracted from conversations at session end (corrections, preferences, workflow discoveries).
- Smart retrieval: learnings about the same person/project/skill auto-injected into future sessions.
- Recency decay: recent learnings score higher than 90-day-old ones.

### Skill Artifact Chaining

- **`src/core/skill-artifacts.js`** — Skills write intermediate artifacts that downstream skills auto-detect.
- Chain map: `/meeting-prep` → `/process-meetings`, `/daily-plan` → `/daily-review`, `/week-plan` → `/week-review`, `/quarter-plan` → `/quarter-review`.
- Artifacts stored in `.vennie/artifacts/`, auto-cleaned after 30 days.

### New Skills — Forcing Questions

Skills that challenge your thinking instead of giving you templates:

- **`/office-hours`** — 30 minutes with a senior PM mentor. 6 Socratic forcing questions: The Real Problem, The Evidence, The User, The Bet, The Cost, The Test.
- **`/product-brief`** — Rewritten to walk through conversational questions, then synthesize into a brief. The conversation is the work; the document is the artifact.
- **`/premortem`** — "It's 6 months from now and this failed. Why?" Structured failure analysis with risk register.
- **`/user-interview-prep`** — Forces you to define what decision the research will inform before writing a single interview question.

### New Skills — Challenge & Review

- **`/red-team`** — Devil's advocate analysis. 5-section structured adversarial review: assumptions, failure modes, blind spots, strongest counter-argument, revised confidence.
- **`/challenge`** — Quick 3-5 bullet counter-arguments. Lightweight version of `/red-team`.
- **`/retro`** — Deep retrospective beyond `/week-review`. Decision audit, per-person breakdowns, pattern recognition, forcing questions, actionable commitments. Accepts time range: `/retro week`, `/retro month`, `/retro quarter`.

### Hooks System

- **`src/core/hooks.js`** — Pre/post skill hooks from `.vennie/hooks.yaml`. Run shell commands before or after any skill executes.

### Infrastructure

- **Session persistence** (`src/core/context-manager.js`) — Sessions auto-saved with cost, model, messages, and topic extraction. Resume any past session.
- **Background MCP loading** — MCP servers load asynchronously after UI renders. No more blocking the startup on slow MCP connections.
- **Permission tiers** — Tools categorized as auto-allow (read-only), confirm (writes), or approve (destructive). Foundation for trust-based auto-approval.
- **Citation tracking** — Tool results tagged with source files/searches for traceability.

### Desktop App

- **Command Palette** (`CommandPalette.jsx`) — Fuzzy search across views and skills. ⌘K to open, ↑↓ to navigate, Enter to select.
- **TitleBar** — Shows active model, tool count, token usage, and session cost.

### Files Changed

**15 modified files** (+2,466 lines, -207 lines):
- `src/cli/app.js` — Major rewrite: streaming, tool display, frameworks, proactive triggers, learnings, artifacts, session management
- `src/core/agent.js` — Permission tiers, citation tracking, philosophy injection, learnings injection, artifact chaining
- `bin/vennie.js` — New commands (log, brief, search, run, watch, history), session resume, model flags
- `src/core/suggestions.js` — Contextual actions, welcome suggestions, skill chains
- `src/core/intent.js` — Framework detection integration
- `src/cli/render.js` — Enhanced rendering
- `VENNIE.md` — Personality rewrite, "Making It Personal" section
- `CLAUDE.md` — New skills catalog, forcing questions documentation

**19 new files** (6,108 lines):
- `src/core/ambient-insights.js` (603 lines) — Work pattern analytics
- `src/core/retro.js` (704 lines) — Deep retrospective data gathering
- `src/core/suggestions.js` (506 lines) — Contextual action engine
- `src/cli/watch.js` (504 lines) — File watcher
- `src/core/learnings.js` (389 lines) — Session learnings JSONL
- `src/core/forcing-questions.js` (355 lines) — Reusable question sets
- `src/core/progressive-onboarding.js` (350 lines) — Milestone-based discovery
- `src/core/model-router.js` (324 lines) — Smart model routing
- `src/core/skill-artifacts.js` (308 lines) — Skill artifact chaining
- `src/core/frameworks.js` (290 lines) — Interactive PM frameworks
- `src/core/proactive.js` (266 lines) — Proactive trigger detection
- `src/core/context-manager.js` (252 lines) — Session persistence
- `src/cli/run.js` (250 lines) — Headless agent runner
- `src/core/hooks.js` (227 lines) — Pre/post skill hooks
- `src/core/conversation-tracker.js` (195 lines) — In-session state
- `src/core/philosophy.js` (171 lines) — PM philosophy injection
- `src/core/permissions.js` (156 lines) — Tool permission tiers
- `src/core/red-team.js` (156 lines) — Adversarial analysis engine
- `src/core/citations.js` (102 lines) — Source tracking

**7 new skills:**
- `/office-hours`, `/product-brief`, `/premortem`, `/user-interview-prep`
- `/red-team`, `/challenge`, `/retro`

**2 new vault files:**
- `System/pm-philosophy.md` — User-editable PM principles
- `vault-template/System/pm-philosophy.md` — Template for new vaults
