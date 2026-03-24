<!-- Agent: skill-creator | Task: channel-management | Session: 2026-03-24 -->

# Channel Management Skill Workflow

## Purpose

This workflow documents the multi-step execution path for the `channel-management` skill in agent contexts. It covers both the standard lifecycle path and the crash-recovery path.

## Trigger Conditions

- `CHANNEL_AUTO_START=true` and `heartbeat-orchestrator` is booting
- User explicitly requests channel start/stop/status/health
- A channel health check fails (DEGRADED state detected)
- A cron job fires for periodic channel health verification

## Agents Involved

| Agent                    | Role                                         |
| ------------------------ | -------------------------------------------- |
| `heartbeat-orchestrator` | Invokes on boot if `CHANNEL_AUTO_START=true` |
| `devops`                 | Manual lifecycle operations                  |
| `developer`              | Debugging channel startup failures           |

## Standard Lifecycle Flow

```
[TRIGGER]
    │
    ▼
Step 1: Invoke Skill
    Skill({ skill: 'channel-management' })
    │
    ▼
Step 2: Status Check
    node .claude/skills/channel-management/scripts/main.cjs status
    → { running: bool, pid: int|null, health: "OK"|"NOT_RUNNING" }
    │
    ├─ running: true → Step 4 (Health Check) ─────────────────┐
    │                                                          │
    └─ running: false → Step 3 (Start)                        │
                                                               │
Step 3: Start Session                                          │
    node .claude/skills/channel-management/scripts/main.cjs start │
    → { ok: bool, pid: int|null, health: "OK"|"SKIPPED" }     │
    │                                                          │
    ├─ ok: false, health: SKIPPED → Log skip, exit (no token) │
    │                                                          │
    └─ ok: true ─────────────────────────────────────────────▶│
                                                               │
Step 4: Health Check  ◀────────────────────────────────────────┘
    node .claude/skills/channel-management/scripts/main.cjs health
    → { health: "OK"|"DEGRADED", pid: int|null, trackerEntry: obj|null }
    │
    ├─ health: OK → Step 5 (Log + Done)
    │
    └─ health: DEGRADED → Crash Recovery Flow
```

## Crash Recovery Flow

```
DEGRADED state detected
    │
    ▼
Step CR-1: Stop
    node .claude/skills/channel-management/scripts/main.cjs stop
    │
    ▼
Step CR-2: Prune Orphans (handled automatically by 'health' action)
    killOrphaned() via terminal-tracker.cjs
    │
    ▼
Step CR-3: Restart
    node .claude/skills/channel-management/scripts/main.cjs start
    │
    ▼
Step CR-4: Re-check Health
    node .claude/skills/channel-management/scripts/main.cjs health
    │
    ├─ health: OK → Step 5 (Log + Done)
    │
    └─ health: DEGRADED (2nd time) → Escalate to devops or log to issues.md
```

## Step 5: Log Outcome

```bash
# Append to learnings.md
node -e "
const fs = require('fs');
const ts = new Date().toISOString();
const entry = '\n## ' + ts + ' — channel-management\n- Channel session lifecycle completed.\n';
fs.appendFileSync('.claude/context/memory/learnings.md', entry, 'utf8');
"
```

## Observability

All lifecycle actions emit events to `.claude/context/runtime/tool-events.jsonl` via `hooks/post-execute.cjs`.

Inspect recent events:

```bash
node -e "
const fs = require('fs');
const f = '.claude/context/runtime/tool-events.jsonl';
if (!fs.existsSync(f)) { console.log('No events yet'); process.exit(0); }
const lines = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-10);
lines.forEach(l => { try { console.log(JSON.parse(l)); } catch(_) {} });
"
```

## Related Files

- `.claude/skills/channel-management/SKILL.md` — Skill definition and full workflow
- `.claude/tools/cli/channel-manager.cjs` — Core lifecycle implementation
- `.claude/tools/cli/terminal-tracker.cjs` — PID registry
