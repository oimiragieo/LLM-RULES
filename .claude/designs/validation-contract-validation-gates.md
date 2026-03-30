# Validation Contract: Validation Gates

> **Status**: Draft
> **Date**: 2026-03-29
> **Scope**: Testable assertions for validation-contract.md Parser, validation-state.json Gatekeeper, Scrutiny Reviewer Auto-Spawn, Milestone Gate Check
> **Target Modules**: `.claude/lib/mission/` (CommonJS .cjs, node:test, AJV for schemas)

---

## Area 1 — Validation Contract Parser (VC)

### VAL-VC-001: Parse well-formed validation contract into executable checks

The parser reads a validation-contract markdown file and extracts all validation rules. Each rule has an ID matching pattern `VAL-{AREA}-{NNN}`, a title, a behavioral description, and evidence requirements. The parser compiles these into an array of executable check objects.

**Pass condition**: Given a well-formed validation-contract.md with N rules, the parser returns an array of exactly N check objects. Each object contains: `id` (string matching `/^VAL-[A-Z]+-\d{3}$/`), `title` (non-empty string), `description` (non-empty string), `evidence` (non-empty string), and compiled `checks` array (each with `name`, `command`, `expectedExitCode`, `timeout`).

**Fail condition**: Any rule is missing, any field is empty/null, or the check object schema doesn't match the expected shape.

**Evidence**: Unit test feeds a known 5-rule contract markdown string to the parser; asserts returned array length is 5; validates each object against AJV schema for check objects.

---

### VAL-VC-002: Duplicate rule IDs are detected and rejected

If a validation-contract.md contains two or more rules with the same VAL-AREA-NNN identifier, the parser must reject the contract with a clear error identifying the duplicate ID(s).

**Pass condition**: Given a contract with rules VAL-VC-001, VAL-VC-002, VAL-VC-001 (duplicate), the parser throws or returns an error object containing `{ type: 'DUPLICATE_ID', ids: ['VAL-VC-001'] }`. No partial result is returned.

**Fail condition**: The parser silently overwrites the first rule with the duplicate, returns a partial result, or throws a generic error without identifying the duplicate.

**Evidence**: Unit test provides contract markdown with intentional duplicate IDs; asserts error type is `DUPLICATE_ID` and the duplicated ID is listed.

---

### VAL-VC-003: Malformed markdown degrades gracefully with actionable errors

If the contract markdown is structurally malformed (missing headers, broken frontmatter, unclosed code fences, missing evidence sections), the parser returns a structured error listing each parse failure with line numbers.

**Pass condition**: Given markdown with a missing `### VAL-` header prefix on one rule, a rule with no evidence section, and a rule with an unclosed code fence, the parser returns `{ success: false, errors: [...] }` where each error includes `{ line: <number>, message: <string>, ruleId: <string|null> }`. Recoverable rules are still parsed; only broken rules produce errors.

**Fail condition**: Parser throws an unhandled exception, silently skips malformed rules without reporting, or returns zero rules when some are parseable.

**Evidence**: Unit test feeds deliberately malformed markdown; asserts `success` is false; asserts error array length matches the number of malformed rules; verifies valid rules are still present in the partial result.

---

### VAL-VC-004: Rules referencing nonexistent commands produce warnings at parse time

If a rule's evidence section references a command (e.g., `pnpm nonexistent:script`) that cannot be resolved on the current system, the parser emits a warning but does not reject the contract. The check object is created with a `commandResolvable: false` flag.

**Pass condition**: A rule referencing `pnpm this:does:not:exist` parses successfully. The resulting check object has `commandResolvable: false` and a `warnings` array containing a message about the unresolvable command. The overall parse result's `warnings` array is non-empty.

**Fail condition**: The parser rejects the entire contract due to an unresolvable command, or silently marks the command as resolvable.

**Evidence**: Unit test provides a contract with one valid command (`pnpm test`) and one invalid command; asserts both rules are parsed; asserts the invalid command's check has `commandResolvable: false`.

---

### VAL-VC-005: Rules with multiple evidence types compile into multiple checks

A single validation rule may specify multiple evidence commands (e.g., a unit test command AND a file existence check AND a grep assertion). Each evidence command compiles into a separate check within the rule's `checks` array.

**Pass condition**: A rule with three evidence commands (e.g., `pnpm test:framework`, `Test-Path some/file`, `rg "pattern" dir/`) produces a check object with `checks.length === 3`. Each check has its own `name`, `command`, `expectedExitCode`, and `timeout`.

