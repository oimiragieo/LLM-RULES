## [FRAMEWORK/QA] EPIC Audit Completion Pattern — 243/243 Tests, Full Module Wiring (2026-03-10)

Pattern: EPIC-scale framework audits (task 1, 2026-03-10 session) should culminate in a final state report with concrete metrics: test pass rate, module wiring status, skill index count, and memory health. The 2026-03-10 EPIC achieved: 243/243 tests pass, memory bloat fixed, skill index at 275 skills, A2A/worker/dispatcher wired, router heartbeat language corrected (delegated to subagents). Key pattern: when an EPIC touches multiple subsystems (memory, routing, A2A, skills), always verify integration via test run before declaring complete. "All modules wired" is only meaningful when accompanied by a passing test suite.

---

## [CODE/QA] Multi-LLM Cross-Validation — JSON.parse Severity Calibration (2026-03-10)

Pattern: When multiple LLMs review the same codebase findings, severity levels can diverge. In the 2026-03-10 session, an initial scan (task 2) reported 40 raw JSON.parse() usages as P0. Codex cross-validation (task 7) downgraded JSON.parse to P2 because hooks/lib files were already patched with safeParseJSON. Similarly, console.log in scripts was rated acceptable (scripts-only usage). Key lesson: always cross-validate P0 findings against already-patched locations before filing issues. The Memory EPIC (243/243 tests) confirms production-readiness; Codex found no additional critical gaps that changed the overall assessment.

---

## [CODE/QA] LSP Wiring Health Check — A2A/Worker Pool Exports (2026-03-10)

Pattern: LSP-based wiring health check (task 3) produced 98% health score for A2A, worker pool, and dispatcher exports. All critical exports verified correct. One unused Collector class identified as low severity. Key insight: 98% wiring health = one minor unused class not causing runtime issues. LSP is effective for bulk export verification but returns empty for .cjs files — use ripgrep fallback for .cjs checks. A2A architecture is confirmed production-ready based on 243/243 test passing + 98% LSP wiring.

---

## [CODE/QA] Skill Quality Gap Audit — Gate 4 Compliance Review (2026-03-10)

Pattern: Task 6 identified quality gaps in 9 skills via Gate 4 compliance review. P0 gaps: `session-transcript-analyzer` (stub/incomplete implementation) and `claude-api` (bad frontmatter format). P1 gaps: 5 skills missing required Iron Laws and Memory Protocol sections. Key action: skill-updater must be invoked for these skills before they are trusted for production agent use. Stubs are particularly dangerous as agents may invoke them expecting real behavior. Frontmatter format errors cause agent model resolution failures. This audit pattern (Gate 4 + Iron Laws + Memory Protocol presence check) should become part of proactive-audit QA workflow.

---

## [CODE/SECURITY] JSON.parse Scan Results — Deduplication Against Already-Patched Code (2026-03-10)

Pattern: Task 2 raw code scan found 40 JSON.parse() instances. After Codex cross-validation (task 7), confirmed hooks and lib files already patched. Remaining JSON.parse usages are in non-critical paths (scripts, test utilities). This deduplication step is essential: initial scans always overcount because they cannot distinguish patched from unpatched locations without cross-referencing patch history. Future scans should exclude `safeParseJSON` caller sites (already safe) from JSON.parse counts. The 37 console.log findings similarly classified as acceptable after domain analysis (scripts-only, not production hooks).

---

## [CODE/ARCH] Memory File Truncation Fix — MaxFileReadTokenExceededError Root Cause (2026-03-10)

Pattern: Developer agent 0 tool uses issue was caused by bloated memory files (issues.md, reflection-log.jsonl exceeding 500KB). This triggered `MaxFileReadTokenExceededError` in spawn-prompt-assembler when auto-injecting memory context into spawn prompts. Fix: truncate memory files to 200 most recent records. Implementation detail: memory files grow unbounded when reflection agents append learnings without pruning old entries. Prevention: memory-quality-auditor should run monthly to prune stale/redundant entries. The 200-record truncation threshold preserves recent operational context while staying within token budgets.

---

## [CODE/ARCH] Ecosystem-Auditor Agent Rewrite — Agent-Creator Template Compliance (2026-03-10)

Pattern: ecosystem-auditor agent was rewritten using strict agent-creator template. Key change: extracted `audit` capability routing from shared capability bucket to dedicated `ecosystem-evolution` capability. This resolved a routing conflict where two agents (ecosystem-auditor + another) both mapped to the `audit` capability, causing ambiguous routing. Rule: each specialized agent should own a unique capability identifier. When two agents share a capability key, the router picks arbitrarily — this must be caught during agent creation via agent-creator template validation.

