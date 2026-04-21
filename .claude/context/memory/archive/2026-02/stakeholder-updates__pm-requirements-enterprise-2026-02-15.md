<!-- Agent: pm | Task: #1 | Session: 2026-02-15 -->

# Product Requirements: Enterprise Audit Findings Remediation

**Version**: 1.0
**Author**: PM Agent
**Date**: 2026-02-15
**Status**: Draft

---

## Executive Summary

The enterprise QA audit revealed 15 critical/high/medium findings across routing logic, task lifecycle management, and memory injection systems. While the framework shows 100% test pass rate (213/213) and 0 lint errors, critical code paths remain untested, creating **HIGH regression risk** for production deployments. This PRD addresses all audit findings with prioritized user stories, acceptance criteria, and implementation phases.

---

## Problem Statement

### The Core Issue

**Agent Studio has untested critical paths that mask serious regression risks despite appearing healthy on surface metrics.**

The framework demonstrates excellent metrics (100% test pass, 0 lint errors, strong CI/CD), yet critical business logic—specialist routing enforcement, task state transitions, workflow loop detection—lacks test coverage. This creates a **false confidence scenario** where metrics look perfect but production failures remain undetected until user impact.

### User Impact

**For Framework Operators:**
- **Misrouting**: Developer spawned instead of specialist → inferior results, user frustration
- **Task Corruption**: Tasks stuck in progress, duplicate work, workflow stalls
- **System Hangs**: Workflow loops never exit → session crashes, resource exhaustion

**For Framework Contributors:**
- **Hidden Regressions**: Code changes break untested paths, discovered only in production
- **Technical Debt**: Growing complexity without safety nets
- **False Security**: Green CI gives false confidence

### Current Behavior

1. Tests pass (213/213) ✅
2. Lint passes (0 errors) ✅
3. CI passes (all workflows green) ✅
4. **BUT:** Specialist misrouting undetected, task state bugs undetected, infinite loops undetected ❌

---

## Evidence

### Audit Findings (QA Report 2026-02-15)

**Critical Gaps:**
- **routing-guard.cjs** (2599 LOC → modular): No tests for Check 7 (specialist override), Check 5 (architect-first), Check 1 (planner-first)
- **task-lifecycle-state.cjs**: No state transition tests (not_started → in_progress → completed/blocked)
- **workflow/cycle-detector.cjs**: No infinite loop detection tests
- **user-prompt-unified.cjs** (2155 LOC): No batch creation detection tests
- **spawn-prompt-assembler.*.cjs**: Constitution tests exist, but no memory mode validation tests

### Business Impact Metrics

From QA Report:
- **Regression Risk**: HIGH for untested routing logic
- **Impact**: User-facing (specialist misrouting), Quality (poor architecture), Edge cases (catastrophic hangs)
- **Test Coverage**: 47% routing, 40% spawn/orchestration (vs 85% code indexing, 100% planning/QA)

### Memory Learnings Evidence

From `learnings.md`:
> "99.3% test pass rate can mask critical coverage gaps (routing logic, loop detection untested)"

> "Pattern: Test Coverage Can Mask Critical Gaps - 100% pass rate (213/213 tests) + 0 lint errors = looks healthy, but critical paths untested"

---

## Key Hypothesis

**We believe that adding 95 integration tests for critical untested paths will reduce production regression risk from HIGH to LOW.**

**We'll know we're right when:**
1. **Specialist misrouting rate** drops to <1% (currently unmeasured)
2. **Task state corruption incidents** drop to 0 (currently unmeasured, user reports exist)
3. **Workflow loop incidents** drop to 0 (rare but catastrophic)
4. **CI regression detection** increases from ~60% to 95%+ for critical paths

---

## What We're NOT Building

- New features (this is remediation only)
- Performance optimization (tests may add 2-3 min to CI, acceptable)
- UI/UX changes
- Documentation overhaul (only test-related docs updated)
- Property-based testing (P2, deferred to future iteration)

