---
name: setup-telegram-voice
description: Check if voice message handling is configured — verify Whisper, ElevenLabs/OpenAI TTS keys, and required tools.
version: 1.0.0
category: infrastructure
trigger: when user says /setup-telegram-voice, "setup voice", "configure telegram voice"
tools: [Read]
tags: [telegram, voice, tts, whisper, setup, configuration]
invoked_by: user
user_invocable: true
error_handling: graceful
verified: true
---

# Setup Telegram Voice

Check if voice message handling is properly configured. Use ONLY the Read tool.

## Files to check

1. **Read `.env`** in the project root. Check for:
   - `ELEVENLABS_API_KEY` — ElevenLabs TTS key (primary)
   - `ELEVENLABS_VOICE_ID` — optional, defaults to George voice
   - `OPENAI_API_KEY` — OpenAI TTS fallback (needed if no ElevenLabs key)
   - `WHISPER_MODEL` — optional, defaults to `medium`
   - `TELEGRAM_BOT_TOKEN` — required (same as base telegram setup)

2. **Read `.claude/skills/enable-telegram/SKILL.md`** to confirm the skill exists.

## Report format

```
Telegram Voice Setup:
  [x] Base Telegram: configured (run /setup-telegram for details)
  [x] ElevenLabs API key: configured
  [ ] ElevenLabs voice ID: using default (George - JBFqnCBsd6RMkjVDRZzb)
  [ ] OpenAI API key: not set (optional fallback)
  [x] Whisper model: medium (default)
  [x] Voice skill: installed
```

## If things are missing

- **No ElevenLabs AND no OpenAI key**: "You need at least one TTS provider. Add `ELEVENLABS_API_KEY=<key>` (from elevenlabs.io) or `OPENAI_API_KEY=<key>` (from platform.openai.com) to `.env`"
- **No Whisper**: "The `transcribe-anything` pip package is needed for speech-to-text. Run `pip install transcribe-anything` to install."
- **Base Telegram not configured**: "Run `/setup-telegram` first to configure the bot."

## When everything passes

Tell the user: "Voice pipeline ready! Run `/enable-telegram` to activate. Voice messages sent to the bot will be transcribed and responded to with audio."

## Important

- Use ONLY the Read tool — no Bash, no pip commands
- Don't attempt to validate API keys against external services
- The voice pipeline requires the base Telegram daemon to be running (`/enable-telegram`)
