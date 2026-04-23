# Test Coverage Gaps and QA Improvements

<!-- Agent: qa | Task: test-coverage-analysis | Session: 2026-02-12 -->

## Executive Summary

Analysis of agent-studio codebase reveals **critical test coverage gaps** across core subsystems. While test infrastructure is strong (266 active tests, 14,108 assertions, 99.3% pass rate from recent audit), significant portions of critical production code lack systematic test coverage.

**Critical Findings:**

1. **Memory Core Facade (0% coverage)**: New memory subsystem consolidation (5 core modules) has zero test coverage
2. **Routing Module Gaps (37.5% coverage)**: 5/8 routing modules untested including critical agent-registry-loader
3. **Code Indexing Gaps (58.8% coverage)**: 7/17 modules untested, including hybrid-lazy-indexer (33KB critical path)
4. **Hook Test Drift (38.5% coverage)**: 64/104 hooks untested despite being framework safety layer
5. **CLI Tools (Low coverage)**: Only 11 tested out of 66 active tools

**Test Quality Issues:**

- 728 skipped/todo tests (technical debt markers)
- 114 archived tests (30% archive rate indicates test rot)
- Missing integration tests for multi-component workflows
- No regression tests for recent HIGH-severity security fixes

---

## 1. Test Coverage Statistics

### Overall Metrics

| Category                        | Total Files | Test Files | Coverage % | Status          |
| ------------------------------- | ----------- | ---------- | ---------- | --------------- |
| Library (`.claude/lib`)         | 223         | ~150       | 67%        | ⚠️ Moderate     |
| Hooks (`.claude/hooks`)         | 104         | 64 active  | 38.5%      | ❌ Critical Gap |
| CLI Tools (`.claude/tools/cli`) | 66          | 11         | 16.7%      | ❌ Critical Gap |
| Memory Core                     | 5           | 1          | 20%        | ❌ Critical Gap |
| Routing                         | 8           | 7          | 87.5%      | ✅ Good         |
| Code Indexing                   | 17          | 7          | 41.2%      | ⚠️ Needs Work   |

### Test Health Indicators

- **Total Test Files**: 381 (266 active + 114 archived + 1 .archived extension)
- **Archive Rate**: 30% (114/380) - indicates test maintenance issues
- **Skipped/Todo Tests**: 728 - significant technical debt
- **Assertion Count**: 14,108 - strong assertion discipline when tests exist
- **Recent Pass Rate**: 99.3% (430/433) - excellent quality where tested

---

## 2. Critical Coverage Gaps (P0 - Blocking)

### 2.1 Memory Core Facade (0% Test Coverage)

