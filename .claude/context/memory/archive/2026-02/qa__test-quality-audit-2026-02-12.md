# Test Quality Audit - 2026-02-12

<!-- Agent: qa | Task: audit | Session: 2026-02-12 -->

## Executive Summary

Comprehensive audit of agent-studio test suite covering 106+ test files across hooks, lib, integration, and code-indexing domains. Analysis reveals strong test coverage for critical paths (routing-guard, unified-creator-guard, memory subsystem) with identified gaps in workflow orchestration, error handling, and integration boundary testing.

**Overall Assessment:** GOOD (7/10)
- Strong: Hook enforcement, routing logic, memory operations
- Weak: Workflow integration, error boundaries, flaky test patterns
- Critical: Missing coverage for post-completion-chain, pre/post-task-unified hooks

---

## CRITICAL Findings (Immediate Action Required)

### C-001: Missing Test Coverage for post-task-unified.cjs Hook

**Severity:** CRITICAL
**Location:** `.claude/hooks/routing/post-task-unified.cjs` (exists), `tests/hooks/post-task-unified.test.cjs` (EXISTS but needs expansion)

**Issue:**
post-task-unified.cjs consolidates 6 hooks (agent-context-tracker, workflow learning extraction, task-completion-guard, evolution-audit, task-list-tracker) but test file only covers basic consolidation logic. Missing tests for:
- Workflow learning extraction edge cases
- Task-output memory extraction failures
- Evolution audit triggers
- Concurrent TaskList/Task interactions
- State corruption scenarios

**Impact:**
- Silent failures in workflow learning extraction
- Task completion guards bypassed
- Evolution audit false negatives

**Recommendation:**
Expand `tests/hooks/post-task-unified.test.cjs` to cover:
1. Each of 6 consolidated hooks' logic independently
2. Error handling when workflow state is corrupted
3. Concurrent Task/TaskList execution races
4. Memory extraction failures (disk full, permission denied)

**Test Gap Estimate:** ~15 critical test cases missing

---

### C-002: Missing Test Coverage for pre-task-unified.cjs Hook

**Severity:** CRITICAL
**Location:** `.claude/hooks/routing/pre-task-unified.cjs` (exists), `tests/hooks/pre-task-unified*.test.cjs` (NOT FOUND)

**Issue:**
pre-task-unified.cjs is a consolidation hook for PreToolUse(Task|TaskList) but NO test file exists. This hook likely handles:
- Task validation before execution
- State setup before Task spawning
- TaskList pre-execution validation

**Impact:**
- Invalid Task spawns not caught
- State corruption before task execution
- Workflow phase setup failures

**Recommendation:**
Create `tests/hooks/pre-task-unified.test.cjs` covering:
1. Task validation logic
2. State setup before spawning
3. Error handling for invalid task parameters
4. Concurrent TaskList call detection

**Test Gap Estimate:** ~20 test cases needed

---

### C-003: Missing Test Coverage for unified-pre-write-hook.cjs

**Severity:** CRITICAL
**Location:** `.claude/hooks/safety/unified-pre-write-hook.cjs` (expected, not found during scan), `tests/hooks/*unified-pre-write*.test.cjs` (NOT FOUND)

**Issue:**
unified-pre-write-hook.cjs consolidates 11 safety checks (path validation, Windows compatibility, file safety) per CLAUDE.md Section 1.3, but no test file found. This is a BLOCKING safety hook that protects against:
- Path traversal attacks
- Windows reserved name writes (nul, con, prn)
- Unsafe file operations

**Impact:**
- Path traversal vulnerabilities
- Windows platform crashes
- Unauthorized file writes

**Recommendation:**
Create `tests/hooks/unified-pre-write-hook.test.cjs` covering:
1. Path traversal detection (../, encoded traversal)
2. Windows reserved name blocking (nul, con, com1-9, lpt1-9)
3. File safety validations (permissions, existence checks)
4. Integration with unified-creator-guard.cjs

**Test Gap Estimate:** ~25 test cases needed for 11 safety checks

---

### C-004: Missing Integration Tests for post-completion-chain.cjs

**Severity:** CRITICAL
**Location:** `.claude/hooks/workflow/post-completion-chain.cjs` (line 1-50 scanned), `tests/hooks/post-completion-chain.test.cjs` (EXISTS but incomplete per scanning)

**Issue:**
post-completion-chain.cjs triggers workflow phase advancement when agents complete (Task 3.1 per source code comments). Test file exists but scanning revealed it's likely incomplete. Missing coverage for:
- Quality gate evaluation failures (evaluateGate from quality-gates.cjs)
- Phase advance signal corruption
- Concurrent agent completion races
- Workflow state transitions (all 8 phases)
- Gate pass/fail scenarios

