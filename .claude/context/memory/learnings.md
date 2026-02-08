- PostToolUse checks are advisory only (metrics, errors, anomalies)
- Session cleanup runs once per session using module-level flag

---

## Reflection Step 0 Guard Must Check spawn-request.json (2026-02-08)

**Problem:** Router skipped Step 0 reflection spawning despite pending requests in the queue.

**Root cause:** Guard hook checked `reflection-reminder.txt` first (which may not exist) instead of prioritizing `reflection-spawn-request.json` (the actual queue/source of truth). When reminder.txt didn't exist and spawn-request.json had an empty array `[]`, the guard allowed TaskList to proceed.

**Additional factor:** Default enforcement mode was changed from `block` to `warn` (Task 1.2), softening the enforcement.

**Fix:**
1. Reordered checks: `spawn-request.json` array length is PRIMARY trigger, `reminder.txt` is SECONDARY/fallback
2. Restored default mode to `block` (was `warn`) for strict enforcement
3. Enhanced block message to show count and explicit Step 0 instructions: "(1) Read spawn-request.json, (2) Spawn reflection-agent, (3) Clear spawn-request.json, (4) Delete reminder.txt"

**Lesson:** Source-of-truth files (spawn-request.json) should be the primary enforcement trigger, not secondary signals (reminder.txt). Guard hooks must check the actual data structure (array length) not just file existence.

**Files Modified:**
- `.claude/hooks/reflection/reflection-step0-guard.cjs` (lines 100-119, 128-130, 167-177)

---

## Memory Management System Design Lessons (2026-02-08)

**Pattern:** When rebuilding archived modules, start with integration design (how it connects to existing code) before implementation design (what it does internally). The 3 archived memory modules (rotator, pruner, cold-storage) had solid internal designs but zero integration -- they were never wired into memory-scheduler.cjs or sync-memory-index.cjs hook.

**Key Findings:**
- `memory-scheduler.cjs` has `runDeduplication()` that returns "disabled (smart-pruner archived)" -- ready to wire
- `memory-scheduler.cjs` has `runArchiveOldLTM()` that tries to import archived cold-storage.cjs -- fails silently
- `sync-memory-index.cjs` hook fires on every memory file write -- ideal trigger for rotation
- `issues.md` at 53KB is the largest memory file, needs immediate rotation
- `archive/learnings-2026-02.md` at 463KB is unmanaged warm storage

**Design Principle:** Keep each module under 150 lines. The archived modules were 900 lines combined; the new design is 300 lines (67% reduction) with better integration coverage.

**ADR-102** records the full decision.

---

## Memory Management Security Review Findings (Task #7B, 2026-02-08)

**Pattern:** Security review of archived modules being rebuilt should assess both the archived code AND the active code it integrates with.

**Key Findings:**

1. **38 raw JSON.parse() calls** across the active memory subsystem (memory-manager.cjs: 11, memory-tiers.cjs: 3, memory-scheduler.cjs: 3, contextual-memory.cjs: 4, memory-dashboard.cjs: 3) -- all lack prototype pollution protection. This is the most impactful systemic vulnerability. The Smart Pruner rebuild should pioneer `safeJSONParse()` pattern.

2. **Archived memory-rotator.cjs uses fs.writeFileSync()** at lines 441, 455, 540, 554 instead of the available `atomicWriteSync()` from `atomic-write.cjs`. The rebuild MUST use atomic writes for all file operations.

3. **Cold storage archives sensitive data without scrubbing** -- API keys, JWTs, emails embedded in memory entries are compressed and preserved indefinitely. Rebuild must include `scrubSensitiveContent()` before compression.

4. **memory-scheduler.cjs line 395 uses spawnSync with -e flag** embedding `projectRoot` via `JSON.stringify()`. While currently safe (projectRoot is internally generated), this pattern is fragile for code injection if projectRoot source changes.

**Security Controls Available (from atomic-write.cjs):**
- `atomicWriteSync()` -- temp file + rename pattern for crash safety
- `atomicWriteAsync()` -- adds proper-lockfile for concurrent access
- `createBackup()` / `restoreFromBackup()` -- backup before destructive operations
- Windows-specific retry logic for EBUSY/EPERM

