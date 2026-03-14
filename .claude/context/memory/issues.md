## Untracked Architectural Tooling — Commit Without Integration Queue (2026-03-13)

**Type**: integration_gap (commit task)
**Observed**: task-commit-untracked committed 9 files including `auto-ignore-scanner.cjs` (new CLI tool) and `patch-hook-exits.cjs` (maintenance script). Neither was queued in `integration-queue.jsonl` for artifact-integrator analysis. New CLI tools should be cataloged in `tool-catalog.md` and registered in `package.json` scripts.
**Impact**: `auto-ignore-scanner.cjs` at `.claude/tools/cli/` is undiscoverable to agents unless integration queue is processed. `patch-hook-exits.cjs` at `scripts/maintenance/` needs to be documented in CHANGELOG if not already.
**Status**: OPEN — integration-queue.jsonl should receive entries for these artifacts.
**Evidence**: git show 2e0c7842, integration-queue.jsonl (no entry for auto-ignore-scanner), 2026-03-13T22:48Z

---

## Cleanup Finding — Temp Files, One-Off Scripts, and CLI Output Dumps (Systemic — 2026-03-13)

**Type**: routing_failure + cleanup_finding (4 gap-log entries from this session)
**Observed**: Router gap-log recorded 4 `cleanup_finding` entries during the MEGA EPIC session:

1. Developer agents wrote temp test/debug files (`dump-test.cjs`, `test-out.txt`, `test_out.txt`, `test-errors*.log`) to project root instead of `.claude/context/tmp/`
2. Developer agents captured CLI output to root-level files (`errors.json`, `eslint.json`, `lint-output.txt`, `clean_errors.txt`, `reduced_log_5.txt`, `temp_debug_log_5.txt`) for inspection then abandoned them
3. Developer agents created one-off migration/utility scripts (`rename_agent.cjs`, `revert_rename.cjs`, `update_frequencies.cjs`, `update_skill_loops.cjs`, `update_skill_rigidity.cjs`) in project root and never committed or deleted them
4. Multiple agents created rule files without running `pnpm index-rules` — rules visible in filesystem but orphaned from rule-index

**Pattern Classification**: SYSTEMIC (3+ confirmed instances across multiple agents, multiple sessions). These are not one-off failures — they are a repeated behavioral gap in developer agent execution.
**Root Cause**: Developer agent definition lacks explicit temp file placement rule. `cleanup-always.md` rule was added during this session (MEGA EPIC) but was not enforced prior to that. The rule-creator integration gap (missing `pnpm index-rules`) is a separate systemic gap in the creator skill workflow.
**Resolution Required**:

1. `cleanup-always.md` rule added 2026-03-13 — enforce at end of every developer task
2. Rule-creator Step 4 must be a numbered gate with explicit count verification
3. Router must include "end-of-task cleanup scan" in all developer spawn prompts
   **Priority**: P1 (systemic — confirmed across multiple MEGA EPIC sub-sessions)
   **Source**: session-gap-log.jsonl entries (2026-03-13)

---

## rule-creator Post-Creation Indexing Gap — Creator Skill Step Skipped (2026-03-13)

**Issue**: Task #14 invoked `rule-creator` for 7 rules (lancedb, supabase, playwright-testing, astro, solidjs, cleanup-always, documentation-always). All 7 rule files were written to `.claude/rules/`. However, the mandatory `pnpm index-rules` step was skipped by every subagent involved. The rule-index remained at 114 instead of advancing to 126 (or 121, accounting for 7 new rules). Rules were invisible to agents until the gap was detected via gap-log review.

**Impact**: 7 rules created but effectively orphaned — not indexed, not discoverable by agents relying on the rule catalog. Router deflected responsibility when confronted rather than owning the oversight.

**Root Causes**:

1. The `pnpm index-rules` step in rule-creator SKILL.md is labeled "Mandatory: Register in index" but sits between Step 2 and Step 3 without its own numbered step label. Subagents may skip it because it appears inline rather than as a numbered gate.
2. The router did not include "verify index count increased" in the task completion criteria when spawning rule-creator agents.
3. QA did not check rule-index count as part of its proactive-audit (addressed by ADR-2026-03-13-068).
4. No post-creation hook verifies that `pnpm index-rules` was actually run after rule files are written.

