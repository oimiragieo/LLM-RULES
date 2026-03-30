# Mission-Core Validation Contract

Area prefixes: **MC** (Mission-Core Workspace Provisioner), **FS** (Features State Machine), **MX** (Mutex / state.json), **MP** (Mission Parser), **AP** (AGENTS.md Parser)

---

## 1 — Mission Workspace Provisioner (MC)

### VAL-MC-001: Fresh workspace provisioning creates required directory tree

When `provisionWorkspace({ missionId })` is called with a valid UUID, the provisioner must create: `<root>/.claude/missions/<uuid>/` with subdirectories `features/`, `state/`, `logs/`, and `context/`. Pass: all four subdirectories exist after the call. Fail: any subdirectory missing.
Evidence: `fs.existsSync` on each of the four paths returns `true`.

### VAL-MC-002: Manifest file is written with correct schema

After provisioning, `<workspace>/manifest.json` must exist and contain at minimum: `{ missionId: <uuid>, createdAt: <ISO-8601>, version: "1.0.0" }`. The JSON must be parseable and pass AJV schema validation. Pass: AJV validates without errors. Fail: missing file, parse error, or schema violation.
Evidence: `safeReadJSON(manifestPath, 'mission-manifest')` returns a valid object; AJV `validate(schema, data)` returns `true`.

### VAL-MC-003: Parent directory auto-creation (recursive mkdir)

If the parent path `.claude/missions/` does not exist, the provisioner must create it recursively (equivalent to `mkdir -p`). Pass: calling `provisionWorkspace` on a fresh project root with no `.claude/missions/` directory succeeds and all paths exist. Fail: throws ENOENT or any filesystem error.
Evidence: Remove `.claude/missions/` before test, call provisioner, verify directory tree exists.

### VAL-MC-004: Duplicate workspace UUID is rejected

If a workspace directory for the given UUID already exists, the provisioner must throw an error with a descriptive message (e.g., `WORKSPACE_EXISTS`). It must NOT overwrite or merge with the existing workspace. Pass: error thrown with identifiable code/message. Fail: silent overwrite or no error.
Evidence: Provision once, provision again with same UUID, assert error type/message.

### VAL-MC-005: Provisioner returns workspace metadata object

The return value of `provisionWorkspace()` must be an object containing `{ missionId, workspacePath, createdAt }` so callers can chain operations. Pass: returned object has all three keys with correct types (string, string, string). Fail: returns undefined/null or missing keys.
Evidence: Assert `typeof result.missionId === 'string'` etc.

---

## 2 — features.json State Machine (FS)

### VAL-FS-001: Valid transition pending → in_progress succeeds

Calling `transitionFeature(featureId, 'in_progress')` on a feature with status `pending` must succeed, updating the status to `in_progress` and setting `startedAt` timestamp. Pass: status is `in_progress`, `startedAt` is a valid ISO-8601 string. Fail: error thrown or status unchanged.
Evidence: Read features.json after transition, verify status and timestamp.

### VAL-FS-002: Valid transition in_progress → validating succeeds

A feature in `in_progress` state must be transitionable to `validating`. Pass: status updates to `validating`. Fail: error or no-op.
Evidence: Read features.json, verify `status === 'validating'`.

### VAL-FS-003: Valid transition validating → completed succeeds

A feature in `validating` state must be transitionable to `completed`, setting `completedAt` timestamp. Pass: status is `completed`, `completedAt` set. Fail: error or no-op.
Evidence: Read features.json, verify status and completedAt.

### VAL-FS-004: Valid transition in_progress → failed succeeds with retry counter

Transitioning to `failed` must increment `retryCount` (starting from 0). Pass: `retryCount` incremented by 1, status is `failed`, `failedAt` timestamp set. Fail: retryCount not incremented or status wrong.
Evidence: Transition to failed twice (via failed→pending→in_progress→failed cycle), verify retryCount is 2.

### VAL-FS-005: Valid transition failed → pending (retry) succeeds