---

## Success Metrics

| Metric | Baseline | Target | How Measured |
|--------|----------|--------|--------------|
| **Critical path test coverage** | 0% (routing, task lifecycle, loop detection) | 100% | Test count per critical module |
| **Total test count** | 213 tests | 308+ tests (+95 tests minimum) | `pnpm test` output |
| **Specialist misrouting rate** | Unknown (no metrics) | <1% | New routing quality metric in CI |
| **Task state corruption incidents** | Unknown (user reports) | 0 incidents/month | Task lifecycle metrics |
| **Workflow loop incidents** | 0 reported (rare) | 0 incidents | Cycle detector metrics |
| **CI execution time** | ~4 min | <7 min (+3 min acceptable) | GitHub Actions duration |
| **Regression detection rate** | ~60% (estimated) | 95%+ | Calculated: caught/(caught+escaped) |

---

## Core Capabilities (MoSCoW)

### MUST (MVP Blockers)

| Priority | Capability | Rationale |
|----------|-----------|-----------|
| Must | **Routing-guard integration tests** (20 tests) | Prevents specialist misrouting, planner-first bypass, security gate failures |
| Must | **Task lifecycle state tests** (15 tests) | Prevents task corruption, duplicate work, workflow stalls |
| Must | **Workflow cycle detection tests** (10 tests) | Prevents infinite loops, system hangs, catastrophic failures |
| Must | **Test execution in CI** | Tests must run automatically on every PR |

### SHOULD (High Value)

| Priority | Capability | Rationale |
|----------|-----------|-----------|
| Should | **Batch creation detection tests** (12 tests) | Prevents invisible artifacts, catalog/routing failures |
| Should | **Spawn-prompt memory injection tests** (18 tests) | Prevents agents missing critical context, inconsistent behavior |
| Should | **Routing-table disambiguation tests** (10 tests) | Prevents ambiguous intent misrouting |
| Should | **Routing quality metrics** | Enables continuous monitoring of routing behavior |

### COULD (Nice to Have)

| Priority | Capability | Rationale |
|----------|-----------|-----------|
| Could | **Integration boundary tests** (20+ tests) | End-to-end pipeline validation |
| Could | **TDD enforcement hook** | Pre-commit test requirement |
| Could | **Property-based routing tests** | Advanced invariant testing with fast-check |

### WON'T (Explicitly Excluded)

| Priority | Capability | Rationale |
|----------|-----------|-----------|
| Won't | **Legacy code refactor** | Focus on test coverage first, refactor later |
| Won't | **Test framework migration** | Node.js native runner works well, no migration needed |
| Won't | **100% code coverage** | Diminishing returns, focus on critical paths |
| Won't | **Performance optimization** | Tests may slow CI, acceptable trade-off for safety |

---

## Users & Context

### Primary User: Framework Developer

**Current Behavior:**
- Developer makes code changes → CI passes (green) → Deploys → Production bug discovered → User impact → Hotfix cycle

**Trigger:**
- Code change in routing logic, task lifecycle, or workflow orchestration

**Success State:**
- Developer makes code changes → CI catches regression (tests fail) → Fix before merge → No production impact

**Job to Be Done:**
"When I change critical framework code, I want regression tests to catch bugs before production, so I can ship confidently without user impact."

### Secondary User: QA Engineer

**Current Behavior:**
- QA runs audit → Finds gaps → Reports findings → Waits for developer to add tests

**Success State:**
- QA runs audit → Test coverage report shows 95%+ for critical paths → Audit focuses on edge cases, not missing coverage

**Job to Be Done:**
"When I audit the framework, I want critical paths to be well-tested, so I can focus on edge cases and quality improvements instead of basic coverage gaps."

### Tertiary User: Framework Operator (End User)

**Current Behavior:**
- User requests feature → Router misroutes to developer → Inferior result → User frustrated → Reports issue

**Success State:**
- User requests feature → Router correctly routes to specialist → High-quality result → User satisfied

