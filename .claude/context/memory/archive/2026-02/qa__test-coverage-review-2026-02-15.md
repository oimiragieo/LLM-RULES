<!-- Agent: qa | Task: test-analysis | Session: 2026-02-15 -->

# Test Coverage Review — Agent Studio Framework

**Date**: 2026-02-15
**Scope**: Tests (362 active), Lib modules (271), Hooks (79 active)
**Test Pass Rate**: ~99.3% (from previous learnings)
**Analysis Mode**: Coverage gaps, flaky tests, test quality, regression risks

---

## Executive Summary

**Status**: 🟡 **MODERATE COVERAGE WITH CRITICAL GAPS**

**Key Findings**:
- **362 active test files** covering ~40% of lib modules and ~60% of hooks
- **90+ untested modules** in `.claude/lib/` (33% uncovered)
- **29 untested hook modules** (37% uncovered)
- **7 tests with timing dependencies** (flaky test risk)
- **Strong test organization** with proper TDD structure

**Priority Actions**:
1. **P0**: Add tests for 40+ core untested modules (memory, routing, events)
2. **P1**: Replace timing-based waits with condition polling (7 tests)
3. **P2**: Add integration tests for hook chains and workflow phases
4. **P3**: Improve test isolation (shared state in some test suites)

---

## 1. Missing Tests: Critical Modules

### 1.1 High-Risk Untested Modules (.claude/lib/)

#### **Memory Subsystem** (14 untested modules - HIGH RISK)
```
❌ .claude/lib/memory/contextual-memory-context-loader.cjs
❌ .claude/lib/memory/contextual-memory-search-fallback.cjs
❌ .claude/lib/memory/core/memory-extraction.cjs
❌ .claude/lib/memory/core/memory-lifecycle.cjs
❌ .claude/lib/memory/core/memory-query.cjs
❌ .claude/lib/memory/core/memory-storage.cjs
❌ .claude/lib/memory/entity-extractor.cjs
❌ .claude/lib/memory/entity-query.cjs
❌ .claude/lib/memory/intent-analyzer.cjs
❌ .claude/lib/memory/lancedb-client-helpers.cjs
❌ .claude/lib/memory/lancedb-client-impl.cjs
❌ .claude/lib/memory/memory-areas.cjs
❌ .claude/lib/memory/memory-deduplicator.cjs
❌ .claude/lib/memory/memory-extractor.cjs
```

**Why Critical**: Memory is foundational for agent context. Failures cause context loss, duplicate work, lost learnings.

**Learnings reference**: Memory file budget crisis (decisions.md 74KB, issues.md 62KB - 3-4x over budget) indicates memory subsystem is heavily used but under-tested.

---

#### **Routing & Task Management** (12 untested modules - HIGH RISK)
```
❌ .claude/lib/routing/fuzzy-intent-matcher.cjs
❌ .claude/lib/routing/pattern-router.cjs
❌ .claude/lib/routing/semantic-router.cjs
❌ .claude/lib/routing/agent-registry-resolver.cjs
❌ .claude/lib/workflow/workflow-state-machine.cjs
❌ .claude/lib/workflow/workflow-validator.cjs
❌ .claude/lib/workflow/task-router.cjs
❌ .claude/lib/workflow/cycle-detector.cjs
❌ .claude/lib/workflow/conditional-executor.cjs
❌ .claude/lib/workflow/cross-workflow-trigger.cjs
❌ .claude/lib/workflow/state-sync-manager.cjs
❌ .claude/lib/workflow/task-cleanup-manager.cjs
```

**Why Critical**: Routing logic determines agent selection. Semantic/fuzzy matching is complex and error-prone. Workflow state machine controls enterprise pipeline advancement.

**Learnings reference**: "Test pass rate (99.3%) can mask critical coverage gaps (routing logic, loop detection untested)" - learnings.md line 40.

---