**Security Controls Available (from project-root.cjs):**
- `validatePathWithinProject()` -- PATH_TRAVERSAL_PATTERNS regex (catches `..`, URL-encoded traversal, null bytes)
- Windows case-insensitive comparison

**Implementation Checklist for Developer:**
1. All JSON.parse calls use safeJSONParse (grep for "JSON.parse" should return 0 in new files)
2. All file writes use atomicWriteSync (grep for "writeFileSync|appendFileSync" should return 0)
3. All archive paths validated with validatePathWithinProject()
4. Backup before truncation via createBackup()
5. scrubSensitiveContent() called before cold storage gzipSync()
6. 22 security test cases (ST-001 through ST-022) documented in report

**Report:** `.claude/context/reports/security/memory-management-security-review-2026-02-08.md`

**Files Modified:**

- Created: `.claude/hooks/routing/pre-tool-unified.cjs`
- Created: `.claude/hooks/metrics/post-tool-metrics-unified.cjs`
- Updated: `.claude/settings.json` (replaced 6 hook registrations with 2)
- Archived: 6 original hooks to respective `_archive/` directories

**Testing:**

- Basic stdin tests passed for both unified hooks
- Verified exit codes: pre-tool returns 0, post-tool returns 0

**Future Application:**

- This pattern can be applied to other hook groups with same matcher
- Consider consolidating specific-matcher hooks (Bash, Task, etc.) in Phase 3
- Unified hooks easier to maintain than scattered individual hooks

**Task #4 (Phase 2 - Consolidate 6 wildcard hooks into 2) - Complete**

---

## TDD Integration Boundary Testing Gap (Tasks #9-13, 2026-02-08)

**Pattern:** Test-Driven Development excels at unit-level validation but can miss integration contract mismatches when modules are tested in isolation.

**Discovery:** Task #9 implemented 4 memory management modules with 41 passing unit tests. Task #13 discovered 2 integration bugs:
1. `pruneResult.entriesRemoved` should be `pruneResult.removed` (field name mismatch)
2. `{ similarityThreshold: 0.6 }` should be `{ threshold: 0.6 }` (parameter key mismatch)

Both bugs were found by **human code review**, not by the 41 passing tests. This revealed a critical gap: unit tests validate internal module logic but not the contracts between modules.

**Root Cause:** When Module A tests calls to Module B, the unit test mocks Module B's return values based on test assumptions (e.g., assumes field is `removed`). The actual Module B implementation had different field names. When the modules are integrated, the mismatch becomes obvious, but automated tests never exercised the real integration.

**Solution:** Add explicit "Integration Verification" phase after unit tests pass:
1. Write integration tests using REAL modules (not mocks) for boundary interfaces
2. Define explicit contracts for each integration point (parameter names, return field names, error cases)
3. Add runtime validation to detect contract violations immediately

**Implementation Pattern:**
```javascript
// Integration test (missing in Task #9, needed):
test("scheduler correctly calls pruner interface", () => {
  const scheduler = require('./memory-scheduler');
  const pruner = require('./smart-pruner');

  // Call real functions to verify contract
  const result = pruner.deduplicate(testEntries);

  // Verify actual field names match expectations
  assert(result.hasOwnProperty('removed'), "pruner returns 'removed' field");

  // Verify scheduler integration works
  scheduler.runDeduplication(); // Should not throw
});

// Contract specification (prevents refactoring breaking interface):
const PRUNER_CONTRACT = {
  deduplicate: {
    params: { entries: 'array', threshold: 'number' },
    returns: { removed: 'number', timestamp: 'string' }
  }
};
```

**Benefits:**
- Catches integration bugs before code review (not after)
- Eliminates false confidence: passing tests actually mean integration works
- Creates executable contract documentation
- Future refactoring won't break contracts silently

**When to Apply:** Any multi-module feature, especially when:
- Parameters have implicit names (not enforced by type system)
- Return values have implicit field names
- Contract is documented in code comments, not types
- Integration has multiple layers (caller → intermediate → callee)

**Lesson:** TDD's strength (isolating modules for testing) can become a weakness at integration boundaries. Always add integration verification phase before declaring a feature complete. The 41 unit tests in Task #9 were excellent, but they should have been accompanied by 5-10 integration tests verifying actual module contracts.

---