**Job to Be Done:**
"When I request framework actions, I want correct routing and stable task management, so my work completes reliably without manual intervention."

---

## Solution Detail

### MVP Scope

**Phase 1: Critical Foundation (P0)**
- Add routing-guard integration tests (20 tests)
- Add task lifecycle state tests (15 tests)
- Add workflow cycle detection tests (10 tests)
- **Total: 45 tests, 3.5 days**

**Phase 2: High Priority (P1)**
- Add batch creation detection tests (12 tests)
- Add spawn-prompt memory injection tests (18 tests)
- Add routing-table disambiguation tests (10 tests)
- **Total: 40 tests, 4 days**

**Phase 3: Metrics & Monitoring (P1)**
- Add routing quality metrics to CI
- Add task lifecycle metrics
- Add workflow loop detection metrics
- **Total: 3 metrics, 2 days**

**Phase 4: Nice to Have (P2 - Optional)**
- Add integration boundary tests (20+ tests)
- Add TDD enforcement pre-commit hook
- Add property-based routing tests
- **Total: 30+ tests, 4 days**

### Test Coverage Target

| Module | Current Tests | Target Tests | Gap | Priority |
|--------|---------------|--------------|-----|----------|
| routing-guard.cjs | 0 | 20 | +20 | P0 |
| task-lifecycle-state.cjs | 0 | 15 | +15 | P0 |
| workflow/cycle-detector.cjs | 0 | 10 | +10 | P0 |
| user-prompt-unified.cjs | 0 | 12 | +12 | P1 |
| spawn-prompt-assembler.*.cjs | 4 (partial) | 18 | +14 | P1 |
| routing-table-*.cjs | 0 | 10 | +10 | P1 |
| **TOTAL** | **4** | **85** | **+81** | **P0-P1** |

### Edge Cases & Scenarios

**Routing-Guard Tests:**
- ✅ Specialist override enforced (Check 7): "update docs" → technical-writer (NOT developer)
- ✅ Planner-first enforced (Check 1): HIGH complexity → planner spawned first
- ✅ Security review enforced (Check 2): auth changes → security-architect included
- ✅ Architect-first for high-risk specialists (Check 5): code-simplifier → architect spawned first

**Task Lifecycle Tests:**
- ✅ Valid state transitions: not_started → in_progress → completed
- ✅ Invalid transitions rejected: completed → in_progress (should fail)
- ✅ Concurrent claim prevention: Two agents claim same task (second fails)
- ✅ Ownership transfer validation: Only owner can update task

**Workflow Cycle Tests:**
- ✅ Intentional cycle detection: Phase A → Phase B → Phase A (should detect)
- ✅ Max phase depth guard: 20 phases max (should reject deeper)
- ✅ Linear workflow passes: Phase 1 → Phase 2 → Phase 3 (no cycle)

---

## Technical Approach

### Feasibility: HIGH

**Dependencies:**
- Node.js native test runner (already in use)
- Existing test infrastructure (`tests/` directory structure)
- No new testing frameworks required

**Integration Points:**
- `tests/lib/routing/` - Routing-guard tests
- `tests/lib/task-management/` - Task lifecycle tests
- `tests/lib/workflow/` - Cycle detection tests
- `.github/workflows/` - CI integration (already configured)

**Test Pattern (TDD Cycle):**
1. **RED**: Write failing test for expected behavior
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Clean up implementation
4. **COMMIT**: Commit with conventional message

### Architecture Notes

**Test Organization:**
- Mirror production structure: `tests/` mirrors `.claude/lib/`
- Use descriptive test names: `test('should reject invalid state transition')`
- Isolate tests: No shared state, no execution order dependencies
- Use real data structures: Actual task objects, agent definitions, routing intents

**Mock Strategy:**
- **Minimal mocking**: Use real modules where possible
- **Mock external I/O**: File system, network calls, spawn processes
- **Mock time-sensitive**: Use fake timers for retry logic, timeouts