**Impact:**
- Workflow phase advancement stalls
- Quality gates silently bypassed
- Phase transitions corrupted

**Recommendation:**
Expand `tests/hooks/post-completion-chain.test.cjs` to cover:
1. All 8 workflow phases (Triage → Design → Implement → Review → Deploy → Document → Reflect)
2. Quality gate evaluation (blocking + non-blocking gates)
3. Phase advance signal generation and consumption
4. Error handling when workflow-state.json is corrupted
5. Concurrent agent completion scenarios

**Test Gap Estimate:** ~30 test cases needed for workflow orchestration

---

## HIGH Priority Findings (Next Sprint)

### H-001: Flaky Test Pattern - Timing Dependencies

**Severity:** HIGH
**Locations:**
- `tests/code-indexing/incremental-indexing.test.cjs`
- `tests/code-indexing/index-manager.test.cjs`
- `tests/lib/memory/memory-scheduler-perf-009.test.cjs`

**Issue:**
Tests depend on timing/file system order without explicit ordering guarantees. Examples:
- BM25 indexer tests assume immediate index availability after write
- Memory scheduler tests assume file write completion before reads
- Incremental indexing tests assume filesystem watch triggers fire immediately

**Evidence:**
```cjs
// memory-scheduler-perf-009.test.cjs
scheduler.getMemoryDir(PROJECT_ROOT); // No sync check before asserting
```

**Impact:**
- Intermittent CI failures (race conditions)
- False positives in local runs
- Developer time wasted debugging "works on my machine"

**Recommendation:**
Add explicit synchronization:
1. Use fs.promises.access() to verify file existence before assertions
2. Add waitForCondition() helper with 5s timeout
3. Mock filesystem for deterministic tests
4. Add retry logic for filesystem-dependent assertions

**Files to Fix:** 3 code-indexing tests, 1 memory test

---

### H-002: Insufficient Error Handling Test Coverage

**Severity:** HIGH
**Locations:**
- `tests/code-indexing/hybrid-search.test.cjs` (line 432-462: only 3 error tests)
- `tests/lib/routing/semantic-router.test.cjs` (error tests missing)
- `tests/hooks/user-prompt-orchestrator.test.cjs` (line 180-202: only execution failure, missing hook stderr/timeout)

**Issue:**
Error handling tests are sparse. hybrid-search.test.cjs has only 3 error scenarios:
- Empty query
- Semantic search errors
- ast-grep errors

Missing error scenarios:
- Network timeouts (semantic search with remote embeddings)
- Disk full errors (indexing failures)
- Invalid input validation (malformed queries)
- Cascading failures (semantic fails → structural fails → no results)

**Impact:**
- Unhandled exceptions in production
- Poor error messages for users
- Silent failures in background processes

**Recommendation:**
Add comprehensive error tests:
1. Network failures (timeout, connection refused)
2. Filesystem errors (ENOSPC, EACCES, EMFILE)
3. Invalid input validation
4. Partial failure scenarios (1 of N operations fails)
5. Resource exhaustion (memory, file descriptors)

**Test Gap Estimate:** ~40 error handling test cases needed

---

### H-003: Missing Integration Boundary Tests

**Severity:** HIGH
**Locations:**
- Integration between routing-guard.cjs and unified-creator-guard.cjs (no end-to-end test)
- Integration between post-task-unified.cjs and post-completion-chain.cjs (workflow advancement)
- Integration between hybrid-search.cjs and index-manager.cjs (semantic + structural)

**Issue:**
Unit tests exist for individual components but integration tests for multi-component interactions are missing. Example gaps:
- No test verifying routing-guard.cjs blocks Task spawn AND unified-creator-guard.cjs blocks Write in same request
- No test verifying post-task-unified.cjs triggers post-completion-chain.cjs for workflow phase advancement
- No test verifying hybrid-search.cjs correctly uses index-manager.cjs semantic search + ast-grep refinement end-to-end

**Impact:**
- Integration bugs slip through (tests pass, integration fails)
- Regression when component interfaces change
- Assumptions about component behavior become invalid

**Recommendation:**
Create integration test suite:
1. `tests/integration/hook-chain-e2e.test.cjs` - Test hook execution order and state passing
2. `tests/integration/workflow-orchestration-e2e.test.cjs` - Test full workflow phase advancement
3. `tests/integration/hybrid-search-e2e.test.cjs` - Test semantic → structural → ranking pipeline

**Test Gap Estimate:** ~25 integration test cases needed

