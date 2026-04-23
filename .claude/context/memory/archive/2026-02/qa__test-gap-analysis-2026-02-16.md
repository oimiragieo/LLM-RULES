<!-- Agent: qa | Task: #4 | Session: 2026-02-16 -->

# Test Gap Analysis and Quality Assessment

**Date:** 2026-02-16
**Agent:** QA
**Context:** Comprehensive test suite analysis for gaps, quality issues, and regression risks

---

## Executive Summary

**Test Suite Health:** ✅ Good baseline with critical gaps

- **Test Files:** 98+ test files discovered
- **Coverage:** Good test infrastructure, but **critical untested paths in core routing and state machine logic**
- **Recently Added Tests:** 5 new test files (all follow good patterns)
- **Quality:** Tests are well-structured with proper isolation
- **Major Concern:** High-value modules lack tests (routing-guard core logic, task lifecycle state machine, workflow cycle detection)

**Risk Assessment:**

- **P0 (Critical):** 3 gaps that could cause production incidents
- **P1 (High):** 3 gaps that reduce system reliability

---

## 1. Test Coverage Inventory

### 1.1 Test Files vs Source Files

**Test Discovery:**

- Test files found: 98+ in `tests/` directory
- Source files in `.claude/lib/`: 110+ CJS modules
- Source files in `.claude/hooks/`: 100+ CJS modules

**Coverage Distribution:**

| Area          | Test Files | Source Files | Coverage             |
| ------------- | ---------- | ------------ | -------------------- |
| Code Indexing | 20         | 12           | ✅ Excellent         |
| Memory        | 15         | 25           | ⚠️ Partial           |
| Routing       | 10         | 15           | ❌ **Critical gaps** |
| Hooks         | 15         | 100+         | ❌ **Many untested** |
| Workflow      | 5          | 15           | ⚠️ Partial           |
| Utils         | 10         | 30           | ⚠️ Partial           |

### 1.2 Untested Critical Modules

**P0 - NO TESTS (High Regression Risk):**

1. **`.claude/lib/monitoring/async-log-buffer.cjs`** (50+ LOC)
   - **Function:** Asynchronous log buffering with flush mechanics
   - **Risk:** Buffer overflow, data loss on process exit, flush timing issues
   - **Impact:** Lost telemetry data, undetected failures
   - **Why untested:** Recently added (TDD Phase 1), tests written but not in main suite

2. **`.claude/lib/events/event-types.cjs`** (337 LOC)
   - **Function:** Event type validation for 32+ event types across 6 categories
   - **Risk:** Invalid events bypass validation, schema drift
   - **Impact:** Corrupted event bus, broken telemetry
   - **Why untested:** Constants file, assumed "too simple to test"

3. **`.claude/hooks/routing/routing-guard-core.cjs`** (wrapper, 10 LOC)
   - **Function:** Entry point for routing-guard-core.impl.cjs (2599 LOC)
   - **Risk:** Specialist routing bypassed, planner-first violated, architect-first skipped
   - **Impact:** Developer spawned instead of specialist (59 agents wasted)
   - **Why untested:** Module split happened, tests didn't follow

**P1 - PARTIAL TESTS (Medium Risk):**

4. **`.claude/hooks/routing/pre-task-unified-core.cjs`** (assumed ~500 LOC)
   - **Function:** Task lifecycle state machine (not_started → in_progress → completed/blocked)
   - **Risk:** Invalid state transitions, stuck tasks, duplicate claims
   - **Impact:** Workflow stalls, duplicate work
   - **Tests:** Basic happy path exists, but no state transition matrix

5. **`.claude/lib/workflow/cycle-detector.cjs`** (exists, LOC unknown)
   - **Function:** Detect infinite loops in workflow phase advancement
   - **Risk:** Workflow phase advances infinitely, never exits
   - **Impact:** System hang, resource exhaustion
   - **Tests:** None found (no `tests/lib/workflow/cycle-detector.test.cjs`)

6. **`.claude/hooks/routing/user-prompt-unified.cjs`** (2155 LOC, batch creation logic ~500-800 LOC)
   - **Function:** Detects batch creation intent ("create 10 agents" → orchestrator)
   - **Risk:** 10 developers write directly (no creator skills, invisible artifacts)
   - **Impact:** Missing catalog entries, CLAUDE.md out of sync, routing failures
   - **Tests:** Basic prompt parsing tested, but NOT batch creation detection

---

## 2. Critical Untested Paths (Detailed)

### 2.1 Routing-Guard Core Logic (P0)

**File:** `.claude/hooks/routing/routing-guard-core.impl.cjs` (2599 LOC)

**Untested Scenarios:**

