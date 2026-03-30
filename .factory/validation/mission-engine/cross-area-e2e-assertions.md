# Cross-Area & E2E Integration Assertions

> Mission Engine — Behavioral test specifications for integration seams

---

## Cross-Area Flows

### VAL-CROSS-001: Full Mission Lifecycle — Create to Milestone Complete

When a user creates a mission with a valid features.json containing ≥1 milestone with ≥1 feature, the engine must:
1. Provision a workspace directory on disk
2. Parse features.json and populate the state machine with all features in `pending` status
3. Dispatch workers for features whose dependencies are satisfied (no deps → immediate dispatch)
4. Collect handoff artifacts from each completed worker
5. Run validation (scrutiny) on each handoff
6. Transition each validated feature to `completed` in state.json
7. When all features in the milestone are `completed`, transition the milestone to `completed`

**Pass condition:** `state.json` shows milestone status `completed`, all features `completed`, handoff artifacts exist on disk for every feature.
**Fail condition:** Any feature stuck in `dispatched`/`pending`, milestone not `completed`, or missing handoff artifacts.

Evidence: state.json content, filesystem listing of workspace/handoffs/, features.json → state.json diff

---

### VAL-CROSS-002: Feature Dependency Chain — Sequential Unblock

Given features.json with Feature-A (no deps) and Feature-B (depends on Feature-A):
1. Engine dispatches Feature-A immediately (deps satisfied)
2. Feature-B remains `blocked` while Feature-A is in-progress
3. Feature-A worker completes and writes handoff
4. Engine re-evaluates dependency graph
5. Feature-B transitions from `blocked` → `pending` → `dispatched`
6. Feature-B worker completes

**Pass condition:** Feature-B dispatch timestamp is strictly after Feature-A completion timestamp. Feature-B was never dispatched while Feature-A was non-complete. Both features reach `completed`.
**Fail condition:** Feature-B dispatched before Feature-A completed, or Feature-B never unblocked.

Evidence: state.json timestamps per feature, dispatcher event log showing dispatch order

---

### VAL-CROSS-003: Validation Rejection and Friction Loop Revival

Given a worker that produces a handoff failing scrutiny validation:
1. Worker completes Feature-X and writes handoff.json
2. Scrutiny reviewer evaluates handoff → produces `{ "status": "fail", "blockingIssues": [...] }`
3. Engine detects rejection and enters friction loop
4. Engine re-dispatches a worker for Feature-X with the blocking issues as additional context
5. Revised worker writes an updated handoff
6. Scrutiny reviewer re-evaluates → produces `{ "status": "pass" }`
7. Feature-X transitions to `completed`

**Pass condition:** Feature-X has ≥2 scrutiny review rounds in its validation history. Final round is `pass`. State.json shows feature `completed`. The re-dispatched worker's prompt includes the blocking issues from round 1.
**Fail condition:** Feature stuck in failed validation with no re-dispatch, or re-dispatch prompt missing rejection context.

