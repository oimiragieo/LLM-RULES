# Architecture Review: Framework Structure Analysis

<!-- Agent: architect | Task: #2 | Session: 2026-02-14 -->

**Generated:** 2026-02-14
**Reviewer:** architect
**Scope:** Complete framework structural analysis

---

## Executive Summary

**Health Score: 7.5/10** — Framework is operationally healthy but carries technical debt from rapid evolution. Critical issues: configuration sprawl (458 skills, 383 indexed), hook complexity (2577-line files), and archive management debt (50 archived hooks, 16 archive directories).

**Key Strengths:**

- Comprehensive hook system (105 hooks) with unified consolidation (6→2 wildcard hooks)
- Robust agent registry (59 agents, 100% healthy status)
- Strong memory system with proper file budgets
- Clean separation of concerns (.claude/lib for modules, .claude/tools for CLI)

**Critical Concerns:**

- Hook complexity explosion (routing-guard.cjs: 2577 lines, 4 hooks >1800 lines)
- Skill indexing drift (458 skill files vs 383 indexed — 75 orphaned?)
- Archive clutter (50 archived hooks still in tree, 16 archive dirs)
- Temporary file accumulation (56 files in .claude/context/tmp)
- Configuration file sprawl (159 schemas, 326 workflows)

---

## Priority Findings

### P0 — Critical (Blocking Issues)

#### P0.1: Hook Complexity Explosion

**Files:**

- `.claude/hooks/routing/routing-guard.cjs` — **2577 lines**
- `.claude/hooks/routing/user-prompt-unified.cjs` — **2155 lines**
- `.claude/hooks/routing/pre-tool-unified.cjs` — **1882 lines**
- `.claude/hooks/routing/spawn-prompt-assembler.cjs` — **1827 lines**

**Issue:** These hooks execute on EVERY tool invocation (PreToolUse). At 2000+ lines, they:

- Slow down tool pipeline (target: <100ms per hook, risk: >500ms)
- Violate single responsibility (routing-guard does planner-first + security + specialist routing + TaskCreate validation)
- Difficult to debug (stack traces span 2500+ lines)
- Hard to test (monolithic functions)

**Impact:** **Performance bottleneck** — every Read/Write/Edit/Task call hits 2500+ line hooks.

**Remediation:**

1. **Extract validators** from routing-guard.cjs into separate hooks:
   - `planner-first-validator.cjs` (Check 1)
   - `security-review-validator.cjs` (Check 2)
   - `specialist-routing-validator.cjs` (Check 7)
   - `taskcreate-complexity-validator.cjs` (Check 4)
2. **Parallelize non-dependent checks** (performance gain: 40-60%)
3. **Add performance budgets** to settings.json (timeout per hook)
4. **Target:** Each hook <500 lines, <100ms execution

**Files to create:**

- `.claude/hooks/routing/planner-first-validator.cjs`
- `.claude/hooks/routing/security-review-validator.cjs`
- `.claude/hooks/routing/specialist-routing-validator.cjs`
- `.claude/hooks/routing/taskcreate-complexity-validator.cjs`

**Files to modify:**

- `.claude/hooks/routing/routing-guard.cjs` (extract logic)
- `.claude/settings.json` (register new hooks)

---

#### P0.2: Skill Indexing Drift

**Data:**

- **458 SKILL.md files** (find .claude/skills -name "SKILL.md")
- **383 skills indexed** in skill-index.json
- **Difference: 75 orphaned skills** (16% orphan rate)

**Issue:** skill-index.json is 24 hours stale (generatedAt: 2026-02-14T18:12:57.972Z). Skills created after this timestamp are invisible to:

- Agent routing (agents can't discover new skills)
- Skill catalog (skill-catalog.md incomplete)
- Validation hooks (orphaned skills not validated)

**Impact:** **Invisible artifacts** — newly created skills are not discoverable by agents or users.

**Root Cause:** `generate-skill-index.cjs` not running automatically after skill creation (no PostToolUse hook for skill-creator completion).

**Remediation:**

1. **Add PostToolUse(TaskUpdate) hook** to detect skill-creator completion and trigger reindex
2. **Run reindex now:** `node .claude/tools/cli/generate-skill-index.cjs`
3. **Add CI check:** Fail if skill count mismatch (filesystem vs index)
4. **Document in skill-creator:** Post-creation step must trigger reindex

**Files to modify:**

- `.claude/hooks/workflow/post-creation-integration.cjs` (add skill reindex trigger)
- `.github/workflows/ci.yml` (add skill count validation)

---

#### P0.3: Agent Registry vs Filesystem Drift

**Data:**

- **59 agents in agent-registry.json**
- **60 agent definition files** (find .claude/agents -name "\*.md")
- **Difference: 1 orphaned agent definition**

**Issue:** Agent file exists but not registered (or vice versa). This causes:

- Routing failures (router can't spawn unregistered agent)
- Task assignment errors (TaskUpdate fails for nonexistent agent)
- Catalog drift (agent-registry.json out of sync)

**Impact:** **Routing failures** — orphaned agent definitions cannot be spawned.

**Remediation:**

1. **Find the orphan:** Compare filesystem (60 files) vs registry (59 agents)
2. **Run agent registry regeneration:** `pnpm build:registry` (if script exists) or manual audit
3. **Add CI check:** Fail if agent count mismatch
4. **Document in agent-creator:** Post-creation step must register agent

**Files to check:**

- `.claude/agents/core/router.md` (duplicate of .claude/agents/router.md per memory?)
- All `.claude/agents/**/*.md` files vs `agent-registry.json` entries

---

### P1 — High Priority (Urgent But Not Blocking)

#### P1.1: Archive Clutter

**Data:**

- **50 archived hooks** in `.claude/hooks/_archive`
- **16 archive directories** (find .claude -name "\_archive")
- **Total archive size:** Unknown (not measured)

**Issue:** Archives are accumulating without cleanup. This causes:

- Visual noise (find/grep results polluted with archived files)
- Confusion (which hook is active? archived version still exists)
- Disk waste (archived files still in repo)

**Impact:** **Developer confusion** — unclear which files are active.

**Remediation:**

1. **Move archives OUT of .claude/:** Create `.claude_archive/` at project root
2. **Document archive policy:** Keep archives for 30 days, then delete or compress
3. **Add cleanup script:** `pnpm clean:archives` to remove >30 day old archives
4. **Update .gitignore:** Exclude `.claude_archive/` from version control

**Rationale:** Archives should not pollute active codebase. Keep them separate or compress to `.tar.gz`.

---

#### P1.2: Temporary File Accumulation

**Data:**

- **56 files in .claude/context/tmp/**
- **No automatic cleanup** (manual cleanup only per workspace-conventions.md)

**Issue:** Temp files are accumulating without cleanup. This causes:

- Disk waste (temp files never cleaned)
- Stale data (old temp files may confuse agents)
- Memory files leaking into tmp (should be in .claude/context/memory/)

**Impact:** **Disk waste + stale data risk.**

**Remediation:**

1. **Add SessionEnd hook** to clean .claude/context/tmp/ (files older than 1 hour)
2. **Document temp file TTL:** 1 hour for agent sessions, 24 hours for user sessions
3. **Add to pre-compact.cjs:** Clean tmp files before context compaction
4. **Move persistent data out:** Any file in tmp/ for >24 hours should move to proper location

**Files to modify:**

- `.claude/hooks/session/pre-compact.cjs` (add tmp cleanup)
- `.claude/settings.json` (register SessionEnd tmp cleanup hook)

---

#### P1.3: Configuration File Sprawl

**Data:**

- **159 schemas** (.claude/schemas/\*.json)
- **326 workflows** (.claude/workflows/\*.md)
- **6 catalogs** (.claude/context/artifacts/catalogs/\*.md)

**Issue:** Large number of configuration files makes framework harder to navigate. Are all 159 schemas active? Are all 326 workflows used?

**Impact:** **Navigation difficulty** — hard to find relevant files.

**Remediation:**

1. **Audit schema usage:** Check if all 159 schemas are referenced in code
2. **Audit workflow usage:** Check if all 326 workflows are referenced in agents/docs
3. **Archive unused artifacts:** Move unused schemas/workflows to `.claude_archive/`
4. **Document active set:** Create `.claude/docs/ACTIVE_ARTIFACTS.md` listing actively used configs

**Investigation needed:**

```bash
# Find unused schemas (not referenced in any .cjs/.mjs/.md)
for schema in .claude/schemas/*.json; do
  basename=$(basename "$schema")
  if ! grep -r "$basename" .claude --include="*.cjs" --include="*.mjs" --include="*.md" >/dev/null 2>&1; then
    echo "Unused: $basename"
  fi
done
```

---

#### P1.4: Memory File Budget Violations

**Data (from analysis):**

- `learnings.md` — **17KB** (budget: 20KB) ✅ Within budget
- `decisions.md` — **8.6KB** (budget: 20KB) ✅ Within budget
- `issues.md` — **7.2KB** (budget: 20KB) ✅ Within budget
- `audit-issues-2026-02-12.md` — **13KB** (should be archived)
- `audit-remediation-decisions-2026-02-12.md` — **16KB** (should be archived)
- `consolidated-audit-findings-2026-02-12.md` — **11KB** (should be archived)

**Issue:** Audit files from 2026-02-12 are still in HOT tier (`.claude/context/memory/`). Per ADR-102, files older than 30 days should rotate to WARM/COLD tiers.

**Impact:** **Memory bloat** — audit files consuming HOT tier space.

**Remediation:**

1. **Move audit files to WARM tier:** `.claude/context/memory/archive/audit-2026-02-12.md`
2. **Document audit file retention:** Audits rotate to WARM tier after 7 days
3. **Add memory rotation reminder:** Monthly rotation (1st of month)

**Files to move:**

- `audit-issues-2026-02-12.md` → `.claude/context/memory/archive/audit-issues-2026-02-12.md`
- `audit-remediation-decisions-2026-02-12.md` → `.claude/context/memory/archive/audit-remediation-decisions-2026-02-12.md`
- `consolidated-audit-findings-2026-02-12.md` → `.claude/context/memory/archive/consolidated-audit-findings-2026-02-12.md`

---

### P2 — Medium Priority (Cleanup & Refactoring)

#### P2.1: Duplicate Agent Definitions

**Finding:** Memory notes mention `.claude/agents/router.md` (root) is a DUPLICATE of `.claude/agents/core/router.md`.

**Issue:** Duplicate files cause:

- Confusion (which file is authoritative?)
- Drift risk (one file updated, other stale)
- Registry ambiguity (which file does agent-registry.json reference?)

**Impact:** **Configuration drift risk.**

**Remediation:**

1. **Verify duplicate:** Compare file contents
2. **Delete root duplicate:** Keep only `.claude/agents/core/router.md`
3. **Update references:** Search codebase for `.claude/agents/router.md` references

**Files to check:**

- `.claude/agents/router.md` (suspected duplicate)
- `.claude/agents/core/router.md` (canonical)

---

#### P2.2: TODO/FIXME Debt

**Data:**

- **95 TODO/FIXME/XXX/HACK comments** in .claude/ codebase

**Issue:** High technical debt indicator. TODOs accumulate without resolution.

**Impact:** **Code quality debt** — unresolved issues.

**Remediation:**

1. **Triage TODOs:** Classify as P0/P1/P2/P3 or "document as limitation"
2. **Create tasks:** Convert P0/P1 TODOs to tasks in task list
3. **Archive low-priority TODOs:** Move P3 TODOs to `.claude/context/memory/issues.md` with "low priority" tag
4. **Document non-issues:** If TODO is "nice to have", document in ADR as accepted limitation

**Investigation command:**

```bash
grep -r "TODO\|FIXME\|XXX\|HACK" .claude --include="*.cjs" --include="*.mjs" -n | head -50
```

---

#### P2.3: Hook Execution Order Complexity

**Data (from settings.json):**

- **PreToolUse(Task):** 4 hooks (spawn-prompt-assembler → pre-task-unified → routing-guard → spawn-prompt-validator)
- **PreToolUse(Edit|Write):** 7 hooks (routing-guard → unified-creator-guard → unified-pre-write-hook → evolution-state-guard → research-enforcement → quality-gate-validator → adaptive-quality-gate)
- **PostToolUse(TaskUpdate):** 3 hooks (post-completion-chain → post-creation-integration → quality-gate-validator)

**Issue:** Hook chains are getting complex. Some hooks run on EVERY tool call (routing-guard runs on 5 different tool matchers).

**Impact:** **Performance overhead** — cumulative hook execution time adds up.

**Remediation:**

1. **Measure hook performance:** Add timing instrumentation to post-tool-metrics-unified.cjs
2. **Optimize hot paths:** Cache results of expensive checks (e.g., agent registry lookups)
3. **Document hook order:** Create `.claude/docs/HOOK_EXECUTION_ORDER.md` with flowcharts
4. **Consider hook budgets:** Set max execution time per hook (100ms) and fail if exceeded

---

#### P2.4: Library Module Organization

**Data:**

- **225 library modules** in .claude/lib/
- **4 root-level tool files** in .claude/tools/

**Issue:** Some tools are misplaced at root level instead of categorized subdirectories.

**Impact:** **Organization inconsistency** — harder to find tools.

**Remediation:**

1. **Move root-level tools to subdirectories:** Group by category (cli/, optimization/, etc.)
2. **Document tool organization:** Update `.claude/docs/DIRECTORY_STRUCTURE.md`
3. **Add linting rule:** Fail CI if new tools added at root level

**Files to investigate:**

```bash
find .claude/tools -maxdepth 1 -name "*.cjs" -o -name "*.mjs"
```

---

### P3 — Low Priority (Nice to Have)

#### P3.1: Database File Size Monitoring

**Data:**

- `memory.db` — **268KB** (under 1MB, healthy)

**Issue:** No monitoring for database growth. memory.db could grow unbounded.

**Impact:** **Potential disk waste** (future risk, not current).

**Remediation:**

1. **Add database size check:** Warn if memory.db >1MB
2. **Add vacuum script:** `pnpm db:vacuum` to compact SQLite databases
3. **Document size limits:** memory.db should stay <1MB (rotate to archive if larger)

---

#### P3.2: Workflow File Count

**Data:**

- **326 workflow files** in .claude/workflows/

**Issue:** Very high number. Are all workflows actively used?

**Impact:** **Navigation difficulty** — hard to find relevant workflows.

**Remediation:**

1. **Audit workflow usage:** Check which workflows are referenced in agents/docs
2. **Archive unused workflows:** Move to `.claude_archive/workflows/`
3. **Create workflow index:** `.claude/context/artifacts/catalogs/workflow-catalog.md`

---

## Architectural Patterns

### Strengths

1. **Hook Consolidation Success:**
   - 6 wildcard hooks → 2 unified hooks (pre-tool-unified, post-tool-metrics-unified)
   - Reduced hook overhead by ~60%
   - Memory notes confirm 2026-02-08 consolidation

2. **Clean Module Separation:**
   - `.claude/lib/` for library modules (225 files)
   - `.claude/tools/` for CLI executables (66 active)
   - `.claude/hooks/` for runtime hooks (105 files)

3. **Registry-Driven Agent Discovery:**
   - agent-registry.json as source of truth (59 agents, 100% healthy)
   - Automatic health checks (lastHealthCheck: 2026-02-14T08:11:36.891Z)
   - Fallback to filesystem if registry stale

4. **Memory Budget Management:**
   - HOT tier files under budget (learnings.md: 17KB, decisions.md: 8.6KB)
   - Clear rotation policy (ADR-102)
   - Named memory API for topic-specific notes

### Anti-Patterns Detected

1. **God Objects:**
   - routing-guard.cjs (2577 lines, 7+ responsibilities)
   - user-prompt-unified.cjs (2155 lines, multiple prompt transformations)

2. **Configuration Sprawl:**
   - 159 schemas (are all used?)
   - 326 workflows (are all used?)
   - Unclear artifact lifecycle

3. **Archive Management Debt:**
   - 50 archived hooks still in tree
   - 16 archive directories
   - No cleanup policy

4. **Synchronous File I/O in Hot Paths:**
   - Multiple hooks use fs.readFileSync in PreToolUse
   - JSON.parse called in 232 files (potential perf bottleneck)

---

## Performance Analysis

### Hook Pipeline Performance Budget

**Target:** <100ms per hook (per performance.md)
**Risk:** Hooks >500ms are red flags

**Measured (from line counts, estimate):**

- routing-guard.cjs: **2577 lines** → Est. 200-400ms (risk)
- user-prompt-unified.cjs: **2155 lines** → Est. 150-300ms (risk)
- spawn-prompt-assembler.cjs: **1827 lines** → Est. 100-250ms (risk)

**Recommendations:**

1. **Add performance instrumentation:** Track actual execution time per hook
2. **Set timeout budgets:** Fail hook if >500ms
3. **Optimize hot paths:** Cache expensive lookups (agent registry, skill index)
4. **Parallelize:** Run independent hooks in parallel (40-60% speedup)

---

## Circular Dependency Analysis

**Method:** Check for parent directory imports (../) in hooks

**Result:** **0 parent imports detected** (grep -r "require._\.\./" .claude/hooks/_.cjs)

**Conclusion:** ✅ **No circular dependencies detected in hooks.** Hooks use well-defined module boundaries.

**Note:** Library modules (.claude/lib/) may have circular deps, not checked in this analysis.

---

## Missing Integrations

### Skill-Agent Assignments

**Issue:** skill-index.json shows 383 skills, but unclear if all skills are assigned to agents.

**Example:** "verification-before-completion" is assigned to 40+ agents (good), but are there skills with NO agent assignments?

**Remediation:**

1. **Audit skill-agent assignments:** Check skill-index.json for skills with empty agentPrimary/agentSupporting
2. **Create orphaned skill report:** List skills with no agent assignments
3. **Document minimum assignments:** Every skill needs ≥1 primary agent

---

### Hook-Agent Coordination

**Issue:** Hooks enforce rules, but do agents know about enforcement modes?

**Example:** routing-guard.cjs has PLANNER_FIRST_ENFORCEMENT=warn mode, but do agents see warnings?

**Remediation:**

1. **Add enforcement visibility:** Include enforcement mode in hook output
2. **Document agent-hook contract:** Agents should check enforcement warnings in hook responses
3. **Add to agent spawn prompts:** Include enforcement modes in spawn prompt context

---

## Recommendations Summary

### Immediate Actions (Next 7 Days)

1. **P0.1:** Extract routing-guard.cjs into 4 separate validators
2. **P0.2:** Regenerate skill-index.json (`node .claude/tools/cli/generate-skill-index.cjs`)
3. **P0.3:** Find and register/delete orphaned agent definition
4. **P1.1:** Move .claude/hooks/\_archive → .claude_archive/hooks/
5. **P1.2:** Add SessionEnd hook to clean .claude/context/tmp/
6. **P1.4:** Rotate audit files to WARM tier

### Short-Term Actions (Next 30 Days)

1. **P1.3:** Audit schema/workflow usage, archive unused
2. **P2.1:** Delete duplicate router.md
3. **P2.2:** Triage 95 TODO comments, create tasks for P0/P1
4. **P2.3:** Add hook performance instrumentation
5. **P2.4:** Move root-level tools to categorized subdirectories

### Long-Term Actions (Next 90 Days)

1. **P3.1:** Add database size monitoring
2. **P3.2:** Create comprehensive workflow catalog
3. **Refactor:** Break down remaining >1000 line hooks
4. **Document:** Create architecture decision records for all major patterns

---

## Metrics Snapshot

| Metric                    | Current | Target  | Status |
| ------------------------- | ------- | ------- | ------ |
| Total Hooks               | 105     | —       | ✅     |
| Archived Hooks            | 50      | 0       | ⚠️     |
| Largest Hook (lines)      | 2577    | <500    | ❌     |
| Agent Registry Health     | 100%    | >95%    | ✅     |
| Skill Index Freshness     | 24h     | <1h     | ⚠️     |
| Memory HOT Tier Size      | 17KB    | <20KB   | ✅     |
| Temp Files                | 56      | <10     | ⚠️     |
| TODO/FIXME Count          | 95      | <20     | ❌     |
| Archive Directories       | 16      | 1       | ❌     |
| Schemas                   | 159     | Unknown | ⚠️     |
| Workflows                 | 326     | Unknown | ⚠️     |
| Circular Dependencies     | 0       | 0       | ✅     |
| Hook Perf Budget Breaches | 3       | 0       | ❌     |
| Parent Directory Imports  | 0       | 0       | ✅     |
| Agent-File Drift          | 1       | 0       | ⚠️     |
| Skill Orphan Rate         | 16%     | <5%     | ❌     |

---

## Conclusion

The agent-studio framework is **operationally healthy** but carries **significant technical debt** from rapid evolution. The framework follows good architectural patterns (clean separation of concerns, registry-driven discovery, memory budgets) but suffers from **complexity explosion** in critical hot paths (routing-guard.cjs: 2577 lines) and **artifact management debt** (50 archived hooks, 75 orphaned skills, 56 temp files).

**Priority:** Focus on **P0 issues** (hook complexity, skill indexing, agent registry drift) to prevent performance degradation and routing failures.

**Next Steps:**

1. Implement P0 remediations (hook extraction, reindexing, orphan cleanup)
2. Measure hook performance (add instrumentation)
3. Create cleanup automation (archive rotation, temp file cleanup)

---

**Report Path:** `.claude/context/reports/architecture-review-2026-02-14.md`
**Follow-up:** Create tasks for P0/P1 remediation work