---

## [WORKFLOW] Reflection Queue Batching — Prevent Context Explosion from Single Zombie Task (2026-03-10)

Pattern: When 10+ reflection requests accumulate about the same stale task (e.g., task-lifecycle-42 zombie generating 31 gap-log entries), the Router must batch them into 2 agents of 5-6 reflections each rather than spawning 11 agents simultaneously. Spawning 11 reflection agents in parallel causes context explosion and coordination overhead. The batching strategy: batch-1 processes reflections 1-6 and calls reflection-cleanup.cjs; batch-2 processes reflections 7-11 and clears the reminder file. The processedReflectionIds in TaskUpdate metadata is the atomic handshake that tells reflection-cleanup.cjs what to remove from the spawn-request.json. Root cause of the accumulation: a single zombie task with missing TaskUpdate(completed) triggers stale-task-detector on every UserPromptSubmit, generating one gap-log entry per prompt — each entry becomes a separate reflection request. Fix: process stale-tasks.json in Step 0.4 early enough to close zombie tasks before they generate 10+ entries.

---

## [WORKFLOW] Stale task-lifecycle-42 Pattern — Devops Agent Context Expiry Without TaskUpdate (2026-03-10)

Pattern: task-lifecycle-42 was detected stale 35+ times across a single session (gap-log entries from 179min to 477min stale). Root cause: a devops agent was spawned for git work (commit/push), completed the actual git operations successfully, but the agent's context expired or the session closed before `TaskUpdate({ status: "completed" })` was called. The task remained `in_progress` indefinitely. This is distinct from the devops commit failure pattern (where git commit itself fails) — here the git work succeeded but the lifecycle close was missed. Detection: stale-task-detector fires on UserPromptSubmit; 35 gap-log entries from a single zombie task confirms the per-task cooldown gap in the detector. Resolution: Router Step 0.4 auto-closed via `stale-tasks.json`. Key signal: rapid-burst gap-log entries (4-6 within 2 seconds) indicate the same zombie task triggering on repeated user prompts, not a real ongoing issue pattern. Gap-log dedup by task ID with 30-min cooldown would reduce this from 35 entries to ~1.

---

## [WORKFLOW] TaskUpdate Metadata Missing — Task 17 Recurrence (2026-03-10)

Pattern: Task 17 completed with fallback summary string, contributing to the documented 16+ instance recurrence of missing task metadata. The `pre-completion-validation.cjs` hook remains in advisory/warn mode. Each missing-metadata completion produces a null-yield reflection cycle (hook fires, agent spawns, no learnings extractable). The cumulative cost is: each violation = ~1 reflection agent invocation wasted + audit trail gap. Resolution requires block-mode enforcement of the fallback string pattern in `pre-completion-validation.cjs`.

---

## [CODE] stale-task-detector writeStaleTasksQueue — Atomic Write + Dedup Pattern (2026-03-10)

Pattern: `writeStaleTasksQueue()` in `stale-task-detector.cjs` uses tmp+rename atomic write and per-task deduplication via a Set of existing `taskId`s. Kill switch: `STALE_TASK_AUTO_QUEUE=off`. This correctly prevents `stale-tasks.json` from accumulating duplicate stale entries across UserPromptSubmit bursts. Router Step 0.4 in CLAUDE.md now references `stale-tasks.json` as the canonical source for auto-close actions. The dedup covers the queue file; gap-log dedup (separate concern) is still missing (see issues.md).

---

## [WORKFLOW] Stale-Task-Detector Deduplication Gap — Gap-Log Spam Pattern (2026-03-10)

Pattern: `stale-task-detector.cjs` fires on every `UserPromptSubmit` with no per-task cooldown. A single zombie task (task-lifecycle-42, stale 458+ min) generated 30 gap-log entries in one session. Reflection agents receive only the last N entries from spawn requests, so a single zombie task can crowd out all genuine integration/routing gaps. Fix requires: (1) per-task deduplication or 30-min cooldown in the detector, (2) ensuring Router Step 0.4 (`stale-tasks.json`) is processed at session start to close zombie tasks before they accumulate entries. This is a signal-to-noise problem — the detector is advisory but must not become a noise amplifier.

---

## [CODE/QA] validate:full Fix — Module-Size Baseline + Malformed Model Strings (2026-03-10)

