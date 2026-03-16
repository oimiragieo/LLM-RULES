---
name: scheduled-tasks
version: 1.1.0
description: Schedule recurring tasks and heartbeat monitoring using Claude Code's cron system (CronCreate/CronList/CronDelete). Implements the Agentic Heartbeat Pattern for ecosystem health monitoring.
category: infrastructure
trigger: when user wants recurring tasks, scheduled maintenance, heartbeat monitoring, periodic health checks, cron jobs
tools:
  [CronCreate, CronList, CronDelete, Read, Bash, TaskCreate, TaskUpdate, TaskList, MemoryRecord]
dependencies: []
tags: [cron, scheduling, heartbeat, monitoring, maintenance, infrastructure]
model: haiku
invoked_by: both
user_invocable: true
error_handling: graceful
verified: true
---

# Scheduled Tasks & Heartbeat Skill

**Official docs:** <https://code.claude.com/docs/en/scheduled-tasks>

## Primary Interface: /loop Slash Command

The primary user-facing way to invoke scheduled tasks is via the `/loop` command. This is the
recommended interface for most users.

### Syntax

```
/loop <interval> <prompt>         # interval-based
/loop every 5m <prompt>           # explicit "every" syntax
/loop 2h <prompt>                 # shorthand hours
/loop at 8:00am <prompt>          # time-based (daily at local time)
```

### Common Intervals

```
2m, 5m, 10m, 15m, 30m            # minutes
1h, 2h, 4h, 6h, 12h              # hours
at 8:00am, at 3:00pm             # daily time triggers (local timezone)
```

### Examples

```
/loop 5m Check for new Telegram messages and reply
/loop 2h Distill recent session learnings into .claude/context/memory/learnings.md
/loop at 8:00am Read issues.md and CHANGELOG.md and give morning briefing
/loop every 4h Run pnpm search:code "indexing" to refresh codebase index
/loop 30m Heartbeat: read agent-health.json, check memory sizes, TaskList for stuck tasks
```

### Chaining: Run a Slash Command on a Schedule

```
/loop 20m /review-pr 1234         # run a slash command on a schedule
/loop 2h /heartbeat-start         # restart heartbeat ecosystem every 2 hours
```

### Key Behaviors

| Behavior               | Detail                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| **Jitter**             | Tasks fire up to 10% of their period late (max 15 min) — avoids stampedes        |
| **No catch-up**        | Missed fires are NOT replayed after sleep/hibernation                            |
| **Session-scoped**     | Loops stop automatically when the Claude Code session ends                       |
| **Local timezone**     | `at HH:MMam/pm` triggers use local time, not UTC                                 |
| **Max 50 loops**       | Hard cap of 50 concurrent scheduled tasks per session                            |
| **3-day expiry**       | All loops silently self-delete 3 days after creation (reschedule before day 2.5) |
| **Fire-between-turns** | Tasks fire only when Claude is idle, not mid-response                            |

---

## Heartbeat OS Pattern

Use `/loop` to build a self-improving agent ecosystem that runs continuously in the background:

### Continuous Reflection (every 2h)

```
/loop 2h Read .claude/context/memory/issues.md and recent session context. Extract patterns, workarounds, and decisions. Append to learnings.md and decisions.md.
```

### Autonomous Evolution (daily at 3am)

```
/loop at 3:00am Review learnings.md and test failures. Use agent-updater skill to improve agent .md files. Run pnpm validate:full before finalizing.
```

### Morning Briefing (weekdays at 8am)

```
/loop at 8:00am Read CHANGELOG.md and issues.md. Summarize technical debt, flaky tests, and top 2 tasks for today.
```

### Context Drain (every 15m)

```
/loop 15m Check if all tasks are done. If TaskList shows zero in_progress tasks, summarize session to memory and surface readiness for /clear to user.
```

### Codebase Indexing (every 4h)

