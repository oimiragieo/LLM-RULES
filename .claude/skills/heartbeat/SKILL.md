---
name: heartbeat
version: 1.0.0
description: Start and manage the full heartbeat ecosystem for agent-studio. Registers all 7 heartbeat loops plus auto-reschedule task via CronCreate to keep the agent ecosystem healthy, indexed, informed, and connected.
category: infrastructure
trigger: when user wants to start heartbeat monitoring, recurring health checks, the full heartbeat ecosystem, scheduled maintenance, or autonomous reflection loops
tools:
  [CronCreate, CronList, CronDelete, Read, Bash, TaskCreate, TaskUpdate, TaskList, MemoryRecord]
dependencies: [scheduled-tasks]
tags: [heartbeat, cron, monitoring, health, ecosystem, telegram, reflection, evolution]
model: haiku
invoked_by: both
user_invocable: true
error_handling: graceful
verified: true
---

<!-- Agent: developer | Task: #heartbeat-skill | Session: 2026-03-07 -->

# Heartbeat Skill

## Overview

The **Heartbeat Ecosystem** keeps agent-studio healthy, indexed, and informed by running 7 background loops via Claude Code's cron scheduler (`CronCreate`/`CronList`/`CronDelete`).

**Key constraint — session-scoped**: All loops die when the terminal closes. Use Loop 0 (auto-reschedule) to prevent silent 3-day expiry, and re-run Quick-Start commands after each session restart.

---

## Quick-Start — Activate All Loops Now

Run these `/loop` commands in your Claude Code session:

```
/loop 2h Read .claude/context/runtime/reflection-reminder.txt — if exists and has content, spawn reflection-agent. Check .claude/context/memory/learnings.md byte size via Bash (wc -c). If > 35000 bytes run: node .claude/lib/memory/memory-rotator.cjs. Reply HEARTBEAT_OK if all healthy.
```

```
/loop 4h Check if .claude/context/data/bm25-index.json is older than 4 hours via Bash (stat mtime). If stale or missing: run pnpm code:index:reindex. Reply HEARTBEAT_OK if fresh.
```

```
/loop 15m TaskList() — if zero active or pending tasks, report "Pipeline drained — ready for /clear if desired." Reply HEARTBEAT_OK otherwise.
```

```
/loop 24h Read .claude/context/memory/learnings.md for patterns mentioning agent behavior or routing issues. If 3+ actionable improvements found: spawn developer agent with skill-updater skill. Otherwise reply HEARTBEAT_OK.
```

---

## The 7 Heartbeat Loops

### Loop 0: Auto-Reschedule (every 2 days — MANDATORY)

Prevents silent 3-day expiry. **CRITICAL ORDER**: Always `CronCreate` new tasks BEFORE `CronDelete` old ones.

```javascript
CronCreate({
  schedule: '0 0 */2 * *',
  task: 'Self-maintenance: CronList() to inventory active tasks. Identify missing heartbeat loops from the expected set (reflection-2h, evolution-24h, briefing-8am, indexing-4h, drain-15m, telegram-2m, research-7am, reschedule-2d). Recreate any missing tasks using schedules in .claude/context/plans/heartbeat-ecosystem-design-2026-03-07.md. Report recreated task IDs.',
});
```

### Loop 1: Continuous Reflection (every 2h)

Extracts patterns from session transcripts before they are lost.

```javascript
CronCreate({
  schedule: '0 */2 * * *',
  task: 'Reflection heartbeat: Read .claude/context/runtime/reflection-reminder.txt — if exists and has content, spawn reflection-agent. Read .claude/context/memory/learnings.md — if > 35000 bytes, run: node .claude/lib/memory/memory-rotator.cjs and report. Check .claude/context/memory/issues.md for P0 items. Reply HEARTBEAT_OK if all healthy.',
});
```

### Loop 2: Agent Evolution (every 24h at 3am)

Applies accumulated learnings to improve agent definitions.

```javascript
CronCreate({
  schedule: '0 3 * * *',
  task: 'Agent evolution: Read .claude/context/memory/learnings.md for agent improvement patterns. Read agent-health.json for degraded agents. If 3+ actionable improvements or any degraded agent found: spawn developer with skill-updater skill to update agent .md files, then pnpm validate:full. Otherwise reply HEARTBEAT_OK.',
});
```

### Loop 3: Morning Briefing (8am weekdays)

Summarizes overnight state and suggests priority work.

```javascript
CronCreate({
  schedule: '0 8 * * 1-5',
  task: 'Morning briefing: Read issues.md for unresolved items. Read learnings.md last 20 lines for recent patterns. Run: git log --oneline -5. Summarize: (1) Top 3 open issues by priority, (2) Recent technical debt indicators, (3) 2 optimal tasks to tackle today. Format as morning briefing report.',
});
```

### Loop 4: Codebase Indexing (every 4h)

Keeps hybrid search index fresh.

```javascript
CronCreate({
  schedule: '0 */4 * * *',
  task: 'Index freshness check: Check mtime of .claude/context/data/bm25-index.json via Bash. If older than 4 hours or missing: run pnpm code:index:reindex and report outcome. If fresh: reply HEARTBEAT_OK.',
});
```

### Loop 5: Context Drain + Clear (every 15min)

Detects pipeline idle state — warns user, does NOT auto-clear.