**Fail condition**: Only the first evidence command is captured, or multiple commands are concatenated into a single check.

**Evidence**: Unit test provides a multi-evidence rule; asserts `checks` array length equals the number of distinct evidence commands; validates each check independently.

---

## Area 2 — Validation State Gatekeeper (VS)

### VAL-VS-001: Track assertion states with valid transitions

The gatekeeper maintains a `validation-state.json` file tracking each assertion's state. Valid states are: `pending`, `passed`, `failed`, `blocked`. Valid transitions are: `pending→passed`, `pending→failed`, `pending→blocked`, `failed→passed` (re-validation), `failed→blocked`, `blocked→pending` (unblock). Invalid transitions (e.g., `passed→pending`) must be rejected.

**Pass condition**: Transitioning an assertion from `pending` to `passed` succeeds and is persisted. Attempting to transition from `passed` to `pending` returns an error with `{ type: 'INVALID_TRANSITION', from: 'passed', to: 'pending' }`. The state file reflects only valid transitions.

**Fail condition**: Invalid transitions are silently accepted, or valid transitions are rejected, or the state file is inconsistent with the in-memory state.

**Evidence**: Unit test exercises all 6 valid transitions and asserts success; exercises 3+ invalid transitions and asserts rejection with correct error type; reads back `validation-state.json` and verifies final state matches.

---

### VAL-VS-002: Block feature completion until all required checks pass

The gatekeeper exposes a `canComplete(featureId)` function. It returns `true` only when every assertion linked to that feature has state `passed`. Any `pending`, `failed`, or `blocked` assertion causes it to return `false` with a list of blocking assertion IDs.

**Pass condition**: For a feature with 3 assertions where 2 are `passed` and 1 is `failed`, `canComplete()` returns `{ allowed: false, blocking: ['VAL-XX-003'] }`. After the failing assertion transitions to `passed`, `canComplete()` returns `{ allowed: true, blocking: [] }`.

**Fail condition**: `canComplete()` returns true while assertions are still pending/failed, or the blocking list is incomplete.

**Evidence**: Unit test creates a feature with 3 assertions in mixed states; asserts `canComplete()` returns false with the correct blocker; transitions the blocker to passed; asserts `canComplete()` now returns true.

---

### VAL-VS-003: Partial re-validation only re-runs failed checks

The gatekeeper supports `revalidate(featureId)` which identifies assertions in `failed` state and re-runs only those checks. Assertions in `passed` state are not re-executed. Assertions in `blocked` state are skipped.

**Pass condition**: For a feature with 5 assertions (3 passed, 1 failed, 1 blocked), calling `revalidate()` invokes the check runner for exactly 1 assertion (the failed one). The passed assertions' `lastRun` timestamps remain unchanged. The blocked assertion is not executed.

**Fail condition**: All 5 assertions are re-run, or the blocked assertion is executed, or passed assertions' timestamps are updated.

**Evidence**: Unit test with mock check runner; asserts runner is called exactly once with the failed assertion's ID; asserts passed assertions' `lastRun` is unchanged; asserts blocked assertion was not touched.

---

### VAL-VS-004: Atomic state persistence via write-temp-rename

All state file updates use the atomic write pattern: write to a temporary file (e.g., `validation-state.json.tmp`), then rename over the original. This prevents corruption from crashes mid-write.

**Pass condition**: After a state update, `validation-state.json` contains valid JSON with the updated state. If the process is killed between `writeFileSync` and `renameSync` (simulated), the original `validation-state.json` is intact (not corrupted/truncated). No `.tmp` files remain after successful writes.

**Fail condition**: `validation-state.json` is truncated or contains partial JSON after a simulated crash, or `.tmp` files accumulate.

**Evidence**: Unit test mocks `fs.renameSync` to throw after `writeFileSync` completes; verifies original file is unchanged; verifies `.tmp` file exists (indicating incomplete write). Second test does a normal write and asserts no `.tmp` file remains.

---

### VAL-VS-005: Corrupted validation-state.json triggers recovery

If `validation-state.json` contains invalid JSON (truncated write, encoding error), the gatekeeper detects the corruption on load, backs up the corrupted file as `validation-state.json.corrupt.<timestamp>`, and initializes a fresh state with all assertions set to `pending`.

**Pass condition**: Given a `validation-state.json` containing `{"assertions":{"VAL-VC-001":"pa` (truncated), the gatekeeper creates `validation-state.json.corrupt.<timestamp>`, writes a new `validation-state.json` with all known assertions in `pending` state, and logs a recovery warning.

