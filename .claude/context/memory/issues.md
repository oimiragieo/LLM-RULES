## TaskUpdate metadata type error — recurring P1 (2026-03-12)

**Issue**: Agents pass `metadata` as a JSON string instead of a record object when calling TaskUpdate. Causes InputValidationError and silent task completion failure.

**Occurrences**: 3 sessions confirmed (2026-02-14, 2026-03-08, 2026-03-12). Transcript toolu_01QYi7KuJrms7UAzZUXdAGfH and toolu_01G9bMwAUj8WpXP27K2sffNf both showed this pattern.

**Root Cause**: Agent inlines JSON.stringify() or wraps the object in a template string before passing to TaskUpdate.

**Solution**: Add metadata type validation to pre-completion-validation.cjs — reject if typeof metadata === 'string'.

**Priority**: P1 (recurring, affects reflection handshake reliability)

---

## Context Overflow at EPIC Pipeline Phase 3 (2026-03-12)

**Issue**: EPIC ecosystem audit plan (task #1, 22 atomic tasks, 3 phases) hit 150K token limit when router attempted to spawn Phase 3 implementation agents. Tasks 6, 7, 8 were blocked. All audit phases complete but implementation deferred to fresh session.

**Pattern**: This is a recurring P0 issue. Prior instance: "EPIC Plan Execution Context Risk - Task #25 (P1)" — same root cause (34 agent spawns, heavy context accumulation).

**Root Cause**: EPIC pipelines (22+ tasks, multiple audit/analysis phases) accumulate context from agent outputs. By Phase 3 the router context is saturated. Even with max-4-concurrent cap, each phase's results (returned inline or via TaskUpdate summaries) compound.

**Prevention**:

- Enforce wave-based execution: 2 agents max per wave (not 4 for heavy analysis)
- Agents must write detailed output to `.claude/context/reports/` files — return ONLY file path + 5-bullet summary (max 500 chars)
- Spawn `context-compressor` after each audit phase before moving to next
- In EPIC plan prompts, explicitly require agents to NOT return inline analysis — cite report file only

**Priority**: P0 (blocks implementation phase of every EPIC audit)

**Status**: Open — fresh session required for Phase 3 implementation

---

## EPIC Pipeline Context Overflow — Systemic Pattern (2026-03-12)

**Type**: context_overflow (router gap)
**Observed**: Phase 3 implementation spawn blocked for tasks 6, 7, 8 — session context exceeded 150K tokens during ecosystem-audit-epic pipeline. All audit phases completed but implementation phase could not start in same session.
**Pattern**: EPIC pipelines with 3+ analysis phases (security audit + structural audit + skill gap analysis) consistently exceed 150K token budget before reaching implementation spawns. This is the 3rd confirmed instance.
**Root cause**: Analysis agents return dense reports inline (or the router accumulates their outputs). By Phase 3, working context is saturated.
**Mitigation**: Split EPIC pipelines at Phase boundary explicitly — Phase 1-2 (audit/analysis) in Session A, Phase 3+ (implementation) in fresh Session B. Use session-handoff skill to transfer state. Do NOT attempt all phases in a single session for EPIC+ complexity.
**Status**: OPEN — no automated enforcement; requires manual discipline at pipeline design time.
**Evidence**: session-gap-log.jsonl entry 2026-03-12T00:00:00Z, context: ecosystem-audit-epic

---

## Missing TaskUpdate Summary — Threshold Crossed (P0 — 2026-03-13)

**Issue**: `failure-recurrence.json` records `missing_task_summary` count = 9+ (tasks 7, 8, 9, 11 in the 2026-03-13 session batch are all fallback strings). This crosses the recommend-evolution threshold (5+ recurring failures of same class). The reflection-log.jsonl entries for these tasks show `memoryWrites: []` and zero learnings extracted.

**Impact**: Reflection pipeline produces no learnings for approximately 30-40% of completed tasks. Audit trail is compromised for pipeline phases that hit context limits or complete without explicit `metadata.summary`.

**Root Cause**: Agents under high context pressure complete tasks via `TaskUpdate(completed)` without populating `metadata.summary`. The `pre-completion-validation.cjs` hook fires a warning but does not block. The fallback string "Task N completed without summary metadata" is inserted by the hook or post-completion-chain.cjs.

**Resolution Required**:

1. Upgrade `pre-completion-validation.cjs` to hard-block `TaskUpdate(completed)` when `metadata.summary` is absent or is the fallback string (P0 — change to fail-closed for security hooks category)
2. OR: Teach the hook to synthesize a summary from `metadata.filesModified + metadata.outputArtifacts` when summary is missing (graceful fallback)
3. Consider evolution recommendation: `metadata-summary-enforcer` hook or updated `pre-completion-validation.cjs` enforcement mode

**Priority**: P0 (9+ confirmed occurrences; crosses evolution trigger threshold)
**Source**: reflection of tasks 7, 8, 9 (2026-03-13T01:16:12-13Z) — all fallback metadata

---

## 2026-03-12 — Structural Ecosystem Audit Findings

- **CRITICAL: issues.md bloat** — was 441KB/4942 lines, 11x past threshold. Fixed 2026-03-12 (archived to issues-archive-2026-03-12.md). Fix: add rotation config to prevent recurrence.
- **P1: CLAUDE.md agent count stale** — States "73 agents" but 74 exist. Fix: update line 172 to "74 agents".
- **P1: shell-injection-validator.cjs** — Raw `JSON.parse` at line 427 before `safeParseJSON` at line 436. Prototype pollution window. Fix: remove raw parse, consolidate to single safeParseJSON.
- **P1: step0-reflection-enforcer.cjs unregistered** — Hook exists at `.claude/hooks/session/step0-reflection-enforcer.cjs` but not in settings.json. UserPromptSubmit Step 0 injection path inactive. Fix: register or archive.

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