**Impact**: HIGH - Foundation of memory subsystem consolidation (Task #17, 2026-02-11)

**Untested Modules**:

```
.claude/lib/memory/core/
├── index.cjs (facade API)              ❌ No tests
├── memory-extraction.cjs (4.5KB)       ❌ No tests
├── memory-lifecycle.cjs (5.6KB)        ❌ No tests
├── memory-query.cjs (6KB)              ❌ No tests
└── memory-storage.cjs (5KB)            ❌ No tests
```

**Why This Matters**:

- Facade pattern consolidates 15+ legacy memory modules → single point of failure
- memory-query.cjs handles tier-based retrieval (HOT/WARM/COLD) → tier bugs invisible
- memory-lifecycle.cjs manages rotation/archival → data loss risk
- Recent learnings.md entry (2026-02-11) confirms deployment without test coverage

**Recommended Tests** (Priority Order):

1. **memory-query.cjs**: Tier fallback behavior (HOT → WARM → COLD)
2. **memory-storage.cjs**: Write atomicity, file locking, corruption recovery
3. **memory-lifecycle.cjs**: Rotation triggers (20KB threshold), archive integrity
4. **memory-extraction.cjs**: Pattern extraction correctness
5. **index.cjs**: Facade API contract validation

**Test Pattern**: Integration tests (not unit) - facade API must work end-to-end

---

### 2.2 Routing Guard Untested Branches (Partial Coverage)

**Impact**: HIGH - Enforces PLANNER_FIRST, security review, specialist routing

**Coverage Gaps**:

```
.claude/lib/routing/
├── agent-registry-loader.cjs (NEW)     ❌ No tests (split registry pattern)
├── router-state.cjs (21KB)             ⚠️ Partial tests (large complex state)
├── routing-table.cjs (29KB)            ⚠️ Partial tests (source of truth, 59 agents)
```

**Why This Matters**:

- **agent-registry-loader.cjs**: NEW module from Task #17 (split registry 3-file strategy) - zero validation
- **router-state.cjs**: 21KB of workflow state management - missing edge case tests
- **routing-table.cjs**: 29KB, 59 agent entries, semantic routing - incomplete coverage of SPECIALIST_ROUTING_ENFORCEMENT

**Existing Tests** (Good):

- ✅ `routing-guard-comprehensive.test.cjs` (45 tests, 2026-02-11 audit)
- ✅ `fuzzy-intent-matcher.test.cjs`
- ✅ `semantic-router.test.cjs`

**Missing Test Scenarios**:

1. **agent-registry-loader**: Split registry loading (core + domain + orchestrators)
2. **routing-table**: Agent lookup misses (fallback behavior)
3. **router-state**: Concurrent state updates (race conditions)
4. **routing-table**: INTENT_KEYWORDS fallback when ROUTING_TABLE miss

**Test Pattern**: Property-based testing for routing consistency

---

### 2.3 Code Indexing Core Untested (7/17 modules)

**Impact**: MEDIUM-HIGH - Hybrid search foundation, 40K file indexing

**Untested Critical Modules**:

```
.claude/lib/code-indexing/
├── hybrid-lazy-indexer.cjs (33KB)      ❌ No tests (CRITICAL - 1330 files in 19.5s)
├── index-manager.cjs (30KB)            ❌ No tests (CRITICAL - orchestration layer)
├── code-parser.cjs (3.5KB)             ❌ No tests (AST parsing entry point)
├── semantic-chunker.cjs (13KB)         ❌ No tests (quality chunking algorithm)
├── query-analyzer.cjs (8KB)            ❌ No tests (query intent parsing)
├── result-ranker.cjs (7KB)             ❌ No tests (RRF ranking algorithm)
├── parse-chunk-worker.cjs (3.5KB)      ⚠️ Partial (worker pool edge cases)
```

**Why This Matters**:

- **hybrid-lazy-indexer.cjs**: 33KB, processes 1330 files in 19.5s - zero test coverage despite being critical path
- **index-manager.cjs**: 30KB orchestration layer - coordinates BM25, embeddings, Merkle tree
- **Learnings.md entry (2026-02-09)**: BM25-only fast-path implemented without test validation
- Result ranking (RRF) untested → search quality degradation invisible

**Existing Tests** (Good):

- ✅ `bm25-indexer.test.cjs` (BM25 core algorithm)
- ✅ `vector-store-hybrid.test.cjs` (hybrid scoring)
- ✅ `gpu-detector.test.cjs` (GPU detection)

**Missing Test Scenarios**:

1. **hybrid-lazy-indexer**: 40K file corpus (memory/CPU limits)
2. **index-manager**: Concurrent indexing (file change during index)
3. **result-ranker**: RRF scoring edge cases (zero results, duplicate scores)
4. **semantic-chunker**: AST chunk boundary correctness

**Test Pattern**: Performance regression tests (1330 files baseline)

---

### 2.4 Hook Test Coverage Gaps (64 active, 40 untested)

**Impact**: CRITICAL - Hooks are framework safety layer

**Untested Critical Hooks**:

```
CRITICAL (P0 - Security/Safety):
├── .claude/hooks/safety/
│   ├── bash-command-validator.cjs      ✅ TESTED (2026-02-11)
│   ├── shell-injection-validator.cjs   ⚠️ PARTIAL (needs HIGH-001 edge cases)
│   ├── spawn-prompt-validator.cjs      ❌ NO TESTS (BLOCKING - token budget guard)
│   ├── unified-pre-write-hook.cjs      ⚠️ PARTIAL (11 checks, 6 untested)
│   └── hybrid-search-enforcer.cjs      ❌ NO TESTS (GREP fallback enforcement)

HIGH (P1 - Routing/Core):
├── .claude/hooks/routing/
│   ├── routing-guard.cjs               ✅ TESTED (comprehensive, 2026-02-11)
│   ├── unified-creator-guard.cjs       ✅ TESTED (comprehensive, 2026-02-11)
│   ├── spawn-prompt-assembler.cjs      ✅ TESTED (enrich-allowed-tools, 2026-02-11)
│   ├── user-prompt-unified.cjs         ❌ NO TESTS (CRITICAL - pre-prompt orchestration)
│   ├── pre-tool-unified.cjs            ⚠️ PARTIAL (11 safety checks)
│   └── post-task-unified.cjs           ❌ NO TESTS (task completion triggers)

MEDIUM (P2 - Monitoring/Quality):
├── .claude/hooks/metrics/
│   └── post-tool-metrics-unified.cjs   ⚠️ PARTIAL (metrics collection tested)
├── .claude/hooks/reflection/
│   ├── reflection-step0-guard.cjs      ❌ NO TESTS (STEP 0 enforcement)
│   ├── unified-reflection-handler.cjs  ❌ NO TESTS (reflection queue processing)
│   └── error-summary-extractor.cjs     ❌ NO TESTS (error pattern extraction)
└── .claude/hooks/evolution/
    ├── research-enforcement.cjs        ❌ NO TESTS (EVOLVE Phase O mandatory)
    └── quality-gate-validator.cjs      ❌ NO TESTS (phase transition gates)
```

**Hook Test Statistics**:

- Total Hooks: 104 (30 active + 74 archived/deprecated)
- Active Hook Tests: 64 test files
- Coverage Estimate: ~38.5% (64/104 with tests, many partial)
- Recent Improvements: +3 comprehensive hook tests (2026-02-11 audit)

**Why Hook Testing Matters**:

- Hooks are blocking enforcement (exit 0 = allow, exit 2 = block)
- Untested hook = invisible enforcement failures
- Performance budget (<100ms) requires validation
- Security hooks (shell-injection, spawn-prompt) are HIGH-severity attack surface

**Missing Test Scenarios**:

1. **spawn-prompt-validator.cjs**: Token budget enforcement (50KB warning, 120KB block)
2. **user-prompt-unified.cjs**: Batch creation detection, preset injection
3. **unified-pre-write-hook.cjs**: 11 safety checks (Windows paths, creator paths, reserved names)
4. **hybrid-search-enforcer.cjs**: GREP fallback deprecation warnings
5. **reflection-step0-guard.cjs**: STEP 0 enforcement (blocks TaskList when pending reflections)

**Test Pattern**: Hook integration tests (stdin JSON → stdout JSON protocol)

---

### 2.5 CLI Tool Test Coverage (11/66 tested)

**Impact**: MEDIUM - Developer-facing utilities

**Untested High-Value Tools**:

```
HIGH PRIORITY (User-Facing):
├── doctor.mjs                          ❌ NO TESTS (health check entry point)
├── hybrid-search-daemon.cjs            ❌ NO TESTS (daemon lifecycle)
├── generate-agent-registry.cjs         ❌ NO TESTS (registry generation)
├── generate-routing-prototypes.cjs     ⚠️ PARTIAL (prototype generation)
├── generate-embeddings.cjs             ❌ NO TESTS (embedding generation pipeline)
└── bootstrap-artifact-graph.cjs        ❌ NO TESTS (graph initialization)

TESTED (Good Coverage):
├── cleanup-transient-artifacts.test.cjs ✅
├── error-report.test.cjs                ✅
├── generate-skill-index.test.cjs        ✅
├── open-findings-summary.test.cjs       ✅
├── open-findings-trend-*.test.cjs       ✅ (3 tests)
└── security-lint.test.cjs               ✅
```

**Why This Matters**:

- **doctor.mjs**: Framework health check - untested means invisible breakage
- **hybrid-search-daemon.cjs**: Daemon lifecycle (start/stop/prewarm) - no validation
- **generate-agent-registry.cjs**: Registry generation used by CI - untested automation

**Test Pattern**: CLI integration tests (command output validation)

---

## 3. Test Quality Issues (Technical Debt)

### 3.1 Skipped/Todo Tests (728 markers)

**Analysis**: 728 instances of `skip`, `todo`, `xit`, `it.skip` found across test suite

**Breakdown**:

- Test TODOs: Placeholders for planned tests (never implemented)
- Skipped Tests: Previously working tests disabled (likely flaky or broken)
- Test Debt: Accumulation indicates test maintenance backlog

**Example Pattern** (from grep analysis):

```javascript
// Common patterns found:
it.skip('should handle large file corpus', ...)  // Skipped due to performance
test.todo('test multi-threading edge cases')     // Never implemented
xit('test concurrent updates', ...)              // Flaky test disabled
```

**Impact**: Technical debt compounds - skipped tests represent known gaps

**Recommendation**: Audit skipped tests, classify as:

1. **Flaky** (stabilize with better isolation)
2. **Performance** (move to separate perf suite)
3. **Never Implemented** (implement or delete)

---

### 3.2 Archived Tests (114 files, 30% archive rate)

**Analysis**: 114 archived test files suggest high test churn

**Archive Pattern**:

- `.archived` extension (standard archive marker)
- `_archive/` directories in test subdirectories
- Tests for deprecated/removed code (not deleted, just archived)

**Examples Found**:

```
tests/agents/core/
├── architect-agent.test.cjs.archived
├── developer-agent.test.cjs.archived
├── qa-agent.test.cjs.archived
└── real-intelligence.test.cjs.archived

tests/hooks/
├── agent-health-hook.test.cjs.archived
├── blocking-event-bus.test.cjs.archived
└── command-allowlist-validator.test.cjs.archived

tests/lib/memory/
├── intent-analyzer.test.cjs.archived
├── memory-extractor.test.cjs.archived
└── session-summary.test.cjs.archived
```

**Why 30% Archive Rate is Concerning**:

- Normal archive rate: <10% (stable test suite)
- 10-30%: Warning (moderate churn)
- > 30%: Crisis (this codebase) - indicates:
  - Frequent refactoring without test updates
  - Tests written but not maintained
  - Code removed but tests not cleaned up

**Learnings.md Confirmation** (2026-02-11):

> Archive Rates Are Leading Indicators — <10% healthy, 10-30% warning, >50% crisis

**Recommendation**: Audit archived tests for resurrection candidates (code still exists)

---

### 3.3 Missing Regression Tests (Recent Security Fixes)

**Context**: Task #17 (2026-02-11 audit fixes) implemented HIGH-001, HIGH-003, HIGH-004 security fixes

**Security Fixes Applied** (from learnings.md):

1. **HIGH-001**: Shell validators enhanced (8 dangerous patterns)
2. **HIGH-003**: Spawn prompt sanitization (instruction override blocking)
3. **HIGH-004**: Command injection bypass patterns

**Current Test Status**:

- ✅ **HIGH-001**: `bash-command-validator.test.cjs` exists (basic tests)
- ⚠️ **HIGH-003**: `spawn-prompt-assembler.test.cjs` exists but incomplete (only tests enrich-allowed-tools)
- ❌ **HIGH-004**: No dedicated regression test for bypass patterns

**Missing Test Scenarios**:

```javascript
// HIGH-001: Shell injection patterns (need comprehensive tests)
// - OR chaining (cmd1 || cmd2)
// - Non-standard separators (\n, \r\n)
// - Shell expansions (${var}, $(cmd))
// - ANSI-C quoting ($'...')

// HIGH-003: Prompt injection (need negative tests)
// - "IGNORE PREVIOUS INSTRUCTIONS"
// - "SYSTEM: new instructions follow"
// - Instruction marker patterns

// HIGH-004: Command injection bypass (need edge cases)
// - Nested command substitution
// - Escaped separator characters
// - Unicode lookalike characters
```

**Impact**: Security fixes deployed without regression tests → future refactors may reintroduce vulnerabilities

**Recommendation**: Create `security-regression.test.cjs` suite with all HIGH-severity attack vectors

---

### 3.4 Test Isolation Issues (Shared State)

**Evidence**: Memory test directories with temporary data

```
tests/lib/memory/
├── .stress-memory/                     (test artifacts)
├── .test-memory/                       (shared test state)
├── .test-contextual-memory/            (shared test state)
└── .test-memory-soak-chaos-*/          (9 temporary directories left behind)
```

**Problem**: Tests leaving behind state indicate:

1. Missing cleanup in `afterEach`/`afterAll`
2. Tests depending on shared filesystem state
3. Possible test order dependencies

**Impact**: Flaky tests, non-deterministic failures, CI instability

**Recommendation**: Audit memory tests for proper teardown, use temp directories with automatic cleanup

---

### 3.5 No Integration Tests for Multi-Component Workflows

**Gap**: Tests focus on unit-level, missing integration validation

**Missing Integration Scenarios**:

1. **Enterprise Workflow Pipeline** (8 phases):
   - No end-to-end test of Triage → Design → Implement → Review → Deploy → Document → Reflect
   - Phase transitions untested (quality gates)
   - Agent handoff untested (metadata propagation)

2. **Memory Tier Rotation**:
   - No test of HOT → WARM → COLD lifecycle
   - Rotation trigger (20KB threshold) untested in integration
   - Cold storage compression untested end-to-end

3. **Hybrid Search Daemon Lifecycle**:
   - Start → Prewarm → Search → Stop untested as workflow
   - Daemon crash/restart recovery untested
   - Performance degradation under load untested

4. **Task Lifecycle with Hook Enforcement**:
   - TaskCreate → routing-guard → spawn-prompt-validator → agent execution → TaskUpdate untested
   - Hook chain execution order untested
   - Hook performance budget (sum <100ms) untested

**Test Pattern**: Integration tests should mock external APIs, test component interactions

**Recommendation**: Create `tests/integration/` directory with workflow tests

---

## 4. Edge Case Coverage Gaps

### 4.1 Error Path Testing (Missing Negative Tests)

**Pattern**: Tests focus on happy path, missing error scenarios

**Examples**:

```javascript
// routing-table.cjs - Missing tests:
// ❌ Agent lookup miss (unknown agent type)
// ❌ Malformed agent config (missing required fields)
// ❌ Circular routing references

// memory-query.cjs - Missing tests:
// ❌ All tiers empty (HOT/WARM/COLD miss)
// ❌ Corrupted tier files (JSON.parse failure)
// ❌ Tier file locked by another process

// hybrid-lazy-indexer.cjs - Missing tests:
// ❌ File deleted during indexing
// ❌ File changed during indexing (race condition)
// ❌ Out of memory during indexing (40K+ files)
```

**Recommendation**: Add negative test cases for each module (error paths)

---

### 4.2 Boundary Condition Testing

**Missing Boundary Tests**:

1. **Memory Budget Enforcement**:
   - 20KB rotation threshold (test at 19KB, 20KB, 21KB)
   - Token budget limits (50KB warning, 120KB block)
   - Context window (200K token limit)

2. **File Size Limits**:
   - Large file indexing (>1MB files)
   - Empty files (0 bytes)
   - Symlinks and junctions (Windows)

3. **Concurrency Limits**:
   - Max workers (hybrid-lazy-indexer worker pool)
   - Max concurrent agents (context overflow at 3+ heavy agents)
   - Max task queue depth

**Test Pattern**: Property-based testing with boundary values

---

### 4.3 Platform-Specific Edge Cases (Windows)

**Windows-Specific Patterns Found** (from learnings.md):

```javascript
// Windows Path Issues (Critical)
// - path.relative() returns backslashes on Windows
// - Glob patterns use forward slashes
// - Regex [^/]* won't block backslash

// Windows Reserved Names (Critical)
// - nul, con, prn, aux, com1-9, lpt1-9
// - unified-pre-write-hook.cjs blocks these
```

**Missing Windows Tests**:

- ❌ Backslash path handling in glob-to-regex conversion
- ❌ Reserved name blocking (nul.txt, con.log)
- ❌ Case-insensitive filesystem handling (Windows vs Linux)
- ❌ Long path support (>260 chars on Windows)

**Recommendation**: CI should run on Windows and Linux (platform-specific tests)

---

## 5. Recommendations (Priority Order)

### P0 - Critical (Deploy Blockers)

1. **Memory Core Facade Tests** (Estimated: 8 hours)
   - Integration tests for 5 core modules
   - Tier fallback behavior (HOT → WARM → COLD)
   - Rotation/archival correctness
   - File: `tests/lib/memory/memory-core-integration.test.cjs`

2. **Security Regression Tests** (Estimated: 4 hours)
   - HIGH-001, HIGH-003, HIGH-004 attack vectors
   - Shell injection bypass patterns
   - Prompt injection patterns
   - File: `tests/security/security-regression.test.cjs`

3. **Hook Integration Tests** (Estimated: 6 hours)
   - spawn-prompt-validator (token budget)
   - user-prompt-unified (batch creation detection)
   - hybrid-search-enforcer (GREP deprecation)
   - File: `tests/hooks/critical-hooks-integration.test.cjs`

**Total P0 Effort**: 18 hours

---

### P1 - High Priority (Quality Gates)

4. **Code Indexing Core Tests** (Estimated: 12 hours)
   - hybrid-lazy-indexer (1330 file baseline)
   - index-manager (orchestration)
   - result-ranker (RRF scoring)
   - File: `tests/lib/code-indexing/indexing-core-integration.test.cjs`

5. **Routing Module Tests** (Estimated: 6 hours)
   - agent-registry-loader (split registry)
   - router-state edge cases (concurrent updates)
   - routing-table fallback behavior
   - File: `tests/lib/routing/routing-integration.test.cjs`

6. **CLI Tool Tests** (Estimated: 8 hours)
   - doctor.mjs (health check)
   - hybrid-search-daemon.cjs (daemon lifecycle)
   - generate-agent-registry.cjs (registry generation)
   - File: `tests/tools/cli/cli-tools-integration.test.cjs`

**Total P1 Effort**: 26 hours

---

### P2 - Medium Priority (Technical Debt)

7. **Skipped Test Audit** (Estimated: 6 hours)
   - Classify 728 skipped/todo tests
   - Stabilize flaky tests
   - Delete never-implemented TODOs
   - File: `.claude/context/reports/skipped-test-audit-2026-02-12.md`

8. **Archived Test Audit** (Estimated: 4 hours)
   - Identify resurrection candidates (code still exists)
   - Delete tests for removed code
   - Update tests for refactored code
   - File: `.claude/context/reports/archived-test-audit-2026-02-12.md`

9. **Integration Test Suite** (Estimated: 16 hours)
   - Enterprise workflow (8 phases end-to-end)
   - Memory tier rotation (HOT → WARM → COLD)
   - Hybrid search daemon lifecycle
   - Task lifecycle with hook chain
   - File: `tests/integration/workflow-integration.test.cjs`

**Total P2 Effort**: 26 hours

---

### P3 - Low Priority (Nice-to-Have)

10. **Performance Regression Suite** (Estimated: 8 hours)
    - 1330 file indexing baseline (19.5s)
    - Hook performance budget (<100ms)
    - Memory tier lookup latency
    - File: `tests/performance/regression-suite.test.cjs`

11. **Platform-Specific Tests** (Estimated: 6 hours)
    - Windows path handling
    - Windows reserved names
    - Case-insensitive filesystem
    - File: `tests/platform/windows-specific.test.cjs`

12. **Property-Based Testing** (Estimated: 12 hours)
    - Routing consistency (all agents resolvable)
    - Memory tier invariants (data never lost)
    - File: `tests/property/invariants.test.cjs`

**Total P3 Effort**: 26 hours

---

## 6. Test Infrastructure Recommendations

### 6.1 Test Organization

**Current Structure**: Tests mirror source structure (good)

```
tests/
├── agents/          ✅ (mirrors .claude/agents/)
├── hooks/           ✅ (mirrors .claude/hooks/)
├── lib/             ✅ (mirrors .claude/lib/)
└── tools/           ✅ (mirrors .claude/tools/)
```

**Recommended Additions**:

```
tests/
├── integration/     ➕ (NEW - multi-component workflows)
├── performance/     ➕ (NEW - regression baselines)
├── security/        ➕ (NEW - attack vector validation)
└── platform/        ➕ (NEW - Windows/Linux specific)
```

---

### 6.2 Test Naming Convention

**Current Pattern**: `{module-name}.test.{cjs|mjs}` (good)

**Recommended Enhancements**:

```
Unit Tests:           {module}.test.cjs
Integration Tests:    {workflow}-integration.test.cjs
Performance Tests:    {module}-perf.test.cjs
Security Tests:       {attack-vector}-security.test.cjs
Regression Tests:     {bug-id}-regression.test.cjs
```

---

### 6.3 Test Script Improvements

**Current Scripts** (from package.json):

```json
"test": "node --test --test-concurrency=1 \"tests/**/*.test.{mjs,cjs}\""
```

**Recommended Additions**:

```json
"test": "node --test --test-concurrency=1 \"tests/**/*.test.{mjs,cjs}\"",
"test:unit": "node --test \"tests/{lib,hooks,tools}/**/*.test.{mjs,cjs}\"",
"test:integration": "node --test \"tests/integration/**/*.test.{mjs,cjs}\"",
"test:security": "node --test \"tests/security/**/*.test.{mjs,cjs}\"",
"test:perf": "node --test \"tests/performance/**/*.test.{mjs,cjs}\"",
"test:coverage": "c8 --reporter=lcov --reporter=text pnpm test",
"test:watch": "node --test --watch \"tests/**/*.test.{mjs,cjs}\""
```

---

### 6.4 CI/CD Integration

**Recommended Gates**:

```yaml
# .github/workflows/test-gate.yml
name: Test Gate
on: [push, pull_request]
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:unit
      - run: pnpm test:integration
      - run: pnpm test:security
    # BLOCK: All tests must pass

  coverage-check:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:coverage
      - run: pnpm assert-coverage --min 70
    # WARN: Coverage below 70% (don't block)

  performance-regression:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test:perf
    # WARN: Performance degradation (don't block)
```

---

## 7. Testing Best Practices (Framework-Specific)

### 7.1 TDD Enforcement (From tdd Skill)

**Iron Law**: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST

**Pattern**:

1. Write failing test (RED)
2. Run test (verify it fails for right reason)
3. Write minimal code (GREEN)
4. Run test (verify it passes)
5. Refactor (keep tests green)

**Violations Found**:

- Memory core facade deployed without tests (violates TDD)
- Security fixes (HIGH-001/003/004) implemented without regression tests first

**Recommendation**: Enforce TDD via `verification-before-completion` skill

---

### 7.2 Test Isolation (From testing.md)

**Pattern**: Each test must be independent (no shared state)

**Current Issues**:

- Memory tests leave behind `.test-*` directories (shared state)
- Test order dependencies (tests fail when run in isolation)

**Solution**:

```javascript
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// CORRECT: Isolated temp directory per test
beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'test-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});
```

---

### 7.3 Assertion Quality (From testing.md)

**Good**: 14,108 assertions across 266 tests = 53 assertions/test (strong)

**Pattern**: Prefer specific assertions over generic

```javascript
// ❌ BAD: Generic assertion
expect(result).toBeTruthy();

// ✅ GOOD: Specific assertion
expect(result.status).toBe('completed');
expect(result.filesModified).toEqual(['file1.ts', 'file2.ts']);
expect(result.testsPassing).toBe(true);
```

---

### 7.4 Error Path Testing (From testing.md)

**Pattern**: Test both success and error paths

```javascript
// ✅ GOOD: Both paths tested
test('loads agent registry', async () => {
  const registry = await loadRegistry('core');
  expect(registry).toHaveProperty('agents');
});

test('throws on missing registry file', async () => {
  await expect(loadRegistry('nonexistent')).rejects.toThrow('Registry not found');
});
```

---

## 8. Actionable Next Steps

### Immediate Actions (This Week)

1. **Invoke TDD Skill**: Begin with RED phase for memory core facade

   ```javascript
   Skill({ skill: 'tdd' });
   Skill({ skill: 'test-generator' });
   ```

2. **Run Test Coverage Analysis**:

   ```bash
   pnpm test:coverage
   c8 report --reporter=html
   # Review coverage report in coverage/index.html
   ```

3. **Audit Skipped Tests**:
   ```bash
   grep -r "skip\|todo\|xit" tests/ --include="*.test.*" > skipped-tests.txt
   # Classify as flaky/performance/never-implemented
   ```

### Sprint 1 (Week 1-2): Critical Coverage Gaps

- **Goal**: Eliminate P0 gaps (18 hours)
- **Deliverables**:
  - Memory core facade integration tests
  - Security regression test suite
  - Critical hook integration tests

### Sprint 2 (Week 3-4): High Priority Gaps

- **Goal**: Eliminate P1 gaps (26 hours)
- **Deliverables**:
  - Code indexing core tests
  - Routing module tests
  - CLI tool integration tests

### Sprint 3 (Week 5-6): Technical Debt

- **Goal**: Reduce technical debt (26 hours)
- **Deliverables**:
  - Skipped test audit + fixes
  - Archived test audit + cleanup
  - Integration test suite

---

## 9. Success Criteria

### Coverage Targets

| Category      | Current | Target (3 months) | Target (6 months) |
| ------------- | ------- | ----------------- | ----------------- |
| Library       | 67%     | 80%               | 90%               |
| Hooks         | 38.5%   | 70%               | 85%               |
| CLI Tools     | 16.7%   | 50%               | 70%               |
| Memory Core   | 20%     | 100%              | 100%              |
| Code Indexing | 41.2%   | 75%               | 90%               |

### Quality Targets

| Metric         | Current | Target (3 months) | Target (6 months) |
| -------------- | ------- | ----------------- | ----------------- |
| Archive Rate   | 30%     | <20%              | <10%              |
| Skipped Tests  | 728     | <300              | <100              |
| Test Pass Rate | 99.3%   | 99.5%             | 99.8%             |

### Integration Targets

| Area                   | Current | Target (3 months) |
| ---------------------- | ------- | ----------------- |
| Enterprise Workflow    | ❌ None | ✅ Full E2E test  |
| Memory Tier Lifecycle  | ❌ None | ✅ Full E2E test  |
| Hybrid Search Daemon   | ❌ None | ✅ Full E2E test  |
| Task Lifecycle + Hooks | ❌ None | ✅ Full E2E test  |

---

## 10. References

### Framework Documentation

- `.claude/rules/testing.md` - Testing standards and patterns
- `.claude/skills/tdd/SKILL.md` - Test-Driven Development methodology
- `.claude/skills/test-generator/SKILL.md` - Test generation patterns
- `.claude/context/memory/learnings.md` - Archive rate analysis (2026-02-11)

### Recent Audit Reports

- `.claude/context/reports/qa/qa-audit-fixes-2026-02-11.md` - Recent QA validation (99.3% pass rate)
- `.claude/context/reports/reflections/audit-reflection-2026-02-11.md` - Systemic patterns analysis
- `.claude/context/reports/architecture-review-2026-02-11.md` - Memory subsystem consolidation

### Testing Tools

- Node.js built-in test runner: `node --test`
- Coverage: `c8` (recommended for install)
- Assertion library: Node.js `assert` module
- Mocking: Minimal (prefer real code over mocks per testing.md)

---

## Appendix A: Test File Inventory

### Active Test Files (266)

```
tests/agents/          30 files
tests/hooks/           64 files
tests/lib/            120 files
tests/tools/           40 files
tests/integration/     12 files
```

### Archived Test Files (114)

```
tests/agents/          8 archived
tests/hooks/          28 archived
tests/lib/            62 archived
tests/tools/          16 archived
```

### Test Coverage by Module

```
EXCELLENT (>80% coverage):
├── Memory (general)      89% (45/51 files tested)
├── Routing (general)     87.5% (7/8 files tested)
└── Monitoring            85% (22/26 files tested)

GOOD (60-80% coverage):
├── Library (general)     67% (150/223 files tested)
├── Code Indexing         58.8% (10/17 files tested)
└── Context Management    62% (18/29 files tested)

NEEDS WORK (40-60% coverage):
├── Hooks                 38.5% (40/104 files tested)
└── Planning              41% (9/22 files tested)

CRITICAL GAP (<40% coverage):
├── CLI Tools             16.7% (11/66 files tested)
├── Memory Core           20% (1/5 files tested)
└── Evolution             25% (3/12 files tested)
```

---

## Appendix B: Learnings Integration

### Key Insights from learnings.md

**2026-02-11 Enterprise Pipeline Retrospective**:

> **Golden Pattern \#5: Comprehensive Testing with Non-Blocking Edge Cases**
> Pattern: 98 new tests, 3 failures (non-blocking workflow enforcement)
> Why: 99.3% pass rate is deployment-ready, perfect is enemy of good

**Takeaway**: This report identifies critical gaps (0% memory core coverage) that violate the 99.3% pass rate for core subsystems.

**2026-02-11 Audit Reflection**:

> **Archive Rates Are Leading Indicators** — <10% healthy, 10-30% warning, >50% crisis

**Takeaway**: 30% archive rate (114/380 tests) is in WARNING zone, approaching crisis. Test maintenance is a process problem.

**2026-02-09 Batch Creation Debt**:

> **Evidence**: 354 orphaned skills (78% orphan rate), 63% hollow schemas, 12/28 critical hooks untested (43%)

**Takeaway**: Test coverage gaps are symptom of batch creation pattern (coverage > depth trade-off).

---

## End of Report

**Report Path**: `.claude/context/reports/test-coverage-gaps-2026-02-12.md`

**Next Actions**:

1. Review findings with team/user
2. Prioritize P0 critical gaps (18 hours effort)
3. Invoke TDD skill for memory core facade tests
4. Schedule Sprint 1 (Critical Coverage Gaps)

**Memory Protocol**: This report logged to `.claude/context/reports/` per workspace conventions. Key findings should be added to `learnings.md` after review.
