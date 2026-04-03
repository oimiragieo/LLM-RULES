# Channel Daemon

Background messaging daemon for Agent Studio. Monitors Telegram (and future platforms) for messages, responds using Claude, and exposes an HTTP API for integration.

## Architecture

Inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) (event router) and Claude Code's KAIROS (persistent assistant with memory).

```
[Telegram] → [Source: long-poll] → [Dispatcher] → [Renderer: Claude -p] → [Sink: Telegram API]
                                        ↕                   ↕
                                   [Commands]          [3-Tier Memory]
                                   [Executor]          [Dream Engine]
```

## Setup

### Prerequisites

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) → get token
2. Get your user ID via [@userinfobot](https://t.me/userinfobot)

### Configuration

Add to your `.env`:

```bash
TELEGRAM_BOT_TOKEN=<your bot token>
TELEGRAM_OWNER_ID=<your user ID>
TELEGRAM_ALLOWED_USERS=<comma-separated user IDs>
CHANNEL_AUTO_START=true
```

### Running

```bash
# Via CLI
node scripts/channels/telegram-ctl.cjs start
node scripts/channels/telegram-ctl.cjs status
node scripts/channels/telegram-ctl.cjs stop
node scripts/channels/telegram-ctl.cjs restart

# Via Claude Code skills
/setup-telegram     # verify config
/enable-telegram    # start daemon
/disable-telegram   # stop daemon

# Direct daemon
node scripts/channels/daemon/index.cjs           # foreground
node scripts/channels/daemon/index.cjs --status   # check
node scripts/channels/daemon/index.cjs --stop     # stop
```

## HTTP API

Default port: `3101` (configurable via `CHANNEL_DAEMON_PORT`)

| Endpoint   | Method | Description                                    |
| ---------- | ------ | ---------------------------------------------- |
| `/health`  | GET    | Health check                                   |
| `/status`  | GET    | Full stats                                     |
| `/send`    | POST   | Send message: `{"chat_id":"...","text":"..."}` |
| `/history` | GET    | Conversation history (`?limit=N`)              |
| `/memory`  | GET    | Memory stats + profiles                        |
| `/dream`   | GET    | Trigger memory consolidation                   |
| `/event`   | POST   | Inject custom event                            |
| `/stop`    | GET    | Shutdown                                       |

### Examples

```bash
# Send a message
curl -X POST http://127.0.0.1:3101/send \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"123456","text":"Hello from the API!"}'

# Check status
curl http://127.0.0.1:3101/status

# View memory
curl http://127.0.0.1:3101/memory

# Trigger dream
curl http://127.0.0.1:3101/dream
```

## Bot Commands

Type `/` in Telegram to see the command menu:

| Command     | Description                        |
| ----------- | ---------------------------------- |
| `/start`    | Welcome + command list             |
| `/help`     | All commands                       |
| `/status`   | Daemon stats                       |
| `/memory`   | What I remember about you          |
| `/tasks`    | Task execution history             |
| `/dream`    | Consolidate memories               |
| `/new`      | Fresh conversation (keeps profile) |
| `/compress` | Manual compaction                  |
| `/forget`   | Clear all data                     |
| `/ping`     | Alive check                        |

Regular messages (no `/` prefix) go to Claude for a response.

## Memory System

### Tier 1: Chat History

Recent messages (max 30). Auto-compacts by summarizing older half.

### Tier 2: Session Summaries

Built from compactions. Wiped after 5 compactions (session rotation).

### Tier 3: User Profiles

Permanent facts (name, preferences, projects). Survives everything. Extracted during dream consolidation.

### Dream Consolidation

4-phase KAIROS process: Orient → Gather → Consolidate → Prune. Runs automatically (every hour if 5+ messages) or manually via `/dream`.

## Adding New Platforms

To add Discord, Slack, etc.:

1. Create `daemon/sources/discord.cjs` implementing `start()` and `stop()` methods
2. Create `daemon/sinks/discord.cjs` implementing `send(chatId, text, opts)`
3. Add config section in `daemon/config.cjs`
4. Wire in `daemon/index.cjs`
5. The router, dispatcher, memory, and renderer are platform-agnostic

## Files

```
daemon/
├── index.cjs        # Main daemon + HTTP server
├── config.cjs       # Config loader
├── router.cjs       # Event → route matching
├── dispatcher.cjs   # Queue + deliver + idle recap + dream
├── renderer.cjs     # Claude -p response generation
├── executor.cjs     # Task execution (headless Claude)
├── commands.cjs     # Bot /slash commands
├── memory.cjs       # 3-tier KAIROS memory
├── sources/
│   ├── telegram.cjs # Telegram polling
│   └── timer.cjs    # Scheduled events
└── sinks/
    └── telegram.cjs # Telegram delivery

telegram-relay.mjs   # MCP server (tools-only in main session)
telegram-ctl.cjs     # CLI: start/stop/status/restart
```
