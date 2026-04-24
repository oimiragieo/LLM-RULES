> ⚠️ Content archived to archive/issues-2026-04-19.md on 2026-04-19

RECURRING: task-lifecycle-42 persisted stale 900+ min — router not reliably calling TaskUpdate(completed). Investigate auto-close hook.

## ~~Issue: unified-creator-guard blocks planner from writing plan files~~ — RESOLVED (2026-04-23)

- **Status**: RESOLVED — confirmed FALSE POSITIVE
- **Resolution**: v2.3.0 S1 investigation (commit history ~`9efc68706` era) confirmed the guard is **path-based, not agent-based**. `.claude/context/plans/` was never listed in `CREATOR_CONFIGS` within `unified-creator-guard.cjs`. The guard only blocks writes to `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `.claude/workflows/`, `.claude/templates/`, and `.claude/schemas/`. Plans always wrote successfully to `context/plans/`.
- **Original symptom (v2.1.1)**: Planner plan file appeared session-only — this was a separate issue (plan file path was resolved relative to CWD rather than PROJECT_ROOT in that session), not a guard violation.
- **No fix needed**: Guard exemption proposed in original issue is unnecessary. Guard is correctly scoped.
- **Source**: v2.3.0 S1 investigation; see commit history around 9efc68706.

## Issue: heartbeat orchestrator cron registration fails from subagent context (2026-04-20)

- **Symptom**: Two consecutive heartbeat orchestrator spawns failed to register crons. Cron registration tools appear to be available only in the parent/interactive session context, not in subagent (Task()) context.
- **Impact**: Heartbeat cron scheduling is currently only reliable when the router invokes `Skill({ skill: "heartbeat" })` directly in the active session. Spawning heartbeat as a subagent silently produces no registered cron.
- **Workaround**: Router must invoke heartbeat skill directly (not via Task()). Orchestrator role is reduced to instruction delivery only.
- **Fix candidate**: Document this constraint prominently in `.claude/skills/heartbeat/SKILL.md` and the heartbeat orchestrator agent definition. Add a note to orchestrator-spawn.md warning that cron-registration tools are session-scoped.
- **Source**: v2.1.1 session; two spawn failures confirmed by router observation.

## BUG: CLAUDE_AGENT_ID env var not propagated to Bash subprocess hook context (2026-04-23)

BUG: CLAUDE_AGENT_ID env var not propagated to Bash subprocess hook context; agents must use Write tool directly or fix env propagation in agent-wrapper.

## P0 BUG: evolution-state-guard.cjs path mismatch in settings.json (2026-04-24)

- **Symptom**: Task 3 baseline inventory found evolution-state-guard.cjs registered with a wrong directory path in `.claude/settings.json`. This will cause a crash on any Write event that the guard is meant to intercept.
- **Impact**: ALL Write/Edit tool calls that trigger this hook will crash with a path resolution error. Production-blocking.
- **Fix**: Update `.claude/settings.json` hook registration to use the correct absolute or relative path for evolution-state-guard.cjs. Verify path matches actual file location on disk.
- **Source**: v4.0.0 Phase 0 baseline audit, Task 3 (2026-04-24).

## TEST-SUITE BASELINE 2026-04-24: 687/6239 fail (~11%). Root cause: missing ./task-manager.cjs referenced by reflection-queue-adapter.cjs. Report: .claude/context/reports/qa/test-suite-status-2026-04-24.md