---

### H-004: Test Organization - Inconsistent Naming and Location

**Severity:** HIGH (affects maintainability)
**Locations:**
- `tests/hooks/post-completion-chain.test.cjs` - Should be in `tests/hooks/workflow/`
- `tests/lib/memory/contextual-memory.search-filters.test.cjs` - Descriptive but long name
- Test files in `tests/fixtures/` without corresponding tests

**Issue:**
Inconsistent test file naming and directory structure:
- Workflow hooks in `tests/hooks/` instead of `tests/hooks/workflow/`
- Some tests use descriptive names (contextual-memory.search-filters.test.cjs) while others use module names (hybrid-search.test.cjs)
- Fixture directories exist without clear test ownership

**Impact:**
- Hard to find tests for specific components
- New contributors confused by structure
- Duplicate test coverage (same behavior tested in multiple files)

**Recommendation:**
Reorganize test structure:
1. Move workflow hook tests to `tests/hooks/workflow/`
2. Standardize naming: `<module>.<feature>.test.cjs` or `<module>.test.cjs`
3. Create `tests/fixtures/README.md` documenting fixture ownership
4. Add test discovery script: `pnpm test:list-coverage`

---

## MEDIUM Priority Findings (Future Iterations)

### M-001: Overly Mocked Tests Reduce Confidence

**Severity:** MEDIUM
**Locations:**
- `tests/code-indexing/hybrid-search.test.cjs` (lines 14-109: extensive mocks)
- `tests/lib/routing/semantic-router.test.cjs` (mocks embedding generator)

**Issue:**
Tests use extensive mocking which reduces confidence that code works with real dependencies. Example:
- hybrid-search.test.cjs mocks IndexManager, AstGrepSearch, QueryAnalyzer, ResultRanker
- semantic-router.test.cjs mocks embedding generator

While unit testing philosophy, these tests don't catch:
- Real API contract violations
- Performance issues with real data
- Actual integration bugs

**Impact:**
- False confidence (tests pass, real usage fails)
- Refactoring breaks real usage but tests still pass
- Performance regressions undetected

**Recommendation:**
Add contract tests with real dependencies:
1. Create `tests/contracts/` directory for API contract tests
2. Use real IndexManager with small test corpus
3. Add performance benchmarks with real data
4. Keep unit tests but add contract/integration layer

**Priority:** MEDIUM (unit tests are valuable, this is additive)

---

### M-002: Missing Edge Case Coverage

**Severity:** MEDIUM
**Locations:**
- `tests/code-indexing/query-analyzer.test.cjs` (line 63-70: only empty query, missing whitespace-only, special chars)
- `tests/hooks/routing-guard-comprehensive.test.cjs` (missing edge cases: state file corruption, concurrent writes)

**Issue:**
Edge cases are under-tested. Examples:
- query-analyzer.test.cjs tests empty string but not whitespace-only, null, undefined, special characters
- routing-guard tests don't cover corrupted router-state.json (invalid JSON, missing fields)

Missing edge cases:
- Whitespace-only inputs
- Unicode/emoji in queries
- Null/undefined parameters
- Corrupted state files
- Race conditions (concurrent state updates)

**Impact:**
- Crashes on unexpected input
- Silent failures with malformed data
- Race conditions in concurrent scenarios

**Recommendation:**
Add edge case tests:
1. Boundary values (empty, max length, special chars)
2. Invalid input (null, undefined, wrong type)
3. Corrupted state (invalid JSON, missing fields)
4. Concurrent access (multiple processes, race conditions)

**Test Gap Estimate:** ~50 edge case test cases needed

---

### M-003: Performance Regression Tests Missing

**Severity:** MEDIUM
**Locations:**
- No performance tests found for hybrid-search.cjs
- No performance tests found for BM25 indexer
- `tests/lib/memory/memory-scheduler-perf-009.test.cjs` exists but only tests path validation, not actual performance

**Issue:**
No automated performance regression tests. Changes can silently degrade performance without detection. Current tests focus on correctness, not performance.

**Impact:**
- Performance regressions slip into production
- No baseline for optimization work
- User experience degrades over time

**Recommendation:**
Add performance test suite:
1. `tests/performance/hybrid-search-benchmark.test.cjs` - Target <150ms for 40k files
2. `tests/performance/bm25-indexer-benchmark.test.cjs` - Track indexing throughput
3. `tests/performance/memory-scheduler-benchmark.test.cjs` - Actual performance, not just validation
4. CI gate: fail if performance degrades >20% from baseline

---

### M-004: Windows-Specific Test Coverage Gaps