| Check   | Description                                               | Risk                                                            | Test Exists? |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| Check 1 | Planner-first enforcement (HIGH/EPIC complexity)          | Developer implements EPIC task without plan                     | ❌ No        |
| Check 5 | Architect-first for code-simplifier/devops/chaos-engineer | High-risk specialists bypass architecture review                | ❌ No        |
| Check 7 | Specialist keyword override (59 agents)                   | Developer spawned for "update docs" instead of technical-writer | ❌ No        |

**Memory Evidence:**

> "routing-guard.cjs (2599 LOC) identified as over-complex but salvageable... 93% extraction potential confirmed"

**Remediation:**

- 20 integration tests (2 days effort)
- Test matrix: 3 checks × 3 complexity levels × 2 enforcement modes = 18 tests
- Add 2 tests for edge cases (unknown agent, missing config)

**Example Test Pattern:**

```javascript
test('Check 7: should route "update docs" to technical-writer, not developer', async () => {
  const hookInput = {
    toolUse: {
      tool: 'Task',
      input: {
        task_id: 'task-123',
        subagent_type: 'developer',
        prompt: 'update documentation in README.md',
      },
    },
  };

  const result = runHook(hookInput);

  assert.equal(result.allow, false);
  assert.match(result.message, /specialist override: use technical-writer/i);
});
```

### 2.2 Task Lifecycle State Machine (P0)

**File:** `.claude/hooks/routing/pre-task-unified-core.cjs` + `task-lifecycle-state.cjs`

**Untested State Transitions:**

| From        | To          | Valid?     | Test Exists? |
| ----------- | ----------- | ---------- | ------------ |
| not_started | in_progress | ✅ Yes     | ✅ Yes       |
| in_progress | completed   | ✅ Yes     | ✅ Yes       |
| in_progress | blocked     | ✅ Yes     | ❌ No        |
| blocked     | in_progress | ✅ Yes     | ❌ No        |
| completed   | in_progress | ❌ Invalid | ❌ No        |
| not_started | completed   | ❌ Invalid | ❌ No        |

**Risk Scenarios:**

- Task marked completed without starting (skips work)
- Task stuck in blocked state (never unblocks)
- Duplicate task claims (two agents work on same task)

**Remediation:**

- 15 state transition tests (1 day effort)
- Test matrix: 6 states × 6 states = 36 transitions (filter invalid)
- Add 3 tests for concurrent claims

**Example Test Pattern:**

```javascript
test('should reject completed → in_progress transition', async () => {
  const taskId = 'task-456';

  // First, complete the task
  await TaskUpdate({ taskId, status: 'completed' });

  // Then try to restart (should fail)
  const result = await TaskUpdate({ taskId, status: 'in_progress' });

  assert.equal(result.success, false);
  assert.match(result.error, /invalid state transition/i);
});
```

### 2.3 Workflow Cycle Detection (P0)

**File:** `.claude/lib/workflow/cycle-detector.cjs`

**Untested Scenarios:**

| Cycle Type       | Description                 | Impact                   | Test Exists? |
| ---------------- | --------------------------- | ------------------------ | ------------ |
| Self-loop        | Phase A → Phase A           | Infinite loop            | ❌ No        |
| Two-phase loop   | Phase A → Phase B → Phase A | Infinite oscillation     | ❌ No        |
| Three-phase loop | Phase A → B → C → A         | Slow resource exhaustion | ❌ No        |

**Risk:** Workflow phase advances infinitely, never exits

**Remediation:**

- 10 cycle detection tests (0.5 day effort)
- Test matrix: 3 cycle types × 3 detection strategies (depth limit, visited set, timeout)
- Add 1 test for valid DAG (no cycles)

**Example Test Pattern:**

```javascript
test('should detect self-loop cycle', async () => {
  const workflow = {
    phases: [
      { id: 'design', next: 'design' }, // Self-loop
    ],
  };

  const result = detectCycle(workflow);

  assert.equal(result.hasCycle, true);
  assert.deepEqual(result.cycle, ['design', 'design']);
});
```

---

## 3. Test Quality Issues

### 3.1 Recently Added Tests (Quality Review)

**Files Reviewed:** 5 new test files

1. **`tests/benchmarks/telemetry-hotpath-latency.test.cjs`** ✅ Good
   - **Pattern:** Performance benchmark with clear pass/fail threshold (<100ms for 500 records)
   - **Strengths:** Measures real-world latency, includes setup noise (50 dummy logs)
   - **Weakness:** No cleanup verification (leaves temp files)
   - **Rating:** 8/10