A `failed` feature can be retried by transitioning back to `pending`. Pass: status is `pending`, retryCount preserved. Fail: error or retryCount reset.
Evidence: Transition failed→pending, verify status and retryCount unchanged.

### VAL-FS-006: Invalid transition pending → completed is rejected

Attempting to skip directly from `pending` to `completed` must throw a `INVALID_TRANSITION` error. Pass: error thrown with descriptive message. Fail: transition succeeds silently.
Evidence: Assert error code/message matches `INVALID_TRANSITION`.

### VAL-FS-007: Invalid transition completed → any state is rejected (terminal state)

Once a feature reaches `completed`, no further transitions are allowed. Attempts to transition to `pending`, `in_progress`, `failed`, or `validating` must all throw. Pass: all four transition attempts throw `INVALID_TRANSITION`. Fail: any succeeds.
Evidence: Attempt each of the four transitions from `completed`, all must throw.

### VAL-FS-008: Invalid transition pending → failed is rejected

A feature that was never started cannot fail. Pass: error thrown. Fail: transition succeeds.
Evidence: Assert error on `transitionFeature(id, 'failed')` from `pending`.

### VAL-FS-009: Precondition check blocks dependent feature

Feature B declares `dependsOn: ['A']`. If Feature A is not `completed`, transitioning Feature B from `pending` to `in_progress` must throw `PRECONDITION_NOT_MET`. Pass: error with message identifying the unmet dependency. Fail: transition proceeds.
Evidence: Create A (pending) and B (pending, depends on A), transition B→in_progress, assert error.

### VAL-FS-010: Precondition check passes when dependency is completed

Same setup as VAL-FS-009, but after Feature A is `completed`, Feature B must be transitionable to `in_progress`. Pass: transition succeeds. Fail: still blocked.
Evidence: Complete A's full lifecycle, then transition B→in_progress, assert success.

### VAL-FS-011: Circular dependency detection

If Feature A depends on B and B depends on A, loading or validating features.json must detect the cycle and throw `CIRCULAR_DEPENDENCY`. Pass: error thrown at load/validate time. Fail: accepted silently (would cause deadlock).
Evidence: Write features.json with circular deps, call `loadFeatures()` or `validateFeatures()`, assert error.

### VAL-FS-012: Malformed features.json is rejected gracefully

If features.json contains invalid JSON (truncated, syntax error), the loader must throw a descriptive error (not crash with unhandled exception). Pass: error has message indicating parse failure with file path. Fail: unhandled SyntaxError or silent empty return.
Evidence: Write `{invalid` to features.json, call `loadFeatures()`, assert controlled error.

### VAL-FS-013: Unknown status value in features.json is rejected

If a feature has `status: "banana"`, schema validation must reject it. Pass: AJV validation error identifying the invalid enum value. Fail: accepted as valid.
Evidence: Write feature with unknown status, call `validateFeatures()`, assert schema error.

### VAL-FS-014: Atomic write safety for features.json

State transitions must use atomic write (write-to-temp then rename) to prevent corruption on crash. Pass: after a transition, verify the write went through `atomicWriteJSONSync` (or equivalent). A mid-write crash simulation must not leave a corrupted features.json. Fail: direct `fs.writeFileSync` used, or corruption possible.
Evidence: Mock/spy on `atomicWriteJSONSync`, verify it is called during transition. Alternatively, verify temp file pattern is used.

---

## 3 — state.json Global Mutex (MX)

### VAL-MX-001: Acquiring lock in orchestrator_turn succeeds

When state.json `turn` field is `orchestrator_turn` and the orchestrator requests the lock, it must be granted. Pass: lock acquired, state.json updated with `lockedBy` and `lockedAt`. Fail: lock denied or state unchanged.
Evidence: Set turn to `orchestrator_turn`, acquire lock as orchestrator, read state.json, verify lock fields.

### VAL-MX-002: Worker cannot acquire lock during orchestrator_turn