Pattern: Two categories of failures block `validate:full`: (1) Module-size baseline drift — when files grow beyond their baseline thresholds, baseline must be updated via `pnpm validate:baseline` or similar; (2) Malformed model string values in `agent-config.json` — short aliases like `sonnet` must be replaced with full model IDs like `claude-sonnet-4-5`. Fix: update baseline file + normalize model strings in `agent-config.json`. Both were fixed in the 2026-03-09/10 session. Validate:full must always be run as the final gate before considering a batch of agent/config changes complete.

---

## [CODE/QA] Agent Model String Validation — 'sonnet' vs 'claude-sonnet-4-5' (2026-03-09)

Pattern: Agent `model:` frontmatter values MUST use full model IDs (e.g., `claude-sonnet-4-5`), not short aliases (e.g., `sonnet`). Short aliases caused 2943 framework test failures during the EPIC codebase audit. Fix: normalize in `agent-config.json` and agent frontmatter. Affected agents detected via test runner output. Commits: `e8d6c9fb`, `d3d2cefc`. Prevention: add schema validation for model string format in agent registry compilation.

---

## [CODE/QA] EPIC Codebase Health Audit Pattern — Incremental Commit Strategy (2026-03-09)

Pattern: For large framework health audits (lint + test + wire verification), use incremental commits at each gate: (1) lint-clean commit, (2) wire-verification commit, (3) test-fix commit. This creates a clean rollback surface at each checkpoint. Commits `27629434` (lint+wiring), `e8d6c9fb` (safeParseJSON fix in token-budget-tracker), `d3d2cefc` (malformed model values) each independently verifiable and reversible. The Memory EPIC (A2A + Worker Pool) was verified fully wired in this session without regressions.

---

## [WORKFLOW] Stale Task Detection via stale-task-detector.cjs (2026-03-09)

Pattern: `stale-task-detector.cjs` fires on `UserPromptSubmit` and detects tasks in `in_progress` status for >N minutes. When triggered, it writes a `missing_metadata` gap to `session-gap-log.jsonl`. Task "task-lifecycle-42" was detected stale at 179 minutes. Agents MUST call `TaskUpdate({ status: "completed" })` immediately when work finishes — delayed completion calls are a systemic reliability gap and show as stale-task-detector findings. The detector is advisory (not blocking), so stale tasks do not prevent future work but DO accumulate as gap-log noise for reflection agents.

---

## [CODE/ARCH] Queue Drain/Ack Protocol as Design-Time Requirement (2026-03-09)

Pattern: Any distributed state system using a JSONL queue bridge MUST specify delivery semantics at design time. Minimum spec: line-level parse isolation (skip malformed lines, log them), atomic drain via file rename (not in-place rewrite), drain checkpoint (last-processed entry ID) for crash recovery. Both Gemini and Codex independently identified the missing queue protocol as the CRITICAL gap in the cron-runner subprocess architecture. See: `.claude/context/reports/architecture/cron-runner-subprocess-council-2026-03-09.md`

---

## [CODE/ARCH] Shadow Mode Flag as Required Migration Safety Primitive (2026-03-09)

Pattern: For any parallel-run migration where both old and new systems can emit effects, a shadow mode flag prevents double-execution. Use an env var (e.g., CRON_SUBPROCESS_MODE=shadow|active): shadow means new system writes queue only, old system continues owning processing; active means new system takes over. Must be implemented in Phase 0 (not retrofitted). ADR-2026-03-09A. Applies to any daemon/subprocess migration.

---

## [WORKFLOW] Multi-LLM Council Convergence as Architectural Validation Signal (2026-03-09)

Pattern: When multiple LLMs independently reviewing the same artifact converge on both the verdict AND the top risks (without seeing each other's responses), this is a strong validation signal. Applied in task #9 (cron-orchestrator) and task #12 (cron-runner subprocess) — full convergence on APPROVE-WITH-CONDITIONS and queue/parallel-run risks in both. Peer critique Stage 2 adds genuine value: credential inheritance risk surfaced in Stage 2 was missed by both reviewers in Stage 1.

---

## Skill Updated: omega-claude-cli (2026-02-24)

- Skill `omega-claude-cli` was reviewed and updated by the skill-updater pipeline.

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-24)

- Updated workflow: evolution-workflow (2026-02-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-27)

- Created new agent: qa-guardian (2026-02-27)

- Created new agent: contract-check (2026-02-27)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-27)

- Created new agent: bool-action (2026-02-27)

- Created new agent: repo-onboarder (2026-02-27)

- Updated workflow: evolution-workflow (2026-02-27)

- Updated workflow: missing-workflow-xyz (2026-02-27)

- Refreshed skill: nativescript (2026-03-01)

- Refreshed skill: webmcp-browser-tools (2026-03-01)