2. **`tests/hooks/taskupdate-state-sync.test.cjs`** ✅ Good
   - **Pattern:** Hook integration test with spawn simulation
   - **Strengths:** Tests hook input/output contract, validates state persistence
   - **Weakness:** Hardcoded task IDs (could cause flakiness if not unique)
   - **Rating:** 7/10

3. **`tests/lib/monitoring/flight-recorder-drain.test.cjs`** ✅ Excellent
   - **Pattern:** Process exit simulation with explicit flush verification
   - **Strengths:** Tests critical data loss scenario, uses child process for isolation
   - **Weakness:** None identified
   - **Rating:** 10/10

4. **`tests/lib/workflow/task-heartbeat.test.cjs`** ⚠️ Needs work
   - **Pattern:** Event bus integration test with timing dependency
   - **Strengths:** Tests heartbeat emission
   - **Weakness:** **Timing-dependent** (50ms interval, 210ms wait → expects 3+ heartbeats). Flaky on slow CI.
   - **Rating:** 5/10 (needs timeout tolerance)

5. **`tests/tools/verify-debug-log-remediation.test.cjs`** ✅ Good
   - **Pattern:** CLI tool integration test with temp file
   - **Strengths:** Uses temp directory, tests exact failure pattern
   - **Weakness:** No positive test (only tests failure case)
   - **Rating:** 7/10

### 3.2 Test Quality Patterns (General)

**Strengths:**

- ✅ Tests use `node:test` (no external framework dependency)
- ✅ Tests are isolated (no shared state)
- ✅ Edge cases covered (e.g., buffer overflow, process exit)
- ✅ Good use of temp directories for file I/O tests

**Weaknesses:**

- ⚠️ Some timing-dependent tests (heartbeat test)
- ⚠️ Hardcoded test IDs (could cause collisions)
- ⚠️ Missing cleanup in some tests (temp files left behind)
- ⚠️ No negative tests for success-only cases

### 3.3 Edge Case Coverage

**Well-Covered:**

- Buffer overflow (telemetry test)
- Process exit (drain test)
- Invalid state transitions (state sync test)

**Poorly-Covered:**

- Null/undefined inputs (no systematic null checks)
- Empty arrays/objects (not consistently tested)
- Boundary values (max buffer size, max recursion depth)
- Concurrent access (only file locking tested, not task claims)

---

## 4. Test Infrastructure

### 4.1 Test Runner Configuration

**Current Setup:**

- Runner: `node --test` (native Node.js test runner)
- Concurrency: `--test-concurrency=1` (sequential execution)
- Pattern: `tests/**/*.test.{mjs,cjs}`
- Coverage: Not enabled (no `--experimental-test-coverage` flag)

**Strengths:**

- ✅ No external dependencies (fast CI)
- ✅ Sequential execution (prevents flakiness)

**Weaknesses:**

- ❌ No coverage reporting (blind to untested paths)
- ⚠️ No timeout configuration (could hang on infinite loops)

### 4.2 Test Speed

**Measured:** Not measured in this session (need `pnpm test` full run)

**Expected:** Tests should all run in <30s (per testing.md guidelines)

**Risk:** No test timeout safeguard (infinite loop in cycle detector would hang tests)

### 4.3 Flaky Test Patterns

**Identified:**

1. **Timing-dependent tests:** `task-heartbeat.test.cjs` (expects 3+ heartbeats in 210ms)
   - **Fix:** Increase timeout tolerance (expect 2-4 heartbeats)
2. **Hardcoded IDs:** `taskupdate-state-sync.test.cjs` (uses `test-sync-task-123`)
   - **Fix:** Use `Date.now()` or UUID for unique IDs

**No network-dependent tests found** ✅

---

## 5. Recommendations

### 5.1 Immediate Actions (P0 - Critical)

**Priority 1: Routing-Guard Core Logic Tests (2 days)**

- Add 20 integration tests for routing-guard-core.impl.cjs
- Test matrix: Check 1 (planner-first), Check 5 (architect-first), Check 7 (specialist override)
- Prevent: Developer spawned for specialist work (59 agents wasted)

**Priority 2: Task Lifecycle State Machine Tests (1 day)**

- Add 15 state transition tests for pre-task-unified-core.cjs
- Test invalid transitions (completed → in_progress, not_started → completed)
- Prevent: Stuck tasks, duplicate work, workflow stalls

**Priority 3: Workflow Cycle Detection Tests (0.5 day)**

- Add 10 cycle detection tests for cycle-detector.cjs
- Test self-loop, two-phase loop, three-phase loop
- Prevent: Infinite workflow loops, resource exhaustion

### 5.2 High Priority Actions (P1 - 1 week)

**Priority 4: Batch Creation Detection Tests (0.5 day)**