**Fail condition**: The gatekeeper throws an unhandled `SyntaxError`, overwrites the corrupted file without backup, or silently returns empty state.

**Evidence**: Unit test writes invalid JSON to the state file; calls gatekeeper load; asserts `.corrupt` backup file exists; asserts fresh state has all assertions as `pending`; asserts a warning was emitted.

---

### VAL-VS-006: Orphaned assertion IDs detected on state load

If `validation-state.json` references assertion IDs that no longer exist in the current validation contract (e.g., after a rule was removed), the gatekeeper emits a warning listing orphaned IDs and excludes them from gate calculations. Conversely, new assertions in the contract that aren't in the state file are added with `pending` state.

**Pass condition**: State file has `VAL-VC-001`, `VAL-VC-002`, `VAL-REMOVED-099`. Contract has `VAL-VC-001`, `VAL-VC-002`, `VAL-VC-003`. After load: `VAL-REMOVED-099` is in orphaned warnings, `VAL-VC-003` is added as `pending`, gate calculations only consider `VAL-VC-001`, `VAL-VC-002`, `VAL-VC-003`.

**Fail condition**: Orphaned IDs silently remain in gate calculations, or new assertions are not auto-added.

**Evidence**: Unit test with mismatched state/contract; asserts orphaned warnings contain `VAL-REMOVED-099`; asserts new assertion `VAL-VC-003` is `pending`; asserts `canComplete` only considers current contract IDs.

---

### VAL-VS-007: Concurrent gatekeeper updates are serialized

If two gatekeeper operations attempt to update state simultaneously (e.g., two parallel check runners reporting results), updates are serialized via file locking or a write queue. The second write must see the first write's changes.

**Pass condition**: Two concurrent `updateState()` calls—one setting `VAL-VC-001: passed` and one setting `VAL-VC-002: passed`—both succeed. The final `validation-state.json` contains both updates. Neither update is lost.

**Fail condition**: One update overwrites the other (last-write-wins without merge), resulting in only one assertion being updated, or the file is corrupted by overlapping writes.

**Evidence**: Unit test launches two `updateState()` calls with `Promise.all()`; reads back state file; asserts both assertions reflect their updated states.

---

## Area 3 — Scrutiny Reviewer Auto-Spawn (SR)

### VAL-SR-001: Reviewer auto-spawns after worker handoff

When a worker agent completes a task and hands off (TaskUpdate with `status: 'completed'`), the scrutiny reviewer is automatically spawned as a separate read-only process to validate the work.

**Pass condition**: After a simulated worker completion event, the reviewer spawn function is invoked within 5 seconds. The spawned reviewer receives the feature ID, the list of `verificationSteps`, and the path to the test suite. The spawn is asynchronous and non-blocking to the main session.

**Fail condition**: No reviewer is spawned, the reviewer blocks the main session, or the reviewer is spawned without the required context (feature ID, verification steps).

**Evidence**: Unit test emits a mock worker completion event; asserts reviewer spawn function was called with correct arguments (featureId, verificationSteps, testCommand); asserts the spawn call returns immediately (non-blocking).

---

### VAL-SR-002: Reviewer executes verificationSteps from features.json

The spawned reviewer reads `verificationSteps` for the completed feature and executes each step sequentially. Each step's exit code and output are captured.

**Pass condition**: Given a feature with `verificationSteps: ["pnpm test:framework", "rg 'pattern' src/"]`, the reviewer executes both commands in order. The result object contains `{ steps: [{ command: "pnpm test:framework", exitCode: 0, stdout: "..." }, { command: "rg ...", exitCode: 0, stdout: "..." }] }`.

**Fail condition**: Steps are skipped, executed out of order, or their outputs are not captured.

**Evidence**: Unit test with mock `execSync`; provides 3 verification steps; asserts all 3 are executed in order; asserts result contains all 3 step outcomes with correct exit codes and captured output.

---

### VAL-SR-003: Reviewer outputs structured JSON verdict

After executing all verification steps and the test suite, the reviewer produces a structured JSON verdict with fields: `verdict` (`approved` | `rejected`), `featureId`, `timestamp`, `steps` (array of step results), `summary` (human-readable), and `failures` (array of failed step details, empty if approved).

**Pass condition**: When all steps pass, verdict is `{ verdict: "approved", failures: [], ... }`. When one step fails, verdict is `{ verdict: "rejected", failures: [{ step: "pnpm test", exitCode: 1, reason: "..." }], ... }`. The verdict JSON validates against the AJV verdict schema.

