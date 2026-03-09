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