- skill-updater: Wired webmcp-browser-tools skill into agent-skill-matrix.json (frontend-pro contextual, developer contextual) and frontend-pro.md frontmatter. Added contextual trigger for @mcp-b/\* packages. (2026-03-01)

- skill-updater: Wired nativescript skill into agent-skill-matrix.json (developer contextual, mobile-ux-reviewer contextual) and added nativescript_project contextual trigger for @nativescript/core. Updated nativescript SKILL.md agents to include mobile-ux-reviewer and expo-mobile-developer. (2026-03-01)

- Refreshed skill: nativescript (2026-03-01)

- Refreshed skill: webmcp-browser-tools (2026-03-01)

---

## Pattern: Cron Subprocess Architecture — JSONL Queue + Shadow Mode Migration (2026-03-09)

Task 12 (2026-03-09): Multi-LLM council review of cron-runner subprocess plan (APPROVE-WITH-CONDITIONS)

**Pattern**: When migrating from session-scoped cron loops (heartbeat-orchestrator) to a persistent subprocess (cron-runner), use a two-phase safety pattern:

1. **JSONL Queue as async bridge**: subprocess writes cron action dispatches to `.jsonl` file; router drains at Step 0.5. Idiomatic for CLI-based systems without a message broker.
2. **Shadow mode flag before parallel run**: `CRON_SUBPROCESS_MODE=shadow|active` env var gates Phase 1 so the new subprocess writes queue but router does NOT drain/act. Prevents double-execution during migration.
3. **Atomic drain via rename** (not in-place rewrite): Read-then-rename the queue file to prevent partial drains. Line-level try/parse with skip-on-error prevents corrupted lines halting all queue processing.
4. **Windows credential inheritance**: Subprocess spawned via `child_process.spawn` inherits `process.env` from the launcher. If API keys are only loaded via `.env` at startup (not system env), subprocess will NOT have them. Must explicitly enumerate required env vars or verify presence before spawning.
5. **Windows zombie prevention**: `detached: true` + `subprocess.unref()` is insufficient on Win11 when terminal is force-closed. Short-term: ensure PID file is cleared on launcher startup and router re-launches if cron-session-ping.json is stale.

**Conditions required before Phase 1**: (C1) Define drain/ack protocol, (C2) CRON_SUBPROCESS_MODE=shadow flag present.

**Evidence**: Two independent LLM reviewers (Gemini + Codex) converged on same Phase 1 double-execution risk and same queue ack contract gap without prompting each other.

**Reuse**: This shadow-mode migration pattern applies to any stateful subprocess that replaces a router-session-owned resource.

---

## Pattern: Multi-LLM Code Review Consensus Detects Critical Bugs (2026-03-04)

Task 2 (2026-03-04): Multi-LLM consultation on LTM eviction fixes

**Pattern**: Running the same code review through multiple LLM models (Gemini + Codex) and synthesizing results yields higher bug detection rate than single-model review.

**Evidence**:

- Both Gemini and Codex independently identified mass-extinction bug (evicts ALL files not just overflow)
- Both independently identified NaN propagation from malformed env vars
- Both independently validated correct fixes (promoted\_ exclusion, Math.max guard)
- Single-pass review would likely have missed at least one class of bugs

**Implementation**: Create multi-llm-consultant agent task when reviewing critical code paths. Request 2-3 independent model reviews before synthesizing.

**Reuse**: This pattern is high-signal for P0 security-critical or complex algorithm reviews.

---

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

## Pattern: Worktree Infrastructure Tasks Must Route to Devops Agent (2026-03-03)

**Pattern**: Worktree lifecycle management, hook creation, and framework infrastructure tasks MUST be routed to `devops` agent, NOT `developer` agent. Developer agent has `isolation: worktree` in frontmatter. When tasked with creating `.claude/` framework files under worktree isolation, all writes go into the isolated clone and are discarded at cleanup — resulting in zero visible changes after TaskUpdate(completed).

**Evidence**:

- Task 36 (2026-03-03): developer agent assigned worktree-prune.cjs + worktree-auto-cleanup.cjs creation → zero files created → rerouted to devops → succeeded
- Gap log entry: `.claude/context/runtime/session-gap-log.jsonl` (2026-03-03T08:30:00Z, type: retry)
- Pattern also seen: code-reviewer with worktree isolation fails to see unstaged changes (Task ~1 same day)

**Routing Rule**:

- Tasks writing to `.claude/hooks/`, `.claude/tools/cli/`, `.claude/skills/` framework paths → use `devops` agent
- Tasks managing git worktree lifecycle (create, prune, cleanup) → use `devops` agent
- Tasks requiring git operations (commit, push, branch management) → use `devops` agent
- Developer agent safe for: code implementation in project source files, feature development, bug fixes