**Fail condition**: Verdict is missing required fields, uses non-standard verdict values, or doesn't conform to the schema.

**Evidence**: Unit test with all-passing steps asserts `verdict: "approved"` and empty `failures`; test with one failing step asserts `verdict: "rejected"` and non-empty `failures` with the failing step's details; AJV schema validation passes for both cases.

---

### VAL-SR-004: Reviewer crash produces a rejected verdict with crash details

If the reviewer process itself crashes (unhandled exception, OOM, segfault), the parent system detects the crash and records a `rejected` verdict with `{ verdict: "rejected", crash: true, error: "<crash details>" }` so the gate does not hang indefinitely.

**Pass condition**: When the reviewer process exits with a non-zero code without producing a verdict JSON, the orchestrator generates a synthetic rejected verdict with `crash: true` and the process's stderr captured in the `error` field. The feature's validation state is set to `failed`.

**Fail condition**: The system hangs waiting for a verdict that never arrives, or the feature is silently marked as passed, or no crash information is recorded.

**Evidence**: Unit test spawns a reviewer mock that throws immediately; asserts a rejected verdict with `crash: true` is produced within the timeout period; asserts the feature's validation state is `failed`.

---

### VAL-SR-005: Reviewer enforces read-only mode (no file writes)

The scrutiny reviewer MUST NOT be able to write, edit, or delete files. It operates in a read-only sandbox. Any attempt to mutate the filesystem is blocked.

**Pass condition**: The reviewer is spawned with a permission profile that disables `Write`, `Edit`, `MultiEdit`, and any destructive file tools. If the reviewer's verification steps include a command that would write files (e.g., `echo test > file.txt`), the command is either blocked before execution or the reviewer is spawned with read-only filesystem access.

**Fail condition**: The reviewer can create, modify, or delete any file on disk.

**Evidence**: Unit test asserts the spawn configuration includes `permissionMode: 'read-only'` or equivalent. Integration test attempts a write operation from within the reviewer context; asserts it is rejected/blocked.

---

### VAL-SR-006: Destructive commands in verificationSteps are filtered

If `verificationSteps` contain commands that would mutate state (e.g., `rm -rf`, `git push`, `DROP TABLE`), the reviewer filters them out before execution and flags them in the verdict as `skipped_destructive`.

**Pass condition**: Given steps `["pnpm test", "rm -rf /tmp/test", "rg pattern src/"]`, the reviewer executes steps 1 and 3, skips step 2, and the verdict includes `{ skippedDestructive: ["rm -rf /tmp/test"] }`.

**Fail condition**: The destructive command is executed, or it is silently skipped without being recorded in the verdict.

**Evidence**: Unit test provides verification steps including known destructive patterns; asserts the destructive command was not passed to `execSync`; asserts the verdict's `skippedDestructive` array contains the filtered command.

---

### VAL-SR-007: Reviewer respects timeout for long-running verification

Each verification step and the overall reviewer process have configurable timeouts. Steps exceeding their timeout are killed and recorded as failed.

**Pass condition**: A verification step configured with a 30-second timeout that runs for 60 seconds is killed after 30 seconds. The step result shows `{ timedOut: true, exitCode: null }`. The overall reviewer timeout (e.g., 5 minutes) kills the entire reviewer if the aggregate steps exceed it.

**Fail condition**: A hung step blocks the reviewer indefinitely, or the timeout kills the step but doesn't record the timeout in the result.

**Evidence**: Unit test with mock slow command; asserts step result has `timedOut: true` after the configured timeout; asserts the reviewer completes within its aggregate timeout even when a step hangs.

---

## Area 4 — Milestone Gate Check (MG)

### VAL-MG-001: All features in milestone must be completed before gate passes

The milestone gate check verifies that every feature listed in the milestone's feature set has `status: 'completed'` in the mission state. Any feature with `status` other than `completed` causes the gate to fail.

**Pass condition**: For a milestone with features [F1, F2, F3] where all have `status: 'completed'`, the gate returns `{ passed: true, blocking: [] }`. If F2 has `status: 'in_progress'`, the gate returns `{ passed: false, blocking: [{ featureId: 'F2', reason: 'status is in_progress' }] }`.

**Fail condition**: The gate passes while a feature is incomplete, or the blocking list omits an incomplete feature.

**Evidence**: Unit test with all-complete features asserts gate passes; test with one incomplete feature asserts gate fails with correct blocker; test with multiple incomplete features asserts all are listed in blockers.

---

### VAL-MG-002: All validation assertions for milestone features must be passed

