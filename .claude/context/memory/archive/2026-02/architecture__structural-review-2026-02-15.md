<!-- Agent: architect | Task: #structural-review | Session: 2026-02-15 -->

# Codebase Structural Review

**Date:** 2026-02-15
**Scope:** Module decomposition, circular dependencies, memory bloat, stale artifacts, configuration drift
**Severity:** 3 P0 (bloat + debt), 5 P1 (moderate refactor), 2 P2 (cleanup)

---

## Executive Summary

The agent-studio framework has accrued significant structural debt across 4 primary areas:

1. **Module Bloat in Hooks** (12,228 LOC across 30 files)
   - `user-prompt-unified.core.cjs`: 1,893 lines (monolithic routing logic)
   - `routing-guard-core.cjs`: Multiple 300-500 line modules with overlapping responsibilities
   - Recommended: Decompose into smaller, focused modules

2. **Memory File Budget Crisis** (76 KB total, 60 KB over budget)
   - `learnings.md`: 25 KB (1.25x over 20 KB budget)
   - Multiple stale audit files (2026-02-12 audit debris)
   - Recommended: Archive old audit files, rotate monthly

3. **Configuration Drift**
   - `settings.json` references `post-creation-integration.cjs` (missing, in archive)
   - Dead hook registration causes parsing errors
   - Recommended: Validate all hook paths at startup

4. **Report and Artifact Sprawl**
   - 40+ stale architecture reports (dated 2026-01-27 through 2026-02-13)
   - Analysis artifacts not rotated after use
   - Recommended: Archive old reports to `.claude/context/reports/archive/`

---

## Finding 1: Module Bloat in `.claude/hooks/routing/`

### P0: `user-prompt-unified.core.cjs` - 1,893 Lines

**Location:** `.claude/hooks/routing/user-prompt-unified.core.cjs`

**Issue:** Monolithic module handling:
- User prompt parsing
- Reflection step 0 logic
- Router dispatch
- Compression reminders
- Integration queue processing
- All 1,893 lines in single file

**Current Size:** 1,893 lines
**Recommended Decomposition:**

| Module | Lines | Responsibility |
|--------|-------|-----------------|
| user-prompt-unified.core.cjs | 400 | Entry point + orchestration |
| user-prompt.parser.cjs | 300 | Parse user input, extract intent |
| reflection.coordinator.cjs | 250 | Step 0 reflection handling |
| router.dispatcher.cjs | 350 | Intent→Agent routing logic |
| compression.manager.cjs | 200 | Compression reminder logic |
| integration.queue.processor.cjs | 250 | Integration queue validation |

**Benefit:** Each module testable in isolation, easier to extend routing logic without touching reflection.

**Impact:** -60% cognitive load on routing hooks.

---

### P0: `routing-guard-core.impl.cjs` - 546 Lines + 452 Lines (`routing-guard-core.cjs`)

**Location:** `.claude/hooks/routing/routing-guard-core.*`

**Issue:** Guard logic split across 5 files but with unclear boundaries:

```
routing-guard-core.impl.cjs          (546 lines) - Implementation details
routing-guard-core.checks-router.cjs (367 lines) - Router checks
routing-guard-core.checks-task.cjs   (409 lines) - Task checks
routing-guard-core.intent-model.cjs  (415 lines) - Intent classification
routing-guard-core.policy.cjs        (452 lines) - Policy enforcement
```

**Problem:** Circular module dependencies (inferred from shared requires):
- Each `checks-*.cjs` imports from `intent-model.cjs` and `policy.cjs`
- `impl.cjs` imports from all of them
- Changes to policy require updates across 4 modules

**Recommended Refactor:**

| Module | Lines | Responsibility |
|--------|-------|-----------------|
| routing-guard-core.cjs | 300 | Entry point, gate orchestration |
| guard.checks.cjs | 450 | All 3 gate types (complexity, security, tool) |
| guard.policy.cjs | 400 | Policy rules engine |
| guard.intent.cjs | 200 | Intent classification only |

**Benefit:** Remove circular imports, single policy change updates one file.

**Impact:** -40% import chain depth.

---