```
/loop 4h Run pnpm code:index:reindex to refresh the BM25 and semantic search index.
```

### Start the Full Heartbeat Ecosystem

Use `/heartbeat-start` to launch all 7 loops in one command. See `.claude/commands/heartbeat-start.md`.

---

## Overview

Provides patterns for scheduling recurring tasks using Claude Code's built-in cron system (`CronCreate`/`CronList`/`CronDelete`). Also implements the Agentic Heartbeat Pattern for keeping the agent ecosystem healthy.

**Core distinction:**

- **Cron tasks**: "Run this SPECIFIC task at 3am Tuesday" — deterministic, time-anchored maintenance
- **Heartbeat**: "Check in periodically; act IF something needs attention" — awareness-based, conditional liveness

## Decision Framework: When to Use Cron

### Quick Decision Checklist (run through before calling CronCreate)

1. **Is the task recurring?** If NO → use `TaskCreate` instead (cron is for recurring work only).
2. **Can it tolerate up to 15-minute jitter?** If NO → use OS cron or GitHub Actions (CronCreate has built-in jitter).
3. **Is it acceptable to lose it on terminal close?** If NO → use OS cron (`crontab -e`) or GitHub Actions for persistence.
4. **Will it complete within the session?** If the session may end before the task fires → prefer OS-level scheduling.
5. **Is it for monitoring/health checks?** If YES → CronCreate is the right tool (this is its primary use case).
6. **Are there 10+ other cron tasks already scheduled?** If YES → reconsider; stay under 10 concurrent tasks (50-cap headroom).

### Decision Tree

```
Need a recurring task?
├── NO → Use TaskCreate (one-shot) or Task()
└── YES
    ├── Must survive terminal close?
    │   ├── YES → Use OS cron (crontab -e) or GitHub Actions
    │   └── NO (session-scoped is fine)
    │       ├── Time-critical (< 15 min precision required)?
    │       │   ├── YES → Use OS cron or GitHub Actions
    │       │   └── NO → CronCreate is appropriate ✓
    │       └── Is it monitoring/heartbeat?
    │           └── YES → CronCreate is ideal ✓
```

### When to Use CronCreate

- Session-scoped heartbeat monitoring (agent health, memory sizes, stuck tasks)
- Periodic index rebuilds during an active work session
- Scheduled memory rotation checks while actively developing
- Auto-reschedule tasks that keep other cron tasks alive
- Morning briefings and context-drain checks during sessions

### When to Use OS Cron / GitHub Actions Instead

- Tasks that must run even when Claude Code is not open
- Production scheduled jobs (backups, deployments, data pipelines)
- Tasks requiring sub-minute precision or hard time guarantees
- Any task where silent expiry (3-day limit) is unacceptable

### When NOT to Use CronCreate

- One-time tasks (use `Task` or `TaskCreate`)
- Tasks triggered by events rather than time (use hooks or event listeners)
- Tasks requiring external system persistence across Claude restarts
- Time-critical alerts where 15-minute jitter is unacceptable

### Session-Scope Context Note

> **CRITICAL — Session-Scoped Loops:** All `CronCreate` loops are registered to the current Claude Code session and are permanently lost when the session ends (terminal close, `/clear`, or session restart). After any session restart, all loops must be re-registered manually.
>
> **heartbeat-orchestrator handles this automatically.** When the heartbeat ecosystem is running, `heartbeat-orchestrator` is responsible for detecting missing loops after session restarts and re-registering them. If you are not using `heartbeat-orchestrator`, you must re-register all loops yourself at the start of each new session.
>
> To check which loops are active: `CronList()`. If loops are missing after a restart, re-run the setup commands or invoke `/heartbeat-start`.

## Quick Reference

```javascript
// Schedule a recurring task
CronCreate({ schedule: '*/30 * * * *', task: 'heartbeat check prompt' });

// List active cron tasks
CronList();

// Remove a scheduled task
CronDelete({ id: 'abc12345' });
```