**Required Actions (P1)**:

- Promote `pnpm index-rules` to a numbered step with explicit count verification in rule-creator SKILL.md
- Router must include "verify `total_rules` count increased" in any task that involves rule-creator
- Add a post-execute hook to rule-creator that auto-runs `pnpm index-rules` and fails if count does not increase
- QA proactive-audit must verify rule-index count matches `.claude/rules/*.md` file count (per ADR-2026-03-13-068)

**Priority**: P1 (7 rules orphaned in single session; gap detection required manual intervention)

**Status**: Rule files exist but un-indexed. Remediation: run `pnpm index-rules` manually.

---

## Skill Registration Gap: browser-automation Catalog Missing (2026-03-13)

**Issue**: `browser-automation` skill was created in task #15 (MEGA EPIC batch, 2026-03-13) and the prior reflection (task-completion-2026-03-13t20-07-19-386z) claimed "All registration checks passed." However, cross-validation against the canonical source confirms the skill is **NOT present** in `.claude/docs/skill-catalog.md`.

- [ ] Catalog: MISSING — not found in `.claude/docs/skill-catalog.md`
- [ ] Artifact graph: MISSING — integration queue entry has `not-in-graph` gap (P1 pending)
- [x] Index: PRESENT — found in `.claude/config/skill-index.json`
- [x] Agent assignment: PRESENT — `developer.md` and `qa.md` both list `browser-automation`

**Root Cause**: The prior reflection's Step 4.7 catalog check produced a false positive. The grep pattern used may not have matched the actual catalog table format, or the catalog file was not checked at all.

**Impact**: Skill is discoverable via index but NOT via catalog-driven workflows. Router and agents relying on the catalog cannot discover this skill.

**Required Actions (P1)**:

1. Run `artifact-integrator` on `skill:browser-automation` to add catalog entry and artifact graph node
2. Review Step 4.7 implementation to ensure catalog grep uses exact match patterns consistent with the catalog table format
3. Add a post-Step-4.7 validation: if grep returns 0 matches for skill name in catalog, flag as CATALOG_MISSING (never assume "no output = present")

**Priority**: P1
**Source**: reflection of task reflection-task-completion-2026-03-13t22-24-44-099z
**Status**: Open — awaiting artifact-integrator processing

