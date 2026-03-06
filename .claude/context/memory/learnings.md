## Debug Log Session Patterns — Streaming Stalls and Hook Errors (2026-03-06)

From task-12 debug log analysis (2026-03-06T00:26):

- **13 streaming stalls** detected in a single session — primary pattern: agent tasks approaching context/time limits mid-stream. Stalls > 60s typically precede an agent drop or incomplete TaskUpdate.
- **105 advisory hook errors** — high count of advisory-mode hook firings indicates advisory mode is being treated as a free pass. When advisory errors exceed ~20 per session, consider converting the most-fired hook to block mode.
- **YAML parse error in ux-researcher.md** — agent definition file has malformed YAML frontmatter; agent cannot be instantiated until fixed. This is a silent failure — the agent appears in the registry but fails at spawn time.
- **Bash timeout** — a Bash command hit the default 2-minute timeout. Pattern: long-running node scripts or pnpm commands without explicit `timeout` parameter.
- **Worktree permission failures** — worktree cleanup fails on Windows when the spawning agent still holds file handles. The `shouldOverrideWorktreeIsolation()` fix (commit 775ccf1f) handles framework paths but not file-handle contention.

**Actionable pattern:** Sessions with 10+ streaming stalls should trigger `context-compressor` earlier; don't wait for the 80K token threshold warning.

---

## debug-log-analysis Skill v1.3.0 Upgrade (2026-03-06)

From task 22 completion (2026-03-06T00:34):

- **Dynamic log discovery**: skill now auto-detects most recent log without requiring session UUID — removes the most common operator error (hardcoded stale UUID)
- **Structured analysis**: error categorization is now formalized into the taxonomy table (Hook Block, Read Miss, Token Overflow, Streaming Stall, Agent Drop, Tool Error)
- **Cleanup step added**: temp files are removed after analysis — prevents `.claude/context/tmp/` accumulation across sessions

Skill is catalog-present, index-present (agentPrimary: developer, supporting: reflection-agent, devops-troubleshooter). No registration gaps.

---

## Batch Reflection Closure (2026-03-05 Session 2)

Second batch: 5 stale reflection requests from enterprise-search-audit pipeline (2026-03-04 23:35:56–23:54:18). All task completion reflections with task summaries present. Gap observations repeated across all 5 requests:

- architect prompt-too-long error (2 retries)
- developer incomplete agent-skill-matrix.json update (5 agents missed, re-spawn triggered)

Pattern identified: Agent scope control failures + incomplete task metadata across multi-agent workflows.

---

## Batch Reflection Closure (2026-03-05 Session 1)

5 stale reflection requests from 2026-03-04 (21:11:00–21:23:39) acknowledged and closed. All lacked `summary` metadata — the mandatory field required for actionable reflection. Sessions completing without summary metadata are non-analyzable; reflection cannot produce quality scores or learnings without it.

**Pattern:** Task completions without summary metadata → reflection unable to analyze → institutional learnings lost across sessions.

**Recommendation:** Enforce `summary` field as BLOCKING in pre-completion-validation.cjs. TaskUpdate(completed) without summary >50 chars should error, not silently skip reflection intake.

---

### Framework-Path Worktree Override (2026-03-04)

- Worktree isolation (`isolation: worktree`) causes silent data loss when an agent targets `.claude/` framework paths — writes go into the isolated clone and are discarded at cleanup
- Fix: `shouldOverrideWorktreeIsolation()` in `spawn-prompt-assembler.task-tools.cjs` detects framework paths and overrides isolation to `none`
- Detection uses regex against 8 framework path segments: hooks, skills, agents, tools, workflows, templates, schemas, lib
- Affected agents: developer, qa, code-reviewer, frontend-pro, nextjs-pro (all have `isolation: worktree` in frontmatter)
- Safe for: source code tasks in `src/`, `tests/`, project root files
- Evidence: 43% failure rate across 5+ confirmed incidents, commit 775ccf1f, 26 tests

### Cross-Platform stdin Reading (2026-03-04)

- `/dev/stdin` throws ENOENT on every invocation on Windows (Windows-first repo — see SE-01)
- Fix: use `fs.readFileSync(0, 'utf8')` (file descriptor 0) which reads stdin cross-platform without device path
- Applied to: `worktree-auto-cleanup.cjs`
- Evidence: commit 775ccf1f

---

## Skill Updated: authentication-flow-rules (2026-02-23)

- Skill `authentication-flow-rules` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: omega-gemini-cli (2026-02-24)

- Skill `omega-gemini-cli` was reviewed and updated by the skill-updater pipeline.

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

- Created new agent: qa-guardian (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

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

- Created new agent: qa-guardian (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

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
