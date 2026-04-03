# Telegram Channel Daemon Architecture

> Last updated: 2026-04-03
> Status: **Working** (verified end-to-end)

---

## Overview

Agent Studio's Telegram integration is a **standalone background daemon** inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) and Claude Code's KAIROS assistant mode. It runs as an independent Node.js process, completely separate from any Claude Code session.

**Key properties:**

- Zero API cost when idle (long-polls Telegram, only calls Claude when a message arrives)
- KAIROS-style 3-tier memory with dream consolidation
- Automatic context rot detection and session rotation
- Task execution via headless `claude -p` sessions
- HTTP API for router/A2A integration
- Bot command menu registered with Telegram

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Channel Daemon (port 3101)                     │
│                                                                   │
│  ┌─────────────┐    ┌────────────┐    ┌──────────┐    ┌───────┐ │
│  │   Sources    │───→│ Dispatcher │───→│ Renderer │───→│ Sinks │ │
│  │  (Telegram)  │    │  + Router  │    │(Claude-p)│    │(Tg API│ │
│  └─────────────┘    └─────┬──────┘    └────┬─────┘    └───────┘ │
│                           │                │                      │
│  ┌─────────────┐    ┌─────┴──────┐    ┌────┴─────┐              │
│  │  Commands    │    │  Executor  │    │  Memory  │              │
│  │ (/help etc)  │    │(task spawn)│    │ (3-tier) │              │
│  └─────────────┘    └────────────┘    └──────────┘              │
│                                                                   │
│  HTTP API: /status /send /history /memory /dream /event /stop     │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Telegram message → Source (long-poll getUpdates)
    │
    ├─ /command → Command handler → direct Telegram reply (no Claude)
    │
    └─ text → Dispatcher queue → Router (match event to route)
         │
         ├─ Build context from 3-tier memory
         ├─ Renderer: claude -p generates response
         │    └─ Response starts with [TASK]?
         │         ├─ YES → Executor spawns claude -p with tools → task result
         │         └─ NO  → plain text response
         │
         └─ Sink: send response via Telegram API
              └─ Record in memory + history
```

---

## File Map

```
scripts/channels/daemon/
├── index.cjs          # Main daemon — HTTP server, source/sink wiring
├── config.cjs         # Configuration loader (.env + ~/.claude/channels/config.json)
├── router.cjs         # Event → route matching (glob patterns)
├── dispatcher.cjs     # Event queue → render → deliver, idle recap, dream trigger
├── renderer.cjs       # Claude -p with OpenClaw-style system prompt + memory context
├── executor.cjs       # Task execution (headless claude -p with tools + A2A router)
├── commands.cjs       # /slash commands (Telegram bot menu — OpenClaw pattern)
├── memory.cjs         # KAIROS-style 3-tier memory with dream consolidation
├── sources/
│   ├── telegram.cjs   # Telegram long-polling + bot menu registration
│   └── timer.cjs      # Proactive scheduled events (timer source)
└── sinks/
    └── telegram.cjs   # Telegram reply delivery

scripts/channels/
├── telegram-relay.mjs  # MCP server (tools-only mode in main Claude session)
└── telegram-ctl.cjs    # CLI: start / stop / status / restart

.claude/hooks/channels/
└── telegram-start.cjs  # Daemon launcher (PowerShell hidden window)

.claude/skills/
├── enable-telegram/     # /enable-telegram — start the daemon
├── disable-telegram/    # /disable-telegram — stop the daemon
├── setup-telegram/      # /setup-telegram — verify configuration
├── setup-telegram-voice/# /setup-telegram-voice — verify voice config
└── enable-telegram-voice/# /enable-telegram-voice — voice pipeline
```

---

## 3-Tier Memory System (KAIROS-style)

### Tier 1: Chat History (short-term)

- Raw recent messages per chat (max 30)
- Auto-compacts when exceeding 20 messages
- Compaction summarizes older half via Haiku, keeps recent
- Stored in `channel-memory/chat-history.json`

### Tier 2: Session Summaries (medium-term)

- Structured summaries built from compacted messages
- Capped at 3000 chars per chat
- Wiped on session rotation (after 5 compactions)
- Stored in `channel-memory/chat-summaries.json`

### Tier 3: User Profiles (long-term)

- Durable facts about each user (name, preferences, projects, expertise)
- Extracted during dream consolidation (4-phase KAIROS process)
- Survives session rotations and daemon restarts
- Max 50 facts per user
- Stored in `channel-memory/user-profiles.json`

### Context Rot Protection

```
Messages 1-20:   Normal chat, Tier 1 grows
Message ~20:     Auto-compact #1 → older half summarized into Tier 2
Message ~40:     Auto-compact #2 → Tier 2 summary grows
...
Compact #5:      SESSION ROTATION → Tier 1+2 wiped, Tier 3 survives
                 User never notices — profile facts carry over
```

The renderer also pre-checks context size before each `claude -p` call. If context exceeds 80% of the budget (4800 chars), it forces an early compaction.

---

## Dream Consolidation (KAIROS 4-Phase)

Triggered by: `/dream` command, auto after 5+ messages + 1hr elapsed, or 10-minute timer check.

| Phase           | Action                                                                                |
| --------------- | ------------------------------------------------------------------------------------- |
| **Orient**      | Review existing profile facts, check what's stale                                     |
| **Gather**      | Extract: identity, projects, preferences, expertise, communication style, corrections |
| **Consolidate** | Merge new with existing, resolve conflicts (newer wins)                               |
| **Prune**       | Remove duplicates, stale facts, trivial conversation details                          |

Uses Sonnet (not Haiku) for higher quality extraction.

---

## Telegram Bot Commands

| Command     | Description                        |
| ----------- | ---------------------------------- |
| `/start`    | Welcome message + command list     |
| `/help`     | All available commands             |
| `/status`   | Daemon stats, uptime, memory info  |
| `/memory`   | What the bot remembers about you   |
| `/tasks`    | Recently executed task history     |
| `/dream`    | Trigger memory consolidation       |
| `/history`  | Recent conversation excerpts       |
| `/new`      | Fresh conversation (keeps profile) |
| `/compress` | Manual memory compaction           |
| `/retry`    | Show last message to resend        |
| `/forget`   | Clear all data about you           |
| `/model`    | Current AI model                   |
| `/ping`     | Alive check                        |

Commands are registered with Telegram via `setMyCommands` — users see them in the `/` menu.

---

## Task Execution

When a user asks the bot to DO something (run code, check git, etc.):

1. Renderer (Claude -p chat mode) responds with `[TASK] description`
2. Dispatcher detects the `[TASK]` tag
3. Sends "⚙️ Running task..." to user
4. Executor spawns `claude -p` with full tool access (`--max-turns 10`)
5. Returns result as "✅ Task complete: ..."
6. Tracks in `activeTasks` map, visible via `/tasks`

---

## HTTP API (port 3101)

| Endpoint   | Method | Description                                    |
| ---------- | ------ | ---------------------------------------------- |
| `/health`  | GET    | `{"status":"ok","uptime":N}`                   |
| `/status`  | GET    | Full daemon stats, sources, sinks, dispatcher  |
| `/send`    | POST   | Send message: `{"chat_id":"...","text":"..."}` |
| `/history` | GET    | Recent processed events (with `?limit=N`)      |
| `/memory`  | GET    | Memory stats + user profiles                   |
| `/dream`   | GET    | Trigger dream consolidation                    |
| `/event`   | POST   | Inject custom event into dispatcher            |
| `/stop`    | GET    | Graceful shutdown                              |

---

## "While You Were Away" Recap

When a user messages after 1+ hour of inactivity, the dispatcher automatically sends a recap of where the conversation left off, before processing the new message.

---

## Configuration

### Environment Variables (`.env`)

| Variable                 | Required    | Description               |
| ------------------------ | ----------- | ------------------------- |
| `TELEGRAM_BOT_TOKEN`     | Yes         | Bot token from @BotFather |
| `TELEGRAM_OWNER_ID`      | Yes         | Your Telegram user ID     |
| `CHANNEL_AUTO_START`     | Yes         | `true` to enable          |
| `TELEGRAM_ALLOWED_USERS` | Recommended | Comma-separated user IDs  |
| `TELEGRAM_ALLOW_ALL`     | No          | `true` for open access    |
| `CHANNEL_DAEMON_PORT`    | No          | Default: 3101             |
| `CHANNEL_MODEL`          | No          | Default: sonnet           |

### Access Control

| Source                                    | Format                           |
| ----------------------------------------- | -------------------------------- |
| `.env` → `TELEGRAM_ALLOWED_USERS`         | Comma-separated IDs or usernames |
| `.env` → `TELEGRAM_OWNER_ID`              | Single owner ID                  |
| `~/.claude/channels/telegram/access.json` | `{"allowFrom":["id1","id2"]}`    |

Allowlist checks both user ID and username. Empty allowlist = nobody (secure default).

### MCP Server (`.claude/.mcp.json`)

The telegram-relay MCP server runs in **tools-only mode** (`TELEGRAM_DISABLE_POLLING=1`) in the main Claude session. This provides `check_messages`, `reply`, `react`, `edit_message`, and `download_attachment` tools without conflicting with the daemon's Telegram polling.
