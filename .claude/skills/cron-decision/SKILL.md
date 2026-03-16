---
name: cron-decision
version: 1.0.0
description: Decision framework for agents to determine WHEN and WHETHER to use Claude Code's native cron scheduler (CronCreate/CronList/CronDelete) vs OS cron, GitHub Actions, or simple Task() delegation.
category: Infrastructure
tags: [cron, scheduling, decision, heartbeat, github-actions, os-cron]
tools: [CronCreate, CronList, CronDelete, TaskCreate, Read, Bash]
agents: [developer, heartbeat-orchestrator, planner, architect]
invoked_by: agent
user_invocable: false
model: sonnet
error_handling: graceful
verified: true
---

<!-- Agent: developer | Task: #task-23 | Session: 2026-03-15 -->

# Cron Decision Skill

**Official docs:** <https://code.claude.com/docs/en/scheduled-tasks>

## Purpose

Help agents decide **when and whether** to use Claude Code's native cron scheduler (`CronCreate`/`CronList`/`CronDelete`) versus alternatives like OS cron (`crontab`), GitHub Actions scheduled workflows, or simple one-shot `Task()` delegation.

Using the wrong scheduling mechanism leads to:

- Silent task loss (session expiry kills CronCreate tasks)
- Missed precision requirements (CronCreate has up to 15-min jitter)
- Over-engineering (using GitHub Actions for a simple session heartbeat)

---

## Quick Checklist (Run Before Any Scheduling Decision)

Answer these 5 questions in order. The FIRST "yes" that hits a stop condition determines your tool.

1. **Is the task a one-time operation?**
   - YES → Use `TaskCreate` or `Task()`. Stop here. CronCreate is for recurring work only.

2. **Must the task survive terminal/session close?**
   - YES → Use **OS cron** (`crontab -e`) or **GitHub Actions**. CronCreate is session-scoped and dies when Claude Code closes.

3. **Does the task require sub-15-minute precision or hard time guarantees?**
   - YES → Use **OS cron** or **GitHub Actions**. CronCreate fires with up to 10% jitter (max 15 min).

4. **Is this a heartbeat loop or session-scoped health check?**
   - YES → Use **CronCreate**. This is its primary intended use case.

5. **Is this triggered by an event rather than a clock?**
   - YES → Use a **hook** (PreToolUse/PostToolUse) or an **event listener**, not a scheduler at all.

---

## Decision Matrix

| Scenario                                                | Recommended Tool                          | Reason                                                        |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Periodic background monitoring during active session    | `CronCreate`                              | Session-scoped is fine; this is CronCreate's primary use case |
| Agent ecosystem heartbeat (health checks, memory sizes) | `CronCreate` via `heartbeat-orchestrator` | Use dedicated orchestrator, not raw CronCreate                |
| One-time task (now or delayed)                          | `Task()` or `TaskCreate`                  | Cron is for recurring work only                               |
| Nightly backup or data pipeline                         | **OS cron** (`crontab -e`)                | Must survive terminal close                                   |
| CI/CD pipeline trigger                                  | **GitHub Actions** `schedule:`            | Cloud-run, no terminal dependency                             |
| Data refresh every 4 hours during development           | `CronCreate`                              | Session-scoped is acceptable for dev workflows                |
| Production scheduled job                                | **OS cron** or **GitHub Actions**         | Never rely on session-scoped for production                   |
| Event-driven reaction (file change, hook trigger)       | **Hook** (PreToolUse/PostToolUse)         | Time-based scheduler is wrong tool for events                 |
| User-requested one-off analysis                         | `Task()`                                  | Single execution, no recurrence needed                        |
| Weekly report generation (must run unattended)          | **GitHub Actions**                        | Unattended, cloud-run, persistent                             |
| Session index rebuild during development                | `CronCreate`                              | Session-scoped is fine; fires while Claude is open            |
| Reflection queue drain check                            | `CronCreate` via `heartbeat-orchestrator` | Part of heartbeat ecosystem                                   |

---

## Heartbeat Integration Note

If the recurring task is **agent ecosystem monitoring** (health checks, memory rotation, stuck task detection, reflection queue), **do not use raw CronCreate directly**.

