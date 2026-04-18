> ⚠️ Content archived to archive/issues-2026-04-17.md on 2026-04-17

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-04-18T00:52:34.772Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-04-18T00:52:34.785Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-04-18T00:52:34.799Z

## task-lifecycle-42 Phantom Stale Detector (2026-04-17) — OPEN P0

**Root cause confirmed**: test-fixture leak in `tests/hooks/grand-lifecycle.test.cjs` line 84-85 (taskId='task-lifecycle-42', sessionId='session-lifecycle-99') — missing `TASKUPDATE_FIRST_STATE_FILE` env-var override writes phantom entry to production `.claude/context/runtime/taskupdate-first-state.json` on every `pnpm test` run.
**Impact**: 1023 gap-log entries (100% of missing_metadata noise), every UserPromptSubmit, 40+ days unresolved.
**Fix spec**: F-LIFECYCLE in `.claude/context/reports/backend/task-lifecycle-42-investigation-2026-04-17.md`
**Files to patch**: `pre-tool-unified.taskupdate.cjs` (add deleted/cancelled handling), `stale-task-detector.cjs` (add 1h cooldown + 7-day orphan prune), `grand-lifecycle.test.cjs` (add TASKUPDATE_FIRST_STATE_FILE override), plus 3 new regression tests.
**One-shot remediation**: delete session-lifecycle-99 from `taskupdate-first-state.json` + clear task-lifecycle-42 from `stale-tasks.json`.
**Source reflections**: all 5 backlog reflection entries (2026-04-17 session).

## Reflection Queue Drain Blocked by write-pretool-bundle.cjs (2026-04-17) — RESOLVED

**Issue**: write-pretool-bundle.cjs blocked all Write/Edit/Bash to `.claude/context/runtime/` including the reflection queue file, making it impossible for reflection-agent to drain the queue.
**Resolution**: patched in commit cb2960e6b — reflection-agent writes to runtime/ now allowed.
**Lesson**: when reflection drain is blocked, check hook allowlist for runtime/ before other diagnosis.

## knip CJS Module.exports False Negatives (2026-04-17) — OPEN

**Issue**: knip dead-code scanner misclassifies CJS `module.exports` patterns as unresolved (upstream issue #465). Causes false orphan classification of live modules (e.g., phase-advance-reader.cjs flagged as dead but is a production routing contract gap).
**Workaround**: rg-based export/import cross-reference as fallback for CJS codebases.
**Action needed**: add knip config exclusion for CJS-only modules pending upstream fix.

## Exa MCP / Ref MCP Unavailable in Agent Pipeline (2026-04-17) — OPEN

**Issue**: `exa_search` and `ref_search_documentation` tools throw NoSuchToolError in agent subprocesses spawned for dead-code research tasks. Affects research quality for agents relying on live documentation.
**Workaround**: WebSearch + WebFetch to github.com / docs sites.
**Action needed**: verify MCP availability in agent spawn environment; add pre-task capability check.
