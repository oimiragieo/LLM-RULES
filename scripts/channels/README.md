# Channel Daemon

Background messaging daemon for Agent Studio. Monitors Telegram (and future platforms) for messages, responds using Claude, and exposes an HTTP API for integration.

## Architecture

Inspired by [clawhip](https://github.com/Yeachan-Heo/clawhip) (event router) and Claude Code's KAIROS (persistent assistant with memory).

```
[Telegram/Webhook] → [Source] → [Dispatcher] → [Renderer: Claude -p] → [Sink: Telegram API]
                                     ↕                ↕          ↕
                                [Commands]      [Model Router] [Skills Engine]
                                [Rate Limit]    [Personality]  [3-Tier Memory]
                                [Executor]      [Skill Inject] [Dream Engine]
                                 (TASK/RALPH/
                                  ULTRAWORK/
                                  INTERVIEW)
```

Future sources (Discord, Slack, Web widget) follow the same pattern — the dispatcher, renderer, memory, and executor are platform-agnostic.

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

## Bot Commands (24 total)

Type `/` in Telegram to see the command menu:

| Command        | Description                                |
| -------------- | ------------------------------------------ |
| `/start`       | Welcome + command list                     |
| `/help`        | All commands (updated for all phases)      |
| `/status`      | Daemon stats                               |
| `/ping`        | Alive check                                |
| `/model`       | View/switch AI model                       |
| `/memory`      | What I remember about you                  |
| `/dream`       | Consolidate memories                       |
| `/new`         | Fresh conversation (keeps profile)         |
| `/compress`    | Manual compaction                          |
| `/forget`      | Clear all data                             |
| `/title`       | Set conversation title                     |
| `/resume`      | Resume a previous session                  |
| `/sessions`    | List saved sessions                        |
| `/export`      | Export conversation as markdown file       |
| `/tasks`       | Task execution history                     |
| `/approve`     | Approve a pending task                     |
| `/deny`        | Deny a pending task                        |
| `/usage`       | Per-user cost tracking                     |
| `/insights`    | Usage analytics and statistics             |
| `/personality` | Switch personality (6 presets)             |
| `/schedule`    | User-managed cron scheduling               |
| `/pair`        | Device pairing (request + `/pair approve`) |

Regular messages (no `/` prefix) go to Claude for a response.

## Execution Tags

Claude's responses can include execution tags that trigger different processing modes:

| Tag           | Mode             | Description                                                |
| ------------- | ---------------- | ---------------------------------------------------------- |
| `[TASK]`      | One-shot         | Single headless execution with full tool access            |
| `[RALPH]`     | Iterative loop   | Persistent verify/fix cycle, max 5 iterations              |
| `[CLARIFY]`   | Single question  | One clarifying question before proceeding                  |
| `[INTERVIEW]` | Multi-round      | Deep Socratic interview, collects answers before executing |
| `[ULTRAWORK]` | Parallel         | Splits task into concurrent subtasks                       |
| `[HANDOFF]`   | Human escalation | Escalates to human, no automated execution                 |

## Multi-Model Routing

The renderer automatically selects the appropriate model based on message complexity:

| Complexity | Model  | Examples                              |
| ---------- | ------ | ------------------------------------- |
| Simple     | Haiku  | Greetings, casual chat, quick answers |
| Medium     | Sonnet | Coding tasks, analysis, debugging     |
| Complex    | Opus   | Architecture, deep reasoning, design  |

Users can override via `/model`.

## Proactive Mode (KAIROS Tick Engine)

The timer source drives scheduled proactive messages with a 15-second heartbeat tick. Supports morning check-ins, reminders, and custom schedules configured via `/schedule`.

## Skill Extraction

The daemon learns from completed tasks. After successful execution, it extracts reusable patterns (command sequences, file structures, solution approaches) and stores them. On future messages, matching skills are auto-injected into the prompt context.

## Rate Limiting

Per-user rate limiting at 10 messages/minute (configurable). Excess messages receive a polite rate-limit response without consuming API calls.

## Webhook Source

External systems can push events via `POST /webhook`. Supports GitHub webhooks, CI pipeline events, and custom payloads. Events are routed through the standard dispatcher pipeline.

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
├── dispatcher.cjs   # Queue + deliver + tags + rate limit + interviews
├── renderer.cjs     # Claude -p + model routing + personality + skill inject
├── executor.cjs     # Task/Ralph/Ultrawork execution + rate limit retry
├── commands.cjs     # Bot /slash commands (24 commands)
├── memory.cjs       # 3-tier KAIROS memory
├── skills.cjs       # Skill extraction engine (learns from tasks)
├── sources/
│   ├── telegram.cjs # Telegram polling
│   ├── webhook.cjs  # Webhook source (POST /webhook)
│   └── timer.cjs    # KAIROS tick/heartbeat engine
└── sinks/
    └── telegram.cjs # Telegram delivery (sendMessage + sendDocument)

telegram-relay.mjs   # MCP server (tools-only in main session)
telegram-ctl.cjs     # CLI: start/stop/status/restart
```