**Assertion Strategy:**
- Use `assert.strictEqual()` for exact matches
- Use `assert.ok()` for boolean checks
- Use `assert.throws()` for error validation
- Use `assert.deepStrictEqual()` for object comparisons

---

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Plan Link |
|---|-------|-------------|--------|----------|---------|-----------|
| 1 | **P0 Foundation** | Add critical path tests (routing, task lifecycle, cycle detection) | pending | No | - | - |
| 2 | **P1 High Priority** | Add batch creation, memory injection, disambiguation tests | pending | No | 1 | - |
| 3 | **P1 Metrics** | Add routing quality, task lifecycle, workflow loop metrics to CI | pending | Yes | 1,2 | - |
| 4 | **P2 Optional** | Add integration boundary tests, TDD enforcement, property-based tests | pending | Yes | 1,2,3 | - |
| 5 | **Validation** | Verify all tests pass, CI green, metrics functional | pending | No | 1,2,3,4 | - |

### Phase 1: P0 Foundation (Week 1)

**Deliverables:**
- 20 routing-guard integration tests
- 15 task lifecycle state tests
- 10 workflow cycle detection tests
- All tests pass in CI

**Estimated Effort:** 3.5 days (2 days routing, 1 day task, 0.5 day cycle)

**Success Criteria:**
- [ ] All 45 tests pass (100% pass rate)
- [ ] No lint errors introduced
- [ ] CI execution time <6 minutes (+2 min from baseline)
- [ ] Test coverage: routing 100%, task lifecycle 100%, cycle detection 100%

### Phase 2: P1 High Priority (Week 2)

**Deliverables:**
- 12 batch creation detection tests
- 18 spawn-prompt memory injection tests
- 10 routing-table disambiguation tests
- All tests pass in CI

**Estimated Effort:** 4 days (1 day batch, 1.5 days memory, 0.5 day disambiguation, 1 day buffer)

**Success Criteria:**
- [ ] All 40 tests pass (100% pass rate)
- [ ] Total tests: 298 (213 baseline + 45 P0 + 40 P1)
- [ ] CI execution time <7 minutes
- [ ] No false positives (tests fail only on real regressions)

### Phase 3: P1 Metrics (Week 2-3)

**Deliverables:**
- Routing quality metrics (specialist override rate, planner spawn rate)
- Task lifecycle metrics (state corruption rate, claim conflicts)
- Workflow loop detection metrics (cycle detection rate)

**Estimated Effort:** 2 days

**Success Criteria:**
- [ ] Metrics tracked in CI (pnpm metrics:ci includes new metrics)
- [ ] Baseline data collected (1 week of data)
- [ ] Metrics dashboard updated
- [ ] Alert thresholds defined

### Phase 4: P2 Optional (Week 3+)

**Deliverables:**
- 20+ integration boundary tests (optional)
- TDD enforcement pre-commit hook (optional)
- Property-based routing tests (optional)

**Estimated Effort:** 4 days

**Success Criteria:**
- [ ] Integration tests validate end-to-end pipelines
- [ ] Pre-commit hook enforces TDD discipline
- [ ] Property-based tests discover edge cases

---

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| **Test framework** | Node.js native test runner | Jest, Mocha, Vitest | Already in use, fast, no dependencies, works well |
| **Test organization** | Mirror lib structure (`tests/` mirrors `.claude/lib/`) | Colocated tests, single test directory | Existing pattern, clear organization, easy navigation |
| **Mock strategy** | Minimal mocking (real modules where possible) | Heavy mocking, full isolation | Prefer integration tests, real modules catch more bugs |
| **Test execution** | Sequential (`--test-concurrency=1`) | Parallel execution | Prevents race conditions, current approach works |
| **CI integration** | Add to existing workflows | New dedicated test workflow | Leverage existing GitHub Actions, no new workflows needed |
| **Metrics location** | CI gate (`pnpm metrics:ci`) | Separate monitoring system | Existing metrics infrastructure, automatic enforcement |
| **Phase priority** | P0 (routing, task, cycle) first | Breadth-first (all modules) | Highest risk first, immediate regression protection |
| **Test count target** | 95 tests minimum (P0+P1) | 100% code coverage | Focus on critical paths, diminishing returns on full coverage |