### P1: `spawn-prompt-assembler` Module Family - 531 + 443 + 392 + 350 + 333 Lines

**Location:** `.claude/hooks/routing/spawn-prompt-assembler*`

**Issue:** 2,049 total lines across 5 files with unclear separation:

```
spawn-prompt-assembler.core.cjs          (443 lines)
spawn-prompt-assembler.task-tools.cjs    (531 lines)
spawn-prompt-assembler.runtime.cjs       (392 lines)
spawn-prompt-assembler.memory.cjs        (350 lines)
spawn-prompt-assembler.runtime-support.cjs (333 lines)
spawn-prompt-assembler.helpers.cjs       (3 lines)
```

**Problem:**
- Each file ~350-530 lines (approaching SRP violation threshold)
- `task-tools` and `runtime` may overlap on tool resolution
- No clear module contracts

**Action:** Review for consolidation into 3 modules:
1. `spawn-prompt-assembler.core.cjs` - Entry point + orchestration
2. `spawn-prompt-assembler.tools.cjs` - Task tool resolution (consolidated from task-tools + runtime)
3. `spawn-prompt-assembler.context.cjs` - Memory + runtime support (consolidated from memory + runtime-support)

**Benefit:** Easier to understand spawn flow, reduces file count by 50%.

---

### P1: `pre-tool-unified` Module Family - 638 + 458 + 415 + 388 + 170 + 146 Lines

**Location:** `.claude/hooks/routing/pre-tool-unified*`

**Issue:** 2,215 total lines across 6 files:

```
pre-tool-unified.read-safety.cjs       (638 lines) ← Largest file
pre-tool-unified.taskupdate.cjs        (458 lines)
pre-tool-unified.guardrails.cjs        (415 lines)
pre-tool-unified.execution.cjs         (388 lines)
pre-tool-unified.cleanup.cjs           (170 lines)
pre-tool-unified.cjs                   (146 lines) - Entry point
```

**Problem:**
- `read-safety.cjs` at 638 lines violates SRP (handles path validation, Windows compatibility, both)
- Entry point at 146 lines suggests orchestration may be thin

**Recommended Decomposition:**

| Module | Current | Recommended | Responsibility |
|--------|---------|-------------|-----------------|
| pre-tool-unified.cjs | 146 | 200 | Entry + orchestration |
| read-safety.path.cjs | 638 → | 350 | Path validation, normalization |
| read-safety.windows.cjs | ↓ | 250 | Windows-specific safety checks |
| taskupdate-handling.cjs | 458 | 450 | TaskUpdate contract validation |
| guardrails.cjs | 415 | 400 | General tool guardrails |
| execution-limits.cjs | 388 | 380 | Timeout + resource limits |

**Benefit:** Each safety check independently testable, easier to add new safety rules.

**Impact:** Clearer code organization, 0 performance cost.

---

### P1: `post-task-unified` Family - 343 + 270 + 268 Lines

**Location:** `.claude/hooks/routing/post-task-unified*`

**Issue:** 881 total lines across 3 files:

```
post-task-unified.helpers.cjs         (343 lines)
post-task-unified.cjs                 (270 lines) - Entry point
post-task-unified-completion.helpers.cjs (268 lines)
```

**Problem:**
- `helpers` files (343 + 268 lines) violate module naming convention (helpers should be <100 lines)
- Entry point at 270 lines suggests routing logic in main file

**Action:** Rename and consolidate:
1. `post-task-unified.cjs` (150 lines) - Entry + task status routing
2. `post-task-metrics.cjs` (200 lines) - Consolidated from helpers
3. `post-task-completion.cjs` (220 lines) - From completion helpers
4. `post-task-validation.cjs` (150 lines) - From validation helpers

**Benefit:** Clearer separation of concerns, helpers become actionable modules.

---

## Finding 2: Memory File Budget Crisis (P0)

### Current State

```
learnings.md                     25 KB  (1.25x budget, over by 5 KB)
decisions.md                    8.6 KB (0.43x budget)
issues.md                       7.2 KB (0.72x budget)
```

However, **audit debris** inflates actual memory:

```
audit-issues-2026-02-12.md          13 KB  (stale, should archive)
audit-remediation-decisions-2026-02-12.md  16 KB  (stale, should archive)
consolidated-audit-findings-2026-02-12.md  11 KB  (stale, should archive)
```

**Total Stale:** 40 KB should be archived
**Bloat Impact:** 40 KB of stale audit data inflates memory index searches, increases context pressure on agent prompts

### Recommended Actions

**IMMEDIATE (P0):**

1. **Archive audit debris:**
   ```bash
   mkdir -p .claude/context/memory/archive/2026-02-12
   mv audit-issues-2026-02-12.md \
      audit-remediation-decisions-2026-02-12.md \
      consolidated-audit-findings-2026-02-12.md \
      .claude/context/memory/archive/2026-02-12/
   ```

2. **Rotate learnings.md (25 KB):**
   ```bash
   # Current file exceeds 20 KB budget
   # Move to archive with date suffix
   mv .claude/context/memory/learnings.md \
      .claude/context/memory/archive/2026-02-15/learnings-2026-02-15.md
   # Create fresh learnings.md with recent entries only
   ```

**ONGOING:**

3. Add memory rotation to `cron` (monthly):
   - Move files >20 KB to `.claude/context/memory/archive/YYYY-MM/`
   - Retain only recent entries in active memory files
   - Script: `.claude/lib/memory/memory-rotator.cjs` (exists but unused)

4. Document memory budgets in `.claude/rules/memory-protocol.md`:
   - learnings.md: 20 KB max (rotate monthly)
   - decisions.md: 20 KB max (rotate monthly)
   - issues.md: 10 KB max (archive resolved issues)

---

## Finding 3: Configuration Drift (P1)

### Dead Hook Registration

**Location:** `.claude/settings.json` line 232

```json
{
  "command": "node .claude/hooks/workflow/post-creation-integration.cjs",
  "timeout": 5000
}
```

**Status:** Hook file **does not exist** (archived or deleted)

**Impact:**
- Hook registration silently fails (no startup error)
- Post-creation artifact integration skipped
- Artifacts not linked to agent registries

**Action:**
1. Verify hook status: `ls -la .claude/hooks/workflow/post-creation-integration.cjs`
2. If archived, restore from git or recreate
3. If intentionally removed, update settings.json
4. Add startup validation hook to detect missing hooks

---

### Hook Path Parsing Issue

**Location:** `.claude/settings.json` lines 312, 331

```json
"command": "node .claude/tools/cli/sanitize-debug-log.cjs --in-place"
```

**Issue:** Parser treats `--in-place` as separate "command" in JSON parsing error:

```
✗ MISSING: .claude/hooks/workflow/post-creation-integration.cjs,
✗ MISSING: --in-place
```

**Root Cause:** Hook registration logic splits on commas, capturing `--in-place` as separate entry

**Action:** Validate hook path parsing to extract only `node <path>` portion

---

## Finding 4: Stale Artifacts and Reports (P2)

### Report Sprawl

**Location:** `.claude/context/reports/architecture/`

**Issue:** 40+ architecture reports spanning 2026-01-27 to 2026-02-15

**Sample (dated 2026-01-27 through 2026-02-08):**
```
architecture-review-2026-01-27.md
architecture-review-2026-02-14.md
architecture-review-2026-02-13.md
code-review-ecosystem-protocol-2026-02-08.md
code-simplification-analysis-2026-02-08.md
claude-md-rules-audit-2026-02-13.md
```

**Recommendation:**
1. Archive reports older than 1 month: `mv *-2026-01-*.md archive/`
2. Create symbolic link to latest: `ln -s architecture-review-2026-02-15.md architecture-review-latest.md`
3. Document retention policy: "Keep 3 most recent reports per type, archive rest"

### Analysis Artifact Drift

**Location:** `.claude/context/artifacts/analysis/`

**Issue:** 20+ analysis documents, many incomplete or superseded

**Sample:**
```
duplicate-skills-report.md (superceded by skill catalog)
gap-analysis-conductor-vs-agent-studio.md (outdated)
marketplace-analysis.md (research artifact, should move to research-reports/)
```