## Constraints (CRITICAL — Read Before Using)

| Constraint             | Detail                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| **Session-scoped**     | All cron tasks die when the terminal closes — no persistence across restarts                |
| **50-task cap**        | Maximum 50 concurrent scheduled tasks per session                                           |
| **3-day auto-expiry**  | Recurring tasks self-delete 3 days after creation (SILENT — must reschedule before day 2.5) |
| **Fire-between-turns** | Tasks fire only when Claude is idle, not mid-response                                       |
| **No catch-up**        | Missed fires are NOT replayed — task fires once at next idle opportunity                    |
| **Jitter**             | Tasks fire up to 10% of their period late (max 15 min) to avoid API stampedes               |
| **Timezone**           | All cron expressions use local system timezone, NOT UTC                                     |
| **No extended syntax** | `L`, `W`, `?`, name aliases like `MON` are NOT supported                                    |

## Cron Expression Reference

Standard 5-field syntax: `minute hour day-of-month month day-of-week`

| Expression     | Meaning                  |
| -------------- | ------------------------ |
| `*/30 * * * *` | Every 30 minutes         |
| `*/5 * * * *`  | Every 5 minutes          |
| `0 * * * *`    | Every hour on the hour   |
| `0 2 * * *`    | Every day at 2am local   |
| `0 3 * * 0`    | Every Sunday at 3am      |
| `0 6 * * 1-5`  | Weekdays at 6am          |
| `0 0 */2 * *`  | Every 2 days at midnight |

## Heartbeat Pattern

### Design Philosophy (OpenClaw-inspired)

Cheap file reads FIRST, LLM only when needed. Achieve 60-80% cost reduction for healthy-state ticks.

**Execution model:**

1. Heartbeat fires at scheduled interval
2. Read `HEARTBEAT.md` checklist (cheap file read — no LLM call)
3. If blank/headers-only → emit `HEARTBEAT_OK` immediately, no LLM invocation
4. Read cheap signals (file sizes, `agent-health.json`, task list) — still no LLM
5. If ALL signals green → emit `HEARTBEAT_OK`
6. Only if signals indicate issues → invoke LLM with full HEARTBEAT.md context

### Heartbeat Checklist

Check these signals on each heartbeat tick (in order — cheapest first):

1. **Agent health**: Read `agent-health.json` — any agents `status: degraded`?
2. **Memory sizes**: Is `learnings.md` > 40KB? Is `decisions.md` > 80KB?
3. **Stuck tasks**: `TaskList()` — any tasks in `in_progress` for > 2 hours?
4. **Hook errors**: Any hooks with `errorRate > 0.05` in `agent-health.json`?
5. **Reflection queue**: Does `reflection-reminder.txt` exist and is stalled?
6. **BM25 freshness**: Is index mtime > 24 hours?

If ALL healthy → return `HEARTBEAT_OK` (no further LLM invocation needed)
If ANY unhealthy → spawn appropriate agent to fix, then report

### HEARTBEAT.md Template

Create `HEARTBEAT.md` in the project root as standing instructions for the heartbeat:

```markdown
# Agent Studio Heartbeat Checklist

## Every Tick (30 minutes)

### Memory Health

- [ ] learnings.md > 40KB? → trigger rotation via node .claude/lib/memory/memory-rotator.cjs
- [ ] decisions.md > 80KB? → warn user
- [ ] issues.md has unresolved P0 items? → surface to user

### Agent Registry Health

- [ ] agent-health.json has any status: degraded? → alert
- [ ] Any hooks have errorRate > 5%? → alert with hook name

### Task Health

- [ ] Any tasks stuck in in_progress for > 2 hours? → surface task IDs

### Reflection Queue

- [ ] reflection-reminder.txt exists? → alert (reflection queue stalled)

## Self-Maintenance

- [ ] This heartbeat task older than 2.5 days? → reschedule before 3-day expiry
```

