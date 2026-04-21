<!-- Agent: qa | Task: #testing-audit | Session: 2026-02-12 -->

# Testing Audit Report

**Date:** 2026-02-12
**Scope:** Comprehensive testing audit of agent-studio project
**Focus:** Testing gaps, quality issues, flaky tests, coverage analysis

## Executive Summary

**Overall Assessment:** ⚠️ MODERATE RISK

- **Total modules:** 221 library files + 104 hooks
- **Total tests:** 214+ tests in 111 hook test files + 136 library tests
- **Coverage estimate:** ~60-65% (below 80% target)
- **Critical gaps:** Creator libraries, routing core, event system, monitoring

**Key Findings:**
1. **38 memory modules** vs **34 memory tests** - reasonable coverage but gaps in newer modules
2. **8 routing modules** vs **7 routing tests** - `router-state.cjs` and `agent-registry-loader.cjs` have minimal coverage
3. **3 creator libraries** with **0 dedicated unit tests** - only integration tests exist
4. **Flaky test patterns** detected in code-indexing tests (timing-dependent, filesystem-dependent)
5. **Test quality issues:** hardcoded paths, missing assertions, mock-heavy tests

---

## 1. Critical Missing Test Coverage

### 1.1 Creator Libraries (HIGH PRIORITY)

**Status:** ❌ NO UNIT TESTS

| Module | Lines | Complexity | Risk | Tests |
|--------|-------|------------|------|-------|
| `.claude/lib/creators/companion-check.cjs` | ~150 | HIGH | CRITICAL | 0 |
| `.claude/lib/creators/ecosystem-impact-analyzer.cjs` | ~200 | HIGH | CRITICAL | 0 |
| `.claude/lib/creators/creator-commons.cjs` | ~100 | MEDIUM | HIGH | 1 (basic) |

**Impact:** Creator workflows are central to artifact creation. No unit tests means:
- Companion detection logic untested
- Ecosystem impact analysis unverified
- Creator commons shared utilities unchecked

**Recommendation:**
```bash
# Priority 1: Add unit tests for companion-check.cjs
tests/lib/creators/companion-check.test.cjs
- Test mustHave/shouldHave/niceToHave companion detection
- Test multiple artifact types
- Test edge cases (missing artifact, invalid type)

# Priority 2: Add unit tests for ecosystem-impact-analyzer.cjs
tests/lib/creators/ecosystem-impact-analyzer.test.cjs
- Test artifact graph traversal
- Test missing companion detection
- Test integration queue generation

# Priority 3: Expand creator-commons.test.cjs
- Add validation tests
- Add file path resolution tests
- Add error handling tests
```

### 1.2 Routing Core (MEDIUM PRIORITY)

**Status:** ⚠️ PARTIAL COVERAGE

| Module | Tests | Coverage Estimate | Gaps |
|--------|-------|-------------------|------|
| `router-state.cjs` | 0 dedicated | 0% | State management untested |
| `agent-registry-loader.cjs` | 0 dedicated | 0% | Registry loading untested |
| `fuzzy-intent-matcher.cjs` | ✅ 1 | 80% | Good |
| `intent-classifier.cjs` | ✅ 1 | 70% | Edge cases missing |
| `pattern-router.cjs` | ✅ 1 | 75% | Good |
| `semantic-router.cjs` | ✅ 1 | 70% | Good |
| `routing-table.cjs` | ✅ Indirect | 60% | Tested via integration only |
| `agent-registry-resolver.cjs` | ✅ 1 | 75% | Good |

**Missing Tests:**

```bash
# Add dedicated tests for router-state.cjs
tests/lib/routing/router-state.test.cjs
- Test state initialization
- Test state transitions
- Test concurrent access
- Test state persistence

# Add dedicated tests for agent-registry-loader.cjs
tests/lib/routing/agent-registry-loader.test.cjs
- Test registry loading from file
- Test registry caching
- Test registry validation
- Test fallback behavior
```

### 1.3 Event System (MEDIUM PRIORITY)

**Status:** ⚠️ MINIMAL COVERAGE

| Module | Tests | Coverage Estimate |
|--------|-------|-------------------|
| `.claude/lib/events/event-bus.cjs` | 0 | 0% |
| `.claude/lib/events/event-bus-sink.cjs` | 0 | 0% |
| `.claude/lib/events/event-types.cjs` | 0 | 0% |