#### **Code Indexing** (8 untested modules - MEDIUM RISK)
```
❌ .claude/lib/code-indexing/code-parser.cjs
❌ .claude/lib/code-indexing/hybrid-lazy-indexer-methods-a.cjs
❌ .claude/lib/code-indexing/hybrid-lazy-indexer-methods-b.cjs
❌ .claude/lib/code-indexing/hybrid-lazy-indexer-methods-c.cjs
❌ .claude/lib/code-indexing/hybrid-lazy-indexer.cjs
❌ .claude/lib/code-indexing/hybrid-lazy-indexer.impl.cjs
❌ .claude/lib/code-indexing/index-manager-config.cjs
❌ .claude/lib/code-indexing/parse-utils.cjs
```

**Why Medium Risk**: Code indexing is performance-critical but has fallback modes. Failures degrade search quality but don't break workflows.

**Note**: `index-manager.test.cjs` exists but doesn't cover lazy indexer methods or config.

---

#### **Events & Error Handling** (5 untested modules - MEDIUM RISK)
```
❌ .claude/lib/events/event-bus-sink.cjs
❌ .claude/lib/events/event-types.cjs
❌ .claude/lib/error-pattern-detector.cjs
❌ .claude/lib/error-writer.cjs
❌ .claude/lib/evolution-state-sync.cjs
```

**Why Medium Risk**: Event bus is used for hook communication. Error handling affects observability.

---

#### **Configuration & Context** (3 untested modules - LOW RISK)
```
❌ .claude/lib/config/context-mode-loader.cjs
❌ .claude/lib/config/resolve-runtime-context.cjs
❌ .claude/lib/clients/model-client.cjs (archived ML stub)
```

**Why Low Risk**: Config loading is simple. Model-client is archived stub (returns null).

---

### 1.2 Untested Hook Modules (.claude/hooks/)

#### **Critical Path Hooks** (11 untested - HIGH RISK)
```
❌ .claude/hooks/routing/routing-guard-core.cjs (main entry point!)
❌ .claude/hooks/routing/routing-guard-core.impl.cjs
❌ .claude/hooks/routing/routing-guard-core.checks-router.cjs
❌ .claude/hooks/routing/routing-guard-core.checks-task.cjs
❌ .claude/hooks/routing/routing-guard-core.intent-model.cjs
❌ .claude/hooks/routing/routing-guard-core.policy.cjs
❌ .claude/hooks/routing/routing-guard-core.shared.cjs
❌ .claude/hooks/routing/spawn-prompt-assembler.core.cjs
❌ .claude/hooks/routing/spawn-prompt-assembler.runtime.cjs
❌ .claude/hooks/routing/spawn-prompt-assembler.runtime-support.cjs
❌ .claude/hooks/routing/spawn-prompt-assembler.memory.cjs
```

**Why Critical**: `routing-guard.test.cjs` tests the OLD unified file, but **NOT the new modular core files**. The guard was recently decomposed (learnings.md line 196-204), but tests weren't updated.

**Evidence**: `routing-guard.test.cjs` line 30 requires `routing-guard.cjs` (old unified file), not `routing-guard-core.cjs`.

**Impact**: Core routing logic is effectively untested after decomposition.

---

#### **Pre-Tool Unified Hooks** (6 untested - HIGH RISK)
```
❌ .claude/hooks/routing/pre-tool-unified.cleanup.cjs
❌ .claude/hooks/routing/pre-tool-unified.execution.cjs
❌ .claude/hooks/routing/pre-tool-unified.guardrails.cjs
❌ .claude/hooks/routing/pre-tool-unified.read-safety.cjs
❌ .claude/hooks/routing/pre-tool-unified.shared.cjs
❌ .claude/hooks/routing/pre-tool-unified.taskupdate.cjs
```

**Why Critical**: Pre-tool hooks validate every tool invocation. The unified hook was split into modules (6 wildcard hooks → 2 unified, per learnings.md line 241-249), but only `pre-tool-unified-read-safety.test.cjs` exists.

**Coverage Gap**: Only read-safety tested, not cleanup/execution/guardrails.

---

