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
created_by: direct (retroactive attribution)
compliance_status: legacy-direct-creation
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
/loop 2h Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-reflection-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to run reflection-check.cjs. Reply HEARTBEAT_OK after spawning.
```

```
/loop 4h Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-indexing-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to check bm25-index.json mtime and reindex if stale. Reply HEARTBEAT_OK after spawning.
```

```
/loop 30m Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-drain-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to run context-drain.cjs and report stdout. Reply HEARTBEAT_OK after spawning.
```

```
/loop 24h Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-evolution-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to run evolution-check.cjs. Reply HEARTBEAT_OK after spawning.
```

---

## The 7 Heartbeat Loops

### Loop 0: Auto-Reschedule (every 2 days — MANDATORY)

Prevents silent 3-day expiry. **CRITICAL ORDER**: Always `CronCreate` new tasks BEFORE `CronDelete` old ones.

```javascript
CronCreate({
  schedule: '0 0 */2 * *',
  task: 'Self-maintenance: CronList() to inventory active tasks. Identify missing heartbeat loops from the expected set (reflection-2h, evolution-24h, briefing-8am, indexing-4h, drain-30m, telegram-5m, research-7am, reschedule-2d). Recreate any missing tasks using schedules in .claude/context/plans/heartbeat-ecosystem-design-2026-03-07.md. Report recreated task IDs.',
});
```

### Loop 1: Continuous Reflection (every 2h)

Extracts patterns from session transcripts before they are lost.

```javascript
CronCreate({
  schedule: '0 */2 * * *',
  task: "Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-reflection-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to execute this tick. The orchestrator must: (1) call TaskUpdate(in_progress), (2) run `node .claude/tools/cli/reflection-check.cjs`, (3) if stdout is HEARTBEAT_OK, call TaskUpdate(completed) and exit. Do NOT run the script directly in the router session. Reply HEARTBEAT_OK immediately after spawning.",
});
```

### Loop 2: Agent Evolution (every 24h at 3am)

Applies accumulated learnings to improve agent definitions.

```javascript
CronCreate({
  schedule: '0 3 * * *',
  task: "Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-evolution-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to execute this tick. The orchestrator must: (1) call TaskUpdate(in_progress), (2) run `node .claude/tools/cli/evolution-check.cjs`, (3) if stdout is HEARTBEAT_OK, call TaskUpdate(completed) and exit. Do NOT run the script directly in the router session. Reply HEARTBEAT_OK immediately after spawning.",
});
```

### Loop 3: Morning Briefing (8am weekdays)

Summarizes overnight state and suggests priority work.

```javascript
CronCreate({
  schedule: '0 8 * * 1-5',
  task: 'Morning briefing: Spawn researcher via Task() to read issues.md, learnings.md, git log, and generate morning briefing report. Do NOT wait for sub-agent. Reply HEARTBEAT_OK and exit.',
});
```

### Loop 4: Codebase Indexing (every 4h)

Keeps hybrid search index fresh.

```javascript
CronCreate({
  schedule: '0 */4 * * *',
  task: "Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-indexing-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to execute this tick. The orchestrator must: (1) call TaskUpdate(in_progress), (2) check mtime of .claude/context/data/bm25-index.json via Bash; if older than 4 hours or missing, run `pnpm code:index:reindex`, (3) call TaskUpdate(completed) and exit. Do NOT run the script directly in the router session. Reply HEARTBEAT_OK immediately after spawning.",
});
```

### Loop 5: Context Drain + Clear (every 30min)

Detects pipeline idle state — warns user, does NOT auto-clear.

```javascript
CronCreate({
  schedule: '*/30 * * * *',
  task: "Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-drain-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to execute this tick. The orchestrator must: (1) call TaskUpdate(in_progress), (2) run `node .claude/tools/cli/context-drain.cjs`, (3) reply with the exact stdout output, then call TaskUpdate(completed) and exit. Do NOT run the script directly in the router session. Reply HEARTBEAT_OK immediately after spawning.",
});
```

### Loop 6: Telegram Polling (every 5min)

Polls Telegram Bot API for user messages and routes to agents.

**Configuration required**:

1. Create Telegram bot via @BotFather → get token
2. Set `TELEGRAM_BOT_TOKEN=your_token` in `.env`
3. Start loop after `.env` is configured

```javascript
CronCreate({
  schedule: '*/5 * * * *',
  task: "Heartbeat tick: Spawn heartbeat-orchestrator subagent via Task({ task_id: 'hb-telegram-' + Date.now(), subagent_type: 'heartbeat-orchestrator' }) to execute this tick. The orchestrator must: (1) call TaskUpdate(in_progress), (2) run `node .claude/tools/cli/telegram-poll.cjs`, (3) if stdout is HEARTBEAT_OK, call TaskUpdate(completed) and exit. Do NOT run the script directly in the router session. Reply HEARTBEAT_OK immediately after spawning.",
});
```

**Discord note**: Discord uses webhooks (push-based) rather than polling. Send messages via Discord webhook URL, but receiving requires a persistent process — recommend Telegram for bidirectional communication.

### Loop 7: ArXiv + Exa Research Digest (daily at 7am)

Surfaces relevant academic papers and web news. Delegates to the dedicated monitor skills.

```javascript
CronCreate({
  schedule: '0 7 * * *',
  task: 'Research digest: Spawn researcher via Task() to invoke arxiv-monitor and exa-monitor skills. Do NOT wait for sub-agent. Reply HEARTBEAT_OK and exit.',
});
```

**Dedicated skills:** `arxiv-monitor` (every 6h standalone) | `exa-monitor` (every 4h standalone)
**Config:** `ARXIV_KEYWORDS` and `EXA_MONITOR_TOPICS` env vars (see `.env.example`)

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
CronCreate({ schedule: '*/30 * * * *', task: '...' }); // see Loop 5 above

// Loop 6: Telegram Polling
CronCreate({ schedule: '*/5 * * * *', task: '...' }); // see Loop 6 above

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
*/5    *    *             *     *            = Every 5 minutes
0      */2  *             *     *            = Every 2 hours
0      8    *             *     1-5          = Weekdays at 8am
0      */4  *             *     *            = Every 4 hours
*/30   *    *             *     *            = Every 30 minutes
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
- `arxiv-monitor` — dedicated ArXiv paper monitor (ARXIV_KEYWORDS, 6h interval)
- `exa-monitor` — dedicated Exa web search monitor (EXA_MONITOR_TOPICS, 4h interval)
- `telegram-polling` — Telegram Bot API polling (TELEGRAM_BOT_TOKEN required)
- `task-management-protocol` — task tracking patterns
- `memory-search` — semantic memory queries used by loop prompts
