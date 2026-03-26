# Active Context — Session Handoff 2026-03-25

**NEXT ACTION (IMMEDIATE):** Fix the channel-auto-start hook so Telegram starts automatically on session boot. The channel-manager.cjs start command works perfectly when called manually — the hook is the only broken piece.

## Bug: channel-auto-start.cjs hook doesn't fire properly

### What works (proven this session):
- `node .claude/tools/cli/channel-manager.cjs start` — opens a new terminal tab, VBScript auto-accepts confirmation, Claude starts with Telegram channel
- `node .claude/tools/cli/channel-manager.cjs stop` — kills the session
- `node .claude/tools/cli/channel-manager.cjs restart` — force-kill + re-spawn
- Voice-to-voice pipeline: Whisper STT (local GPU) → Claude → ElevenLabs TTS → Telegram audio reply
- VBScript AppActivate("claude") + SendKeys "{ENTER}" — auto-accepts the development channels confirmation prompt

### What's broken:
- `.claude/hooks/channels/channel-auto-start.cjs` (UserPromptSubmit hook) doesn't reliably spawn the channel
- When it DOES fire, it spawns multiple windows (one per prompt) because the cooldown lockfile isn't written fast enough
- The hook uses `spawn('node', [channelManager, 'start'], {detached: true})` which creates timing issues
- `wt new-tab` from a detached process opens a new WINDOW (not a tab) and sometimes opens PowerShell instead of cmd

### Root causes to investigate:
1. Claude's hook runner may kill the process before stdin 'end' event fires (the hook reads stdin but may not need to)
2. Multiple hooks fire in parallel on same prompt — race condition on lockfile
3. Detached spawn from hook subprocess has different wt behavior than interactive terminal

### Possible fixes to try:
1. Use `execFileSync` instead of `spawn` in the hook (but this blocked earlier due to hook timeout — the 20s channel-manager start was too slow)
2. Write lockfile SYNCHRONOUSLY at the very top of the hook before any async operations
3. Skip stdin reading entirely — UserPromptSubmit hooks may not need to drain stdin
4. Use a simpler check: just try to write a PID file atomically with `wx` flag (exclusive create)

### Key files:
- `.claude/hooks/channels/channel-auto-start.cjs` — the broken hook
- `.claude/tools/cli/channel-manager.cjs` — the working channel manager (bat launcher + VBScript auto-accept)
- `.claude/context/tmp/_channel-launch.bat` — generated bat file for wt to execute
- `.claude/context/tmp/_auto-accept.vbs` — generated VBScript for Enter keystroke

## What was accomplished this session:
- Ecosystem audit: agents.md 102→110, JSON.parse safety in 2 lib files
- TDD v1.4.0 confirmed current
- Setup script enhanced: tool detection, .env wizard, validation step (163→357 lines)
- Telegram channel system built: channel-manager with VBScript auto-accept, voice pipeline skill, auto-start hook
- Multi-model review via Codex CLI: 5 architecture findings
- Dependabot CVE fixed (flatted >=3.4.2)
- ElevenLabs API key configured
- 10+ commits pushed to main

## Token usage: ~$181 today (212M tokens as of last ccusage check)
