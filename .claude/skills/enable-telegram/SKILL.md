---
name: enable-telegram
version: 7.0.0
description: Start Telegram monitoring. Auto-enables voice pipeline if ElevenLabs or OpenAI TTS keys are detected.
category: infrastructure
trigger: when user says /enable-telegram, "start telegram", "enable telegram"
tools: [Agent, Read]
tags: [telegram, monitoring, background, daemon, voice]
invoked_by: user
user_invocable: true
error_handling: graceful
verified: true
---

# Enable Telegram

## Step 1: Check if already running

Read `.claude/context/runtime/channel-daemon.pid`. If it exists and has content, verify the PID is alive using `node -e "try { process.kill(PID, 0); console.log('ALIVE') } catch { console.log('DEAD') }"`. If ALIVE, tell the user the daemon is already running and show them status commands. Done — do NOT try to start again.

## Step 2: Start the daemon

Spawn a developer agent:

```
subagent_type: developer
prompt: Run this command and report the output: node scripts/channels/telegram-ctl.cjs start
```

## Step 3: Auto-detect voice pipeline

Read `.env` and check for `ELEVENLABS_API_KEY` or `OPENAI_API_KEY`. If either is set, tell the user:

"Voice pipeline auto-enabled — voice messages will be transcribed (Whisper) and responded to with audio (ElevenLabs/OpenAI TTS)."

If neither is set, just say:

"Text-only mode. Add `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` to `.env` for voice message support."

## Step 4: Confirm

Tell the user what's active:

- Daemon status (running on port 3101)
- Text messaging: active
- Voice pipeline: active/inactive
- Memory: loaded (N chats, N profiles)
- Commands: type `/` in Telegram for the menu

## Important

- Do NOT use curl to check daemon health — it's blocked by security hooks
- Use `node -e` with `process.kill(pid, 0)` or `http.get` for health checks
- The PID file + kill(0) check is sufficient to confirm the daemon is alive
