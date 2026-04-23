<!-- Agent: qa | Task: #4 | Session: 2026-02-16 -->

# QA Audit Report — agent-studio

**Date**: 2026-02-16
**Auditor**: QA Agent (Task #4)
**Scope**: `tests/`, `.claude/lib/`, `.claude/hooks/`, `package.json`

---

## Executive Summary

The codebase has **497 active test files** across a large framework with strong coverage in the hook layer and memory subsystem, but significant gaps in critical lib modules. One test is actively failing due to a missing fixture directory. Six `echo`-stub test scripts exist in `package.json` that provide no test value. The routing and workflow engine modules — among the most critical in the framework — have no direct unit tests at the lib layer.

---

## 1. Test Infrastructure

### 1.1 Test Runner

- **Runner**: Node.js native test runner (`node --test`)
- **Concurrency**: `--test-concurrency=1` (sequential — avoids race conditions)
- **Coverage reporting**: `--experimental-test-coverage` available but only wired to `test:coverage` script (not CI)
- **CI script**: `test:ci` runs all `tests/**/*.test.{mjs,cjs}` with `--test-reporter=spec`

### 1.2 Test Script Inventory

| Script               | Status    | Notes                                                 |
| -------------------- | --------- | ----------------------------------------------------- |
| `test`               | Active    | Main runner: all tests in `tests/**`                  |
| `test:framework`     | Active    | Framework-specific tests (lib + hooks)                |
| `test:code-indexing` | Active    | Code indexing subsystem                               |
| `test:memory:ci`     | Active    | Memory CI subset                                      |
| `test:ci`            | Active    | Spec reporter variant                                 |
| `test:coverage`      | Partial   | Experimental coverage, `.mjs` only                    |
| `test:hooks`         | DEAD STUB | `echo 'Hook tests archived...'` — no actual tests run |
| `test:hooks:memory`  | DEAD STUB | `echo` stub                                           |
| `test:hooks:stress`  | DEAD STUB | `echo` stub                                           |
| `test:a2a`           | DEAD STUB | `echo` stub (A2A tests archived)                      |
| `test:a2a:verbose`   | DEAD STUB | `echo` stub                                           |
| `test:a2a:ci`        | DEAD STUB | `echo` stub                                           |

**Risk**: 6 dead-stub scripts give false confidence. Any CI pipeline calling these scripts will succeed (exit 0) without running any tests.

### 1.3 Current Test Status

**Actively Failing**: `tests/code-indexing/gpu-bm25-integration-e2e.test.cjs`

```
not ok 1 - E2E: Full indexing pipeline with GPU detection + BM25
error: ENOENT: no such file or directory
  'tests/fixtures/sample-code-e2e/.claude/context/code-index/checkpoint.json'
```

Root cause: The test writes to a subdirectory of `tests/fixtures/sample-code-e2e/` but the `.claude/context/code-index/` directory does not exist. The `saveCheckpoint` function in `index-manager-files.cjs` attempts `fs.writeFile` without first creating the parent directory.

**Total Active Test Files**: 497 (not counting `.archived` files)
**Archived Test Files**: 114

---

## 2. Test Coverage Matrix

### 2.1 `.claude/lib/` Module Coverage

**Well-Covered Subsystems** (tests exist):

| Subsystem                             | Coverage Status         |
| ------------------------------------- | ----------------------- |
| `lib/memory/memory-manager`           | Tested (multiple files) |
| `lib/memory/memory-tiers`             | Tested                  |
| `lib/memory/memory-rotator`           | Tested                  |
| `lib/memory/smart-pruner`             | Tested                  |
| `lib/memory/contextual-memory`        | Tested                  |
| `lib/routing/task-lifecycle-state`    | Tested                  |
| `lib/routing/fuzzy-intent-matcher`    | Tested                  |
| `lib/routing/intent-classifier`       | Tested                  |
| `lib/routing/semantic-router`         | Tested                  |
| `lib/monitoring/flight-recorder`      | Tested                  |
| `lib/monitoring/spawn-log`            | Tested                  |
| `lib/utils/safe-json`                 | Tested (4 files)        |
| `lib/utils/file-locker`               | Tested                  |
| `lib/workflow/workflow-engine`        | Tested                  |
| `lib/workflow/workflow-state-manager` | Tested                  |
| `lib/self-healing/*`                  | Tested                  |

**Untested Critical Modules** (no test file in `tests/lib/`):

| Module                                  | Risk Level | Reason                                 |
| --------------------------------------- | ---------- | -------------------------------------- |
| `routing/routing-table`                 | CRITICAL   | Core agent routing dispatch            |
| `routing/routing-table-core-map`        | CRITICAL   | Agent intent → routing map             |
| `routing/routing-table-intent-keywords` | CRITICAL   | Keyword matching for routing decisions |
| `routing/agent-registry-loader`         | HIGH       | Loads agent registry on every spawn    |
| `routing/router-state`                  | HIGH       | Tracks router session state            |
| `routing/task-claim-ledger`             | HIGH       | Prevents task duplication              |
| `workflow/cycle-detector`               | CRITICAL   | Detects infinite loops in workflows    |
| `workflow/quality-gates`                | CRITICAL   | Blocking gates between workflow phases |
| `workflow/workflow-state-machine`       | HIGH       | State machine for workflow lifecycle   |
| `workflow/workflow-resolver`            | HIGH       | Resolves workflow definitions          |
| `workflow/state-validator`              | HIGH       | Validates workflow state transitions   |
| `workflow/conditional-executor`         | HIGH       | Conditional workflow step execution    |
| `events/event-bus`                      | HIGH       | Core event dispatch system             |
| `events/event-bus-sink`                 | HIGH       | Event persistence/draining             |
| `utils/atomic-write`                    | HIGH       | Used throughout for safe file writes   |
| `utils/enforcement-defaults`            | HIGH       | Default enforcement mode config        |
| `utils/hook-runner`                     | HIGH       | Executes hook chain                    |
| `utils/hook-logger`                     | MEDIUM     | Hook execution logging                 |
| `memory/memory-manager-core`            | HIGH       | Core memory operations                 |
| `memory/memory-sanitizer`               | HIGH       | Strips malicious memory entries        |
| `memory/memory-deduplicator`            | MEDIUM     | Prevents memory bloat                  |
| `memory/entity-extractor`               | MEDIUM     | Extracts entities from session data    |
| `clients/model-client`                  | HIGH       | LLM API client (archived from tests)   |
| `code-indexing/hybrid-lazy-indexer`     | HIGH       | Primary search indexer                 |
| `code-indexing/bm25-health`             | MEDIUM     | BM25 index health checks               |
| `validation/ci-gate-layers`             | HIGH       | CI gating logic                        |

### 2.2 `.claude/hooks/` Coverage

**Covered hooks** (tests exist in `tests/hooks/`):

- `routing-guard.cjs` — 14 test files (excellent)
- `bash-command-validator.cjs` — 3 test files
- `routing/pre-task-unified.cjs` — several test files
- `routing/post-task-unified.cjs` — several test files
- `routing/agent-registry-auto-refresh.cjs` — tested
- `validation/check-console-log.cjs` — tested
- `safety/shell-injection-validator.cjs` — tested
- `safety/windows-null-sanitizer.cjs` — tested
- `safety/spawn-prompt-validator.cjs` — tested
- `reflection/*` — most reflection hooks tested

**Untested hooks** (no corresponding test file):

| Hook                                          | Risk Level                                       |
| --------------------------------------------- | ------------------------------------------------ |
| `routing/unified-creator-guard.cjs`           | CRITICAL — blocks unauthorized artifact creation |
| `routing/pre-tool-unified.cjs`                | CRITICAL — primary safety gate for all tools     |
| `routing/pre-tool-unified.guardrails.cjs`     | HIGH                                             |
| `routing/spawn-prompt-assembler.cjs`          | HIGH — builds all agent prompts                  |
| `routing/routing-guard-core.cjs`              | HIGH — core routing enforcement                  |
| `safety/unified-pre-write-hook.cjs`           | HIGH — 11 write safety checks                    |
| `validation/pre-completion-validation.cjs`    | HIGH — completion gate                           |
| `validation/creator-compliance-validator.cjs` | HIGH                                             |
| `validation/flight-recorder-schema-gate.cjs`  | MEDIUM                                           |
| `session/post-edit-scanner.cjs`               | MEDIUM                                           |
| `workflow/post-creation-integration.cjs`      | MEDIUM                                           |
| `reflection/unified-reflection-actions.cjs`   | MEDIUM                                           |
| `memory/sync-memory-index.cjs`                | MEDIUM                                           |
| `monitoring/error-tracker.cjs`                | MEDIUM                                           |

---

## 3. Test Quality Analysis

### 3.1 Strengths

- **Routing guard coverage**: 14 test files cover routing-guard from multiple angles (planner-first, specialist override, architect gates, bash bypass, intent model). This is the most critical enforcement hook and has strong coverage.
- **Memory subsystem**: 40+ test files across memory tiers, locking, SLO metrics, concurrency, and stress testing. The memory system has some of the most thorough testing.
- **Safe-json utility**: 4 dedicated test files covering prototype pollution, structured clone, bounded sets — excellent security-critical path coverage.
- **Event bus**: 7 test files in `tests/unit/events/` covering cap, circularity, deduplication, parallelism, resilience, tracing.
- **TDD evidence**: Many test files have corresponding regression and edge-case files (e.g., `routing-guard.test.cjs` + `routing-guard-comprehensive.test.cjs` + `routing-guard-core-comprehensive.test.cjs`).

### 3.2 Weaknesses

- **No coverage for `routing-table` family**: The routing table is the core dispatch mechanism mapping user intent to agent types. Despite 14 routing-guard test files, the underlying `routing-table.cjs`, `routing-table-core-map.cjs`, `routing-table-intent-agents.cjs`, and `routing-table-intent-keywords.cjs` have no direct unit tests at the lib layer.
- **`workflow/cycle-detector` untested at lib level**: Only tested via the hook test `hooks/workflow-cycle-detector.test.cjs`. The lib module itself has no isolated unit tests for cycle detection edge cases.
- **Stale archived tests**: 114 `.archived` test files exist. Many were for modules that were moved or replaced (e.g., `clients/model-client.test.cjs.archived`, `agents/developer-agent.test.cjs.archived`). These inflate apparent test counts and may cause confusion.
- **E2E test missing fixture**: `gpu-bm25-integration-e2e.test.cjs` is actively failing because `saveCheckpoint` doesn't create the parent directory before writing. Low severity for CI since GPU is typically unavailable, but the test is unconditionally registered.
- **`unified-creator-guard.cjs` hook not directly tested**: This is a critical IRON LAW enforcement hook that blocks direct writes to creator paths. Multiple tests exist for specific scenarios (`hooks/unified-creator-guard-*.test.cjs`) but the main hook file itself has no corresponding direct test.
- **No coverage reporting in CI**: `test:coverage` uses `--experimental-test-coverage` but is not called from `test:ci` or `test:all`. Coverage numbers are not tracked or enforced.
- **Flaky risk in benchmarks**: `tests/benchmarks/` and `tests/hooks/benchmarks/` contain timing-sensitive tests. Tests measuring p95 latency thresholds can be flaky on slow CI machines.

### 3.3 Test Quality Scores by Category

| Category                   | Score | Notes                                                           |
| -------------------------- | ----- | --------------------------------------------------------------- |
| Hook layer (routing-guard) | 9/10  | Excellent, 14 test files                                        |
| Memory subsystem           | 8/10  | Deep coverage, stress + SLO tests                               |
| Utility functions          | 7/10  | Good but several untested: atomic-write, hook-runner            |
| Workflow engine            | 7/10  | Engine tested but cycle-detector, quality-gates untested at lib |
| Routing lib                | 5/10  | routing-table family completely untested at lib layer           |
| Code indexing              | 6/10  | hybrid-lazy-indexer untested, 1 E2E test actively failing       |
| Creator/evolution          | 5/10  | creator-guard hook has indirect tests only                      |
| Security-critical paths    | 7/10  | safe-json and bash-command-validator well tested                |

---

## 4. Top 10 Missing Tests (Ranked by Risk)

| Rank | Missing Test                                   | Risk     | Justification                                                                                                                                                                                         |
| ---- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `lib/routing/routing-table.test.cjs`           | CRITICAL | Core dispatch. No unit test for the primary intent→agent mapping. A bug here silently misroutes all work.                                                                                             |
| 2    | `lib/workflow/cycle-detector.test.cjs`         | CRITICAL | Infinite workflow loops are a P0 incident. Only tested via hook wrapper, missing edge cases for nested cycles.                                                                                        |
| 3    | `lib/workflow/quality-gates.test.cjs`          | CRITICAL | Blocking gates that determine phase progression. `workflow/quality-gates.test.cjs` exists in `tests/workflow/` but no `tests/lib/workflow/quality-gates.test.cjs`.                                    |
| 4    | `lib/routing/task-claim-ledger.test.cjs`       | HIGH     | Prevents duplicate task assignment. Concurrency race conditions around claim operations untested.                                                                                                     |
| 5    | `lib/utils/atomic-write.test.cjs`              | HIGH     | Used for all safe file writes across the framework. No tests for concurrent write collision, power-fail simulation, or partial-write recovery.                                                        |
| 6    | `lib/events/event-bus.test.cjs` (at lib layer) | HIGH     | `tests/unit/events/event-bus.test.cjs` exists but tests the event bus via `tests/unit/` path rather than `tests/lib/events/`. Acceptable but import path mismatch could hide module loading failures. |
| 7    | `lib/utils/hook-runner.test.cjs`               | HIGH     | Executes the hook chain. Chain-of-responsibility failure modes (hook throwing, exit code 2, timeout) untested.                                                                                        |
| 8    | `lib/memory/memory-sanitizer.test.cjs`         | HIGH     | Security-critical: strips `__proto__`, `constructor` and adversarial content from memory writes. No tests.                                                                                            |
| 9    | `lib/workflow/workflow-state-machine.test.cjs` | HIGH     | State machine transitions for workflow lifecycle — untested state machine logic risks silent state corruption.                                                                                        |
| 10   | `lib/utils/enforcement-defaults.test.cjs`      | MEDIUM   | Provides default enforcement modes (block/warn/off). Incorrect defaults silently disable security guards.                                                                                             |

---

## 5. Flaky Test Risks

| Test File                                                  | Flaky Risk | Reason                                                                                                      |
| ---------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `tests/benchmarks/hook-pool-latency.test.cjs`              | HIGH       | Measures p95 latency thresholds — timing-dependent on CPU load                                              |
| `tests/benchmarks/telemetry-hotpath-latency.test.cjs`      | HIGH       | Hot-path latency assertions can fail on slow CI                                                             |
| `tests/hooks/benchmarks/perf-gate-ci-integration.test.cjs` | HIGH       | CI timing gate — machine-dependent                                                                          |
| `tests/lib/memory/memory-tier-concurrency.test.cjs`        | MEDIUM     | Concurrent lock testing — can produce race-dependent results                                                |
| `tests/lib/memory/memory-soak-chaos.test.cjs`              | MEDIUM     | Chaos testing — nondeterministic by design                                                                  |
| `tests/code-indexing/gpu-bm25-integration-e2e.test.cjs`    | MEDIUM     | Fails with ENOENT on missing fixture dir — intermittent depending on whether fixture was previously created |

---

## 6. Stale/Dead Tests

### 6.1 Echo-Stub Scripts (No Test Value)

```
test:hooks       → echo 'Hook tests archived...'
test:hooks:memory → echo 'Hook tests archived...'
test:hooks:stress → echo 'Hook tests archived...'
test:a2a         → echo 'A2A tests archived...'
test:a2a:verbose → echo 'A2A tests archived...'
test:a2a:ci      → echo 'A2A tests archived...'
```

**Risk**: Any CI step calling these scripts will exit 0 with no test execution.

### 6.2 Archived Test Files (114 files)

Notable archived tests that may need revival or permanent deletion:

- `tests/agents/developer-agent.test.cjs.archived` — developer agent tests archived
- `tests/agents/qa-agent.test.cjs.archived` — QA agent tests archived
- `tests/clients/model-client.test.cjs.archived` — model client tests archived (but `lib/clients/model-client.cjs` is active)
- `tests/hooks/blocking-event-bus.test.cjs.archived` — potentially replaced by `tests/unit/events/event-bus.test.cjs`
- 8 `spec-0xx` tests in `tests/_archive/` — specification tests of unclear provenance

---

## 7. Known Actively Failing Tests

| Test                                                    | Error                                                                                   | Priority                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- |
| `tests/code-indexing/gpu-bm25-integration-e2e.test.cjs` | `ENOENT: .../tests/fixtures/sample-code-e2e/.claude/context/code-index/checkpoint.json` | HIGH — fails every run, blocks CI |

**Fix required**: In `saveCheckpoint()` (`lib/code-indexing/index-manager-files.cjs`), add `fs.mkdirSync(dir, { recursive: true })` before `fs.writeFile`. Alternatively, skip the E2E test when running in non-GPU environments by checking `process.env.GPU_AVAILABLE` or using `test.skip()`.

---

## 8. Coverage Gap Summary

| Layer                     | Total Modules | With Tests | Without Tests | Coverage % |
| ------------------------- | ------------- | ---------- | ------------- | ---------- |
| `.claude/lib/` (active)   | ~170 modules  | ~75        | ~95           | ~44%       |
| `.claude/hooks/` (active) | ~80 hooks     | ~55        | ~25           | ~69%       |
| Critical routing lib      | 12 modules    | 6          | 6             | 50%        |
| Critical workflow lib     | 15 modules    | 8          | 7             | 53%        |

**Note**: Coverage % reflects file-level test existence, not line/branch coverage within files.

---

## 9. Recommendations

### Immediate (P0 — Blocking Failures)

1. **Fix E2E test fixture**: Add `mkdirSync` with `recursive: true` in `saveCheckpoint()` or skip test in non-GPU environments.

### Short-term (P1 — High Risk Gaps)

2. **Add `lib/routing/routing-table.test.cjs`**: Cover primary intent→agent dispatch, disambiguation, and fallback behavior.
3. **Add `lib/workflow/cycle-detector.test.cjs`**: Cover direct cycles (A→B→A), indirect cycles (A→B→C→A), self-loops, and empty graphs.
4. **Add `lib/utils/atomic-write.test.cjs`**: Cover concurrent writes, partial-write simulation, and cleanup on failure.
5. **Add `lib/routing/task-claim-ledger.test.cjs`**: Cover concurrent claim races, duplicate prevention, and ledger persistence.

### Medium-term (P2 — Quality Improvements)

6. **Replace echo-stub scripts**: Remove or redirect `test:hooks`, `test:hooks:memory`, `test:hooks:stress`, `test:a2a*` to descriptive error messages or actual archived test catalogs.
7. **Enable coverage in CI**: Wire `--experimental-test-coverage` to `test:ci` and enforce a minimum threshold (suggest 60% for critical paths).
8. **Add `lib/memory/memory-sanitizer.test.cjs`**: Security-critical path — prototype pollution stripping must be tested.
9. **Add `lib/utils/hook-runner.test.cjs`**: Test chain-of-responsibility failure modes.
10. **Mark benchmark tests appropriately**: Add environment guards or timeout multipliers for benchmark tests to prevent flakiness on slow CI.

---

## Appendix: Checklist Validation (IEEE 1028)

- [x] Code follows project style guide (CJS hooks/lib pattern consistent)
- [x] Tests written for critical paths (routing-guard has 14 files)
- [ ] All new code has corresponding tests (routing-table family missing)
- [ ] Test coverage >= 80% for new code (no coverage enforcement in CI)
- [x] Tests cover edge cases for covered modules (memory has stress/chaos tests)
- [x] Tests are isolated (sequential concurrency=1 prevents most ordering issues)
- [ ] No stale/dead code in test infrastructure (6 echo-stub scripts exist)
- [x] Error conditions handled in critical modules (safe-json, validator)
- [ ] No actively failing tests (1 E2E test failing: gpu-bm25-integration-e2e)
