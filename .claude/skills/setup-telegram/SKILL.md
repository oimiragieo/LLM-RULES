---
name: setup-telegram
version: 1.3.0
description: Check Telegram bot configuration and guide setup if anything is missing.
category: infrastructure
trigger: when user says /setup-telegram, "setup telegram", "configure telegram bot"
tools: [Read]
tags: [telegram, setup, configuration]
invoked_by: user
user_invocable: true
error_handling: graceful
verified: true
---

# Setup Telegram

Check if the Telegram bot is properly configured by reading config files. Do NOT use Bash — use the Read tool only.

## Files to check

Read each of these files and verify the required values:

1. **Read `.env`** in the project root. Check for:
   - `TELEGRAM_BOT_TOKEN` — must exist and be non-empty
   - `TELEGRAM_OWNER_ID` — must exist (numeric Telegram user ID)
   - `CHANNEL_AUTO_START` — must be `true`
   - `CHANNEL_PROJECT_ROOT` — the absolute path to the project the daemon works with (e.g., `C:\dev\projects\agent-studio`). Task executors use this as their working directory for git, file, and code operations. If missing, defaults to the daemon's startup directory.
   - `TELEGRAM_ALLOWED_USERS` — recommended (comma-separated user IDs)
   - `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` — needed for headless monitor auth

2. **Read `~/.claude/channels/telegram/access.json`** (path: `C:\Users\oimir\.claude\channels\telegram\access.json`). Check for:
   - `allowFrom` array with at least one user ID

3. **Read `~/.claude/channels/telegram/.env`** (path: `C:\Users\oimir\.claude\channels\telegram\.env`). Check for:
   - `TELEGRAM_BOT_TOKEN` present

4. **Read `.claude/.mcp.json`**. Check for:
   - `telegram-relay` key in `mcpServers`

## Report format

Show a simple checklist:

```
Telegram Setup Status:
  [x] .env: Bot token configured
  [x] .env: Owner ID: 6521653928
  [x] .env: CHANNEL_AUTO_START=true
  [x] .env: CHANNEL_PROJECT_ROOT=C:\dev\projects\agent-studio
  [x] .env: Allowed users: 6521653928
  [x] .env: Auth token configured (API key or OAuth token)
  [x] Voice: transcribe-anything installed (pip)
  [x] MCP: telegram-relay registered
  [x] access.json: 1 allowed user
  [x] channels/.env: token present
```

For any `[ ]` items, tell the user exactly what to add and where.

**If both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are missing**, tell the user:

- "The headless Telegram monitor needs auth credentials to run independently."
- "Option 1: Run `! claude setup-token` in your terminal, then add `CLAUDE_CODE_OAUTH_TOKEN=<token>` to `.env`"
- "Option 2: Add `ANTHROPIC_API_KEY=sk-ant-...` to `.env` (get one from console.anthropic.com)"
- "Without one of these, the monitor can't authenticate and will fail to start."

If everything passes: "All configured! Run `/enable-telegram` to start monitoring."

**Voice message support (optional):** If the user wants voice messages to be transcribed, they need:

- `pip install transcribe-anything` — Whisper-based speech-to-text (required for voice)
- `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` in `.env` — for TTS audio responses (optional)
- Without `transcribe-anything`, voice messages get a "please type instead" fallback

## Important

- Use ONLY the Read tool — do NOT use Bash, curl, or any external commands
- Do NOT attempt to validate the token against the Telegram API
- The router lockdown prevents Bash — this skill must work with Read only
