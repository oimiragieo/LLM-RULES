---
name: channel-management
description: Manage Claude Code --channels sessions (start/stop/status/health) via channel-manager.cjs and terminal-tracker.cjs.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, TaskUpdate]
agents: [developer, devops, heartbeat-orchestrator]
category: 'External Integrations'
tags: [channels, telegram, session, lifecycle, pid, terminal, health]
best_practices:
  - Always call isChannelRunning() before startChannel() to avoid duplicate sessions
  - Track PID via terminal-tracker after every start
  - Run health check within 10 seconds of start to confirm session is live
  - Use CHANNEL_AUTO_START=true in .env only for supervised production environments
error_handling: strict
streaming: not-applicable
---

# Channel Management

## Overview

This skill manages the full lifecycle of a Claude Code `--channels` session (Telegram bot, Discord bot, or any plugin-based channel integration). It wraps the CLI tools at `.claude/tools/cli/channel-manager.cjs` and `.claude/tools/cli/terminal-tracker.cjs` and provides a repeatable, observable workflow for:

1. **Starting** a channel session in a new Windows Terminal tab
2. **Stopping** a running channel session cleanly
3. **Checking status** and PID liveness
4. **Health-checking** the session via the terminal tracker

## When to Invoke

```javascript
Skill({ skill: 'channel-management' });
```

Invoke when:

- `CHANNEL_AUTO_START=true` is set and session startup must be verified on agent boot
- A user or cron job requests manual channel lifecycle management
- A channel session appears to have crashed and needs restart
- Diagnosing why Telegram/Discord messages are not being received
- Inspecting or pruning orphaned channel PID entries

## The Iron Law

```
NEVER start a channel session without checking isChannelRunning() first.
NEVER assume a tracked PID is alive without calling isPidAlive(pid).
NEVER restart after a crash without calling killOrphaned() to prune stale entries.
```

---

## Workflow

### Step 0: Read Memory Context (MANDATORY)

Before executing any lifecycle action, read memory to check for known issues:

```bash
node -e "const fs=require('fs');const p='.claude/context/memory/learnings.md';if(fs.existsSync(p))console.log(fs.readFileSync(p,'utf8').split(/\r?\n/).slice(0,80).join('\n'));"
```

Check `.claude/context/memory/issues.md` for any known channel startup problems:

```bash
node -e "const fs=require('fs');const p='.claude/context/memory/issues.md';if(fs.existsSync(p))console.log(fs.readFileSync(p,'utf8').split(/\r?\n/).slice(0,60).join('\n'));"
```

### Step 1: Check isChannelRunning

**Command:**

```bash
node -e "
const { isChannelRunning, getChannelPid } = require('./.claude/tools/cli/channel-manager.cjs');
const running = isChannelRunning();
const pid = getChannelPid();
console.log(JSON.stringify({ running, pid }));
"
```

**Expected output:** `{"running":false,"pid":null}` (not running) or `{"running":true,"pid":12345}` (running)

**Verify:** Exit code 0 and valid JSON printed to stdout.

**Decision gate:**

- `running: true` → Skip Step 2 (already running), proceed to Step 4 (health check)
- `running: false` → Continue to Step 2

### Step 2: Start Channel Session (if not running)

**Pre-condition:** Confirm `TELEGRAM_BOT_TOKEN` is set:

```bash
node -e "
require('dotenv').config({ path: '.env' });
const token = process.env.TELEGRAM_BOT_TOKEN;
console.log(token ? 'TOKEN_PRESENT' : 'TOKEN_MISSING');
"
```

**If TOKEN_MISSING:** Log to issues.md and abort — channel cannot start without credentials.

**Start command:**

```bash
node -e "
const { startChannel } = require('./.claude/tools/cli/channel-manager.cjs');
const result = startChannel();
console.log(JSON.stringify(result));
"
```

**Expected output:** `{"ok":true,"pid":12345,"reason":"started"}` on success, or `{"ok":false,"pid":null,"reason":"TELEGRAM_BOT_TOKEN not set — skipped"}` when token missing.

**Verify:** `ok: true` in JSON output. Exit code 0.

### Step 3: Track PID

After a successful start, confirm the PID is registered in the tracker:

```bash
node -e "
const { listTracked } = require('./.claude/tools/cli/terminal-tracker.cjs');
const sessions = listTracked();
const channel = sessions.filter(s => s.purpose === 'channel-session');
console.log(JSON.stringify(channel, null, 2));
"
```

**Expected output:** Array containing at least one entry with `"status": "active"` and a numeric `"pid"`.

