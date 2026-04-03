# daemon/

Standalone channel daemon for Agent Studio. Inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) (event router) and Claude Code's KAIROS (persistent assistant with memory). Runs as an independent Node.js process, completely separate from any Claude Code session.

## Architecture

```
[Sources] → [Dispatcher + Router] → [Renderer (Claude -p)] → [Sinks]
                    ↕                        ↕
              [Commands]               [3-Tier Memory]
              [Executor]               [Dream Engine]
```

## Files

### `index.cjs`

Main daemon entry point. Creates HTTP server (port 3101), wires sources/sinks/renderer/memory/commands, spawns Telegram source, starts auto-dream timer (10-minute check interval). HTTP routes: `/health`, `/status`, `/send`, `/history`, `/memory`, `/dream`, `/event`, `/stop`. CLI flags: `--status`, `--stop`. Writes PID file, handles SIGTERM/SIGINT graceful shutdown.

### `config.cjs`

Configuration loader. Reads from `.env` (via `loadDotenv`) and `~/.claude/channels/config.json`. Builds allowed users set from `TELEGRAM_ALLOWED_USERS`, `TELEGRAM_OWNER_ID`, and `~/.claude/channels/telegram/access.json`. Exports source configs, renderer config, daemon port, and route definitions. Default port: 3101.

### `router.cjs`

Event-to-route matcher. `Router.resolve(event)` finds matching routes using glob patterns (`telegram.*` matches `telegram.message`) and optional key-value filters. Falls back to default route (handler: claude, sink: same source) if no routes match. Follows clawhip's `routes_for()` pattern.

### `dispatcher.cjs`

Event queue processor. Receives events from sources, routes them, renders responses via Claude, delivers via sinks. Sequential processing (one event at a time to avoid concurrent `claude -p` issues). Features: "while you were away" idle recap (1hr threshold), auto-dream trigger after events, `[TASK]` tag detection for task execution, conversation history tracking, active task map.

### `renderer.cjs`

Claude -p response generator with conversation memory. System prompt follows OpenClaw pattern: tells Claude what platform it's on, what it can/can't do, how to handle tool requests (`[TASK]` tag), and how to use memory context. Builds prompt from: persona + Tier 3 profile facts + Tier 2 summary + Tier 1 recent messages + new message. Auto-compacts context at 80% budget (4800 chars). Includes `renderProactive()` for timer-based events.

### `executor.cjs`

Task execution engine. `executeTask()` spawns `claude -p --model sonnet --max-turns 10` with full tool access for coding tasks. `sendToRouter()` sends JSON-RPC tasks to the A2A server (port 3100). `isRouterAvailable()` checks A2A health endpoint. Tasks have 5-minute timeout.

### `commands.cjs`

Telegram bot `/` command handler (OpenClaw pattern). Intercepts slash commands before they reach Claude: `/start`, `/help`, `/status`, `/memory`, `/tasks`, `/dream`, `/history`, `/new`, `/compress`, `/retry`, `/forget`, `/model`, `/ping`. Instant responses (no Claude API call). Unknown `/` commands pass through to Claude.

### `memory.cjs`

KAIROS-style 3-tier memory system with dream consolidation.

**Tier 1 (Chat History):** Raw recent messages per chat (max 30). Auto-compacts at 20 messages by summarizing older half via Haiku.

**Tier 2 (Session Summaries):** Built from compactions. Capped at 3000 chars. Wiped on session rotation after 5 compactions.

**Tier 3 (User Profiles):** Durable facts about each user. Extracted during dream consolidation. Max 50 facts per user. Survives everything.

**Dream consolidation (4-phase KAIROS):** Orient (review existing) → Gather (extract identity, projects, preferences, expertise, corrections) → Consolidate (merge, resolve conflicts) → Prune (remove stale/duplicate). Uses Sonnet for quality. Triggers: manual `/dream`, auto after 5+ messages + 1hr, 10-minute timer check.

**Session rotation:** After 5 compactions, Tier 1+2 are wiped (fresh start) but Tier 3 profile survives. User never notices — their identity carries over transparently.

All tiers persisted to JSON files in `.claude/context/runtime/channel-memory/`.

## sources/

### `sources/telegram.cjs`

Telegram long-polling source. Registers bot command menu via `setMyCommands` on startup. Clears competing `getUpdates` connections. Long-polls with 30s timeout. Filters by allowlist (user ID + username). Routes `/` commands to command handler before dispatching to Claude. Emits `telegram.message` events.

### `sources/timer.cjs`

Proactive timer source for scheduled events. Accepts configurable schedules with name, prompt, chatIds, and intervalMs. Emits `timer.<name>` events at configured intervals. Ready to wire for morning check-ins, reminders, etc.

## sinks/

### `sinks/telegram.cjs`

Telegram reply delivery via Bot API `sendMessage`. Supports `replyTo` (threading) and `format` (MarkdownV2). Imports `telegramApi` from the Telegram source module.