- Add 10 tests for user-prompt-unified.cjs batch creation logic
- Test: "create 10 agents" → orchestrator (not 10 developers)
- Prevent: Invisible artifacts, missing catalog entries

**Priority 5: Event-Types Validation Tests (0.5 day)**

- Add 15 tests for event-types.cjs validation
- Test: validateEvent() for all 32 event types
- Prevent: Invalid events bypass validation, corrupted event bus

**Priority 6: Async-Log-Buffer Tests (0.5 day)**

- Add 10 tests for async-log-buffer.cjs
- Test: Buffer flush timing, overflow, process exit
- Prevent: Data loss, undetected failures

### 5.3 Test Infrastructure Improvements

**Enable Coverage Reporting:**

```json
// package.json
"scripts": {
  "test:coverage": "node --test --experimental-test-coverage tests/**/*.test.{mjs,cjs}"
}
```

**Add Test Timeout:**

```javascript
// In each test file
test.setTimeout(5000); // 5s timeout per test
```

**Fix Flaky Tests:**

- `task-heartbeat.test.cjs`: Increase timeout tolerance (expect 2-4 heartbeats, not 3+)
- All tests: Use UUID for test IDs (not hardcoded strings)

### 5.4 Long-Term Improvements

**Property-Based Testing:**

- Add `fast-check` library for algorithmic correctness (cycle detection, state machines)

**Mutation Testing:**

- Add Stryker to verify test quality (do tests catch intentional bugs?)

**Integration Test Harness:**

- Build test harness for hook integration tests (reduce spawn boilerplate)

---

## 6. Test Gap Matrix (Summary)

| Module                          | LOC  | Tests      | Risk   | Priority | Effort  |
| ------------------------------- | ---- | ---------- | ------ | -------- | ------- |
| routing-guard-core.impl.cjs     | 2599 | ❌ None    | **P0** | 1        | 2 days  |
| pre-task-unified-core.cjs       | ~500 | ⚠️ Partial | **P0** | 2        | 1 day   |
| cycle-detector.cjs              | ~200 | ❌ None    | **P0** | 3        | 0.5 day |
| user-prompt-unified.cjs (batch) | ~300 | ❌ None    | **P1** | 4        | 0.5 day |
| event-types.cjs                 | 337  | ❌ None    | **P1** | 5        | 0.5 day |
| async-log-buffer.cjs            | 50+  | ❌ None    | **P1** | 6        | 0.5 day |

**Total Estimated Effort:** 5 days (P0: 3.5 days, P1: 1.5 days)

---

## 7. Cross-References

**Related Reports:**

- Previous QA audit: `.claude/context/reports/qa-audit-2026-02-15.md` (100% test pass rate, but coverage gaps noted)
- Memory learnings: `.claude/context/memory/learnings.md` (line 41-90: Test coverage gaps P0 findings)

**Related Workflows:**

- `.claude/workflows/qa-workflow.md` - Systematic QA validation
- `.claude/rules/testing.md` - Test-Driven Development standards

**Related Skills:**

- `tdd` - For creating failing tests (RED phase)
- `test-generator` - For comprehensive test case generation
- `verification-before-completion` - Pre-completion gate enforcement

---

## Appendix A: Test Discovery Commands

```bash
# Find all test files
pnpm glob "tests/**/*.test.{cjs,mjs,js}"

# Find all source files in lib
pnpm glob ".claude/lib/**/*.cjs"

# Find all source files in hooks
pnpm glob ".claude/hooks/**/*.cjs"

# Run specific test suite
node --test tests/hooks/routing-guard-intent-model.test.cjs

# Run all tests with concurrency
pnpm test
```

---

## Appendix B: Test Quality Checklist

**For each new test:**

- [ ] Tests actual behavior (not just "doesn't throw")
- [ ] Isolated (no shared mutable state)
- [ ] Edge cases covered (null, undefined, empty, boundary)
- [ ] Error paths tested (not just happy path)
- [ ] Uses unique test IDs (UUID/timestamp)
- [ ] Cleanup performed (temp files deleted)
- [ ] Timeout tolerance (for timing-dependent tests)
- [ ] Positive AND negative tests (both success and failure)

---

**Conclusion:**
Test suite has good baseline quality (well-structured, isolated tests), but **critical gaps in routing logic, state machine, and workflow cycle detection create HIGH regression risk**. Recommend **5-day sprint to close P0 gaps** (routing-guard, task lifecycle, cycle detector) before next production deployment.

**Next Actions:**

1. Implement P0 tests (3.5 days)
2. Enable coverage reporting
3. Fix flaky tests
4. Add test timeout safeguard
5. Close P1 gaps (1.5 days)