## Scheduled Maintenance Patterns

### Index Rebuild (nightly)

```javascript
CronCreate({
  schedule: '0 2 * * *',
  task: 'Rebuild BM25 search index for code discovery. Run: cd /project && pnpm code:index:reindex',
});
```

### Memory Rotation Check (weekly)

```javascript
CronCreate({
  schedule: '0 3 * * 0',
  task: 'Check memory file sizes and rotate if needed. Run node .claude/lib/memory/memory-rotator.cjs and report results.',
});
```

### Agent Registry Refresh (daily)

```javascript
CronCreate({
  schedule: '0 6 * * *',
  task: 'Regenerate agent registry: pnpm agents:registry and verify 72 agents are registered.',
});
```

### Heartbeat (every 30 minutes)

```javascript
CronCreate({
  schedule: '*/30 * * * *',
  task: 'Run heartbeat check: Read HEARTBEAT.md checklist, check agent-health.json, memory file sizes, and stuck tasks. Reply HEARTBEAT_OK if all healthy, otherwise describe issues found.',
});
```

### Auto-Reschedule (every 2 days — prevents 3-day silent expiry)

```javascript
CronCreate({
  schedule: '0 0 */2 * *',
  task: 'Re-register all scheduled tasks to prevent 3-day auto-expiry. Call CronList() to check what tasks exist, then recreate any that are missing or older than 2.5 days.',
});
```

### Reschedule a Specific Task (correct order — no scheduling gap)

When replacing a running cron task with updated settings, ALWAYS use CronCreate FIRST, then CronDelete.
This prevents a scheduling gap where no cron task exists between delete and create.

```javascript
// CORRECT ORDER: Create new before deleting old to prevent scheduling gap

// Step 1: Create the new task FIRST (new task is now running)
CronCreate({
  schedule: '*/30 * * * *',
  task: 'Updated heartbeat prompt with new checks.',
});

// Step 2: THEN delete the old task (old ID obtained from CronList())
// There is never a window where no heartbeat cron exists
CronDelete({ id: 'old-task-id-from-cronlist' });

// WRONG ORDER (creates a scheduling gap — do NOT do this):
// CronDelete({ id: "old-id" });   // <-- gap begins here
// CronCreate({ ... });             // <-- gap ends here (tasks missed during gap)
```

### Weekly Validation (every Sunday)

```javascript
CronCreate({
  schedule: '0 3 * * 0',
  task: 'Run full framework validation: pnpm validate:full and report any errors found.',
});
```

## Integration Points

| Infrastructure       | Integration Method                                      | Heartbeat Action                     |
| -------------------- | ------------------------------------------------------- | ------------------------------------ |
| `agent-health.json`  | `Read` tool → JSON parse                                | Check `status`, `errorRate` per hook |
| `learnings.md`       | `Bash: wc -c` or Read + check size                      | Alert if > 40KB threshold            |
| `decisions.md`       | `Bash: wc -c` or Read + check size                      | Alert if > 80KB threshold            |
| Task system          | `TaskList()`                                            | Surface stuck in_progress tasks      |
| Memory rotator       | `Bash: node .claude/lib/memory/memory-rotator.cjs`      | Trigger when threshold exceeded      |
| BM25 index           | Check index mtime                                       | Rebuild if mtime > 24h               |
| `pnpm validate:full` | `Bash`                                                  | Weekly validation, surface errors    |
| Reflection queue     | `Read: .claude/context/runtime/reflection-reminder.txt` | Alert if reflection queue stalled    |

## Cost & Performance Controls

| Control                   | Purpose                             | Recommendation            |
| ------------------------- | ----------------------------------- | ------------------------- |
| Cheap checks first        | Read files before invoking LLM      | Always check files first  |
| `HEARTBEAT_OK` early exit | No LLM when all healthy             | Saves 60-80% API costs    |
| haiku model               | Cheaper model for status-only runs  | Use haiku for heartbeats  |
| `lightContext`            | Only HEARTBEAT.md, not full session | Reduces context per tick  |
| 30m default interval      | OpenClaw proven default             | Don't go below 15 minutes |