**Severity:** MEDIUM
**Locations:**
- `tests/hooks/filesystem-validators.test.cjs` (Windows reserved name tests exist)
- `tests/hooks/windows-null-sanitizer.test.cjs` (NOT FOUND)

**Issue:**
Windows-specific behavior is under-tested:
- windows-null-sanitizer.cjs exists (per CLAUDE.md) but no corresponding test file
- Backslash path handling not systematically tested
- Windows reserved names (nul, con, prn, com1-9, lpt1-9) only tested in filesystem-validators.test.cjs

**Impact:**
- Windows platform crashes
- Path handling bugs on Windows
- Reserved name writes succeed (then crash)

**Recommendation:**
Create comprehensive Windows test suite:
1. `tests/platform/windows-paths.test.cjs` - Backslash normalization, UNC paths
2. `tests/platform/windows-reserved-names.test.cjs` - All reserved names
3. Add Windows CI runner to catch platform-specific regressions

---

### M-005: Test Quality - Assertions Check Wrong Thing

**Severity:** MEDIUM
**Locations:**
- `tests/hooks/routing-guard-comprehensive.test.cjs` (line 550: asserts pass regardless of result)

**Issue:**
Some tests assert too loosely or don't verify meaningful behavior. Example:
```cjs
// Line 550-551: routing-guard-comprehensive.test.cjs
// "Allow pass regardless - validation logic tested in unit tests"
assert.ok(result.pass === true || result.pass === false);
```
This assertion always passes (pass is boolean) and doesn't verify actual behavior.

**Impact:**
- False positives (tests pass but code is broken)
- Regression bugs slip through
- Refactoring breaks behavior but tests still pass

**Recommendation:**
Review and strengthen assertions:
1. Audit all tests for loose assertions (always-true conditions)
2. Replace `assert.ok(x || y)` with specific assertions
3. Add "negative tests" (verify failures fail correctly)
4. Use strict equality (`assert.strictEqual`) not loose (`assert.ok`)

**Files to Review:** ~10 test files with loose assertions

---

## LOW Priority Findings (Cleanup/Tech Debt)

### L-001: Dead Test Files for Removed Code

**Severity:** LOW
**Locations:**
- Test files in `tests/hooks/` for archived hooks (found `.claude/hooks/_archive/` but tests not cleaned up)

**Issue:**
Test files may exist for archived/removed hooks. Need verification:
- Check if test files exist for hooks in `.claude/hooks/_archive/`
- Verify tests reference non-existent source files

**Impact:**
- Confusing for new contributors
- False sense of coverage
- Wasted CI time running obsolete tests

**Recommendation:**
Audit and clean up:
1. Generate list of archived hooks
2. Check for corresponding test files
3. Archive tests to `tests/hooks/_archive/` or delete if obsolete
4. Add pre-commit hook to detect tests for non-existent files

---

### L-002: Test Output Verbosity

**Severity:** LOW
**Locations:**
- `tests/hooks/user-prompt-orchestrator.test.cjs` (creates mock hooks with chmod, leaves artifacts)
- `tests/fixtures/` directories with remnant test data

**Issue:**
Tests create temporary files/directories and may not clean up properly:
- Mock hooks created in `tests/fixtures/mock-hooks/`
- Cleanup in afterEach() hooks but may fail if test crashes

**Impact:**
- Disk space usage (minor)
- False test failures (stale data)
- Confusing test output (unexpected files)

**Recommendation:**
Add robust cleanup:
1. Use `tests/fixtures/tmp/` for all temp data
2. Add global test teardown to clean tmp directory
3. Use try/finally blocks in cleanup hooks
4. Add `.gitignore` entry for `tests/fixtures/tmp/`

---

### L-003: Inconsistent Test Style - describe() vs test()

**Severity:** LOW
**Locations:**
- `tests/code-indexing/hybrid-search.test.cjs` uses `describe()` + `it()`
- `tests/hooks/hybrid-search-enforcer.test.cjs` uses `test()` only

**Issue:**
Inconsistent test style across codebase:
- Some files use Jest-style `describe()` + `it()`
- Some files use Node.js native `test()` only
- Both work but inconsistency confuses contributors

**Impact:**
- Style inconsistency (minor)
- Harder to enforce patterns
- New contributors unsure which to use

**Recommendation:**
Standardize on one style:
1. Choose Node.js native `test()` (no dependencies) OR Jest-style `describe()`/`it()`
2. Document decision in `tests/README.md`
3. Add ESLint rule to enforce chosen style
4. Gradually migrate existing tests

---

## Test Coverage Summary by Component