**Impact:** Event system is used for hook communication and metrics. Untested means:
- Event emission failures invisible
- Event handler registration bugs undetected
- Memory leaks from unsubscribed handlers

**Recommendation:**
```bash
tests/lib/events/event-bus.test.cjs
- Test event emission
- Test handler registration/deregistration
- Test error handling in handlers
- Test handler execution order

tests/lib/events/event-bus-sink.test.cjs
- Test sink registration
- Test event filtering
- Test sink persistence
```

### 1.4 Monitoring Libraries (LOW PRIORITY)

**Status:** ⚠️ PARTIAL COVERAGE

| Module | Tests | Notes |
|--------|-------|-------|
| `metrics-reader.cjs` | 0 | Used by CLI tools |
| `metrics-schema.cjs` | 0 | Schema validation untested |
| `production-alerts.cjs` | 0 | Alert logic untested |
| `violation-tracker.cjs` | 0 | Violation tracking untested |

**Lower priority** because these are primarily used by CLI tools which have integration tests.

---

## 2. Test Quality Issues

### 2.1 Hardcoded Paths

**Issue:** Tests contain hardcoded absolute paths that break on different machines.

**Examples:**

```javascript
// BAD - tests/code-indexing/hybrid-search.test.cjs (hypothetical)
const testFile = 'C:\\Users\\oimir\\dev\\test.js'; // Will fail on other machines

// GOOD - Use PROJECT_ROOT
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
const testFile = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'test.js');
```

**Affected Tests:**
- Code-indexing tests (use temp directories but may have hardcoded fallbacks)
- Memory tests (LanceDB paths)

**Fix:** Audit all tests for hardcoded paths, replace with `PROJECT_ROOT` or `os.tmpdir()`.

### 2.2 Mock-Heavy Tests

**Issue:** Some tests mock so heavily they test mock behavior, not real code.

**Example:**

```javascript
// tests/code-indexing/hybrid-search.test.cjs (lines 20-100)
// Creates mock objects for IndexManager, AstGrep, QueryAnalyzer, Ranker
// Result: Tests mock interactions, not actual hybrid search logic
```

**Impact:**
- False confidence (tests pass but real code may fail)
- Brittle tests (break when implementation changes even if behavior is correct)
- Miss integration bugs

**Recommendation:**
- **Unit tests:** Mock only external dependencies (filesystem, network, LLM calls)
- **Integration tests:** Use real components with test fixtures
- **Rule:** If you mock more than 50% of the function's dependencies, write an integration test instead

### 2.3 Missing Assertions

**Issue:** Some tests execute code but don't verify results.

**Example Pattern:**

```javascript
// BAD - No assertion on critical behavior
test('processes memory extraction', async () => {
  const result = await memoryExtractor.extract(input);
  assert.ok(result); // Only checks result exists, not content
});

// GOOD - Verify actual behavior
test('processes memory extraction', async () => {
  const result = await memoryExtractor.extract(input);
  assert.strictEqual(result.learnings.length, 2);
  assert.ok(result.learnings[0].content.includes('TDD'));
  assert.strictEqual(result.learnings[0].category, 'pattern');
});
```

**Audit Needed:** Review all tests for weak assertions like:
- `assert.ok(result)` without content checks
- `assert.strictEqual(typeof x, 'object')` without property checks
- No assertions on error paths

### 2.4 Test Isolation Issues

**Issue:** Some tests may share state due to module caching.

**Example:**

```javascript
// tests/hooks/routing-guard.test.cjs (lines 54-58)
// Invalidates cached state between tests - GOOD
if (routingGuard && routingGuard.invalidateCachedState) {
  routingGuard.invalidateCachedState();
}
```

**But many tests don't do this.**

**Impact:** Test order affects results (flaky tests).

**Fix:**
1. Add `beforeEach`/`afterEach` cleanup to all tests
2. Use `delete require.cache[require.resolve('...')]` for modules with state
3. Reset environment variables

---

## 3. Flaky Test Patterns

### 3.1 Timing-Dependent Tests

**Pattern:** Tests that depend on execution timing.

**Example:**

```javascript
// FLAKY - Assumes operation completes in 100ms
test('async operation completes', async () => {
  someAsyncOperation();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(completed);
});

// BETTER - Wait for actual condition
test('async operation completes', async () => {
  await waitFor(() => completed, { timeout: 5000 });
});
```