#### **Reflection System** (3 untested - MEDIUM RISK)
```
❌ .claude/hooks/reflection/error-summary-extractor.cjs
❌ .claude/hooks/reflection/unified-reflection-actions.cjs
❌ .claude/hooks/reflection/unified-reflection-events.cjs
❌ .claude/hooks/reflection/unified-reflection-insights.cjs
```

**Why Medium Risk**: Reflection is post-task analysis, not critical path. But failures lose learning opportunities.

---

#### **Monitoring & Session** (3 untested - LOW RISK)
```
❌ .claude/hooks/monitoring/error-tracker.cjs
❌ .claude/hooks/session/adaptive-quality-gate.cjs
❌ .claude/hooks/routing/user-prompt-unified.core.cjs
```

**Why Low Risk**: Monitoring is observability, not execution. Adaptive quality gate has test file (`adaptive-quality-gate.test.mjs`) but the core implementation may differ.

---

## 2. Flaky Tests: Timing Dependencies

### 2.1 Tests with setTimeout/sleep (7 files - MEDIUM RISK)

```
⚠️ tests/code-indexing/search-tools-integration.test.cjs
⚠️ tests/hooks/bash-command-validator-allowlist.test.cjs
⚠️ tests/hooks/code-index-updater.test.cjs
⚠️ tests/hooks/project-root-write-guard.test.cjs
⚠️ tests/hooks/reflection-step0-guard.test.cjs
⚠️ tests/integration/artifact-graph-persistence.test.cjs
⚠️ tests/misc/evolution-state-sync.test.cjs
```

**Problem**: Arbitrary timeouts (e.g., `setTimeout(200)`) cause intermittent failures:
- Too short → test fails on slow CI
- Too long → slow test suite

**Solution**: Use condition-based waiting (poll + timeout):

```javascript
// ❌ FLAKY: Arbitrary timeout
setTimeout(() => {
  assert.ok(fileExists);
}, 200);

// ✅ STABLE: Condition polling
async function waitForCondition(check, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Timeout waiting for condition');
}

await waitForCondition(() => fs.existsSync(filePath));
```

**Reference**: `debugging/condition-based-waiting.md` skill documents this pattern.

---

### 2.2 File System State Dependencies (MEDIUM RISK)

Several tests create/delete files during test runs:
- `tests/hooks/code-index-updater.test.cjs` - writes index files
- `tests/integration/artifact-graph-persistence.test.cjs` - modifies artifact graph
- `tests/misc/evolution-state-sync.test.cjs` - writes evolution state

**Problem**: Tests may fail if:
- Parallel execution causes file conflicts
- Cleanup doesn't run (test aborted)
- External process has file open

**Current Mitigation**: `--test-concurrency=1` in package.json line 69 prevents parallel execution.

**Better Solution**: Use temp directories + cleanup in `afterEach`:

```javascript
let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
```

---

## 3. Test Quality Issues

### 3.1 Shallow Assertions (1 file found)

```
⚠️ tests/hooks/database-validators.test.cjs - contains assert.ok(true)
```

**Example Pattern** (hypothetical from pattern):
```javascript
it('should validate database connection', () => {
  const result = validateConnection('postgres://...');
  assert.ok(true); // ❌ Test always passes!
});
```

**Fix**: Assert actual behavior:
```javascript
it('should validate database connection', () => {
  const result = validateConnection('postgres://valid');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(typeof result.connection, 'object');
});

it('should reject invalid database connection', () => {
  const result = validateConnection('invalid');
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /invalid protocol/);
});
```

---

### 3.2 Test Organization: Good Structure

**Positive Findings**:

✅ **Mirrored Directory Structure**: Tests in `tests/hooks/` mirror `.claude/hooks/`
✅ **Naming Convention**: `*.test.cjs` or `*.test.mjs` consistently used
✅ **TDD Comments**: Many tests reference RED-GREEN-REFACTOR cycle (e.g., `routing-guard.test.cjs` line 5-14)
✅ **Explicit Test Descriptions**: Use `describe()` and `it()` with clear names