---

## Research Summary

### Market Context

**Industry Standards:**
- **Kent Beck (TDD)**: "Test the behavior, not the implementation"
- **Martin Fowler**: "Tests should give confidence, not create busy work"
- **Google Testing Blog**: "Focus on integration boundaries, not internals"

**Test Coverage Benchmarks:**
- **Critical systems**: 95%+ coverage on critical paths (financial, healthcare)
- **Framework code**: 80%+ coverage typical, but critical paths need 100%
- **CI execution time**: <10 minutes acceptable for comprehensive suites

### Technical Context

**Existing Test Infrastructure:**
- Node.js native test runner (`node --test`)
- 213 tests passing (100% pass rate)
- 131 test files across 13 categories
- CI execution: ~4 minutes currently
- Test organization: Mirrors lib structure

**Test Quality Patterns:**
- Clear test descriptions using `describe()` and `it()` blocks
- Good assertions and edge case coverage
- Isolated tests (no shared state)
- Real data structures (not heavy mocking)

**Feasibility Assessment:** HIGH
- No new tools needed (Node.js native runner)
- Clear test patterns established
- CI infrastructure ready
- Team familiar with test patterns

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **CI execution time exceeds 10 min** | Medium | Low | Parallelize tests, optimize slow tests, acceptable trade-off |
| **False positives in new tests** | Low | Medium | Review tests thoroughly, use real scenarios, iterate on feedback |
| **Test maintenance burden** | Medium | Medium | Follow DRY, use test helpers, keep tests simple |
| **Developer resistance to TDD** | Low | Low | TDD optional in Phase 4, focus on test value first |
| **Tests don't catch real regressions** | Low | High | Use integration tests, test real scenarios, validate with production cases |
| **Phase 1 timeline slip** | Medium | Medium | Buffer time included, prioritize ruthlessly, P2 is optional |

---

## Open Questions

- [ ] Should we enforce TDD for all new code (pre-commit hook)? **Decision:** Phase 4 (P2), not blocking
- [ ] Should we add property-based tests for routing invariants? **Decision:** Phase 4 (P2), nice to have
- [ ] What's acceptable CI execution time? **Decision:** <10 min (7 min target for P0+P1)
- [ ] Should we add integration boundary tests in Phase 1? **Decision:** Phase 4 (P2), focus on critical paths first
- [ ] How do we handle flaky tests? **Decision:** Isolate tests, use fake timers, retry infrastructure tests only

---

## User Stories

### Story 1: Routing-Guard Integration Tests (P0)

**As a** framework developer
**I want** comprehensive tests for routing-guard.cjs
**So that** specialist misrouting and planner-first bypass are caught before production

**Acceptance Criteria:**
- [ ] 20 tests added for routing-guard.cjs checks
- [ ] Check 1 (planner-first) tested: HIGH complexity → planner spawned first
- [ ] Check 2 (security review) tested: auth changes → security-architect included
- [ ] Check 5 (architect-first) tested: high-risk specialists → architect spawned first
- [ ] Check 7 (specialist override) tested: "update docs" → technical-writer (NOT developer)
- [ ] All tests pass in CI (100% pass rate)
- [ ] No false positives (tests fail only on real regressions)
- [ ] Test execution time: <1.5 minutes

**Definition of Done:**
- [ ] Tests written following TDD cycle (RED → GREEN → REFACTOR)
- [ ] All tests pass locally (`pnpm test`)
- [ ] All tests pass in CI (GitHub Actions)
- [ ] Lint passes (`pnpm lint:fix`)
- [ ] Format passes (`pnpm format`)
- [ ] Tests added to `tests/lib/routing/routing-guard.test.cjs`
- [ ] Test coverage report shows 100% for critical routing-guard checks