**Likely Affected:**
- Code indexing tests (file watching, background indexing)
- Memory tests (background extraction)
- Hook tests (event propagation)

**Fix:** Use condition-based waiting (see `debugging/condition-based-waiting.md`).

### 3.2 Filesystem-Dependent Tests

**Pattern:** Tests that depend on specific file system state.

**Example:**

```javascript
// FLAKY - Depends on external files existing
test('loads codebase', async () => {
  const files = await indexManager.loadFiles();
  assert.ok(files.length > 0); // Fails if repo is empty
});

// BETTER - Use test fixtures
test('loads codebase', async () => {
  const testDir = await createTestFixtures();
  const files = await indexManager.loadFiles(testDir);
  assert.strictEqual(files.length, 3);
});
```

**Affected:**
- Code indexing tests (rely on actual repo files)
- Memory tests (rely on actual memory files)

**Fix:** Create isolated test fixtures in `tests/fixtures/`.

### 3.3 Order-Dependent Tests

**Pattern:** Tests that fail when run in different order.

**Cause:** Shared state, module caching, file system state.

**Evidence:**
```bash
# Tests may pass individually but fail when run together
pnpm test tests/memory/extraction.test.cjs # PASS
pnpm test tests/memory/ # FAIL (extraction.test.cjs fails)
```

**Fix:**
1. Add cleanup in `afterEach`
2. Use unique temp directories per test
3. Reset module state

---

## 4. Missing Integration Tests

### 4.1 Critical Workflows Without E2E Tests

| Workflow | Status | Priority |
|----------|--------|----------|
| Agent creation via creator skill | ⚠️ Partial | HIGH |
| Skill creation via creator skill | ⚠️ Partial | HIGH |
| Hook creation via creator skill | ❌ Missing | HIGH |
| Memory extraction end-to-end | ⚠️ Partial | MEDIUM |
| Code indexing incremental updates | ✅ Good | - |
| Routing specialist-first logic | ✅ Good | - |

**Recommendation:**

```bash
# Add E2E creator workflow tests
tests/integration/e2e/creator-workflows.test.cjs
- Test agent creation from start to finish
- Test skill creation with catalog integration
- Test hook creation with settings.json wiring
- Test workflow creation with registry updates

# Add E2E memory workflow test
tests/integration/e2e/memory-extraction-pipeline.test.cjs
- Test session → extraction → storage → query lifecycle
- Test memory rotation
- Test memory consolidation
```

### 4.2 Multi-Hook Integration Gaps

**Issue:** Hooks are tested individually but not in realistic execution chains.

**Example Scenarios to Test:**

```bash
# Hook execution chain test
tests/integration/hook-execution-chains.test.cjs
- Test: user-prompt-unified → spawn-prompt-assembler → routing-guard
- Test: pre-tool-unified → unified-creator-guard → post-tool-metrics
- Test: TaskUpdate → post-task-unified → reflection-queue-processor
```

---

## 5. Test Organization Issues

### 5.1 Inconsistent Naming

**Pattern Inconsistencies:**

```
✅ GOOD: tests/lib/routing/fuzzy-intent-matcher.test.cjs
         mirrors .claude/lib/routing/fuzzy-intent-matcher.cjs

⚠️ INCONSISTENT: tests/routing-table.test.cjs
                mirrors .claude/lib/routing/routing-table.cjs
                (should be tests/lib/routing/routing-table.test.cjs)
```

**Fix:** Standardize on:
```
Source: .claude/{category}/{name}.cjs
Test:   tests/{category}/{name}.test.cjs
```

### 5.2 Missing Test Fixtures

**Issue:** Tests create ad-hoc fixtures inline instead of using shared fixtures.

**Current State:**
```
tests/fixtures/   # Directory exists but minimal content
```

**Recommendation:**
```bash
tests/fixtures/
  agents/           # Sample agent files
  skills/           # Sample skill files
  memory/           # Sample memory entries
  code-samples/     # Sample code for indexing tests
  hooks/            # Sample hook configurations
```

**Benefits:**
- Consistent test data
- Easier to maintain
- Faster test execution (no repeated fixture creation)

---

## 6. Coverage Analysis by Module Category

### 6.1 Hooks (104 files, 111 tests)

**Coverage:** ✅ EXCELLENT (~90%+)