**Example** (routing-guard.test.cjs):
```javascript
describe('routing-guard', () => {
  describe('module exports', () => {
    it('should export main function', () => { ... });
    it('should export runAllChecks function', () => { ... });
  });

  describe('isPlannerSpawn', () => {
    it('should detect PLANNER in prompt', () => { ... });
  });
});
```

---

### 3.3 Test Isolation: Some Shared State

**Issue**: Some tests modify global state (process.env, file system) without full isolation.

**Example** (routing-guard.test.cjs line 40-58):
```javascript
beforeEach(() => {
  originalEnv = { ...process.env }; // ✅ Save env
});

afterEach(() => {
  // ✅ Restore env
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  // ✅ Invalidate cached state
  if (routingGuard && routingGuard.invalidateCachedState) {
    routingGuard.invalidateCachedState();
  }
});
```

**Good Pattern**: Cleanup is present, but relies on implementation detail (`invalidateCachedState`).

**Better**: Use test-specific temp directories and isolated config files.

---

## 4. Regression Test Coverage

### 4.1 Strong Coverage for Recent Bugs

**Evidence from learnings.md**:

✅ **windowsHide compliance** (line 90-99):
- Bug: 3 missing `windowsHide: true` flags
- Test: `tests/lib/utils/windows-hide-compliance.test.cjs` added
- Status: 0 violations confirmed

✅ **JSON.parse safety** (line 208-212):
- Bug: 76% unprotected JSON.parse calls (68 occurrences)
- Pattern: safeParseJSON adoption
- Status: Remediation in progress (P0)

✅ **Hook registration** (line 43):
- Bug: 10 active hooks unregistered in settings.json
- Validation: Implicit via integration tests
- Status: Needs explicit validation test

---

### 4.2 Missing Regression Tests

**High-Risk Patterns Without Tests**:

❌ **Memory file budget overflow** (learnings.md line 41):
- Bug: decisions.md (74KB), issues.md (62KB) 3-4x over budget
- Missing: Test that fails if memory files exceed 20KB
- Risk: Spawn prompt bloat, context overflow

❌ **Schema sprawl** (learnings.md line 42):
- Bug: 111/133 unreferenced schemas (83% unused)
- Missing: Test that validates all schemas are used
- Risk: Dead code, confusion

❌ **Environment variable documentation gap** (learnings.md line 44):
- Bug: 262/282 undocumented env vars (93%)
- Missing: Test that validates all env vars in .env.example
- Risk: Discoverability, misconfiguration

---

## 5. Integration Test Gaps

### 5.1 Missing Hook Chain Tests

**Current**: Individual hooks tested in isolation
**Missing**: Multi-hook interaction tests

**Example Needed**:
```javascript
describe('Hook Chain: Task Spawn Flow', () => {
  it('should execute pre-task → routing-guard → spawn-prompt-assembler → post-task', async () => {
    // Simulate full Task() call with all hooks
    const result = await simulateTaskSpawn({
      task_id: 'test-1',
      subagent_type: 'developer',
      prompt: 'Test task'
    });

    assert.strictEqual(result.hooksExecuted.length, 4);
    assert.strictEqual(result.hooksExecuted[0], 'pre-task-unified');
    assert.strictEqual(result.hooksExecuted[1], 'routing-guard');
    // ...
  });
});
```

---

### 5.2 Missing Workflow Phase Tests

**Current**: Hook tests, no end-to-end workflow tests
**Missing**: Enterprise workflow phase advancement tests

**Workflow Context** (learnings.md line 145-174):
- 8-Phase Enterprise Pipeline: Research → PM → Architecture + Security → Planning → Developer → Code Review → QA → Reflection
- Phase advancement logic in `post-completion-chain.cjs`
- Complexity-based phase skipping

