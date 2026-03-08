---
name: heartbeat-start
description: Start all 7 heartbeat loops for the autonomous agent ecosystem
---

Start the full heartbeat ecosystem. I'll launch all 7 background loops using the heartbeat-orchestrator:

1. **Reflection loop** (every 2h): Distill session learnings to memory, drain reflection queue
2. **Evolution loop** (at 3am daily): Self-improve agent configurations from learnings
3. **Morning briefing** (at 8am weekdays): Daily technical briefing — debt, tasks, blockers
4. **Context drain** (every 15m): Surface session completion status and stuck tasks
5. **Codebase indexer** (every 4h): Keep BM25/LanceDB search index fresh
6. **Research digest** (at 7am daily): Monitor arXiv/Exa for relevant AI papers
7. **Auto-reschedule** (every 2 days): Prevent silent 3-day loop expiry

Note: Telegram polling (Loop 7) is registered only when `TELEGRAM_BOT_TOKEN` is configured in `.env`.

Spawn the heartbeat-orchestrator to manage all loops:

```javascript
Task({
  task_id: 'heartbeat-start',
  subagent_type: 'heartbeat-orchestrator',
  prompt: `Start all heartbeat loops.

Task ID: heartbeat-start

1. Call TaskUpdate({ taskId: 'heartbeat-start', status: 'in_progress' }) immediately.
2. Invoke Skill({ skill: 'heartbeat' }) to load loop specifications.
3. Invoke Skill({ skill: 'scheduled-tasks' }) for CronCreate patterns.
4. Call CronList() to check current ecosystem state — skip any loop already registered.
5. Read .claude/context/plans/heartbeat-ecosystem-design-2026-03-07.md for full loop definitions.
6. Register all missing loops using CronCreate (in startup order from the design doc).
7. Verify Telegram token before registering Loop 7 (telegram-2m).
8. Report all active loop IDs and their schedules to the user.
9. Call TaskUpdate({ taskId: 'heartbeat-start', status: 'completed', metadata: { loopsRegistered: N, loopIds: [...] } })
`,
});
```
