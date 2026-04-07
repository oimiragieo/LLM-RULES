# daemon/

Standalone channel daemon for Agent Studio. Inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) (event router) and Claude Code's KAIROS (persistent assistant with memory). Runs as an independent Node.js process, completely separate from any Claude Code session.

## Architecture

```
[Sources] → [Dispatcher + Router] → [Renderer (Claude -p)] → [Sinks]
  (Telegram,     ↕         ↕              ↕          ↕
   Webhook,  [Commands] [Rate Limit] [Model Router] [Skills Engine]
   Timer)    [TaskPool]              [Personality]   [3-Tier Memory]
              ↕ (async)              [Skill Inject]  [Dream Engine]
         [Executor Async]
         (TASK/RALPH/ULTRAWORK
          run as background
          child processes)
```

### Non-Blocking Task Execution (v1.1.0)

Task execution is **fully asynchronous**. When Claude responds with `[TASK]`, `[RALPH]`, or `[ULTRAWORK]`, the dispatcher spawns the work into a **TaskPool** and immediately continues processing the message queue. The user can send new messages, check task status, and spawn additional tasks while others run in the background.

**Key components:**

- `task-pool.cjs` — Concurrent task routing table (EventEmitter). Tracks running/queued/completed tasks. Configurable concurrency limit (default 3). Supports cancel, timeout, and drain.
- `claudeAsync()` in `claude-cli.cjs` — Non-blocking `spawn`-based wrapper alongside `claudeSync()`. Returns `{ child, promise, cancel }`.
- `executeTaskAsync()` / `executeRalphLoopAsync()` in `executor.cjs` — Async task execution methods. Rate limit retry uses `setTimeout` (not busy-wait).
- Pool event handlers in `dispatcher._wirePoolEvents()` — Deliver results, update memory, extract skills when background tasks complete.
- `/cancel <id>` command — Kill a running task from Telegram.

## Files

### `index.cjs`

Main daemon entry point. Creates HTTP server (port 3101), wires sources/sinks/renderer/memory/commands, spawns Telegram source, starts auto-dream timer (10-minute check interval). HTTP routes: `/health`, `/status`, `/send`, `/history`, `/memory`, `/dream`, `/event`, `/stop`. CLI flags: `--status`, `--stop`. Writes PID file, handles SIGTERM/SIGINT graceful shutdown.

### `../telegram-ctl.cjs` (parent directory)

CLI control script. Commands: `start`, `stop`, `status`, `restart`, `doctor` (validate config), `doctor --fix` (validate + auto-repair). The `doctor` subcommand checks directories, TELEGRAM_BOT_TOKEN, access.json validity, env/access.json allowlist conflicts, and config.json structure. Each check returns `{status, changes[]}` tuples. `--fix` auto-creates missing files with defaults, merges orphaned env allowlists into access.json, and backs up corrupt files before replacing.

### `config.cjs`

Configuration loader. Reads from `.env` (via `loadDotenv`) and `~/.claude/channels/config.json`. Builds allowed users set from `TELEGRAM_ALLOWED_USERS`, `TELEGRAM_OWNER_ID`, and `~/.claude/channels/telegram/access.json`. Exports source configs, renderer config, daemon port, and route definitions. Default port: 3101.

### `router.cjs`

Event-to-route matcher. `Router.resolve(event)` finds matching routes using glob patterns (`telegram.*` matches `telegram.message`) and optional key-value filters. Falls back to default route (handler: claude, sink: same source) if no routes match. Follows clawhip's `routes_for()` pattern.

### `dispatcher.cjs`

Event queue processor. Receives events from sources, routes them, renders responses via Claude, delivers via sinks. Sequential processing (one event at a time to avoid concurrent `claude -p` issues). Features: "while you were away" idle recap (1hr threshold), auto-dream trigger after events, conversation history tracking, active task map, per-user rate limiting (10 msg/min default).

**Execution tag detection:** Parses Claude's response for execution tags and routes to the appropriate handler:

- `[TASK]` — one-shot task execution via executor
- `[RALPH]` — iterative verify/fix loop (max 5 iterations) via executor
- `[CLARIFY]` — single clarification question (no execution)
- `[INTERVIEW]` — deep Socratic multi-round interview (collects answers before execution)
- `[ULTRAWORK]` — parallel execution (splits task into concurrent subtasks)
- `[HANDOFF]` — human escalation (notifies user, no execution)

### `renderer.cjs`

Claude -p response generator with conversation memory. System prompt follows OpenClaw pattern: tells Claude what platform it's on, what it can/can't do, how to handle execution tags (`[TASK]`, `[RALPH]`, `[ULTRAWORK]`, `[INTERVIEW]`, `[CLARIFY]`, `[HANDOFF]`), and how to use memory context. Builds prompt from: persona + Tier 3 profile facts + Tier 2 summary + Tier 1 recent messages + new message. Auto-compacts context at 80% budget (4800 chars). Includes `renderProactive()` for timer-based events.

**Multi-model routing:** Selects model by message complexity — haiku for simple/casual, sonnet for coding/analysis, opus for architecture/deep reasoning. Users can override via `/model`.

**Personality system:** Supports 6 personality presets (selectable via `/personality`). Personality modifies the system prompt persona section.

**Skill injection:** Before rendering, checks the skill extraction engine for matching learned patterns. If a match is found, injects the relevant skill context into the system prompt so Claude can apply previously learned techniques.

### `claude-cli.cjs`

Safe Claude CLI wrapper. All daemon modules use `claudeSync()` instead of raw `execSync` with string interpolation (SEC-011). Uses `spawnSync` with array arguments. Supports `--append-system-prompt` and `--append-system-prompt-file` for overriding CLAUDE.md in headless sessions. Falls back to temp file approach on Windows when prompt + system prompt exceed cmd.exe 8191 char limit.

### `task-executor-prompt.txt`

System prompt appended via `--append-system-prompt-file` to headless `claude -p` sessions spawned by the executor. Overrides the router CLAUDE.md by giving headless agents a task-executor identity. Lists available MCP tools (Exa web search/crawl, filesystem) so headless agents know they can do web research, file operations, and code tasks directly.

### `executor.cjs`

Task execution engine. `executeTask()` spawns `claude -p --append-system-prompt-file task-executor-prompt.txt --model sonnet --max-turns 10` with full tool access including MCP tools. The appended system prompt overrides the router CLAUDE.md, giving headless sessions a task-executor identity with explicit MCP tool awareness (Exa web search, filesystem, etc.). `sendToRouter()` sends JSON-RPC tasks to the A2A server (port 3100). `isRouterAvailable()` checks A2A health endpoint. Tasks have 5-minute timeout.

**Ralph loop execution:** When the dispatcher detects a `[RALPH]` tag, the executor runs a persistent verify/fix loop — executes the task, verifies the result, and if verification fails, re-executes with the failure context. Max 5 iterations. Streams progress updates (15s heartbeat) back to the user during execution.

**Ultrawork parallel execution:** When the dispatcher detects an `[ULTRAWORK]` tag, the executor splits the task into independent subtasks and runs them concurrently via parallel `claude -p` processes. Results are collected and merged before delivery.

**Rate limit auto-retry:** If `claude -p` returns a rate limit error, the executor retries with exponential backoff instead of failing immediately.

### `commands.cjs`

Telegram bot `/` command handler (OpenClaw pattern). Intercepts slash commands before they reach Claude. Instant responses (no Claude API call). Unknown `/` commands pass through to Claude.

**Full command list (24):** `/start`, `/help`, `/status`, `/ping`, `/model`, `/memory`, `/dream`, `/new`, `/compress`, `/forget`, `/title`, `/resume`, `/sessions`, `/export`, `/tasks`, `/approve`, `/deny`, `/usage`, `/insights`, `/personality`, `/schedule`, `/pair` + regular text messages.