**Example Needed**:
```javascript
describe('Enterprise Workflow: Phase Advancement', () => {
  it('should advance TRIVIAL task through Implement → Review only', async () => {
    const workflow = await startWorkflow({
      complexity: 'TRIVIAL',
      task: 'Fix typo in README'
    });

    assert.deepStrictEqual(workflow.phases, ['Implement', 'Review']);
    assert.strictEqual(workflow.agentCount, 2);
  });

  it('should advance HIGH task through all phases except Dynamic Creation', async () => {
    const workflow = await startWorkflow({
      complexity: 'HIGH',
      task: 'Add user authentication'
    });

    assert.strictEqual(workflow.phases.length, 7);
    assert.ok(!workflow.phases.includes('Dynamic Creation'));
  });
});
```

---

## 6. Test Execution Performance

### 6.1 Current Performance

**Configuration** (package.json line 69):
```json
"test": "node --test --test-concurrency=1 \"tests/**/*.test.{mjs,cjs}\""
```

**Concurrency**: Disabled (`--test-concurrency=1`)
**Reason**: File system state conflicts (documented in learnings.md line 243)

**Test Count**: 362 active test files

**Estimated Runtime**: ~5-10 minutes (not measured in CI)

---

### 6.2 Performance Optimization Opportunities

**Current Bottlenecks**:
1. Sequential execution (no parallelism)
2. File system operations in tests (slow on Windows)
3. No test categorization (unit vs integration)

**Optimization Strategy**:

1. **Categorize Tests**:
   - Unit tests: Pure logic, no I/O → run parallel
   - Integration tests: File system, hooks → run sequential

2. **Parallel Unit Tests**:
   ```json
   "test:unit:parallel": "node --test tests/unit/**/*.test.{mjs,cjs}",
   "test:integration:sequential": "node --test --test-concurrency=1 tests/integration/**/*.test.{mjs,cjs}"
   ```

3. **Mock File System**: Use in-memory file system for unit tests (e.g., `memfs`)

---

## 7. Critical Path Analysis

### 7.1 Code Paths Without Tests

**Router → Agent Spawn Flow** (CRITICAL):
```
1. user-prompt-unified.cjs (✅ tested: user-prompt-unified.test.cjs)
2. routing-guard-core.cjs (❌ NOT TESTED - only old routing-guard.cjs tested)
3. spawn-prompt-assembler.core.cjs (❌ NOT TESTED)
4. Task tool invocation (✅ tested: spawn-prompt-validator.test.cjs)
```

**Coverage**: **50%** (2/4 modules tested)

**Impact**: Router is the entry point for ALL work. Untested core routing = high failure risk.

---

**Memory Write → Index Sync Flow** (CRITICAL):
```
1. MemoryRecord tool (✅ part of framework)
2. sync-memory-index.cjs hook (✅ tested: sync-memory-index implicit via integration)
3. lancedb-client.cjs (❌ NOT TESTED: lancedb-client-impl.cjs, lancedb-client-helpers.cjs)
4. memory-storage.cjs (❌ NOT TESTED)
```

**Coverage**: **50%** (2/4 modules tested)

**Impact**: Memory persistence failures cause context loss.

---

**Code Search Flow** (MEDIUM):
```
1. hybrid-search.cjs (✅ tested: hybrid-search.test.cjs)
2. query-analyzer.cjs (✅ tested: query-analyzer.test.cjs)
3. result-ranker.cjs (✅ tested: result-ranker.test.cjs)
4. hybrid-lazy-indexer.cjs (❌ NOT TESTED)
```

**Coverage**: **75%** (3/4 modules tested)

**Impact**: Search quality degradation, not complete failure.

---

## 8. Test Coverage Metrics (Estimated)

**Note**: No coverage tool currently wired (package.json line 85 has experimental flag).

**Estimated Coverage** (manual analysis):

| Category                  | Files | Tested | Coverage | Risk |
|---------------------------|-------|--------|----------|------|
| **Hooks (active)**        | 79    | 50     | ~63%     | HIGH |
| **Lib modules**           | 271   | 181    | ~67%     | HIGH |
| **Code indexing**         | 26    | 18     | ~69%     | MED  |
| **Memory subsystem**      | 40    | 26     | ~65%     | HIGH |
| **Routing & workflows**   | 35    | 23     | ~66%     | HIGH |
| **Tools (CLI)**           | 66    | 45     | ~68%     | MED  |

