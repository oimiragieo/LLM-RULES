# Channel Management Rules

## Core Principles

- **Idempotent operations**: Always call `isChannelRunning()` before `startChannel()`. Starting twice spawns a duplicate tab.
- **PID liveness verification**: Never trust the tracker file alone — cross-check with `isPidAlive(pid)`.
- **Token guard**: If `TELEGRAM_BOT_TOKEN` is absent, abort `start` silently and log the skip to memory.
- **Orphan cleanup**: Call `killOrphaned()` before any restart to clear stale PID entries older than 2 hours.
- **Shell safety**: Always use `shell: false` with array arguments — already enforced in `channel-manager.cjs`. Never add `shell: true` wrappers.

## Lifecycle State Machine

```
NOT_RUNNING → [start] → RUNNING
RUNNING     → [stop]  → NOT_RUNNING
RUNNING     → [crash] → DEGRADED
DEGRADED    → [killOrphaned + start] → RUNNING
```

## Anti-Patterns

- **Never** poll `isChannelRunning()` in a tight loop without a sleep — it invokes PowerShell each call
- **Never** delete `terminal-pids.json` manually — use `cleanup()` from `terminal-tracker.cjs`
- **Never** set `CHANNEL_AUTO_START=true` without a health-check cron or heartbeat that detects crashes
- **Never** pass `TELEGRAM_BOT_TOKEN` as a CLI argument — use `.env` only (prevents token leakage in process lists)

## Environment Safety

The `TELEGRAM_BOT_TOKEN` is loaded from `.env` via the `.env` bootstrap in `channel-manager.cjs`.
It is never passed through `process.argv` or shell interpolation.

## Integration Points

- `heartbeat-orchestrator` agent should invoke `channel-management` skill on boot when `CHANNEL_AUTO_START=true`
- `devops` agent uses this skill for manual channel lifecycle operations
- `developer` agent can use this skill when debugging channel startup failures

## Related Files

- `.claude/tools/cli/channel-manager.cjs` — Core lifecycle implementation
- `.claude/tools/cli/terminal-tracker.cjs` — PID registry
- `.claude/context/runtime/terminal-pids.json` — Live PID state
- `.claude/skills/channel-management/SKILL.md` — Full workflow documentation