When state.json `turn` is `orchestrator_turn`, a worker requesting the lock must be denied with a `TURN_VIOLATION` error. Pass: error thrown. Fail: lock granted to worker.
Evidence: Set turn to `orchestrator_turn`, attempt worker lock acquisition, assert error.

### VAL-MX-003: Worker acquires lock during worker_turn

When turn is `worker_turn` and the specific worker is designated, that worker must be able to acquire the lock. Pass: lock granted. Fail: denied.
Evidence: Set turn to `worker_turn` with designated worker ID, acquire lock, verify success.

### VAL-MX-004: Stale lock detection and recovery

If a lock is held but the `lockedAt` timestamp is older than the stale threshold (e.g., 30 seconds on Windows), the next lock acquisition attempt must forcibly release the stale lock and grant it to the new requester. Pass: stale lock overridden, new lock granted. Fail: permanent deadlock.
Evidence: Write state.json with `lockedAt` = 60 seconds ago, attempt lock acquisition, assert success and updated lock fields.

### VAL-MX-005: Timeout behavior on contested lock (30s on Windows)

If a lock is legitimately held (not stale) and another agent tries to acquire it, the attempt must time out after the configured duration (30s on Windows). Pass: after timeout, a `LOCK_TIMEOUT` error is thrown. Fail: hangs indefinitely or returns immediately without lock.
Evidence: Acquire lock, attempt second acquisition with timeout, measure elapsed time, assert error after ~30s (±5s tolerance).

### VAL-MX-006: Concurrent access prevention (mutual exclusion)

Two simultaneous lock acquisition attempts must result in exactly one success and one failure/wait. Pass: only one caller holds the lock at any time. Fail: both callers believe they hold the lock (race condition).
Evidence: Launch two parallel lock attempts, verify only one completes successfully before the other. Check `lockedBy` in state.json matches exactly one agent.

### VAL-MX-007: State file corruption recovery

If state.json is corrupted (invalid JSON, empty file, truncated), the mutex module must detect the corruption and reinitialize state.json with safe defaults (unlocked state, orchestrator_turn). Pass: after encountering corruption, state.json is valid and unlocked. Fail: unhandled parse error or permanent broken state.
Evidence: Write `{corrupt` to state.json, attempt lock operation, verify state.json is reinitialized and valid.

### VAL-MX-008: Lock release clears lock fields

When `releaseLock()` is called by the lock holder, `lockedBy` and `lockedAt` must be cleared (set to `null`). Pass: both fields are `null` after release. Fail: stale lock data persists.
Evidence: Acquire lock, release it, read state.json, assert `lockedBy === null && lockedAt === null`.

---

## 4 — mission.md Parser (MP)

### VAL-MP-001: Extracts objectives section from well-formed mission.md

Given a mission.md with `## Objectives` containing bullet points, the parser must return an array of objective strings. Pass: returned array matches the bullets in the document. Fail: empty array or incorrect content.
Evidence: Parse a fixture mission.md with 3 objectives, assert `result.objectives.length === 3` and content matches.

### VAL-MP-002: Extracts anti-goals section

Given a mission.md with `## Anti-Goals`, the parser must return an array of anti-goal strings. Pass: array matches document content. Fail: missing or wrong.
Evidence: Parse fixture, assert `result.antiGoals` matches expected values.

### VAL-MP-003: Extracts architectural decisions section

Given a mission.md with `## Architectural Decisions` or `## Architecture`, the parser must return structured decisions. Pass: decisions array populated. Fail: empty or missing.
Evidence: Parse fixture with 2 architectural decisions, assert `result.architecturalDecisions.length === 2`.

### VAL-MP-004: Missing sections return empty arrays (not errors)

If mission.md lacks an `## Objectives` section, `result.objectives` must be `[]` (empty array), not `undefined` or an error. Same for all optional sections. Pass: all section fields exist and are empty arrays. Fail: undefined, null, or thrown error.
Evidence: Parse a mission.md with only a title and no sections, assert all section fields are `[]`.