**Risk Assessment:** HIGH impact (user-facing), MEDIUM likelihood (complex routing table)

**Dependencies:** None (can start immediately)

---

### Story 2: Task Lifecycle State Tests (P0)

**As a** framework developer
**I want** comprehensive tests for task-lifecycle-state.cjs
**So that** task state corruption and duplicate claims are caught before production

**Acceptance Criteria:**
- [ ] 15 tests added for task-lifecycle-state.cjs
- [ ] Valid state transitions tested: not_started → in_progress → completed
- [ ] Invalid transitions rejected: completed → in_progress (should throw error)
- [ ] Concurrent claim prevention tested: Two agents claim same task (second fails)
- [ ] Ownership transfer validated: Only owner can update task status
- [ ] All tests pass in CI (100% pass rate)
- [ ] Test execution time: <1 minute

**Definition of Done:**
- [ ] Tests written following TDD cycle (RED → GREEN → REFACTOR)
- [ ] All tests pass locally and in CI
- [ ] Lint and format pass
- [ ] Tests added to `tests/lib/task-management/task-lifecycle-state.test.cjs`
- [ ] Test coverage report shows 100% for state transitions

**Risk Assessment:** HIGH impact (workflow stalls), HIGH likelihood (concurrent agents)

**Dependencies:** None (can start immediately)

---

### Story 3: Workflow Cycle Detection Tests (P0)

**As a** framework developer
**I want** comprehensive tests for workflow/cycle-detector.cjs
**So that** infinite workflow loops are caught before causing system hangs

**Acceptance Criteria:**
- [ ] 10 tests added for workflow/cycle-detector.cjs
- [ ] Intentional cycle detection tested: Phase A → Phase B → Phase A (should detect)
- [ ] Max phase depth guard tested: 20 phases max (should reject deeper)
- [ ] Linear workflow passes: Phase 1 → Phase 2 → Phase 3 (no cycle, should pass)
- [ ] All tests pass in CI (100% pass rate)
- [ ] Test execution time: <30 seconds

**Definition of Done:**
- [ ] Tests written following TDD cycle (RED → GREEN → REFACTOR)
- [ ] All tests pass locally and in CI
- [ ] Lint and format pass
- [ ] Tests added to `tests/lib/workflow/cycle-detector.test.cjs`
- [ ] Test coverage report shows 100% for cycle detection

**Risk Assessment:** HIGH impact (catastrophic hang), LOW likelihood (rare but severe)

**Dependencies:** None (can start immediately)

---

### Story 4: Batch Creation Detection Tests (P1)

**As a** framework developer
**I want** comprehensive tests for batch creation detection in user-prompt-unified.cjs
**So that** batch creation requests route to orchestrators (not direct developers)

**Acceptance Criteria:**
- [ ] 12 tests added for batch creation detection
- [ ] "create 10 agents" → orchestrator spawned (NOT 10 developers)
- [ ] "create N skills" → orchestrator spawned
- [ ] Single artifact creation → direct creator (no orchestrator needed)
- [ ] All tests pass in CI (100% pass rate)
- [ ] Test execution time: <1 minute

**Definition of Done:**
- [ ] Tests written following TDD cycle (RED → GREEN → REFACTOR)
- [ ] All tests pass locally and in CI
- [ ] Lint and format pass
- [ ] Tests added to `tests/lib/routing/user-prompt-unified.test.cjs`
- [ ] Test coverage report shows batch creation detection covered

**Risk Assessment:** MEDIUM impact (invisible artifacts), MEDIUM likelihood (documented IRON LAW but no tests)

**Dependencies:** Story 1 complete (routing-guard tests provide foundation)

---

### Story 5: Spawn-Prompt Memory Injection Tests (P1)

**As a** framework developer
**I want** comprehensive tests for spawn-prompt-assembler memory injection
**So that** agents receive critical context (constitution, behaviour, learnings)