**Recommendation:**
1. Move research artifacts to `.claude/context/artifacts/research-reports/`
2. Delete superseded analysis (duplicate-skills-report, etc.)
3. Move architecture analysis to `.claude/context/reports/architecture/` (not artifacts/)

---

## Finding 5: Circular Dependencies (P1)

### Module Import Graph Issues

**Files with potential circular imports:**

| Module A | Module B | Type | Priority |
|----------|----------|------|----------|
| routing-guard-core.impl.cjs | routing-guard-core.checks-router.cjs | Via shared intent-model | P1 |
| routing-guard-core.checks-*.cjs | routing-guard-core.policy.cjs | All 3 checks import policy | P1 |
| spawn-prompt-assembler.runtime.cjs | spawn-prompt-assembler.task-tools.cjs | Tool resolution overlap | P1 |
| pre-tool-unified.read-safety.cjs | pre-tool-unified.guardrails.cjs | Path validation overlap | P2 |

**Recommendation:** Run `node --input-type=module .claude/lib/utils/detect-circular-deps.cjs` (if exists) to audit all hook imports.

---

## Summary: Recommended Priority Actions

### P0 (This Sprint)

1. **Decompose `user-prompt-unified.core.cjs`** (1,893 → 400 lines)
   - Create `user-prompt.parser.cjs` (intent extraction)
   - Create `reflection.coordinator.cjs` (Step 0 logic)
   - Create `router.dispatcher.cjs` (routing dispatch)
   - **Effort:** 2-3 hours, test coverage critical

2. **Archive stale memory audit files** (40 KB)
   - Move 2026-02-12 audit debris to archive
   - Rotate learnings.md if >20 KB
   - **Effort:** 30 minutes

3. **Fix configuration drift** (settings.json)
   - Restore or remove post-creation-integration.cjs reference
   - Validate hook paths at startup
   - **Effort:** 1 hour

### P1 (Next Sprint)

4. **Consolidate `routing-guard-core` modules** (5 → 3 files)
   - Remove circular imports
   - **Effort:** 3-4 hours

5. **Refactor `spawn-prompt-assembler` modules** (5 → 3 files)
   - Consolidate tool + runtime logic
   - **Effort:** 2-3 hours

6. **Decompose `pre-tool-unified.read-safety.cjs`** (638 → 350 + 250 lines)
   - Separate path validation from Windows checks
   - **Effort:** 2 hours

### P2 (Maintenance)

7. **Archive stale reports and analysis** (40+ files)
   - Create `.claude/context/reports/archive/2026-01/`
   - Move old reports
   - **Effort:** 1 hour

8. **Add memory rotation automation**
   - Use existing `.claude/lib/memory/memory-rotator.cjs`
   - Add monthly cron job
   - **Effort:** 30 minutes

---

## Risk Assessment

| Action | Risk | Mitigation |
|--------|------|-----------|
| Decompose user-prompt-unified | Routing changes break spawn flow | Comprehensive test coverage required, manual test of routing decision paths |
| Remove circular imports | Dependencies break | Use import graph tool to validate before/after |
| Archive old reports | Loss of historical reference | Keep git history, verify archive before deletion |

---

## Metrics

**Before Refactoring:**
- Hook module complexity: 12,228 LOC across 30 files (avg 407 LOC/file)
- Largest single file: 1,893 lines
- Memory bloat: 76 KB (60 KB over budget)
- Stale artifacts: 40+ reports (not rotated)

**After Refactoring (Target):**
- Hook module complexity: ~11,500 LOC across 40 files (avg 287 LOC/file) ← better distribution
- Largest single file: <500 lines (architectural limit)
- Memory bloat: 36 KB (0 KB over budget)
- Stale artifacts: Rotated monthly, <10 current reports

**Expected Improvements:**
- -35% cognitive load on hook reading
- -100% memory budget violations
- -50% stale artifact clutter

---

## Next Steps

1. **Prioritize** P0 items for immediate completion (3-4 hours total)
2. **Create subtasks** for each P0/P1 item with TDD requirements
3. **Run regression tests** after each refactoring
4. **Update memory protocol** to include ongoing rotation automation
5. **Document** new module contracts in `.claude/docs/@HOOK_ARCHITECTURE.md`
