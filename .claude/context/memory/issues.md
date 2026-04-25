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

## SYSTEMIC: stale-task-detector has no per-task emission cooldown (confirmed 2026-04-17, still not fixed 2026-04-24)

- **Symptom**: 1034 gap-log entries for task-lifecycle-42 across 22+ days (2026-04-02 to 2026-04-24), all identical missing_metadata type. Multiple entries emitted per UserPromptSubmit burst.
- **Root cause confirmed (2026-04-17)**: test-fixture leak in grand-lifecycle.test.cjs; TASKUPDATE_FIRST_STATE_FILE env-var override missing from test fixture writes production runtime state, creating an unresolvable phantom stale task.
- **Secondary defect**: stale-task-detector.cjs has no emission cooldown. Every UserPromptSubmit fires a new gap-log entry for any stale task, producing burst clusters (up to 10 entries per session). Fix: add 1h per-taskId cooldown + 7-day hard-prune for cross-session orphans.
- **Impact**: Gap log ~99% noise from this phantom; real pipeline gaps are invisible.
- **Fix required**: F-LIFECYCLE (4 patches + 3 regression tests, v4.0.0 D2). Also cooldown logic in stale-task-detector.cjs.
- **Source**: gap-log analysis task 4 reflection (2026-04-24).

## SYSTEMIC: pre-completion-validation.cjs stderr surfaces as tool error even on allow (2026-04-24)

- **Symptom**: TaskUpdate status=completed blocked with tool error despite hook emitting allow. Logged gap-log line 1035 (2026-04-24T16:34:00Z).
- **Root cause hypothesis**: Hook writes advisory content to stderr; Claude Code pipeline surfaces any stderr as a blocking tool error regardless of exit code or allow signal.
- **Impact**: Legitimate completions blocked; agent stalls and must retry.
- **Fix**: Audit process.stderr.write() calls in pre-completion-validation.cjs; suppress advisory output on allow path; reserve stderr for genuine errors only (SE-03 compliance).
- **Source**: gap-log line 1035, DR-4 deviation (2026-04-24).

## MISSING: orchestration_start and reflection event types have no description field in gap-log (2026-04-24)

- **Symptom**: Gap-log entries with type:orchestration_start (line 1033) and type:reflection (line 1034) lack a description field.
- **Impact**: Gap-log consumers that rely on description field for classification silently skip these entries.
- **Fix**: Standardize gap-log schema — require description on all event types. Update writers for orchestration_start and reflection types.
- **Source**: gap-log analysis task 4 reflection (2026-04-24).

## P1 BUG: hook-contract-violation — pre-completion-validation.cjs stdout/stderr inversion (2026-04-24)

- **Type**: hook-contract-violation
- **Severity**: P1 — causes TaskUpdate(completed) to surface as a tool error even when the hook emits event=allow
- **Symptom**: Task 5 TaskUpdate(completed) was BLOCKED by pre-completion-validation hook despite the hook audit log emitting event=allow to stderr. The stderr payload was surfaced as a tool error, leaving task 5 stuck in in_progress. Work was verified complete (commits 010863563, b477a078c pushed).
- **Root cause**: In pre-completion-validation.cjs (line 449), auditLog writes {event:allow} to stderr. When GIT_COMMIT_VERIFICATION triggers a block (dirty state detection racing with pushed state), the stderr allow event was already emitted but exit code 2 was returned. Tool pipeline surfaces stderr payload as error message, creating misleading allow-event-caused-block appearance. The summary contained pushed to main which triggered isPipelineCompletion=true, activating MILESTONE_SELF_REVIEW_ENFORCEMENT (warn) and CCUSAGE_REPORT_ENFORCEMENT (warn) warnings. GIT_COMMIT_VERIFICATION then ran git status and may have found dirty state in a race condition after push.
- **Contract rule**: allow events in auditLog should only write to stderr when DEBUG_HOOKS=true. block decisions must ONLY go to stdout via formatHookResult. Unconditional stderr from allow path creates noise that tool pipeline misinterprets.
- **Workaround**: Set GIT_COMMIT_VERIFICATION=warn or GIT_COMMIT_VERIFICATION=off for cleanup/commit tasks.
- **Fix candidate**: Guard auditLog call at pre-completion-validation.cjs line 449 behind debug flag. Remove unconditional stderr from allow transitions.
- **Source**: Reflection of task 5 (2026-04-24); CRITICAL DEVIATION reported in reflection trigger.
- **Tags**: hook-contract-violation, pre-completion-validation, stderr-stdout-inversion, task-5

## P0 OPEN: Test pass rate unverified post-fix 7d46d28cc (2026-04-24)

- **Status**: OPEN — MUST resolve before any release gate claim
- **Symptom**: pnpm test re-run after commit 7d46d28cc timed out at 12min in the QA agent. active_context.md flags this as NOT PROVEN YET. Test suite audit report documents baseline of 5551/6239 (89%) BEFORE fix. Post-fix pass rate is UNVERIFIED.
- **Risk**: Release gate cannot be claimed. The 6506/6512 (99.92%) figure in active_context.md was recorded as VERIFIED THIS SESSION but must be confirmed by a fresh pnpm test run in a clean session.
- **Root cause**: QA agent pnpm test run timed out at 12min (default 120s timeout exceeded for 6239-test suite). Agent marked work partial and handed off without pass-rate evidence.
- **Next action**: In next session, spawn QA agent with timeout:600000 (10min) to re-run pnpm test and compare output against 6506/6512 claim. If confirmed, update issues.md and CHANGELOG.
- **Source**: Reflection of task 4 / gap-log trigger (2026-04-24T19:40:29Z).
- **Tags**: test-suite, pass-rate-unverified, release-gate, timeout