**Acceptance Criteria:**
- [ ] 18 tests added for spawn-prompt-assembler memory injection
- [ ] Constitution loading tested: Spawn prompt includes constitution content
- [ ] Behaviour loading tested: Spawn prompt includes behaviour content
- [ ] Memory context injection tested: STM/MTM/LTM tiers injected correctly
- [ ] Semantic memory filtering tested: Relevant memories selected
- [ ] All tests pass in CI (100% pass rate)
- [ ] Test execution time: <1.5 minutes

**Definition of Done:**
- [ ] Tests written following TDD cycle (RED → GREEN → REFACTOR)
- [ ] All tests pass locally and in CI
- [ ] Lint and format pass
- [ ] Tests added to `tests/lib/spawn/spawn-prompt-assembler.test.cjs`
- [ ] Test coverage report shows memory injection covered

**Risk Assessment:** MEDIUM impact (context loss), MEDIUM likelihood (complex memory tiers)

**Dependencies:** Story 1 complete (routing provides agent selection foundation)

---

### Story 6: Routing-Table Disambiguation Tests (P1)

**As a** framework developer
**I want** comprehensive tests for routing-table disambiguation
**So that** ambiguous intents route to correct specialists (not developer)

**Acceptance Criteria:**
- [ ] 10 tests added for routing-table disambiguation
- [ ] "review code" → code-reviewer (NOT developer)
- [ ] "update docs" → technical-writer (NOT developer)
- [ ] "run tests" → qa (NOT developer)
- [ ] Intent keyword mapping tested: Keywords correctly map to agents
- [ ] All tests pass in CI (100% pass rate)
- [ ] Test execution time: <30 seconds

**Definition of Done:**
- [ ] Tests written following TDD cycle (RED → GREEN → REFACTOR)
- [ ] All tests pass locally and in CI
- [ ] Lint and format pass
- [ ] Tests added to `tests/lib/routing/routing-table.test.cjs`
- [ ] Test coverage report shows disambiguation covered

**Risk Assessment:** MEDIUM impact (specialist misrouting), LOW likelihood (well-documented patterns)

**Dependencies:** Story 1 complete (routing-guard tests provide specialist enforcement foundation)

---

### Story 7: Routing Quality Metrics (P1)

**As a** QA engineer
**I want** continuous monitoring of routing quality metrics
**So that** I can detect routing regressions before user impact

**Acceptance Criteria:**
- [ ] Specialist override rate metric added (should be <1%)
- [ ] Planner spawn rate metric added (should be 100% for HIGH/EPIC)
- [ ] Security-architect inclusion rate metric added (should be 100% for auth changes)
- [ ] Metrics tracked in `pnpm metrics:ci`
- [ ] Metrics dashboard updated
- [ ] Alert thresholds defined and enforced

**Definition of Done:**
- [ ] Metrics collection code added to CI
- [ ] Baseline data collected (1 week of data)
- [ ] Metrics dashboard shows new metrics
- [ ] Alert system configured (if thresholds exceeded)
- [ ] Documentation updated (metrics explained in @METRICS.md)

**Risk Assessment:** LOW impact (monitoring only), LOW likelihood (metrics infrastructure exists)

**Dependencies:** Stories 1-6 complete (routing and task tests provide baseline)

---

### Story 8: Task Lifecycle Metrics (P1)

**As a** QA engineer
**I want** continuous monitoring of task lifecycle metrics
**So that** I can detect task state corruption before workflow stalls

**Acceptance Criteria:**
- [ ] Task state corruption rate metric added (should be 0%)
- [ ] Claim conflict rate metric added (should be 0%)
- [ ] Task completion rate metric added (should be >95%)
- [ ] Metrics tracked in `pnpm metrics:ci`
- [ ] Metrics dashboard updated
- [ ] Alert thresholds defined and enforced