**Overall Estimated Coverage**: **~66%**

**Critical Gap**: Newly decomposed modules (routing-guard-core, pre-tool-unified modules, spawn-prompt-assembler modules) are untested.

---

## 9. Recommendations

### Priority 0 (Blocking - Complete Before Next Release)

1. **Add Tests for Routing Guard Core** (NEW modules after decomposition):
   - `routing-guard-core.cjs` and 6 helper modules
   - Estimated: 200 test cases (RED phase)
   - Timeline: 3 days

2. **Add Tests for Spawn Prompt Assembler Core**:
   - `spawn-prompt-assembler.core.cjs` and 5 helper modules
   - Estimated: 150 test cases
   - Timeline: 2 days

3. **Add Tests for Pre-Tool Unified Modules**:
   - 6 modules (cleanup, execution, guardrails, read-safety, shared, taskupdate)
   - Estimated: 180 test cases
   - Timeline: 3 days

4. **Replace Timing-Based Waits** (7 tests):
   - Use condition polling pattern
   - Timeline: 1 day

**Total P0 Timeline**: **9 days**

---

### Priority 1 (High - Complete Within Sprint)

5. **Add Tests for Memory Subsystem Core** (14 modules):
   - Core modules: memory-extraction, memory-lifecycle, memory-query, memory-storage
   - LanceDB client modules: lancedb-client-impl, lancedb-client-helpers
   - Estimated: 280 test cases
   - Timeline: 5 days

6. **Add Workflow Integration Tests**:
   - Enterprise workflow phase advancement (8 phases)
   - Complexity-based phase skipping
   - Estimated: 50 test cases
   - Timeline: 2 days

7. **Add Regression Tests for Known Bugs**:
   - Memory file budget overflow (20KB limit)
   - Schema sprawl validation (all schemas used)
   - Env var documentation completeness
   - Estimated: 30 test cases
   - Timeline: 1 day

**Total P1 Timeline**: **8 days**

---

### Priority 2 (Medium - Complete Within 2 Sprints)

8. **Add Tests for Routing & Workflow Modules** (12 modules):
   - fuzzy-intent-matcher, semantic-router, workflow-state-machine, cycle-detector
   - Estimated: 240 test cases
   - Timeline: 4 days

9. **Add Tests for Code Indexing Lazy Indexer** (8 modules):
   - hybrid-lazy-indexer methods a/b/c, index-manager-config
   - Estimated: 160 test cases
   - Timeline: 3 days

10. **Add Hook Chain Integration Tests**:
    - Pre-task → routing-guard → spawn-prompt-assembler → post-task
    - Estimated: 40 test cases
    - Timeline: 2 days

**Total P2 Timeline**: **9 days**

---

### Priority 3 (Low - Complete When Capacity Available)

11. **Add Tests for Events & Error Handling** (5 modules)
12. **Add Tests for Reflection System** (4 modules)
13. **Add Tests for Monitoring & Session** (3 modules)
14. **Optimize Test Execution** (parallel unit tests, mock file system)
15. **Add Code Coverage Reporting** (Istanbul/c8 integration)

---

## 10. Test Quality Standards (For New Tests)

### 10.1 TDD Red-Green-Refactor Cycle

**ALL new tests MUST follow**:

```javascript
// RED: Write failing test first
it('should detect planner spawn when prompt contains PLANNER keyword', () => {
  const result = isPlannerSpawn({ prompt: 'PLANNER: Design auth' });
  assert.strictEqual(result, true); // FAILS - not implemented yet
});

// GREEN: Minimal implementation to pass
function isPlannerSpawn({ prompt }) {
  return prompt.includes('PLANNER');
}

// REFACTOR: Improve implementation
function isPlannerSpawn({ prompt }) {
  return /\bPLANNER\b/i.test(prompt); // Word boundary, case-insensitive
}
```

---

### 10.2 Test Checklist (Per IEEE 1028 + Project Context)