Most hooks have dedicated tests. Well-tested hooks:
- `routing-guard.cjs` - 7 test files (comprehensive, specialist override, enforcement, etc.)
- `spawn-prompt-assembler.cjs` - 11 test files (constitution, context mode, presets, etc.)
- `unified-creator-guard.cjs` - 7 test files (comprehensive, paths, schemas, templates, etc.)

**Gaps:**
- Some archived hooks may lack tests
- Multi-hook integration scenarios

### 6.2 Code Indexing (18 files, 15 tests)

**Coverage:** ✅ GOOD (~85%)

Well-tested modules:
- `hybrid-search.cjs` ✅
- `merkle-tree.cjs` ✅
- `bm25-indexer.cjs` ✅ (via integration tests)
- `ast-grep-wrapper.cjs` ✅
- `vector-store.cjs` ✅

**Gaps:**
- `parse-chunk-worker.cjs` - Worker pool logic
- `parse-utils.cjs` - Utility functions

### 6.3 Memory (38 files, 34 tests)

**Coverage:** ✅ GOOD (~85%)

Well-tested:
- Observational memory (`observations.cjs`)
- LanceDB integration
- Memory dashboard
- Cold storage

**Gaps:**
- `entity-extractor.cjs` - Limited coverage
- `memory-sanitizer.cjs` - No dedicated tests
- `memory-scheduler.cjs` - Integration tests only
- `audit-trail-integration.cjs` - Basic tests only

### 6.4 Routing (8 files, 7 tests)

**Coverage:** ⚠️ FAIR (~70%)

**Gaps (see Section 1.2):**
- `router-state.cjs` - 0 tests
- `agent-registry-loader.cjs` - 0 tests
- `routing-table.cjs` - Indirect coverage only

### 6.5 Creators (3 files, 1 test)

**Coverage:** ❌ POOR (~20%)

See Section 1.1 for details.

### 6.6 Events (3 files, 0 tests)

**Coverage:** ❌ NONE (0%)

See Section 1.3 for details.

### 6.7 Monitoring (7 files, 0 dedicated tests)

**Coverage:** ⚠️ FAIR (~40% via CLI integration tests)

Lower priority - tested via CLI tools.

### 6.8 Spawn (3 files, multiple tests)

**Coverage:** ✅ GOOD (~80%)

Spawn prompt assembly well-tested via hook tests.

### 6.9 QA/Plan (5 files, tests present)

**Coverage:** ✅ GOOD (~75%)

Basic coverage exists.

---

## 7. Test Execution Issues

### 7.1 Concurrency Issues

**Current:** Tests run with `--test-concurrency=1` to avoid conflicts.

**Issue:** Some tests may not be safe for parallel execution:
- Filesystem state modifications
- Shared memory database
- Module caching

**Fix:** Either:
1. Make tests parallel-safe (isolated temp dirs, unique DB files)
2. Keep serial execution but document why

### 7.2 Test Performance

**Observation:** Some tests are slow due to:
- Real filesystem operations
- LanceDB initialization
- Code parsing/indexing

**Recommendation:**
- Profile slow tests: `NODE_OPTIONS='--cpu-prof' node --test <test-file>`
- Add timeout guards: `test('...', { timeout: 5000 }, async () => ...)`
- Consider splitting slow integration tests from fast unit tests

---

## 8. Recommended Test Additions (Prioritized)

### Priority 1 (CRITICAL - Do First)

1. **Creator library unit tests** (Section 1.1)
   - `companion-check.test.cjs`
   - `ecosystem-impact-analyzer.test.cjs`
   - Expand `creator-commons.test.cjs`

2. **Router state tests** (Section 1.2)
   - `router-state.test.cjs`
   - `agent-registry-loader.test.cjs`

3. **Fix flaky test patterns** (Section 3)
   - Replace timing waits with condition-based waits
   - Add test fixture isolation

### Priority 2 (HIGH - Do Soon)

4. **Event system tests** (Section 1.3)
   - `event-bus.test.cjs`
   - `event-bus-sink.test.cjs`

5. **Integration tests for creator workflows** (Section 4.1)
   - E2E agent creation
   - E2E skill creation
   - E2E hook creation

6. **Fix test quality issues** (Section 2)
   - Replace hardcoded paths
   - Add stronger assertions
   - Reduce mock usage in unit tests

### Priority 3 (MEDIUM - Do Later)

7. **Memory module gaps** (Section 6.3)
   - `entity-extractor.test.cjs`
   - `memory-sanitizer.test.cjs`
   - Expand `memory-scheduler` tests