**Verify:** Entry exists with `status: "active"`.

### Step 4: Health Check

Confirm the session is alive after startup (or as a standalone health probe):

```bash
node -e "
const { isChannelRunning, getChannelPid } = require('./.claude/tools/cli/channel-manager.cjs');
const { listTracked } = require('./.claude/tools/cli/terminal-tracker.cjs');
const running = isChannelRunning();
const pid = getChannelPid();
const tracked = listTracked().find(s => s.purpose === 'channel-session' && s.status === 'active');
console.log(JSON.stringify({
  health: running ? 'OK' : 'DEGRADED',
  pid,
  trackerEntry: tracked || null
}));
"
```

**Expected output:** `{"health":"OK","pid":12345,"trackerEntry":{...}}` when healthy.

**Verify:** `health: "OK"` in JSON. If `health: "DEGRADED"`, proceed to Step 5 (restart).

### Step 5: Stop Channel Session

Use when explicitly stopping the channel or before a clean restart:

```bash
node -e "
const { stopChannel } = require('./.claude/tools/cli/channel-manager.cjs');
const result = stopChannel();
console.log(JSON.stringify(result));
"
```

**Expected output:** `{"ok":true,"reason":"stopped"}` or `{"ok":true,"reason":"not-running"}`.

**Verify:** `ok: true`.

### Step 6: Prune Orphaned Entries

After a crash or unexpected shutdown, clean up stale PID entries:

```bash
node -e "
const { killOrphaned } = require('./.claude/tools/cli/terminal-tracker.cjs');
killOrphaned();
console.log('Orphan prune complete');
"
```

**Expected output:** `Orphan prune complete`

**Verify:** Exit code 0. Re-run Step 1 to confirm `running: false` after prune.

### Step 7: Log Outcome to Memory

After any lifecycle action, append a brief note:

```bash
# Append to learnings.md (adjust message as appropriate)
node -e "
const fs = require('fs');
const ts = new Date().toISOString();
const entry = '\n## ' + ts + ' — channel-management\n- Channel session lifecycle action completed. PID: <PID>. Status: <STATUS>.\n';
fs.appendFileSync('.claude/context/memory/learnings.md', entry, 'utf8');
console.log('Memory updated');
"
```

---

## Auto-Start on Session Boot

When `CHANNEL_AUTO_START=true` is set in `.env`, agents should execute this skill at startup:

```javascript
// In agent Step 0 or heartbeat-orchestrator boot sequence
if (process.env.CHANNEL_AUTO_START === 'true') {
  Skill({ skill: 'channel-management' });
}
```

The skill is idempotent — calling it when the session is already running is a safe no-op.

---

## Environment Variables

| Variable              | Required | Default                                   | Purpose                                                    |
| --------------------- | -------- | ----------------------------------------- | ---------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`  | YES      | —                                         | Telegram bot credentials                                   |
| `CHANNEL_AUTO_START`  | NO       | `false`                                   | Auto-start on agent boot                                   |
| `CHANNEL_PLUGINS`     | NO       | `plugin:telegram@claude-plugins-official` | Space-separated plugin list                                |
| `CHANNEL_PERMISSIONS` | NO       | —                                         | Extra claude flags (e.g. `--dangerously-skip-permissions`) |

---

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execution hook validates that the `action` field is a known enum value and that a `TELEGRAM_BOT_TOKEN` guard is in place for `start` actions.

---

## Anti-Patterns

- **Never call `startChannel()` in a tight loop** without checking `isChannelRunning()` first — each call spawns a new Windows Terminal tab
- **Never assume the tracker file is the source of truth** without cross-checking PID liveness via `isPidAlive()`
- **Never set `CHANNEL_AUTO_START=true` without monitoring** — silent crashes will not be detected without a health-check cron
- **Never use `shell: true`** in any child process spawned from this skill — use array arguments with `shell: false` (already enforced in `channel-manager.cjs`)

---

## References

- `.claude/tools/cli/channel-manager.cjs` — Core lifecycle API (`startChannel`, `stopChannel`, `isChannelRunning`, `getChannelPid`)
- `.claude/tools/cli/terminal-tracker.cjs` — PID registry (`registerSpawn`, `listTracked`, `killOrphaned`, `cleanup`)
- `.claude/context/runtime/terminal-pids.json` — Live PID tracker state file

---

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md` and `.claude/context/memory/issues.md` for known channel startup problems.

**After completing:** Append outcome to `.claude/context/memory/learnings.md` with timestamp and action taken.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