**Why Devops**: devops agent has no worktree isolation in frontmatter — it operates on the main working tree. All file writes are immediately visible to the parent repo.

**Detection for Router**: If developer agent completes a task involving `.claude/` path writes, run `git diff --name-only HEAD` to verify changes exist. If no diff, re-spawn to devops.

---

- Created new agent: aso-specialist (2026-03-03)

- Created new agent: marketing-strategist (2026-03-03)

- Created new agent: brand-guardian (2026-03-03)

---

## Pattern: Worktree Isolation Compatibility Matrix (2026-03-03)

**Pattern**: Worktree isolation (isolated git worktrees from clean HEAD) is **safe for code-generation tasks** but **breaks code-analysis tasks** that depend on uncommitted changes visibility.

**Applies to**:

- ✅ **SAFE**: developer, qa, testing agents (operate on committed code)
- ❌ **UNSAFE**: code-reviewer, architect, code-simplifier (need working-tree visibility)

**Evidence**:

- Task 1 (2026-03-03): code-reviewer with worktree isolation → cannot see unstaged changes → fail → re-spawn without isolation → succeed
- Lint pipeline showed 2570/2571 issues were in isolated worktrees (expected isolation to clean HEAD)

**Workaround**:

1. For in-flight code review: spawn code-reviewer WITHOUT `isolation: worktree`
2. For committed code review: spawn code-reviewer WITH isolation (safe)
3. For mixed scenarios: commit changes before code-review spawn

**Implementation**:

- Remove `isolation: worktree` from code-reviewer.md frontmatter (set to `isolation: none`)
- Document this tradeoff in CLAUDE.md routing section
- Future: Add spawn-time override flag for conditional isolation

**Impact**:

- Resolves blocking issue: code-review fails when spawned with worktree isolation
- Enables best practice: use worktree isolation only for agents that don't need working-tree state

- Created new agent: qa-guardian (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

---

## LTM Eviction & Access Count Pattern (2026-03-03)

**Pattern**: LTM eviction changed from threshold-based to cap-based. Evicts lowest-utility entries only when `files.length > LTM_MAX_FILES`.

**Implementation**:

- Eviction is cap-based: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when threshold exceeded)
- NOT threshold-based: no longer wipes all entries when any age past 180 days
- NaN guard added for env vars: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` use `Number.isFinite()` check
- mtime fallback: entries missing timestamp fields default to current time via `mtime || Date.now()`
- Eviction preview log: `console.error` outputs deleted entries BEFORE deletion
- **Access count wired**: `incrementLTMAccessCount()` in `contextual-memory.cjs` increments `accessCount` on search hit
- Utility calculation: combines `accessCount` with time decay for eviction priority (highest utility kept, lowest evicted)

**Why This Matters**:

- Cap-based prevents mass extinction (threshold-based could wipe all LTM in single pass)
- NaN guards prevent silent calculation failures that corrupt eviction decisions
- mtime fallback prevents crash on malformed entries
- Access count enables utility-based eviction (previously all entries had equal utility)

**Multi-LLM Review** (Gemini + Codex):

- Identified mass extinction bug (threshold-based eviction)
- Identified NaN propagation risk in decay calculations
- Validated cap-based approach is correct
- Confirmed access_count wiring complete

**Files Modified**:

- `.claude/lib/memory/memory-pruner.cjs` (eviction logic)
- `.claude/lib/memory/contextual-memory.cjs` (access_count increment)
- `.claude/lib/memory/memory-manager.cjs` (NaN guards)

- Created new agent: ptest-agent (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

## TDD for AI Agent Systems (2026-03-08)

- Property-based testing (fast-check) is top gap: routing/matching invariants untested across input space
- Mutation testing (Stryker incremental) recommended for hooks; security-critical hooks need >90% mutation score
- Contract testing (Pact pattern) for TaskUpdate schema: no formal agent-to-agent boundary contracts
- Probabilistic assertions needed for LLM routing tests: assert N/M correct, not exact match
- tdd SKILL.md needs: probabilistic assertions section, contract testing, mutation gate for P0 paths
- Report: .claude/context/reports/qa/tdd-research-2026-03-08.md

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Updated workflow: evolution-workflow (2026-03-09)

- Updated workflow: missing-workflow-xyz (2026-03-09)

- Created new agent: qa-guardian (2026-03-09)

- Created new agent: contract-check (2026-03-09)

- Created new agent: bool-action (2026-03-09)

- Created new agent: repo-onboarder (2026-03-09)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-09)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-09)