Evidence: scrutiny/reviews/*.json files (round count ≥ 2), scrutiny/synthesis.json final status, worker dispatch logs showing re-dispatch with rejection context

---

### VAL-CROSS-004: Milestone Boundary Gate — Sequential Milestone Progression

Given features.json with Milestone-1 (features A, B) and Milestone-2 (features C, D):
1. Engine starts Milestone-1: dispatches A and B
2. A and B complete and pass validation
3. Milestone-1 gate evaluates: all features passed → milestone `completed`
4. Engine transitions to Milestone-2: features C and D become available
5. C and D are dispatched, complete, and pass validation
6. Milestone-2 gate passes → mission `completed`

**Pass condition:** No Milestone-2 feature is ever dispatched while any Milestone-1 feature is non-complete. Milestone-2 features' first dispatch timestamps are after Milestone-1's completion timestamp. Final state.json shows both milestones `completed`.
**Fail condition:** Milestone-2 feature dispatched while Milestone-1 incomplete, or milestone gate skipped.

Evidence: state.json with per-milestone status and timestamps, dispatcher event log proving sequential execution

---

### VAL-CROSS-005: Readiness Gate Constrains Mission Feature Set

Given a repository assessed at readiness level L2:
1. Readiness scorer runs against the repository → produces JSON with 9 pillar scores and `overallLevel: "L2"`
2. Mission loads features.json which contains both L2-compatible and L3-requiring features
3. Engine filters available features to only those compatible with current readiness level (≤ L2)
4. L3-requiring features are marked `skipped` or `deferred` with reason `readiness-level-insufficient`
5. Only L2-compatible features are dispatched

**Pass condition:** state.json shows L3 features with status `skipped`/`deferred` and reason field referencing readiness level. No L3 feature was ever dispatched. Readiness report JSON is persisted in workspace.
**Fail condition:** L3 feature dispatched despite L2 readiness, or readiness assessment missing/ignored.

Evidence: readiness-report.json with pillar scores and overall level, state.json feature statuses and reason fields

---

### VAL-CROSS-006: Services.yaml Canonical Command Resolution in Worker Context

Given `.factory/services.yaml` defines `test: pnpm test`:
1. Mission boots and loads services.yaml
2. Worker is dispatched for a feature requiring test execution
3. Worker references canonical command name `test`
4. Engine resolves `test` → `pnpm test` from services.yaml
5. Worker executes the resolved command

**Pass condition:** Worker's execution log shows the resolved command (`pnpm test`), not the canonical name. services.yaml was read exactly once during mission boot (not per-worker). Resolution is available to all workers without re-parsing.
**Fail condition:** Worker executes literal string `test` instead of `pnpm test`, or services.yaml not loaded, or worker crashes on unresolved command.

Evidence: Worker execution logs showing resolved command, services.yaml parse trace, command resolution cache state

---

### VAL-CROSS-007: Init.sh Bootstrap Runs Before Any Worker Dispatch

Given `.factory/init.sh` exists and is executable:
1. Mission boots
2. Engine executes init.sh before any worker dispatch
3. init.sh runs `pnpm install` (or equivalent) and writes bootstrap artifacts
4. Engine verifies init.sh exit code is 0
5. Only after successful init.sh does the engine begin worker dispatch

**Pass condition:** init.sh execution timestamp is strictly before the earliest worker dispatch timestamp. If init.sh exits non-zero, no workers are dispatched and mission enters `boot-failed` state. `node_modules/` (or equivalent) exists after init.sh.
**Fail condition:** Worker dispatched before init.sh completes, or init.sh failure ignored, or init.sh skipped entirely.

Evidence: init.sh execution log with exit code and timestamp, first worker dispatch timestamp, filesystem state post-init

---

### VAL-CROSS-008: State Recovery After Interruption

Given a mission interrupted mid-execution (e.g., process kill) with Feature-A `completed` and Feature-B `dispatched`:
1. state.json on disk shows Feature-A `completed`, Feature-B `dispatched`
2. features.json on disk is intact
3. Mission engine restarts and detects existing state.json
4. Engine loads state.json and features.json
5. Feature-A is recognized as `completed` (not re-dispatched)
6. Feature-B was `dispatched` (in-progress) at crash time → transitioned to `pending` for re-dispatch (orphan recovery, matching TaskStateMachine pattern)
7. Feature-B is re-dispatched from scratch
8. Mission continues to completion

**Pass condition:** After recovery, Feature-A is never re-dispatched. Feature-B is re-dispatched exactly once. No data loss: Feature-A's handoff artifacts survive recovery. Final state.json shows both features `completed`.
**Fail condition:** Feature-A re-dispatched (duplicate work), Feature-B stuck forever, state.json corrupted on recovery, or engine starts fresh ignoring existing state.

Evidence: state.json before crash vs after recovery, dispatcher logs showing only Feature-B re-dispatch, handoff artifact integrity check

---

## E2E Integration Tests

### VAL-E2E-001: Mock Worker Full Pipeline

End-to-end test using a mock worker (no real LLM calls):
1. Provision a temp workspace directory
2. Load a test features.json with 1 milestone, 1 feature (no deps)
3. Engine dispatches mock worker
4. Mock worker writes a synthetic handoff JSON: `{ "featureId": "F1", "status": "done", "files": ["src/foo.ts"] }`
5. Scrutiny validator processes handoff → passes (mock validator or real validator with passing fixture)
6. State machine transitions F1 to `completed`
7. Milestone gate evaluates → milestone `completed`
8. Engine emits `mission-complete` event

**Pass condition:** Entire pipeline runs without error. state.json final state: feature `completed`, milestone `completed`. Handoff JSON exists on disk. Total wall-clock time < 10 seconds (no real LLM latency). `mission-complete` event emitted exactly once.
**Fail condition:** Any step throws, state machine stuck, handoff missing, or timeout exceeded.

Evidence: state.json final content, handoff file on disk, event log showing mission-complete, wall-clock duration

---

### VAL-E2E-002: Multi-Feature Concurrent Dispatch with Dependency

Given features.json with 3 features: F1 (no deps), F2 (no deps), F3 (depends on F1 and F2):
1. Engine starts → dispatches F1 and F2 concurrently (both have no deps)
2. WorkerPool runs F1 and F2 in parallel (concurrency ≥ 2, matching WorkerPool architecture)
3. F1 completes first → state.json updated → F3 still blocked (needs F2)
4. F2 completes → state.json updated → F3 unblocked
5. F3 dispatched → F3 completes
6. Milestone complete

**Pass condition:** F1 and F2 dispatch timestamps are within 1 second of each other (concurrent). F3 dispatch timestamp is after both F1 and F2 completion timestamps. BudgetEnforcementService allowed 2 concurrent slots. All 3 features reach `completed`. Total elapsed time < sum of individual feature times (proving concurrency).
**Fail condition:** F1 and F2 dispatched sequentially despite no dependency, F3 dispatched prematurely, or concurrency budget not respected.

Evidence: state.json with per-feature dispatch/complete timestamps, dispatcher event log, BudgetEnforcementService slot acquisition log

---

### VAL-E2E-003: Readiness Self-Assessment Against Agent-Studio

Run the readiness scorer against the agent-studio repository itself:
1. Execute readiness assessment module against `C:\dev\projects\agent-studio`
2. Scorer evaluates all 9 readiness pillars
3. Produces a JSON report with structure: `{ "pillars": { "<name>": { "score": <0-100>, ... } }, "overallLevel": "L<N>" }`
4. Report has exactly 9 pillar entries
5. Each pillar score is a number 0-100
6. Overall level is ≥ L2

**Pass condition:** Output is valid JSON. Contains exactly 9 pillar keys. All scores are numbers in [0, 100]. Overall level field is present and ≥ "L2". No pillar has score 0 (agent-studio is a mature repo). Report is deterministic: two consecutive runs produce identical pillar scores.
**Fail condition:** JSON parse error, missing pillars, scores outside [0,100], overall level < L2, or non-deterministic scores between runs.

Evidence: readiness-report.json output, JSON schema validation result, diff between two consecutive runs

---

### VAL-E2E-004: Services.yaml Self-Resolution and Executability

Load agent-studio's own `.factory/services.yaml` and verify all commands resolve:
1. Parse `.factory/services.yaml` → extract `commands` map
2. For each canonical command name (install, test, test:framework, test:all, etc.), resolve to actual command string
3. Verify each resolved command's binary exists on PATH (e.g., `pnpm` for `pnpm test`)
4. Execute a dry-run or `--help` equivalent for at least the `install` and `test` commands to confirm they are runnable

**Pass condition:** All 15 canonical commands in services.yaml resolve to non-empty strings. The binary prefix of each resolved command (`pnpm`) is found on PATH. `pnpm install --frozen-lockfile` and `pnpm test --help` (or equivalent) exit with code 0. No command maps to an empty string or undefined.
**Fail condition:** Any command key resolves to empty/undefined, binary not on PATH, or basic executability check fails.

Evidence: services.yaml parsed content, resolution map (canonical → actual), PATH lookup results, exit codes from executability probes

---

### VAL-E2E-005: Dispatcher-to-Collector Round Trip

Verify the full Dispatcher → WorkerPool → Collector pipeline using the existing SQLite-based queue:
1. Create an in-memory SQLite database with queue schema
2. Instantiate BudgetEnforcementService with default limits
3. Instantiate WorkerPool with a mock processFn that returns `{ result: "ok" }` after 100ms delay
4. Instantiate Collector wrapping the pool
5. Enqueue a message via `enqueueMessage(db, payload)`
6. Call `emitNewMessage(id)` to wake dispatcher
7. Call `collector.waitForResult(id, 5000)`

**Pass condition:** waitForResult resolves (not rejects) within 5 seconds. Resolved value contains the original message id. processFn was called exactly once. BudgetEnforcementService reports 0 active workers after completion (slot released). SQLite row status is `completed`.
**Fail condition:** waitForResult times out, processFn called 0 or >1 times, budget slot leaked, or SQLite row stuck in `claimed`.

Evidence: waitForResult return value, processFn call count, budget.currentConcurrency post-run, SQLite queue row final status

---

### VAL-E2E-006: Task State Machine Recovery on Restart

Verify the A2A TaskStateMachine's orphan recovery (matching existing production code in task-state-machine.cjs):
1. Create TaskStateMachine with a SQLite database
2. Create Task-A → transition to `working`
3. Create Task-B → transition to `working` → transition to `completed`
4. Simulate crash: destroy the TaskStateMachine instance (but keep db)
5. Create a new TaskStateMachine with the same db
6. New instance runs `_restoreFromDb()`

**Pass condition:** Task-A (was `working` at crash) is now `failed` with error containing `orphaned`. Task-B (was `completed` at crash) is pruned or absent from in-memory map (terminal pruning). No tasks are in `working` state after recovery. DB row for Task-A has status `failed`.
**Fail condition:** Task-A still in `working` state after recovery, Task-B re-appears as non-terminal, or _restoreFromDb throws.

Evidence: task-state-machine listTasks() output post-recovery, SQLite a2a_tasks table dump, error field on Task-A

---

### VAL-E2E-007: Validation Gate Pass/Fail Determines Feature Outcome

End-to-end validation gate wired to a feature state:
1. Feature-X completes worker execution → handoff written
2. Validation gate runs scrutiny review on handoff
3. **Scenario A (pass):** Scrutiny returns `{ "status": "pass" }` → Feature-X → `completed`
4. **Scenario B (fail):** Scrutiny returns `{ "status": "fail", "blockingIssues": ["test failures"] }` → Feature-X → `validation-failed` → friction loop triggered
5. Friction loop re-dispatches → worker fixes → scrutiny passes → Feature-X → `completed`

**Pass condition:** In Scenario A, Feature-X reaches `completed` in exactly 1 validation round. In Scenario B, Feature-X reaches `completed` in exactly 2 validation rounds. scrutiny/synthesis.json records both rounds. Blocking issues from round 1 appear in the re-dispatch worker context.
**Fail condition:** Scenario A requires >1 round, Scenario B doesn't trigger friction loop, or blocking issues lost between rounds.

Evidence: scrutiny/synthesis.json with round count, state.json feature history, worker dispatch prompts for round 2

---

## Summary

| Area  | Count | IDs |
|-------|-------|-----|
| CROSS | 8     | VAL-CROSS-001 through VAL-CROSS-008 |
| E2E   | 7     | VAL-E2E-001 through VAL-E2E-007 |
| **Total** | **15** | |