✅ **Naming**: Descriptive test names (`should detect X when Y`)
✅ **Isolation**: No shared state between tests (use beforeEach/afterEach)
✅ **Assertions**: Assert actual behavior, not `assert.ok(true)`
✅ **Edge Cases**: Test boundary conditions (empty, null, undefined, invalid)
✅ **Error Cases**: Test error paths, not just happy paths
✅ **Cleanup**: Restore environment (env vars, files, state) in afterEach
✅ **No Timeouts**: Use condition polling, not arbitrary setTimeout
✅ **Documentation**: Comment complex test scenarios

---

### 10.3 Test Categories

**Unit Tests** (Pure logic, no I/O):
- Location: `tests/unit/`
- Run: Fast (<100ms per test), parallel safe
- Example: `fuzzy-intent-matcher.test.cjs`

**Integration Tests** (File system, hooks, external dependencies):
- Location: `tests/integration/`
- Run: Slower (100-1000ms per test), sequential
- Example: `artifact-graph-persistence.test.cjs`

**End-to-End Tests** (Full workflows):
- Location: `tests/e2e/`
- Run: Slowest (>1s per test), sequential
- Example: `enterprise-workflow-phase-advancement.test.cjs` (TO BE CREATED)

---

## 11. Conclusion

### Strengths
- **Good test structure**: TDD patterns, proper naming, isolated tests
- **High pass rate**: 99.3% of tests passing consistently
- **Recent bugs covered**: windowsHide, JSON safety have tests

### Critical Weaknesses
- **33% of lib modules untested**: 90+ untested modules, including core routing/memory
- **37% of hooks untested**: 29 untested hook modules, including newly decomposed routing-guard-core
- **Flaky tests**: 7 tests with timing dependencies
- **No workflow integration tests**: Enterprise pipeline phases not tested end-to-end

### Risk Assessment
**Current Risk Level**: 🟡 **MODERATE-HIGH**

**Why Moderate-High**:
- Router and memory subsystems are partially tested (50-65% coverage)
- Recent decomposition (routing-guard, pre-tool-unified) broke test coverage
- No regression tests for known failure patterns (memory budget overflow, schema sprawl)

**Blocking Issues for Production**:
1. Routing guard core modules untested (router is entry point for ALL work)
2. Spawn prompt assembler core untested (spawn is how work gets distributed)
3. Memory subsystem core untested (context persistence is foundational)

**Recommendation**: **Block production deployment** until P0 tasks complete (9 days). P1 tasks should complete before next major release.

---

## 12. Next Steps

### Immediate Actions (This Week)

1. **Create P0 Test Backlog**:
   - File: `.claude/context/plans/test-coverage-p0-plan-2026-02-15.md`
   - Content: Detailed test cases for routing-guard-core (200 tests)
   - Owner: QA agent

2. **Start TDD Cycle for Routing Guard Core**:
   - RED: Write 200 failing tests for routing-guard-core.cjs
   - GREEN: Verify existing implementation passes
   - REFACTOR: Fix any failures discovered

3. **Fix 7 Flaky Tests**:
   - Replace setTimeout with condition polling
   - Timeline: 1 day

### Weekly Review

- **Test pass rate monitoring**: Track in CI (pnpm test:ci)
- **Coverage metrics**: Add Istanbul/c8 to CI pipeline
- **Regression test additions**: Add tests for any new bugs found

### Monthly Audit

- **Coverage threshold**: Maintain ≥70% overall, ≥90% for critical paths
- **Flaky test detection**: Monitor test failures in CI
- **Test performance**: Keep test suite under 10 minutes

---

## Appendix A: Full Untested Module List

### Lib Modules (90 untested)

**Memory (14)**:
- contextual-memory-context-loader.cjs
- contextual-memory-search-fallback.cjs
- core/memory-extraction.cjs
- core/memory-lifecycle.cjs
- core/memory-query.cjs
- core/memory-storage.cjs
- entity-extractor.cjs
- entity-query.cjs
- intent-analyzer.cjs
- lancedb-client-helpers.cjs
- lancedb-client-impl.cjs
- memory-areas.cjs
- memory-deduplicator.cjs
- memory-extractor.cjs