**Definition of Done:**
- [ ] Metrics collection code added to CI
- [ ] Baseline data collected (1 week of data)
- [ ] Metrics dashboard shows new metrics
- [ ] Alert system configured (if thresholds exceeded)
- [ ] Documentation updated (metrics explained in @METRICS.md)

**Risk Assessment:** LOW impact (monitoring only), LOW likelihood (metrics infrastructure exists)

**Dependencies:** Story 2 complete (task lifecycle tests provide baseline)

---

### Story 9: Workflow Loop Detection Metrics (P1)

**As a** QA engineer
**I want** continuous monitoring of workflow loop detection metrics
**So that** I can detect infinite loops before system hangs

**Acceptance Criteria:**
- [ ] Cycle detection rate metric added (should be 0% for production workflows)
- [ ] Max phase depth violations metric added (should be 0%)
- [ ] Workflow completion rate metric added (should be >95%)
- [ ] Metrics tracked in `pnpm metrics:ci`
- [ ] Metrics dashboard updated
- [ ] Alert thresholds defined and enforced

**Definition of Done:**
- [ ] Metrics collection code added to CI
- [ ] Baseline data collected (1 week of data)
- [ ] Metrics dashboard shows new metrics
- [ ] Alert system configured (if thresholds exceeded)
- [ ] Documentation updated (metrics explained in @METRICS.md)

**Risk Assessment:** LOW impact (monitoring only), LOW likelihood (metrics infrastructure exists)

**Dependencies:** Story 3 complete (cycle detection tests provide baseline)

---

## Tracking & Reporting

### Sprint Cadence

- **Sprint Length:** 2 weeks
- **Sprint 1 (Week 1-2):** Phase 1 (P0 Foundation) + Phase 2 (P1 High Priority)
- **Sprint 2 (Week 3-4):** Phase 3 (P1 Metrics) + Phase 4 (P2 Optional)

### Status Reporting

**Weekly Updates:**
- Test count progress (current/target)
- CI execution time tracking
- Blocker status (if any)
- Risk mitigation updates

**Completion Criteria:**
- [ ] All P0 tests complete (45 tests)
- [ ] All P1 tests complete (40 tests)
- [ ] All P1 metrics complete (3 metrics)
- [ ] CI execution time <7 minutes
- [ ] 100% test pass rate maintained
- [ ] 0 lint errors maintained

### Rollout Strategy

**Phase 1 (P0):** Merge as soon as tests pass (no feature flag needed)
**Phase 2 (P1):** Merge as soon as tests pass (no feature flag needed)
**Phase 3 (P1):** Merge metrics incrementally (non-breaking)
**Phase 4 (P2):** Merge TDD hook with opt-out mechanism (gradual adoption)

---

## Appendix: Findings Reference

### CRITICAL (P0)

1. **CRIT-001**: Routing-guard.cjs integration tests missing (2599 LOC split into modular)
2. **CRIT-002**: Task lifecycle state machine untested (task-lifecycle-state.cjs, pre-task-unified-core.cjs)
3. **CRIT-003**: Workflow cycle detection untested (workflow/cycle-detector.cjs)

### HIGH (P1)

4. **HIGH-001**: Batch creation detection untested (user-prompt-unified.cjs)
5. **HIGH-002**: Spawn-prompt-assembler memory injection partially tested (constitution tests exist, memory mode validation missing)
6. **HIGH-003**: Routing-table disambiguation untested (intent classification)

### MEDIUM (P2)

7. **MED-001**: Integration boundary tests missing (routing → spawn → hook → memory pipeline)
8. **MED-002**: TDD enforcement not automated (pre-commit hook missing)
9. **MED-003**: Property-based routing tests missing (invariant testing)
10. **MED-004**: Task lifecycle metrics missing (state corruption rate, claim conflicts)
11. **MED-005**: Routing quality metrics missing (specialist override rate, planner spawn rate)

---

**Report Generated:** 2026-02-15
**Author:** PM Agent
**Task:** #1
**Next Steps:** Share with stakeholders, gather feedback, assign to Planner for implementation planning
