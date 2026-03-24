# channel-management Command Reference

## CLI Usage

```bash
# Check session status (default)
node .claude/skills/channel-management/scripts/main.cjs status

# Start a channel session
node .claude/skills/channel-management/scripts/main.cjs start

# Stop a running channel session
node .claude/skills/channel-management/scripts/main.cjs stop

# Run a full health check (prunes orphans, checks liveness)
node .claude/skills/channel-management/scripts/main.cjs health
```

## Output Format

All actions emit JSON to stdout:

```json
{
  "ok": true,
  "action": "status",
  "running": false,
  "pid": null,
  "sessions": [],
  "health": "NOT_RUNNING"
}
```

## Exit Codes

| Code | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | Success (session OK or action completed cleanly)                  |
| `1`  | Non-fatal: session not running, degraded health, or token missing |
| `2`  | Fatal error: invalid action, manager not found                    |

## Skill Invocation

```javascript
Skill({ skill: 'channel-management' });
```

## Quick Reference

| Action   | When to Use                                                      |
| -------- | ---------------------------------------------------------------- |
| `status` | Check if the session is running (safe, no side effects)          |
| `start`  | Start the session (idempotent — safe to call if already running) |
| `stop`   | Gracefully stop the session                                      |
| `health` | Full health probe — prunes orphans, verifies PID liveness        |