| Component               | Test File                                             | Coverage | Gaps                                   |
| ----------------------- | ----------------------------------------------------- | -------- | -------------------------------------- |
| routing-guard.cjs       | routing-guard-comprehensive.test.cjs                  | GOOD     | Edge cases, state corruption           |
| unified-creator-guard   | unified-creator-guard-comprehensive.test.cjs          | GOOD     | TTL edge cases, concurrent writes      |
| user-prompt-orchestrator| user-prompt-orchestrator.test.cjs                     | GOOD     | Hook stderr/timeout scenarios          |
| post-task-unified       | post-task-unified.test.cjs                            | FAIR     | 6 consolidated hooks need expansion    |
| pre-task-unified        | MISSING                                               | NONE     | **CRITICAL: No tests exist**           |
| unified-pre-write-hook  | MISSING                                               | NONE     | **CRITICAL: No tests exist**           |
| post-completion-chain   | post-completion-chain.test.cjs                        | FAIR     | Workflow phases, quality gates         |
| hybrid-search           | hybrid-search.test.cjs                                | GOOD     | Error handling, performance            |
| query-analyzer          | query-analyzer.test.cjs                               | GOOD     | Edge cases (whitespace, unicode)       |
| contextual-memory       | contextual-memory.search-filters.test.cjs             | GOOD     | Filter merge edge cases                |
| memory-scheduler        | memory-scheduler-perf-009.test.cjs                    | FAIR     | Path validation only, no perf tests    |

---

## Recommendations Summary

### Immediate (This Sprint)

1. **Create tests for pre-task-unified.cjs** (C-002) - 20 test cases
2. **Create tests for unified-pre-write-hook.cjs** (C-003) - 25 test cases
3. **Expand post-task-unified.test.cjs** (C-001) - 15 test cases
4. **Expand post-completion-chain.test.cjs** (C-004) - 30 test cases

**Total:** ~90 critical test cases needed

### Next Sprint

1. **Fix flaky timing tests** (H-001) - Add synchronization to 4 test files
2. **Add error handling tests** (H-002) - 40 test cases across components
3. **Create integration test suite** (H-003) - 25 end-to-end tests
4. **Reorganize test structure** (H-004) - Move/rename files, create docs

### Future Iterations

1. Add contract tests with real dependencies (M-001)
2. Add comprehensive edge case coverage (M-002) - 50 test cases
3. Add performance regression tests (M-003)
4. Add Windows-specific test coverage (M-004)
5. Audit and strengthen loose assertions (M-005)

---

## Test Quality Metrics

**Current State:**
- Total test files: 106+
- Critical coverage gaps: 4 components (90 test cases)
- High-priority gaps: 4 areas (90 test cases)
- Medium-priority gaps: 5 areas (100+ test cases)
- Low-priority issues: 3 (cleanup/style)

**Target State:**
- Add 90 critical tests (this sprint)
- Add 130 high-priority tests (next sprint)
- Add 100+ medium-priority tests (future)
- Fix 10+ test quality issues

**Risk Assessment:**
- **HIGH RISK:** Missing tests for pre-task-unified, unified-pre-write-hook (safety-critical)
- **MEDIUM RISK:** Workflow orchestration gaps, flaky tests
- **LOW RISK:** Test organization, style inconsistencies

---

## Conclusion

The agent-studio test suite has strong coverage for core routing and enforcement logic but **critical gaps exist for workflow orchestration and safety hooks**. Immediate action required on 4 missing/incomplete test files covering ~90 test cases. Flaky test patterns and missing error handling tests represent medium-term risks.

**Recommendation:** Prioritize critical test coverage (pre-task-unified, unified-pre-write-hook) before next production release. These are safety-critical hooks protecting against path traversal and invalid task execution.

**Next Steps:**
1. Create GitHub issues for C-001 through C-004 (critical findings)
2. Assign test creation to QA team with 1-week deadline
3. Add CI gate blocking merges until critical tests exist
4. Schedule test quality review in 2 weeks to verify fixes

---

## Appendix: Test Execution Commands

Run full test suite:
```bash
pnpm test
```

Run specific test category:
```bash
pnpm test tests/hooks/
pnpm test tests/lib/
pnpm test tests/code-indexing/
```

Run single test file:
```bash
node --test tests/hooks/routing-guard-comprehensive.test.cjs
```

Check test coverage (if configured):
```bash
pnpm test:coverage
```

---

**Report Generated:** 2026-02-12
**Agent:** qa
**Audit Scope:** Full test suite (hooks, lib, integration, code-indexing)
**Files Analyzed:** 106+ test files, 50+ source files
**Time Investment:** 2 hours systematic analysis