**Phase 5 additions:** `/usage` (per-user cost tracking).
**Phase 6 additions:** `/export` (conversation export as markdown file), `/pair` (device pairing request + `/pair approve`).
**Phase 7 additions:** `/personality` (switch between 6 presets), `/insights` (usage analytics), `/schedule` (user-managed cron scheduling). Updated `/help` to list all commands.

### `memory.cjs`

KAIROS-style 3-tier memory system with dream consolidation.

**Tier 1 (Chat History):** Raw recent messages per chat (max 30). Auto-compacts at 20 messages by summarizing older half via Haiku. Supports `user`, `assistant`, and `system` message roles (system role used for session gap markers).

**Tier 2 (Session Summaries):** Built from compactions. Capped at 3000 chars. Uses ACC-style full replacement when budget is exceeded (replaces old summary entirely rather than slicing mid-sentence). Wiped on session rotation after 5 compactions.

**Tier 3 (User Profiles):** Durable facts about each user. Extracted during dream consolidation. Max 50 facts per user. Survives everything. Dream prompt includes explicit chatId list to prevent misattribution.

**Dream consolidation (4-phase KAIROS):** Orient (review existing) → Gather (extract identity, projects, preferences, expertise, corrections) → Consolidate (merge, resolve conflicts) → Prune (remove stale/duplicate). Uses Sonnet for quality. Triggers: manual `/dream`, auto after 5+ messages + 1hr, 10-minute timer check.

**Session rotation:** After 5 compactions, Tier 1+2 are wiped (fresh start) but Tier 3 profile survives. User never notices — their identity carries over transparently. Compaction counts persist across daemon restarts via `daemon-metadata.json`.

**Persistence:** All tiers persisted to JSON files in `.claude/context/runtime/channel-memory/` using atomic write-to-temp-then-rename to prevent corruption. Daemon metadata (`lastDream`, `messagesSinceDream`, `compactionCounts`) persisted separately so dream state and session rotation survive restarts. Corrupt JSON files are logged on load instead of silently ignored.

## sources/

### `sources/telegram.cjs`

Telegram long-polling source. Registers bot command menu via `setMyCommands` on startup. Clears competing `getUpdates` connections. Long-polls with 30s timeout. Filters by allowlist (user ID + username). Routes `/` commands to command handler before dispatching to Claude. Emits `telegram.message` events.

### `sources/timer.cjs`

Proactive timer source for scheduled events. Accepts configurable schedules with name, prompt, chatIds, and intervalMs. Emits `timer.<name>` events at configured intervals. Ready to wire for morning check-ins, reminders, etc.

## sinks/

### `sinks/telegram.cjs`

Telegram reply delivery via Bot API `sendMessage` and `sendDocument` (file sending). Supports `replyTo` (threading) and `format` (MarkdownV2). Imports `telegramApi` from the Telegram source module.

### `skills.cjs`

Skill extraction engine. Learns from completed tasks by analyzing successful execution patterns. After a task completes, extracts reusable patterns (command sequences, file structures, solution approaches) and stores them. Before rendering, the engine matches the current message against stored skills and injects matching skill context into the prompt so Claude can apply previously learned techniques automatically.

### `sources/webhook.cjs`

Webhook source for external integrations. Exposes `POST /webhook` endpoint for GitHub events, CI pipeline notifications, and other external systems. Parses incoming payloads and emits `webhook.<source>` events into the dispatcher queue.

## Execution Tags

The daemon supports 6 execution tags that Claude includes in its responses to trigger different execution modes:

| Tag           | Mode             | Description                                                         |
| ------------- | ---------------- | ------------------------------------------------------------------- |
| `[TASK]`      | One-shot         | Single headless claude -p execution with tools                      |
| `[RALPH]`     | Iterative loop   | Persistent verify/fix cycle, max 5 iterations                       |
| `[CLARIFY]`   | Single question  | Asks one clarifying question, no execution                          |
| `[INTERVIEW]` | Multi-round      | Deep Socratic interview, collects multiple answers before executing |
| `[ULTRAWORK]` | Parallel         | Splits task into concurrent subtasks                                |
| `[HANDOFF]`   | Human escalation | Escalates to human, no automated execution                          |
