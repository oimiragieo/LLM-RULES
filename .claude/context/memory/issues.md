> ⚠️ Content archived to archive/issues-2026-04-19.md on 2026-04-19

## Issue: unified-creator-guard blocks planner from writing plan files (2026-04-20)

- **Symptom**: During v2.1.1 release session, planner agent could not persist its plan file to `.claude/context/plans/`. unified-creator-guard treated planner writing to creator paths as a violation.
- **Impact**: Plans exist only in session context; a context crash or reset would destroy the plan with no recovery path.
- **Root cause**: unified-creator-guard blanket-blocks all Write/Edit to creator paths. The guard does not distinguish between (a) an agent editing an existing skill/agent artifact (prohibited) and (b) the planner-agent creating a new plan document in plans/ (legitimate).
- **Fix candidate**: Add a guard exemption: if `agent_type == "planner"` AND `path matches .claude/context/plans/**` AND operation is Write (new file creation, not edit of existing creator artifact), allow the write.
- **Source**: v2.1.1 soak-test session; confirmed by router observation that plan content was session-only.

## Issue: heartbeat orchestrator cron registration fails from subagent context (2026-04-20)

- **Symptom**: Two consecutive heartbeat orchestrator spawns failed to register crons. Cron registration tools appear to be available only in the parent/interactive session context, not in subagent (Task()) context.
- **Impact**: Heartbeat cron scheduling is currently only reliable when the router invokes `Skill({ skill: "heartbeat" })` directly in the active session. Spawning heartbeat as a subagent silently produces no registered cron.
- **Workaround**: Router must invoke heartbeat skill directly (not via Task()). Orchestrator role is reduced to instruction delivery only.
- **Fix candidate**: Document this constraint prominently in `.claude/skills/heartbeat/SKILL.md` and the heartbeat orchestrator agent definition. Add a note to orchestrator-spawn.md warning that cron-registration tools are session-scoped.
- **Source**: v2.1.1 session; two spawn failures confirmed by router observation.