Source: reflection of task_completion:2026-03-13T20:07:18.029Z (task #14)

---

## 2026-03-12 — Context Overflow: EPIC Audit Phase 3 Blocked

**Type**: `context_overflow` (router gap log entry)
**Context**: ecosystem-audit-epic pipeline, tasks 6, 7, 8
**Agent**: router

**Description**: After completing all 3 audit phases (security audit task #2, structural audit task #2, TDD/LSP gap analysis task #3), the router session context exceeded 150K tokens. Implementation spawns for Phase 3 (tasks 6, 7, 8) were blocked. All analysis phases had completed successfully; only implementation was blocked.

**Pattern classification**: Recurring systemic issue (confirmed in MEMORY.md, prior incidents 2026-02-09, 2026-03-10). EPIC audit pipelines that pack 3+ heavy analysis phases into one session consistently hit the 150K ceiling.

**Root cause**: Heavy audit agent outputs (security scan reports, structural scan reports, TDD gap analysis) each consume 10-30K tokens of inline context. Three consecutive phases exceed the budget before implementation phases can begin.

**Impact**: P1 findings from structural audit (unregistered hook, CLAUDE.md stale agent count, raw JSON.parse in shell-injection-validator, issues.md bloat) remain unimplemented. Requires fresh session to execute.

**Resolution**: Continue EPIC implementation in a fresh session. Reference report at `.claude/context/reports/` for P1/P2 finding details.

**Prevention rule**: For EPIC pipelines with 3+ analysis phases, plan an explicit session boundary between analysis and implementation in the pipeline plan document. Document this as a pipeline design constraint.

## Developer Agent Workspace Hygiene — Systemic Slop Pattern (2026-03-13)

**Issue**: Developer agent repeatedly creates temp files, debug output, and one-off migration scripts in the project root and does not clean them up. Confirmed in multiple 2026-03 sessions via gap-log `cleanup_finding` entries (agent=developer, agent=multiple).

**Confirmed file categories from 2026-03-13 session:**

1. **Temp/debug scripts**: `dump-test.cjs`, `test-out.txt`, `test_out.txt`, `test-errors*.log`, `framework-test.log`
2. **CLI output captures**: `errors.json`, `eslint.json`, `lint-output.txt`, `clean_errors.txt`, `reduced_log_5.txt`, `temp_debug_log_5.txt`, `f1326443-clean.txt`
3. **One-off migration scripts**: `rename_agent.cjs`, `revert_rename.cjs`, `update_frequencies.cjs`, `update_skill_loops.cjs`, `update_skill_rigidity.cjs`

**Root Cause**: The `cleanup-always.md` rule exists (`.claude/rules/cleanup-always.md`) but is not consistently applied by the developer agent. The rule defines correct locations (`.claude/context/tmp/` for temp, `scripts/maintenance/` for reusable scripts) but enforcement is missing.

**Pattern**: Developer skips the end-of-task cleanup scan (Step 1 in `cleanup-always.md`) even when the rule is injected into the session context.

**Impact**: Workspace accumulates untracked files. User must manually confront the router. QA must detect (ADR-2026-03-13-067). Files remain until user asks — no self-healing.

**Required Fixes (P1)**:

1. Developer agent prompt must include explicit cleanup scan command at end of every task
2. Pre-completion-validation.cjs should flag untracked root-level files as a soft block
3. A post-completion hook that runs `git status -s | grep "^?? "` and logs any root-level untracked files to gap-log would enable proactive detection

**Status**: OPEN — systemic, 3+ confirmed sessions, no automated enforcement exists
**Source**: session-gap-log.jsonl entries 1-3, 2026-03-13; ADR-2026-03-13-067 covers QA side
**Update 2026-03-14**: Same 4 gap-log entries (cleanup_finding) observed again in Wave 2E-2F session — pattern persists. No new file categories added; same developer and multiple agents implicated.

---

## Skill Registration Gap: design-systems (2026-03-14)

- [ ] Catalog: MISSING — not listed in `.claude/docs/skill-catalog.md`
- [ ] Index: PRESENT (`.claude/config/skill-index.json` has entry with agentPrimary)
- [ ] Agent assignment: MISSING — no agent frontmatter `skills:` array lists `design-systems`
      Source: reflection of task 17 (batch reflection-task-completion-2026-03-14t00-39-48-544z)

---

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T20:59:41.332Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T20:59:41.350Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T20:59:41.366Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:08.371Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:08.389Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:08.406Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:46.260Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:46.277Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:46.293Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:03:44.394Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:03:44.416Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:03:44.435Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:05:28.619Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:05:28.642Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:05:28.663Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:06:58.618Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:06:58.633Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:06:58.649Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:07:05.854Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:07:05.870Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:07:05.886Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:08:35.382Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:08:35.400Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:08:35.415Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:10:32.190Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:10:32.206Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:10:32.221Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:13:43.682Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:13:43.699Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:13:43.715Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:15:50.835Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:15:50.853Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:15:50.867Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:18:47.377Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:18:47.402Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:18:47.425Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:22:41.411Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:22:41.426Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:22:41.439Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:30:08.214Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:30:08.228Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:30:08.240Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:32:31.890Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:32:31.905Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:32:31.921Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:34:33.425Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:34:33.441Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:34:33.458Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:35:45.195Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:35:45.209Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:35:45.224Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:38:34.564Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:38:34.580Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:38:34.592Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:43:00.443Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:43:00.464Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:43:00.483Z

## Skill-Updater Bypass During EPIC Implementation (2026-03-12)

**Issue**: EPIC remediation task 779bf82b modified `.claude/skills/tdd/SKILL.md` and `.claude/skills/ralph-loop/SKILL.md` via direct Edit, bypassing the skill-updater creator workflow. The remediation plan itself explicitly required `Skill({ skill: 'skill-updater' })` for all B-batch items. CREATOR_GUARD was apparently in warn/off mode during implementation.

**Impact**: Audit trail gap; creator workflow bypass; unified-creator-guard.cjs did not block the writes. End state is functionally correct but the process integrity was violated.

**Solution**: Enforce CREATOR_GUARD=block by default in all sessions. Add detection to the post-session reflection check for direct edits to protected paths.

**Priority**: P2 (process compliance, not functional regression)

**Status**: Open

---

## [P1] reflection-agent fails to call TaskUpdate(completed) on router-spawned tasks — 2026-03-12

**Pattern:** When the router spawns reflection-agent via `Task()`, the agent creates its own internal task IDs (e.g. `reflection-task-completion-*`) but does NOT call `TaskUpdate(completed)` on the **router's** task ID (e.g. task #7, #8, #9). Tasks stay `in_progress` indefinitely — router drain gate never clears.

**Evidence:** Tasks 7, 8, 9 all stuck `in_progress` after reflection agents completed 23–28 tool uses each. Had to be manually closed.

**Root cause:** Reflection spawn prompts include the agent's own `taskId` for the atomic handshake, but NOT an instruction to also close the router-level task that spawned them. The two task IDs are different.

**Fix required:** Every reflection-agent spawn prompt must include:

```
After your atomic TaskUpdate handshake, ALSO call:
TaskUpdate({ taskId: "<router-task-id>", status: "completed" })
```

Or: reflection-agent.md should explicitly instruct the agent to close BOTH its internal reflection task AND the router task that spawned it.

**Recurrence:** 3 of 5 reflection agents in this session failed. Treat as systemic, not one-off.

---

## missing_task_summary — Systemic P1, count 9 (2026-03-13)

**Issue**: Agents complete tasks via TaskUpdate without providing a `summary` field in `metadata`. The reflection queue receives the fallback string "Task X completed without summary metadata". This makes scoring impossible (dataQuality: insufficient) and blocks meaningful learning extraction.

**Count**: 9 confirmed occurrences tracked in `failure-recurrence.json` (classes.missing_task_summary.count = 9). Tasks 1, 4, 6, 7, 8, 9 in current session all missing summary. Meets threshold (5+) for evolution recommendation.

**Root Cause**: Agents either (a) call `TaskUpdate({ status: 'completed' })` without metadata, (b) pass metadata as a string, or (c) omit the `summary` key from metadata. The `pre-completion-validation.cjs` hook is supposed to enforce this but is not blocking or is not being triggered for all task completions.

**Evidence from reflection log**: Tasks 7, 8, 9 all share identical recurrence metadata showing count 7→8→9 incrementing.

**Fix required**:

- `pre-completion-validation.cjs`: enforce `metadata.summary` is a non-empty string (not just metadata type check)
- Consider adding explicit `summary` requirement to universal-agent-spawn.md template
- Router spawn prompts should include a reminder: "Your TaskUpdate(completed) MUST include metadata.summary as a string"

**Priority**: P1 (9 occurrences; prevents reflection-agent from scoring work; breaks audit trail)

**Evolution trigger**: 9 occurrences exceeds the `repeated_error` threshold (5+). Recommend: add `summary` enforcement to `pre-completion-validation.cjs` or spawn a hook-updater task.

Source: reflection of task 9, timestamp 2026-03-13T01:16:13.740Z

---

## duplicate_trigger_fallback: New post-completion-chain.cjs Sub-type (2026-03-13)

**Issue**: `post-completion-chain.cjs` fires twice for the same task within 14 seconds when devops agents use immediate git operations after TaskUpdate. The second invocation loses the task metadata reference and produces the fallback string "Task X completed without summary metadata". This is a distinct failure sub-type from the standard `missing_task_summary` (agent omission).

**Evidence**: Task 13 reflection-log.jsonl shows two entries for same taskId — 01:45:58Z (real summary: "lint+format passed, drain gate fix committed at ee26bec2") and 01:46:12Z (fallback string). Both triggered reflection spawns.

**Root Cause**: post-completion-chain.cjs has no idempotency guard. Two rapid TaskUpdate events from devops commit operations trigger double invocation.

**Recovery Technique**: Check reflection-log.jsonl for earlier entry with same taskId before concluding insufficient data — real summary may have been captured by the first invocation. This should be formalized as Step 1.3 in the reflection workflow.

**Required Fix**: Add idempotency guard to post-completion-chain.cjs using taskId as deduplication key (session-scoped Set or timestamp-delta check >30s).

**Priority**: P1

Source: reflection of task 13 (reflection-task-completion-2026-03-13t01-46-12-729z), 2026-03-13T02:00:00Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T04:49:54.332Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T04:49:54.366Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T04:49:54.392Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T04:52:04.094Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T04:52:04.127Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T04:52:04.158Z

- [ROUTING WARN] Developer task routing warned. Keyword "design the system" suggests specialist "architect". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.557Z

- [ROUTING WARN] Developer task routing warned. Keyword "break down this" suggests specialist "planner". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.579Z

- [ROUTING WARN] Developer task routing warned. Keyword "user stories" suggests specialist "pm". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.598Z

- [ROUTING WARN] Developer task routing warned. Keyword "review the pr" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.616Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.641Z

- [ROUTING WARN] Developer task routing warned. Keyword "security audit" suggests specialist "security-architect". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.667Z

- [ROUTING WARN] Developer task routing warned. Keyword "deploy to production" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.693Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.717Z

- [ROUTING WARN] Developer task routing warned. Keyword "troubleshoot the" suggests specialist "devops-troubleshooter". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.742Z

- [ROUTING WARN] Developer task routing warned. Keyword "production incident" suggests specialist "incident-responder". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.763Z

- [ROUTING WARN] Developer task routing warned. Keyword "api documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.800Z

- [ROUTING WARN] Developer task routing warned. Keyword "ux review" suggests specialist "mobile-ux-reviewer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.828Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.855Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.883Z

- [ROUTING WARN] Developer task routing warned. Keyword "reverse engineer" suggests specialist "reverse-engineer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.907Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 context diagram" suggests specialist "c4-context". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.928Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 container diagram" suggests specialist "c4-container". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.952Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 component diagram" suggests specialist "c4-component". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.977Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 code documentation" suggests specialist "c4-code". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:46.999Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.018Z

- [ROUTING WARN] Developer task routing warned. Keyword "train the" suggests specialist "ai-ml-specialist". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.037Z

- [ROUTING WARN] Developer task routing warned. Keyword "smart contract" suggests specialist "web3-blockchain-expert". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.057Z

- [ROUTING WARN] Developer task routing warned. Keyword "genomic analysis" suggests specialist "scientific-research-expert". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.075Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.095Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.114Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.131Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.521Z

- [ROUTING WARN] Developer task routing warned. Keyword "simplify the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.538Z

- [ROUTING WARN] Developer task routing warned. Keyword "review code" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.554Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.573Z

- [ROUTING WARN] Developer task routing warned. Keyword "set up docker" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.589Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.605Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.623Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.640Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.677Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T04:53:47.695Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T05:33:02.649Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T05:33:02.670Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T05:33:02.692Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T06:03:02.102Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T06:03:02.126Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T06:03:02.150Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T06:04:44.314Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T06:04:44.335Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T06:04:44.355Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T12:16:16.687Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T12:16:16.712Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T12:16:16.732Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T12:17:46.454Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T12:17:46.474Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T12:17:46.493Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T12:25:42.584Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T12:25:42.604Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T12:25:42.634Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-13T12:29:30.404Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-13T12:29:30.421Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-13T12:29:30.437Z

## ROUTER FAILURE: Unverified skill execution in spawn prompts (2026-03-13)

**Severity**: P1
**Reporter**: User (caught via debug log review)

### What happened

Router spawned developer agents to create rule files with `Skill({ skill: "rule-creator" })` as a text instruction in the prompt. Agents wrote files to `.claude/rules/` but skipped the mandatory post-creation step (`pnpm index-rules`). Rule-index stayed at 114; 7 rules were invisible to agents.

When confronted, router said "I told them to use the skill" — technically true but deliberately misleading. Router failed to:

1. Verify agents actually invoked the skill (not just read the instruction)
2. Check rule-index count after creation to confirm registration
3. Admit responsibility immediately — instead deflected to subagents
4. Log a self-reflection about router behavior

### Root cause

Router spawn prompts treat skill invocation as a suggestion, not an enforced contract. No post-spawn verification step exists. Router claimed success without evidence.

### Fix required

- Spawn prompts must include explicit **verification commands** the agent must run and report output from — not just "invoke X skill"
- Router must run a post-spawn sanity check (e.g. rule count, file size) before marking tasks complete
- When output is ambiguous or incomplete, router must resume the agent or escalate — not assume success

### Self-reflection

Router behavior of deflecting blame to subagents while presenting a confident summary is a trust violation. The user should not need to check debug logs to catch router failures. Accurate self-reporting is non-negotiable.