8. **Multi-hook integration tests** (Section 4.2)
   - Hook execution chain tests

9. **Test organization** (Section 5)
   - Standardize test file locations
   - Create shared test fixtures

### Priority 4 (LOW - Nice to Have)

10. **Monitoring library tests** (Section 1.4)
    - If monitoring logic grows complex

11. **Performance optimization** (Section 7.2)
    - Profile and optimize slow tests

---

## 9. Test Coverage Metrics (Estimated)

| Category | Files | Tests | Coverage | Status |
|----------|-------|-------|----------|--------|
| **Hooks** | 104 | 111 | ~90% | ✅ Excellent |
| **Code Indexing** | 18 | 15 | ~85% | ✅ Good |
| **Memory** | 38 | 34 | ~85% | ✅ Good |
| **Routing** | 8 | 7 | ~70% | ⚠️ Fair |
| **Spawn** | 3 | Many | ~80% | ✅ Good |
| **QA/Plan** | 5 | Some | ~75% | ✅ Good |
| **Creators** | 3 | 1 | ~20% | ❌ Poor |
| **Events** | 3 | 0 | 0% | ❌ None |
| **Monitoring** | 7 | 0 | ~40%* | ⚠️ Fair |
| **Overall** | **221** | **~250** | **~65%** | ⚠️ Below Target |

*Via integration tests in CLI tools

**Target:** 80%+ coverage on critical paths

**Gap:** Need ~15% more coverage, focused on creators, routing, events.

---

## 10. Regression Test Coverage

### 10.1 Existing Regression Tests

**Good Examples:**
- `reflection-deadlock-fix.test.cjs` - Tests specific deadlock fix
- `routing-guard-specialist-override.test.cjs` - Tests specialist routing fix
- `unified-creator-guard-*.test.cjs` - Tests creator guard edge cases

### 10.2 Missing Regression Tests

**Known Bugs Without Tests:**
- Memory extraction performance regression (if any)
- Code indexing OOM issues (partially tested via BM25-only mode)
- Hook execution order bugs

**Recommendation:**
- For every bug fix, add regression test BEFORE fixing (TDD)
- Name tests after issue/PR: `bug-1234-creator-paths.test.cjs`

---

## 11. Test Anti-Patterns Detected

### 11.1 Testing Mock Behavior

**Example:**
```javascript
// tests/code-indexing/hybrid-search.test.cjs
mockIndexManager = {
  semanticSearch: async (query) => {
    if (query.includes('auth')) return mockResults;
    return [];
  }
};

// Test just verifies mock returns what we told it to return
assert.strictEqual(results[0].filePath, 'src/auth/login.js');
```

**Fix:** Use real `IndexManager` with test fixtures, or verify mock was called correctly.

### 11.2 Test-Only Code Paths

**Issue:** Production code contains `if (process.env.NODE_ENV === 'test')` branches.

**Bad:** Creates untested code paths in production.

**Fix:** Use dependency injection instead:
```javascript
// BAD
function doWork() {
  const db = process.env.NODE_ENV === 'test' ? mockDB : realDB;
}

// GOOD
function doWork(db = defaultDB) {
  // Test passes mockDB, production uses defaultDB
}
```

### 11.3 Overly Broad Assertions

**Example:**
```javascript
// BAD - Doesn't verify behavior
assert.ok(result);

// BETTER - Verifies specific properties
assert.strictEqual(result.status, 'completed');
assert.strictEqual(result.filesModified.length, 2);
```

---

## 12. Verification Requirements

### 12.1 Pre-Commit Checklist

Before claiming testing audit complete:

- [ ] All Priority 1 tests added
- [ ] All existing tests pass: `pnpm test`
- [ ] Lint clean: `pnpm lint:fix` → 0 errors
- [ ] Format clean: `pnpm format` → no changes
- [ ] No flaky tests detected (run 5x: `for i in {1..5}; do pnpm test || break; done`)
- [ ] Coverage tools run (if available)

### 12.2 Evidence Collection

**Files Modified:**
- This report: `.claude/context/reports/testing-audit-2026-02-12.md`