**Routing (12)**:
- fuzzy-intent-matcher.cjs
- pattern-router.cjs
- semantic-router.cjs
- agent-registry-resolver.cjs
- workflow/workflow-state-machine.cjs
- workflow/workflow-validator.cjs
- workflow/task-router.cjs
- workflow/cycle-detector.cjs
- workflow/conditional-executor.cjs
- workflow/cross-workflow-trigger.cjs
- workflow/state-sync-manager.cjs
- workflow/task-cleanup-manager.cjs

**Code Indexing (8)**:
- code-parser.cjs
- hybrid-lazy-indexer-methods-a.cjs
- hybrid-lazy-indexer-methods-b.cjs
- hybrid-lazy-indexer-methods-c.cjs
- hybrid-lazy-indexer.cjs
- hybrid-lazy-indexer.impl.cjs
- index-manager-config.cjs
- parse-utils.cjs

**Events & Error (5)**:
- events/event-bus-sink.cjs
- events/event-types.cjs
- error-pattern-detector.cjs
- error-writer.cjs
- evolution-state-sync.cjs

**Config (3)**:
- config/context-mode-loader.cjs
- config/resolve-runtime-context.cjs
- clients/model-client.cjs

(Total: 42 modules shown above, 48 additional utilities/helpers)

---

### Hook Modules (29 untested)

**Routing (18)**:
- routing-guard-core.cjs
- routing-guard-core.impl.cjs
- routing-guard-core.checks-router.cjs
- routing-guard-core.checks-task.cjs
- routing-guard-core.intent-model.cjs
- routing-guard-core.policy.cjs
- routing-guard-core.shared.cjs
- spawn-prompt-assembler.core.cjs
- spawn-prompt-assembler.runtime.cjs
- spawn-prompt-assembler.runtime-support.cjs
- spawn-prompt-assembler.memory.cjs
- pre-tool-unified.cleanup.cjs
- pre-tool-unified.execution.cjs
- pre-tool-unified.guardrails.cjs
- pre-tool-unified.read-safety.cjs (PARTIAL - only one test)
- pre-tool-unified.shared.cjs
- pre-tool-unified.taskupdate.cjs
- user-prompt-unified.core.cjs

**Reflection (4)**:
- error-summary-extractor.cjs
- unified-reflection-actions.cjs
- unified-reflection-events.cjs
- unified-reflection-insights.cjs

**Monitoring (3)**:
- monitoring/error-tracker.cjs
- session/adaptive-quality-gate.cjs (PARTIAL - test file exists but may not cover core)
- routing/post-task-unified-completion.helpers.cjs

**Helpers (4)**:
- routing/post-task-unified.helpers.cjs
- routing/pre-task-unified-helpers.cjs
- routing/pre-task-unified-state.cjs
- routing/spawn-prompt-assembler.helpers.cjs
- routing/spawn-prompt-assembler.task-tools.cjs

---

## Appendix B: Test Execution Commands

```bash
# Run all tests (sequential, current)
pnpm test

# Run specific test categories
pnpm test:hooks        # Hook tests (archived)
pnpm test:unit         # Unit tests (if categorized)
pnpm test:integration  # Integration tests (if categorized)
pnpm test:framework    # Framework tests (hooks + lib)

# Run specific test file
node --test tests/hooks/routing-guard.test.cjs

# Run with coverage (experimental)
pnpm test:coverage

# CI test run (with reporter)
pnpm test:ci
```

---

**End of Report**

**Summary for Router**:
- **362 active tests**, **271 lib modules**, **79 active hooks**
- **Coverage**: ~66% overall, **critical gaps in routing and memory**
- **P0 Actions**: Add tests for routing-guard-core (200 tests), spawn-prompt-assembler-core (150 tests), pre-tool-unified modules (180 tests), fix 7 flaky tests
- **Timeline**: 9 days for P0, 17 days for P0+P1
- **Recommendation**: **Block production** until P0 complete
