---
name: integration-test-worker
description: Builds cross-area integration tests for the mission engine module system
---

# Integration Test Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that build integration tests wiring multiple mission engine modules together:

- Shared mock infrastructure (mock factories, test pipeline helpers)
- Cross-area flow tests (dependency chains, friction loops, milestone gates)
- End-to-end pipeline tests (full lifecycle, concurrent dispatch, recovery)
- Tests involving external modules (A2A task state machine, queue operations, budget enforcement)

## Work Procedure

### 1. Understand the Feature

Read the feature's `description`, `expectedBehavior`, and `verificationSteps` carefully. Cross-reference with the validation contract assertions listed in `fulfills` to understand exactly what behavior must be verified.

Read AGENTS.md for the EXACT state machine transitions and event names. Using wrong state names will cause test failures.

### 2. Understand the Module APIs

Before writing any code, read the actual module source files to understand:

- The exact export names and function signatures
- The exact constructor parameters and options
- The exact return value shapes
- Any side effects (file writes, events emitted)

Key modules to reference:

- `.claude/lib/mission/features-state-machine.cjs` — VALID_TRANSITIONS, FeaturesStateMachine class
- `.claude/lib/mission/friction-loop.cjs` — FrictionLoopEngine, event names
- `.claude/lib/mission/worker-features-dispatcher.cjs` — dispatchFeature function
- `.claude/lib/mission/scrutiny-reviewer.cjs` — ScrutinyReviewer class
- `.claude/lib/mission/milestone-gate.cjs` — MilestoneGate class
- `.claude/lib/mission/workspace-provisioner.cjs` — provisionWorkspace function
- `.claude/lib/mission/handoff-watcher.cjs` — HandoffWatcher class
- `.claude/lib/mission/persona-injector.cjs` — composePersona function
- `.claude/lib/services/services-registry.cjs` — ServicesRegistry class
- `.claude/lib/services/bootstrap-system.cjs` — BootstrapSystem class
- `.claude/lib/readiness/readiness-scorer.cjs` — ReadinessScorer class

### 3. Write Tests FIRST (TDD Red Phase)

Before writing ANY helper/infrastructure code:

1. Create test file in `tests/integration/`
2. Use `node:test` with `describe()` and `it()` blocks
3. Use `assert` from `node:assert/strict`
4. Write tests that exercise the integration points described in the feature
5. Run tests with `node --test <test-file>` to confirm they FAIL (red phase)

Test file conventions:

- Filename: matches feature scope (e.g., `cross-area.test.cjs`, `e2e-pipeline.test.cjs`)
- Use temp directories for workspace isolation (clean up in `after()`)
- Mock external dependencies with the shared mock factory when available
- Use `path.join()` for all paths (Windows compatibility)
- Each `describe()` block should map to one validation assertion ID

### 4. Build Required Infrastructure (TDD Green Phase)

If the feature requires shared helpers (mock factory, test pipeline):

1. Create helper files in `tests/integration/helpers/`
2. Use CommonJS: `module.exports = { ... }`
3. Helpers must be stateless between test cases
4. Each mock factory function returns a fresh instance

If the feature is purely tests (no new helpers needed):

1. Wire the real modules together with mocks for external deps
2. Drive the lifecycle through explicit method calls
3. Assert state at each transition point

### 5. Verify Your Work

1. Run the specific test file: `node --test tests/integration/<file>.test.cjs`
2. Run the full test suite: `pnpm test` (must not break existing tests)
3. Run format check: `pnpm format:check`
4. If format fails, run: `node scripts/format-tracked.mjs --write` then re-check

### 6. Check Edge Cases

- Verify tests work with temp paths containing spaces or special characters
- Verify cleanup happens even when assertions fail (use try/finally or after())
- Verify no open handles (setTimeout, setInterval) prevent test runner from exiting

## Example Handoff

```json
{
  "salientSummary": "Built shared mock factory with createMockDb, createMockBudget, createMockEnqueue, createMockWorker. Wrote 12 test cases covering all 4 stubs' recording, configurability, and isolation. All tests pass, pnpm test green, format:check clean.",
  "whatWasImplemented": "tests/integration/helpers/mock-factory.cjs with 4 factory functions. Each returns a configurable stub that records invocations. createMockWorker writes synthetic handoff JSON to a specified directory. All stubs have independent state per instantiation.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/integration/helpers/mock-factory.test.cjs",
        "exitCode": 0,
        "observation": "12 tests pass, 0 fail"
      },
      {
        "command": "pnpm test",
        "exitCode": 0,
        "observation": "457 tests pass including 12 new integration tests"
      },
      { "command": "pnpm format:check", "exitCode": 0, "observation": "No format issues" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/integration/helpers/mock-factory.test.cjs",
        "cases": [
          { "name": "createMockDb returns callable stub", "verifies": "VAL-INFRA-001" },
          { "name": "createMockBudget records invocations", "verifies": "VAL-INFRA-001" },
          { "name": "stubs have independent state", "verifies": "VAL-INFRA-001" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- A module's actual API doesn't match what the feature description assumes
- An existing module has a bug that prevents the integration test from working
- A test requires functionality that no existing module provides and can't be mocked
- The required mock infrastructure is more complex than the feature scope allows