## Anti-Patterns

- Do NOT use cron for one-time tasks (use `Task`/`TaskCreate` instead)
- Do NOT schedule more than 10 concurrent cron tasks (leave room for user tasks in the 50-cap)
- Do NOT mix heartbeat and maintenance in the same cron task — keep them separate
- ALWAYS include auto-reschedule task to prevent silent 3-day expiry
- Do NOT rely on heartbeat for time-critical alerts — jitter means up to 15 min delay
- Do NOT set interval below 5 minutes — creates API stampede risk
- NEVER use extended cron syntax (`L`, `W`, `?`, named days) — not supported

## Usage Examples

### Start full heartbeat monitoring

```javascript
Skill({ skill: 'scheduled-tasks' });

// 1. Heartbeat every 30 minutes
CronCreate({
  schedule: '*/30 * * * *',
  task: 'Heartbeat: Read .claude/context/memory/agent-health.json, check learnings.md size, run TaskList() for stuck tasks. Reply HEARTBEAT_OK if all healthy.',
});

// 2. Auto-reschedule every 2 days (prevents 3-day expiry)
CronCreate({
  schedule: '0 0 */2 * *',
  task: 'Self-maintenance: CronList() to check active tasks, recreate any missing scheduled tasks.',
});

// 3. Nightly index rebuild
CronCreate({
  schedule: '0 2 * * *',
  task: 'Rebuild search index: pnpm code:index:reindex',
});
```

### Check scheduled task health

```javascript
CronList(); // Verify all expected tasks are registered
// If missing, re-register (3-day expiry may have cleared them silently)
```

### Cancel a specific task

```javascript
CronList(); // Get task IDs
CronDelete({ id: 'abc12345' }); // Cancel by ID
```

## Durable Alternatives (When Session-Scope Is Not Enough)

For tasks that must survive terminal close:

- **Desktop scheduled tasks** (OS-level): survives terminal close, graphical setup
- **GitHub Actions `schedule` trigger**: fully unattended, cloud-run, no terminal required
- **OS cron (`crontab -e`)**: persistent, runs independently of Claude Code

Use Claude Code's `CronCreate` for session-scoped monitoring only. Use OS-level scheduling for critical production tasks.

## Iron Laws

1. **ALWAYS** include an auto-reschedule cron task when setting up heartbeats — the 3-day silent expiry will kill the heartbeat without warning
2. **NEVER** use cron for tasks requiring time-critical precision — jitter up to 10% of period (max 15 min) makes timing non-deterministic
3. **ALWAYS** use cheap file reads before LLM invocation in heartbeat prompts — 60-80% cost reduction for healthy systems
4. **NEVER** exceed 10 concurrent scheduled tasks — leave headroom in the 50-task session cap for user-initiated tasks
5. **ALWAYS** document that cron tasks are session-scoped and will not survive terminal close — this surprises users who expect persistence

## Anti-Patterns

| Anti-Pattern                   | Why It Fails                          | Correct Approach                                |
| ------------------------------ | ------------------------------------- | ----------------------------------------------- |
| No auto-reschedule task        | 3-day expiry silently kills heartbeat | Add `0 0 */2 * *` reschedule cron               |
| Heartbeat interval < 5 minutes | API stampede risk, burns token budget | Use 30 min default; minimum 5 min               |
| LLM invocation on every tick   | 100% API cost with no savings         | Cheap checks first, LLM only when needed        |
| Mixing heartbeat + maintenance | One failure breaks both               | Separate cron tasks per concern                 |
| Extended cron syntax           | Not supported — silent failure        | Use standard 5-field syntax only                |
| Assuming session persistence   | Tasks die on terminal close           | Document limitation; use OS cron for durability |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New scheduling pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
