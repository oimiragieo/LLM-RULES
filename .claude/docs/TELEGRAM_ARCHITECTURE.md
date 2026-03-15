# Telegram → Claude → Telegram Architecture

> Last updated: 2026-03-15
> Status: **Working** (verified end-to-end)

---

## Message Flow (End-to-End)

```
[User sends message to Telegram bot]
        │
        ▼ every 2 minutes
[Heartbeat cron: telegram-2m]
  └─ runs: node .claude/tools/cli/telegram-poll.cjs
        │
        ▼
[getUpdates?offset=<last>]  ← Telegram Bot API
        │
        ├─ offset advanced BEFORE processing (prevents redelivery on crash/restart)
        │
        ├─ Simple commands → handled inline (no Claude needed)
        │    /help, /status, /loops, /logs, /memory
        │
        ├─ Claude commands → handleAsk() → invokeClaude() → sendMessage()
        │    /ask <text>          — inline Claude invocation
        │    <free-form text>     — any non-slash message
        │    <unknown /command>   — falls through to Claude
        │
        └─ Complex commands → queued to cron-actions-queue.jsonl
             /tasks, /research, /skill, /agent, /workflow,
             /spawn, /approve, /confirm, /deny
        │
        ▼
[invokeClaude(prompt)]
  └─ spawnSync(cmd.exe, [/c, CLAUDE_BIN, -p, prompt, --output-format, text])
  └─ CLAUDECODE='' (MUST be unset — prevents "nested session" error)
  └─ CLAUDE_BIN resolved at startup via `where claude` (works in cron)
        │
        ▼
[Claude stdout captured]
        │
        ▼
[sendMessage(chatId, response)]
  └─ Chunked at 4000 chars (Telegram hard limit: 4096)
  └─ Markdown mode first, plain text fallback on parse error
  └─ Typing indicator sent before Claude processes
        │
        ▼
[Offset persisted to telegram-offset.json]
  └─ .claude/context/tmp/telegram-offset.json
  └─ Survives process restarts — no message reprocessing
```

---

## Key Files

| File | Purpose |
|------|---------|
| `.claude/tools/cli/telegram-poll.cjs` | Main poll loop — runs every 2 min via cron |
| `.claude/tools/cli/telegram-command-router.cjs` | Routes slash commands, builds Claude action objects |
| `.claude/context/tmp/telegram-offset.json` | Persisted getUpdates offset (cross-run state) |
| `.claude/context/runtime/cron-actions-queue.jsonl` | Queue for complex commands (background processing) |
| `.claude/skills/telegram-polling/SKILL.md` | Skill documentation |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | **Yes** | Bot API token from @BotFather |
| `TELEGRAM_OWNER_ID` | Recommended | Your numeric Telegram user ID |
| `TELEGRAM_OWNER_USERNAME` | Recommended | Your Telegram username |
| `TELEGRAM_ALLOWED_USERS` | Recommended | Comma-separated allowed user IDs |
| `TELEGRAM_OWNER_CHAT_ID` | Optional | Chat ID for owner DMs |
| `TELEGRAM_CHAT_IDS` | Optional | Restrict to specific chat IDs |
| `CLAUDE_CLI_PATH` | Optional | Full path to `claude` binary — auto-detected if not set |

---

## Claude Binary Path Resolution (Critical for Cron)

When running in a non-interactive cron context, `npm`'s global bin directory
(`%APPDATA%\npm` on Windows) may not be in `PATH`. The script resolves this at startup:

```javascript
// Priority order:
// 1. CLAUDE_CLI_PATH env var (explicit override)
// 2. `where claude` / `which claude` (auto-detect)
// 3. 'claude' bare name (works if npm bin is on PATH)
```

**Recommended:** Set `CLAUDE_CLI_PATH` in `.env` to the full path found by `where claude`.

On this machine: `C:\Users\oimir\AppData\Roaming\npm\claude`

---

## Session Independence

The system has **no in-memory state** — it is fully restartable:

1. **Offset file** — `telegram-offset.json` persists the last processed `update_id`.
   If the cron restarts mid-run, messages already offset-advanced won't be reprocessed.

2. **No daemon required** — the poll script is stateless, exit-0 always.
   The cron simply re-runs it every 2 minutes.

3. **CLAUDECODE unset** — prevents Claude Code's nested-session guard from
   blocking the `claude -p` subprocess invocation.

---

## Manual Test

```bash
# Option 1: let the script load .env itself
node .claude/tools/cli/telegram-poll.cjs

# Option 2: explicit env
TELEGRAM_BOT_TOKEN=<token> CLAUDE_CLI_PATH=<path> node .claude/tools/cli/telegram-poll.cjs

# Verify bot connectivity only
node -e "
const t=process.env.TELEGRAM_BOT_TOKEN;
require('https').get('https://api.telegram.org/bot'+t+'/getMe',r=>{
  let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log(JSON.parse(d)));
});
"
```

---

## Troubleshooting

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Messages received, no response | `handleAsk` not wired to dispatch | Fixed 2026-03-15: wired at lines 539, 562, 578 |
| `Cannot launch nested Claude Code session` | `CLAUDECODE` env var still set | Script sets `CLAUDECODE: ''` in spawnSync env |
| `claude: command not found` in cron | npm PATH not in cron environment | Set `CLAUDE_CLI_PATH` in `.env` |
| Same message processed twice | Offset not persisted | Offset written to `telegram-offset.json` after each batch |
| 404 from Telegram API | Invalid/expired bot token | Regenerate token via @BotFather |
| Markdown parse error from Telegram | Response contains unescaped markdown | Script retries with `parse_mode` omitted |
| Timeout on long prompts | 90s limit hit | Set `TELEGRAM_CLAUDE_TIMEOUT_MS` env var |

---

## Security

- **Auth**: Only `TELEGRAM_ALLOWED_USERS` IDs can use the bot; `TELEGRAM_OWNER_ID` gets extra commands
- **Shell injection**: `shell: false` + array args prevent injection via message text
- **Token**: Never logged; loaded from `.env` which is gitignored
- **safeParseJSON**: All Telegram API responses parsed safely (prototype pollution guard)