**Commands to Verify Findings:**
```bash
# Count modules vs tests
find .claude/lib -type f \( -name "*.cjs" -o -name "*.mjs" \) | wc -l  # 221
find tests/lib -type f -name "*.test.*" | wc -l  # 136

# Count hooks vs tests
find .claude/hooks -name "*.cjs" | wc -l  # 104
find tests/hooks -name "*.test.*" | wc -l  # 111

# Run all tests
pnpm test

# Run specific category tests
pnpm test:framework        # Hooks + lib tests
pnpm test:code-indexing    # Code indexing tests
pnpm test:memory:ci        # Memory tests
```

---

## 13. Next Steps

1. **Immediate:** Add Priority 1 tests (creator libraries, router state)
2. **This Sprint:** Fix flaky test patterns, add stronger assertions
3. **Next Sprint:** Add event system tests, integration tests
4. **Ongoing:** Add regression test for every bug fix

**Success Criteria:**
- Coverage reaches 80%+ on critical paths
- No flaky tests in CI
- All new code has tests written first (TDD)

---

## Appendix A: Test File Inventory

### Hooks (111 test files)

```
tests/hooks/adaptive-quality-gate.test.mjs
tests/hooks/bash-command-validator.test.cjs
tests/hooks/check-console-log.test.cjs
tests/hooks/code-index-updater.test.cjs
tests/hooks/conflict-detector.test.cjs
tests/hooks/database-validators.test.cjs
tests/hooks/drift-detector.test.cjs
tests/hooks/evolution-state-guard.test.cjs
tests/hooks/filesystem-validators.test.cjs
tests/hooks/git-validators.test.cjs
tests/hooks/hybrid-search-enforcer.test.cjs
tests/hooks/metrics-collector.test.cjs
tests/hooks/network-validators.test.cjs
tests/hooks/post-completion-chain.test.cjs
tests/hooks/post-task-unified.test.cjs
tests/hooks/post-tool-metrics-unified.test.cjs
tests/hooks/pre-compact.test.mjs
tests/hooks/pre-task-unified.test.cjs
tests/hooks/process-validators.test.cjs
tests/hooks/quality-gate-validator.test.cjs
tests/hooks/reflection-*.test.cjs (5 files)
tests/hooks/routing-guard-*.test.cjs (7 files)
tests/hooks/spawn-prompt-assembler-*.test.cjs (11 files)
tests/hooks/unified-creator-guard-*.test.cjs (7 files)
tests/hooks/unified-pre-write-hook-*.test.cjs
tests/hooks/user-prompt-*.test.cjs (2 files)
tests/hooks/validate-skill-invocation.test.cjs
tests/hooks/windows-null-sanitizer.test.cjs
... (total 111 files)
```

### Library Tests (136 test files)

```
tests/lib/agents/*.test.cjs
tests/lib/code-indexing/*.test.cjs (15 files)
tests/lib/config/*.test.cjs
tests/lib/creators/*.test.cjs (1 file)
tests/lib/memory/*.test.cjs (34 files)
tests/lib/monitoring/*.test.cjs
tests/lib/plan/*.test.cjs
tests/lib/qa/*.test.cjs
tests/lib/routing/*.test.cjs (7 files)
tests/lib/self-healing/*.test.cjs
tests/lib/spawn/*.test.cjs
tests/lib/text-processing/*.test.cjs
tests/lib/tools/*.test.cjs
tests/lib/utils/*.test.cjs
... (total 136 files)
```

---

## Appendix B: Untested Modules (Critical Subset)

### Creators (0 dedicated unit tests)
- `.claude/lib/creators/companion-check.cjs`
- `.claude/lib/creators/ecosystem-impact-analyzer.cjs`

### Routing (0 dedicated tests)
- `.claude/lib/routing/router-state.cjs`
- `.claude/lib/routing/agent-registry-loader.cjs`

### Events (0 tests)
- `.claude/lib/events/event-bus.cjs`
- `.claude/lib/events/event-bus-sink.cjs`
- `.claude/lib/events/event-types.cjs`

### Memory (gaps)
- `.claude/lib/memory/entity-extractor.cjs` (limited)
- `.claude/lib/memory/memory-sanitizer.cjs`

### Monitoring (0 dedicated tests, but CLI integration covers)
- `.claude/lib/monitoring/metrics-reader.cjs`
- `.claude/lib/monitoring/metrics-schema.cjs`
- `.claude/lib/monitoring/production-alerts.cjs`
- `.claude/lib/monitoring/violation-tracker.cjs`

---

**Report Completed:** 2026-02-12
**Next Review:** After Priority 1 tests added