```javascript
CronCreate({
  schedule: '*/15 * * * *',
  task: 'Context drain check: TaskList() — if zero tasks in in_progress or pending and pipeline appears idle, report "Pipeline drained — ready for /clear if desired" with completion summary. Do NOT auto-clear. Reply HEARTBEAT_OK if tasks still active.',
});
```

### Loop 6: Telegram Polling (every 2min)

Polls Telegram Bot API for user messages and routes to agents.

**Configuration required**:

1. Create Telegram bot via @BotFather → get token
2. Set `TELEGRAM_BOT_TOKEN=your_token` in `.env`
3. Start loop after `.env` is configured

```javascript
CronCreate({
  schedule: '*/2 * * * *',
  task: 'Telegram polling: Check TELEGRAM_BOT_TOKEN env var — if set, fetch getUpdates API for new messages. Route each message to appropriate agent (researcher/developer/code-reviewer/etc), execute task, reply via sendMessage API. Track update offset in .claude/context/tmp/telegram-offset.json. Reply HEARTBEAT_OK if no messages or token not configured.',
});
```

**Discord note**: Discord uses webhooks (push-based) rather than polling. Send messages via Discord webhook URL, but receiving requires a persistent process — recommend Telegram for bidirectional communication.

### Loop 7: arXiv/Exa Research Digest (daily at 7am)

Surfaces relevant academic and news content.

```javascript
CronCreate({
  schedule: '0 7 * * *',
  task: 'Research digest: Fetch arXiv for recent multi-agent LLM papers (max 5 results, sorted by date): http://export.arxiv.org/api/query?search_query=all:multi-agent+LLM+orchestration&max_results=5&sortBy=submittedDate&sortOrder=descending. WebSearch for "Claude Code agent patterns 2026". Summarize top 3 most relevant findings. Append to .claude/context/memory/research-digest.md with date header.',
});
```

---

## Activation via CronCreate (Full Ecosystem)

To activate all 8 tasks programmatically:

```javascript
// Invoke via Skill({ skill: 'heartbeat' }) — this skill registers all loops

// Loop 0: Auto-reschedule (must be first — keeps everything alive)
CronCreate({ schedule: '0 0 */2 * *', task: '...' }); // see Loop 0 above

// Loop 1: Reflection
CronCreate({ schedule: '0 */2 * * *', task: '...' }); // see Loop 1 above

// Loop 2: Evolution
CronCreate({ schedule: '0 3 * * *', task: '...' }); // see Loop 2 above

// Loop 3: Morning Briefing
CronCreate({ schedule: '0 8 * * 1-5', task: '...' }); // see Loop 3 above

// Loop 4: Indexing
CronCreate({ schedule: '0 */4 * * *', task: '...' }); // see Loop 4 above

// Loop 5: Drain Check
CronCreate({ schedule: '*/15 * * * *', task: '...' }); // see Loop 5 above

// Loop 6: Telegram Polling
CronCreate({ schedule: '*/2 * * * *', task: '...' }); // see Loop 6 above

// Loop 7: Research Digest
CronCreate({ schedule: '0 7 * * *', task: '...' }); // see Loop 7 above

// Verify all registered
CronList();
```

---

## Monitoring & Management

### Check Ecosystem Status

```javascript
CronList(); // Returns all active tasks with IDs, schedules, next fire time
```

### Stop Individual Loop

```javascript
CronDelete({ id: 'abc12345' }); // Use ID from CronList()
```

### Stop All Loops

```javascript
// Get all IDs via CronList(), then delete each
const tasks = await CronList();
for (const task of tasks) {
  CronDelete({ id: task.id });
}
```

---

## Cron Expression Reference

```
minute hour day-of-month month day-of-week
*/2    *    *             *     *            = Every 2 minutes
0      */2  *             *     *            = Every 2 hours
0      8    *             *     1-5          = Weekdays at 8am
0      */4  *             *     *            = Every 4 hours
*/15   *    *             *     *            = Every 15 minutes
0      0    */2           *     *            = Every 2 days at midnight
```

**Supported**: wildcards (`*`), single values (`5`), steps (`*/15`), ranges (`1-5`), comma lists (`1,15,30`).
**NOT supported**: `L`, `W`, `?`, named aliases (`MON`, `JAN`).

---

## Constraints & Risks

| Risk                                              | Mitigation                                            |
| ------------------------------------------------- | ----------------------------------------------------- |
| **session-scoped**: loops die on terminal close   | Re-run Quick-Start commands on each session restart   |
| **3-day auto-expiry**: tasks silently self-delete | Loop 0 auto-reschedule runs every 2 days              |
| **50-task cap**: max concurrent scheduled tasks   | 8 loops = 16% of cap; leaves 84% for ad-hoc tasks     |
| **No catch-up**: missed fires are NOT replayed    | Design loops to be idempotent (safe to skip)          |
| **Jitter**: up to 15min delay on recurring tasks  | Expected; design checks to tolerate timing variance   |
| **Telegram token not configured**                 | Loop 6 gracefully skips if `TELEGRAM_BOT_TOKEN` unset |

---

## Integration with Memory System

- **Loop 1** integrates with `memory-rotator.cjs` for automatic file rotation
- **Loop 2** reads `agent-health.json` for degradation signals
- **Loop 7** appends to `.claude/context/memory/research-digest.md`
- **Loop 5** uses `TaskList()` same as the router drain gate

## Related Skills

- `scheduled-tasks` — low-level cron patterns (this skill builds on it)
- `task-management-protocol` — task tracking patterns
- `memory-search` — semantic memory queries used by loop prompts