### VAL-MP-005: Empty mission.md returns default structure

An empty file (0 bytes) must parse to a valid default structure `{ objectives: [], antiGoals: [], architecturalDecisions: [], rawContent: '' }`. Pass: structure matches. Fail: error thrown or fields missing.
Evidence: Parse empty string, assert default structure.

### VAL-MP-006: Condensed context injection into worker prompts

The `injectMissionContext(prompt, parsedMission)` function must append a `## Mission Context` section to the prompt containing summarized objectives and anti-goals. Pass: output prompt contains `## Mission Context` with content derived from the parsed mission. Fail: prompt unchanged or mission data missing.
Evidence: Call `injectMissionContext` with a base prompt and parsed mission with 2 objectives, assert output contains `## Mission Context` and both objectives.

---

## 5 — AGENTS.md Semantic Parser (AP)

### VAL-AP-001: Extracts Build & Test section

Given an AGENTS.md with `## Build & Test` containing commands, the parser must return the commands as structured data. Pass: `result.buildAndTest` contains the expected command strings. Fail: empty or wrong.
Evidence: Parse fixture AGENTS.md, assert `result.buildAndTest` includes e.g. `pnpm test`.

### VAL-AP-002: Extracts Architecture section

`## Architecture` or `## Project Architecture` section must be extracted. Pass: `result.architecture` populated. Fail: empty.
Evidence: Parse fixture, assert `result.architecture` is a non-empty string or structured object.

### VAL-AP-003: Extracts Git Workflows section

`## Git Workflows` or `## Git` section must be extracted, including branch naming conventions and commit message rules. Pass: `result.gitWorkflows` populated. Fail: empty.
Evidence: Parse fixture, assert `result.gitWorkflows` is non-empty.

### VAL-AP-004: Extracts Security section

`## Security` section must be extracted. Pass: `result.security` populated. Fail: empty.
Evidence: Parse fixture, assert `result.security` is non-empty.

### VAL-AP-005: Discovery override hierarchy (cwd → parent → user global)

The parser must search for AGENTS.md in this order: (1) `cwd/AGENTS.md`, (2) parent directories up to filesystem root, (3) `~/.claude/AGENTS.md` (user global). The first found file wins. Pass: when AGENTS.md exists in both cwd and parent, the cwd version is used. Fail: wrong file selected or search order violated.
Evidence: Create AGENTS.md in both cwd and parent with distinct content, parse, assert cwd content is returned.

### VAL-AP-006: Missing AGENTS.md returns default empty structure

If no AGENTS.md is found anywhere in the hierarchy, the parser must return a default structure with empty sections (not throw). Pass: returns `{ buildAndTest: null, architecture: null, gitWorkflows: null, security: null }` or equivalent. Fail: error thrown.
Evidence: Parse from a temp directory with no AGENTS.md, assert default structure returned.

### VAL-AP-007: Malformed markdown handled gracefully

If AGENTS.md contains broken markdown (unclosed fences, missing headings), the parser must extract what it can and return partial results rather than throwing. Pass: parser returns a result (possibly with empty sections for broken parts). Fail: unhandled error.
Evidence: Parse AGENTS.md with unclosed code fence and missing `##` delimiters, assert no throw and result object is returned.

---

## Cross-Cutting Concerns

### VAL-MC-006: All modules use CommonJS exports

Every module in `.claude/lib/mission/` must use `module.exports = { ... }` (CommonJS), not ES module `export`. Pass: `grep -c 'module.exports' <file>` >= 1 for each `.cjs` file. Fail: any file uses `export default` or `export {`.
Evidence: Static analysis of all `.cjs` files in the mission directory.

### VAL-FS-015: Schema validation uses AJV (project convention)

All JSON schema validation in the mission engine must use AJV (consistent with the rest of agent-studio). Pass: `require('ajv')` appears in the validation module. Fail: custom validation or different library used.
Evidence: Grep for `require('ajv')` in mission modules.