## Test Cleanup: Archive Tests for Archived Modules (2026-02-08)

**Pattern:** When archiving implementation modules, archive corresponding test files to prevent MODULE_NOT_FOUND failures.

**Problem:** 29 test files importing archived workflow/memory/self-healing modules would fail with MODULE_NOT_FOUND since the implementation was archived.

**Archived Test Files (28 total, 42 changes including deletions):**

- **tests/_archive/**: 8 files (spec-017 through spec-022, workflow-state-transactions, error-pattern-detector-memory)
- **tests/phase-4/_archive/**: 8 files (workflow-versioning, workflow-performance, workflow-patterns-*, hybrid-executor, legacy-adapter-strangler, workflow-composition)
- **tests/workflows/_archive/**: 1 file (state-machine-advanced)
- **tests/integration/_archive/**: 1 file (integration-impact)
- **tests/lib/memory/_archive/**: 7 files (already archived: cold-storage, memory-consolidation, memory-rotator, semantic-archival, session-context-for-search, smart-pruner, smart-pruner-perf-009)
- **tests/lib/workflow/_archive/**: 2 files (already archived: domain-detector, saga-coordinator)
- **tests/lib/self-healing/_archive/**: 1 file (already archived: dashboard)

**Verification:**

- Grep search confirms all test files importing archived modules are now in `_archive/` directories
- 26 test files found, all in `_archive/` paths
- Git status shows 42 test file changes (renames + staged additions/deletions)

**Learnings:**

- Test archival should happen alongside implementation archival (prevents broken test suite)
- Use Grep to find test imports before archiving: `require\(['\"].*/(archived-module)\.cjs`
- Create `_archive/` directories in test tree mirroring implementation structure
- Git shows renames (R) for moved files, additions (A) + deletions (D) for previously moved files

**Diagnostic Context:** This resolves the P3 finding from system-diagnostics-2026-02-08.md (29 test file imports of archived workflow modules).

---

## System Diagnostics Post-Consolidation (2026-02-08)

**Pattern:** After major archival/consolidation changes, run comprehensive diagnostics to verify system health.

**Diagnostics Run:** Post-consolidation health check after:
- 6 wildcard hooks → 2 unified hooks
- 37 dead modules archived (_archive/ directories)
- 6 original hooks moved to _archive/

**Results (27/31 passed, 87%):**

✅ **Hook System:**
- All 6 core routing/safety hooks exist and load
- Both new unified hooks execute correctly
- Hook count reduced: 45 → 37 active hooks
- No archived hooks registered in settings.json

✅ **Router System:**
- routing-table.cjs loads (7 exports, 132 agents)
- All 5 core routing modules load without errors

✅ **Memory System:**
- All 5 memory files exist (learnings, decisions, issues, active_context, memory.db)
- memory-manager.cjs and memory-tiers.cjs load successfully

✅ **Workflow System:**
- All 3 core workflow modules load (state-manager, phase-advance, complexity-classifier)

⚠️ **Findings (3 medium-priority):**

1. **memory-scheduler.cjs imports archived smart-pruner.cjs** (line 347)
   - Impact: Deduplication feature non-functional (fails silently)
   - Resolution: Restore smart-pruner.cjs OR remove deduplication feature
   - Priority: P2

2. **29 test file imports of archived workflow modules**
   - deployment-manager.cjs (23 imports in spec-020-versioning.test.cjs)
   - strangler-fig.cjs, workflow-composer.cjs, saga-coordinator.cjs (6 imports)
   - Impact: Test failures (expected, pre-existing)
   - Resolution: Archive test files alongside implementation modules
   - Priority: P3

3. **Test suite not verified**
   - Windows command syntax prevented automated test run
   - Manual verification required: `pnpm test`
   - Priority: P1

**Full Report:** `.claude/context/reports/architecture/system-diagnostics-2026-02-08.md`

**Learnings:**
- Unified hook pattern successful (6→2 consolidation working correctly)
- Archived modules with `safeRequire()` fail gracefully (no crashes)
- Test files importing archived modules need cleanup alongside archival
- Windows path issues in Bash tool require PowerShell fallback for complex commands

---

**Task #4 (Phase 2 - Consolidate 6 wildcard hooks into 2) - Complete**

---

## Dead Code Archive: Phase 1 (Task #3, 2026-02-08)

**Pattern:** Systematic archival of dead modules verified via `require()` dependency tracing.

**Archived (37 production files, 10,271 lines + 12 test files, 3,127 lines):**

- Workflow: 22 modules (5,808 lines) to `.claude/lib/workflow/_archive/`
- Memory: 6 modules (2,507 lines) to `.claude/lib/memory/_archive/`
- ML: 7 modules + 1 models/ subdir (1,368 lines) to `.claude/lib/ml/_archive/`
- Self-Healing: 1 module (588 lines) to `.claude/lib/self-healing/_archive/`

**Skipped (with reasons):**

- `session-summary.cjs` (memory) -- active import from `memory-tiers.cjs`
- `loop-state-manager.cjs` (self-healing) -- active import from `post-task-unified.cjs`
- `error-pattern-detector.cjs` -- active import from `weekly-error-analysis.cjs` tool
- `validator.cjs` (self-healing) -- active import from `rollback-manager.cjs`
- `ml/index.cjs` -- kept as facade; active imports from `unified-reflection-handler.cjs` and `workflow-engine.cjs`

**Verification:**

- All pre-existing passing tests still pass
- rollback-manager.test.cjs passes (validator.cjs restored after initial mis-archive)
- Pre-existing failures (intent-analyzer, memory-deduplicator, etc.) confirmed pre-existing

**Task #3 (Phase 1 - Archive dead modules) - Complete**

---

## Memory Management Rebuild - Implementation Complete (Task #9, 2026-02-08)

**Pattern:** TDD with integration wiring produces robust, testable memory management systems.

**Implementation Summary:**
- Created `.claude/lib/memory/cold-storage.cjs` (89 lines) - archives warm storage to cold JSONL with sensitive scrubbing
- Wired into `memory-scheduler.cjs`: replaced dead runDeduplication(), added runRotation(), updated runArchiveOldLTM()
- Wired into `sync-memory-index.cjs` hook: triggers rotation when files exceed 20KB
- Added memory config to `.claude/config.yaml` (rotation threshold, pruning similarity, cold storage max age)
- All security controls applied: atomicWriteSync, safeParseJSON, scrubSensitiveContent, validatePathWithinProject

**Test Coverage:**
- 7 unit tests for cold-storage.cjs (100% passing)
- 4 integration tests for full pipeline (rotation → dedup → cold) (100% passing)
- Total: 11/11 tests passing

**Key Learnings:**
1. **TDD Red-Green-Refactor works**: Wrote failing tests first, minimal implementation, then refactored. Each module took ~30 minutes.
2. **Integration is non-negotiable**: A module without wiring is invisible. cold-storage, memory-rotator, and smart-pruner were individually correct but worthless until wired into scheduler + hook.
3. **Security by design**: Using existing utilities (atomicWriteSync, safeParseJSON, scrubSensitiveContent) from the start prevents vulnerabilities. No security retrofitting needed.
4. **Test assumptions matter**: JWT regex requires 10+ chars after `eyJ`. Status regex expects `:` not `: ` (colon-no-space not colon-space). File size requires 400+ iterations to exceed 20KB. Old enough dates required for pruning (30+ days).
5. **Hook integration is best-effort**: sync-memory-index.cjs triggers rotation in try-catch with silent failure. This prevents hook crashes from blocking memory writes.

**Files Modified:**
- Created: `.claude/lib/memory/cold-storage.cjs` (89 lines)
- Modified: `.claude/lib/memory/memory-scheduler.cjs` (wired rotation, dedup, cold; fixed JSON.parse calls)
- Modified: `.claude/hooks/memory/sync-memory-index.cjs` (added rotation trigger after sync)
- Modified: `.claude/config.yaml` (added memory section with rotation/pruning/cold_storage config)
- Created: `tests/lib/memory/cold-storage.test.cjs` (7 tests)
- Created: `tests/lib/memory/memory-management-integration.test.cjs` (4 tests)

**Next Steps:**
- Monitor issues.md size (currently 53KB) - should rotate automatically via hook
- Monitor warm archive growth (learnings-2026-02.md at 463KB) - should archive to cold after 30 days
- Consider adding searchCold() implementation for cold storage query (currently stubbed)

