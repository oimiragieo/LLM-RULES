---
name: mission-engine-worker
description: Builds mission engine modules, orchestration wiring, plugin system, headless execution, and code review infrastructure
---

# Mission Engine Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that implement the mission engine subsystem and production infrastructure:

- Mission orchestrator wiring (dispatch loop, handoff pipeline, milestone gates)
- Plugin marketplace (manifest, registry, resolver, loader, CLI)
- Headless execution engine (autonomy tiers, output formats, permission enforcement)
- Code review system (diff engine, severity matrix, 2-pass pipeline)
- Mission workspace provisioning and state management
- features.json state machine and precondition DAG
- state.json mutex and lock management
- Handoff directory watching and processing
- Worker-to-features dispatching and persona injection
- Friction loop engine
- Validation contract parsing and state gatekeeper
- Scrutiny reviewer auto-spawn and milestone gates
- services.yaml command registry
- init.sh bootstrap system
- Readiness scoring engine and auto-remediation

## Work Procedure

### 1. Understand the Feature

Read the feature's `description`, `expectedBehavior`, and `verificationSteps` carefully. Cross-reference with the validation contract assertions listed in `fulfills` to understand exactly what behavior must be verified.

### 2. Write Tests FIRST (TDD Red Phase)

Before writing ANY implementation code:

1. Create test file in `tests/mission/` (or `tests/services/`, `tests/readiness/` as appropriate)
2. Use `node:test` with `describe()` and `it()` blocks
3. Use `assert` from `node:assert/strict`
4. Write tests that cover ALL assertions in the feature's `fulfills` array
5. Run tests with `node --test <test-file>` to confirm they FAIL (red phase)

Test file conventions:

- Filename: `<module-name>.test.cjs`
- Use temp directories for filesystem tests (clean up in `after()`)
- Mock external dependencies with manual stubs (no sinon/jest)
- Use `path.join()` for all paths (Windows compatibility)

### 3. Implement the Module (TDD Green Phase)

1. Create module in `.claude/lib/mission/` (or `.claude/lib/services/`, `.claude/lib/readiness/`)
2. Use CommonJS: `module.exports = { ... }`
3. Use AJV for all JSON schema validation
4. Use atomic writes for state files: write to `.tmp` then rename
5. Use `path.normalize()` for all file paths
6. Handle Windows-specific concerns:
   - `fs.watch` may be unreliable on NTFS - provide polling fallback
   - Use `process.platform === 'win32'` checks where needed
   - Use `where` instead of `command -v` on Windows
7. Run tests to confirm they PASS (green phase)

### 4. Verify Your Work

1. Run the specific test file: `node --test tests/mission/<file>.test.cjs`
2. Run the full test suite: `pnpm test` (must not break existing tests)
3. Run format check: `pnpm format:check`
4. If format fails, run: `pnpm format` then re-check
5. Manually verify by requiring the module and calling key functions from a Node REPL or inline script

### 5. Check for Integration Issues

- Verify your module exports match what other modules expect to import
- Check that file paths used match the mission workspace structure
- Ensure no circular dependencies with existing `.claude/lib/` modules

## Example Handoff

```json
{
  "salientSummary": "Implemented features.json state machine with 5 valid transitions, precondition DAG evaluation, circular dependency detection, and atomic write safety. Wrote 14 test cases covering all VAL-FS assertions. All tests pass, pnpm test green, format:check clean.",
  "whatWasImplemented": "Created .claude/lib/mission/features-state-machine.cjs with loadFeatures(), transitionFeature(), validateFeatures(), and getEligibleFeatures(). Uses AJV for schema validation, atomic write via writeFileSync to .tmp + renameSync. Topological sort for cycle detection. Full state transition matrix: pending->in_progress, in_progress->validating, validating->completed, in_progress->failed, failed->pending.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/mission/features-state-machine.test.cjs",
        "exitCode": 0,
        "observation": "14 tests passing, 0 failing"
      },
      { "command": "pnpm test", "exitCode": 0, "observation": "Full suite passes, no regressions" },
      { "command": "pnpm format:check", "exitCode": 0, "observation": "All files formatted" }
    ],
    "interactiveChecks": [
      {
        "action": "Required module and called loadFeatures() with valid fixtures",
        "observed": "Returns parsed features array with correct schema"
      },
      {
        "action": "Called transitionFeature with invalid transition pending->completed",
        "observed": "Throws INVALID_TRANSITION error as expected"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/mission/features-state-machine.test.cjs",
        "cases": [
          { "name": "pending to in_progress succeeds", "verifies": "VAL-FS-001" },
          { "name": "in_progress to completed succeeds", "verifies": "VAL-FS-002" },
          { "name": "failed increments retry counter", "verifies": "VAL-FS-003" },
          { "name": "pending to completed rejected", "verifies": "VAL-FS-004" },
          { "name": "completed is terminal", "verifies": "VAL-FS-005" },
          { "name": "precondition blocks dependent", "verifies": "VAL-FS-006" },
          { "name": "precondition passes when met", "verifies": "VAL-FS-007" },
          { "name": "circular dependency detected", "verifies": "VAL-FS-008" },
          { "name": "malformed JSON rejected", "verifies": "VAL-FS-009" },
          { "name": "atomic write used", "verifies": "VAL-FS-010" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature requires modifying existing `.claude/lib/workers/` modules (bridge only, not modify)
- Circular dependency found between new mission modules and existing modules
- AJV schema from existing codebase conflicts with PRD-specified schema
- Windows-specific issue blocks implementation (NTFS, path, process management)
- Feature's preconditions reference modules that don't exist yet