Beyond feature completion, the gate checks that every validation assertion associated with the milestone's features has state `passed` in `validation-state.json`. This is checked via the gatekeeper's `canComplete()` for each feature.

**Pass condition**: For a milestone with features F1 (assertions A1, A2) and F2 (assertions A3), all assertions are `passed` → gate passes. If A2 is `failed`, gate fails with `{ blocking: [{ featureId: 'F1', assertions: ['A2'] }] }`.

**Fail condition**: The gate passes with any assertion not in `passed` state, or the blocking detail omits the specific failing assertions.

**Evidence**: Unit test with all assertions passed asserts gate passes; test with one failed assertion per feature asserts gate fails with correct feature-assertion mapping.

---

### VAL-MG-003: Gate triggers scrutiny and user-testing validators

When the milestone gate check is initiated, it automatically triggers two validator passes: (1) the scrutiny reviewer for automated verification, and (2) the user-testing validator for behavioral acceptance. Both must produce `approved` verdicts.

**Pass condition**: Calling `checkMilestoneGate(milestoneId)` triggers scrutiny reviewer execution AND user-testing validator execution. The gate result includes `{ scrutiny: { verdict: 'approved' }, userTesting: { verdict: 'approved' } }`. If either produces `rejected`, the gate fails.

**Fail condition**: Only one validator is triggered, or the gate passes despite a `rejected` verdict from either validator.

**Evidence**: Unit test with mock validators both returning `approved` asserts gate passes; test with scrutiny `approved` but user-testing `rejected` asserts gate fails; test verifying both validator functions were called.

---

### VAL-MG-004: Infrastructure features without fulfills are exempt from assertion checks

Features flagged as infrastructure (e.g., `type: 'infrastructure'` or with empty `fulfills` array) are exempt from validation assertion requirements. They only need `status: 'completed'` to satisfy the gate.

**Pass condition**: A milestone with feature F1 (`fulfills: ['REQ-001']`, assertions required) and feature F2 (`fulfills: []`, infrastructure) passes the gate when F1's assertions are all `passed` AND F2 has `status: 'completed'` — even though F2 has zero assertions.

**Fail condition**: The gate blocks on F2 requiring assertions when it has no `fulfills`, or the gate ignores F1's assertion requirements.

**Evidence**: Unit test with an infrastructure feature (empty `fulfills`) and a requirements feature; asserts gate passes when infrastructure feature is complete and requirements feature's assertions pass; asserts gate fails only when the requirements feature's assertions fail.

---

### VAL-MG-005: Feature added mid-execution is included in gate check

If a new feature is added to a milestone while execution is in progress (e.g., scope change), the gate check dynamically reads the current feature list. It does not cache the feature list from milestone start.

**Pass condition**: Gate check reads the feature list at invocation time. If feature F4 is added to the milestone after the gate was first checked, a subsequent gate check includes F4 in its evaluation. If F4 is `pending`, the gate fails with F4 in the blockers.

**Fail condition**: The gate uses a stale feature list from a previous check and passes without considering the newly added feature.

**Evidence**: Unit test checks gate with 3 features (all complete, all assertions pass) → gate passes; adds F4 to milestone with `status: 'pending'`; re-checks gate → gate fails with F4 as blocker.

---

### VAL-MG-006: Cancelled features are excluded from gate check

Features with `status: 'cancelled'` are excluded from the milestone gate evaluation. They do not block progression and their assertions (if any) are ignored.

**Pass condition**: A milestone with features [F1 (completed, assertions pass), F2 (cancelled)] passes the gate. F2's assertions (if any exist in `validation-state.json`) are not evaluated.

**Fail condition**: The gate blocks on a cancelled feature, or cancelled features' failed assertions cause the gate to fail.

**Evidence**: Unit test with one completed feature and one cancelled feature; asserts gate passes; asserts the cancelled feature's assertions were not checked (no calls to gatekeeper for cancelled feature's assertion IDs).

---

## Summary

| Area                         | Assertions | IDs                           |
| ---------------------------- | ---------- | ----------------------------- |
| Validation Contract Parser   | 5          | VAL-VC-001 through VAL-VC-005 |
| Validation State Gatekeeper  | 7          | VAL-VS-001 through VAL-VS-007 |
| Scrutiny Reviewer Auto-Spawn | 7          | VAL-SR-001 through VAL-SR-007 |
| Milestone Gate Check         | 6          | VAL-MG-001 through VAL-MG-006 |
| **Total**                    | **25**     |                               |