Instead, delegate to `heartbeat-orchestrator` or invoke the `/heartbeat-start` command:

```javascript
// CORRECT: Delegate heartbeat ecosystem to the dedicated orchestrator
// Router: spawn heartbeat-orchestrator agent
// OR user: /heartbeat-start

// WRONG: Manually wiring raw CronCreate for ecosystem health
CronCreate({
  schedule: '*/30 * * * *',
  task: 'Check agent health...',
});
```

The `heartbeat-orchestrator` manages:

- All 7 heartbeat loops
- Auto-reschedule (prevents silent 3-day expiry)
- Session restart detection and re-registration
- Coordinated observability via `heartbeat-session-ping.json`

**Exception**: Use raw `CronCreate` only for custom, non-ecosystem recurring tasks that are not part of the standard heartbeat loops.

---

## CronCreate Constraints (Critical Before Using)

| Constraint             | Detail                                                         |
| ---------------------- | -------------------------------------------------------------- |
| **Session-scoped**     | Dies when terminal closes — no persistence across restarts     |
| **3-day auto-expiry**  | Self-deletes silently after 3 days (reschedule before day 2.5) |
| **Jitter**             | Fires up to 10% of period late (max 15 min)                    |
| **No catch-up**        | Missed fires are NOT replayed                                  |
| **50-task cap**        | Max 50 concurrent scheduled tasks per session                  |
| **Fire-between-turns** | Fires only when Claude is idle, not mid-response               |
| **No extended syntax** | `L`, `W`, `?`, `MON`-style names are NOT supported             |

---

## When to Use Each Tool

### Use `CronCreate` when

- Task is session-scoped (acceptable to lose on terminal close)
- Monitoring, health checks, or periodic index refreshes during active development
- 15-minute jitter is acceptable
- Task fits within the 50-task session cap (stay under 10 for headroom)

### Use OS cron (`crontab -e`) when

- Task must run even when Claude Code is closed
- Sub-minute precision is required
- Production data pipelines, backups, or server maintenance

### Use GitHub Actions `schedule:` when

- Task must run unattended in CI/CD environment
- Fully cloud-run with no terminal dependency
- Cross-repo or deployment-related scheduling
- Audit trail and run history are required

### Use `Task()` or `TaskCreate` when

- One-time execution (even if delayed)
- Event-driven (not time-driven)

### Use a hook when

- Triggered by a tool call event (PreToolUse/PostToolUse), not a clock

---

## Quick Reference: CronCreate API

```javascript
// Schedule a recurring task (standard 5-field cron expression)
CronCreate({ schedule: '*/30 * * * *', task: 'Heartbeat check prompt here' });

// List active cron tasks (verify what is registered)
CronList();

// Remove a scheduled task by ID
CronDelete({ id: 'abc12345' });
```

**Common schedules:**

| Expression     | Meaning                               |
| -------------- | ------------------------------------- |
| `*/30 * * * *` | Every 30 minutes                      |
| `*/5 * * * *`  | Every 5 minutes (minimum recommended) |
| `0 * * * *`    | Every hour on the hour                |
| `0 2 * * *`    | Every day at 2am local time           |
| `0 3 * * 0`    | Every Sunday at 3am                   |

---

## When to Invoke

```javascript
Skill({ skill: 'cron-decision' });
```

Invoke before:

- Setting up any recurring task (to choose the right tool)
- Creating a CronCreate schedule (to verify constraints are acceptable)
- Deciding between GitHub Actions, OS cron, and session-scoped scheduling

Do NOT invoke for:

- One-time task delegation (use `TaskCreate` directly)
- Heartbeat ecosystem setup (use `heartbeat-orchestrator` or `/heartbeat-start`)

---

## Related Skills and Agents

- `scheduled-tasks` — Full CronCreate implementation reference with heartbeat patterns
- `heartbeat` — Start the full 7-loop heartbeat ecosystem
- `heartbeat-orchestrator` agent — Manages ecosystem heartbeat loops

---

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md` for previous scheduling decisions.

**After completing:**

- New scheduling pattern discovered → `.claude/context/memory/learnings.md`
- Scheduling issue found → `.claude/context/memory/issues.md`
- Architecture decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
