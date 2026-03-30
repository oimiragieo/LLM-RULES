# Worker-Bridge Milestone — Testable Behavioral Assertions

> Generated from codebase analysis of `.claude/lib/workers/dispatcher.cjs`,
> `worker-pool.cjs`, `worker-runner.cjs`, `budget-enforcement.cjs`,
> `db/queue-operations.cjs`, and existing test patterns in `tests/lib/workers/`.
>
> All new modules target `.claude/lib/mission/` — CommonJS (.cjs), node:test, Windows-compatible.

---

## 1. Handoff Directory Watcher

### VAL-HW-001: Detects new JSON file in handoffs/ directory

When a valid `.json` file is written to the handoffs/ directory, the watcher emits a `handoff-detected` event containing the parsed JSON payload and the filename.
Evidence: Event listener callback receives `{ filename, payload }` within 2 seconds of file creation.

### VAL-HW-002: fs.watch with polling fallback on Windows

On NTFS (detected via `process.platform === 'win32'`), the watcher falls back to `fs.watchFile` polling (interval ≤ 1000 ms) when `fs.watch` is unavailable or unreliable. On other platforms, `fs.watch` is used.
Evidence: Inspect internal `_watchMode` property; on simulated win32 platform, polling is used; on posix, native `fs.watch` is used.

### VAL-HW-003: Debounce prevents duplicate processing (500 ms)

When the same file triggers multiple filesystem events within 500 ms (common on Windows — CREATE + MODIFY), the watcher emits exactly one `handoff-detected` event for that file.
Evidence: Write a file, count events within 1 second — assert count === 1.

### VAL-HW-004: FIFO ordering by timestamp in filename

When multiple handoff files exist (e.g. `1711700000000-task-a.json`, `1711700001000-task-b.json`), they are processed in ascending timestamp order regardless of filesystem enumeration order.
Evidence: Drop 3 files with distinct timestamps simultaneously; assert `handoff-detected` events arrive in timestamp-ascending order.

### VAL-HW-005: Malformed JSON file emits error event, does not crash

When a file containing invalid JSON is placed in handoffs/, the watcher emits a `handoff-error` event with `{ filename, error }` and continues watching for subsequent files.
Evidence: Write `{bad json` to handoffs/; assert `handoff-error` fires with a SyntaxError; then write a valid file and assert `handoff-detected` fires normally.

### VAL-HW-006: Partially-written file is retried after delay

When a file is still being written (0-byte or incomplete JSON on first read), the watcher retries reading after a configurable delay (default 200 ms, max 3 retries) before emitting `handoff-error`.
Evidence: Create a 0-byte file, then append valid JSON 150 ms later; assert `handoff-detected` fires. Create a 0-byte file that stays empty; assert `handoff-error` fires after retries exhausted.

### VAL-HW-007: File deletion does not trigger processing

When a `.json` file is deleted from handoffs/, no `handoff-detected` or `handoff-error` event is emitted.
Evidence: Create then delete a file; assert zero events emitted after the deletion.

### VAL-HW-008: Non-JSON files are ignored

When a non-`.json` file (e.g. `.tmp`, `.bak`, `.txt`) appears in handoffs/, no events are emitted.
Evidence: Write `handoffs/notes.txt`; assert zero `handoff-detected` events within 1 second.

### VAL-HW-009: Watcher start/stop lifecycle is clean

Calling `stop()` removes all filesystem watchers and clears pending timers. No events fire after stop. Calling `start()` again re-registers watchers cleanly.
Evidence: `start()` → write file → assert event → `stop()` → write another file → assert zero events → `start()` → write file → assert event.

---

## 2. Worker-to-Features Dispatcher

### VAL-WD-001: Reads features.json and selects next pending feature with met preconditions

Given a `features.json` with features in `pending` status, the dispatcher selects the first feature whose `preconditions` array references only features with status `done`.
Evidence: Provide features.json with A(done), B(pending, preconditions:[A]), C(pending, preconditions:[A,B]); assert B is selected (not C).

### VAL-WD-002: Enqueues selected feature to existing SQLite worker pool

When a dispatchable feature is found, the dispatcher calls `enqueueMessage(db, ...)` on the existing SQLite queue with the feature's `id`, `skillName`, and stringified context.
Evidence: After dispatch, `getPendingCount(db)` increases by 1; the enqueued row's `text` field contains the feature id and skillName.

### VAL-WD-003: Passes skillName and persona context in enqueued message

The enqueued message includes a JSON payload with `featureId`, `skillName`, and `personaContext` fields that the worker can parse downstream.
Evidence: Claim the enqueued message; parse its text/attachments; assert all three fields are present and match the features.json node.

### VAL-WD-004: No-op when no features are pending

When all features in features.json have status `done` or `failed`, the dispatcher returns early without enqueuing anything.
Evidence: Call `dispatch()`; assert return value is `null` or `{ dispatched: false }`; assert `getPendingCount(db)` is unchanged.

### VAL-WD-005: No-op when all pending features have unmet preconditions

When pending features exist but all have preconditions referencing features that are not `done`, the dispatcher returns early.
Evidence: features.json has A(pending, preconditions:[B]), B(pending, preconditions:[A]) (circular); assert `dispatch()` returns `{ dispatched: false, reason: 'no_eligible' }`.

### VAL-WD-006: Respects worker pool budget (full/busy)

When `budget.acquireWorkerSlot()` returns `{ allowed: false }`, the dispatcher does not enqueue and returns a retry-after hint.
Evidence: Exhaust budget slots; call `dispatch()`; assert no row enqueued; assert return includes `retryAfterMs`.

### VAL-WD-007: Feature priority ordering (lower index = higher priority)

When multiple features are eligible (all preconditions met), the dispatcher selects the one with the lowest array index in features.json (natural document order).
Evidence: features.json has B(index 0, pending, no preconditions), A(index 1, pending, no preconditions); assert B is dispatched first.

---

## 3. Worker Persona Injection

### VAL-PI-001: Composes 3-layer system prompt

The persona injector produces a prompt string containing exactly three clearly delimited sections: (1) Base boilerplate, (2) Skill template from SKILL.md, (3) Mission context from mission.md + features.json node.
Evidence: Parse output for section delimiters; assert all three sections present and non-empty.

### VAL-PI-002: Includes mission.md objectives in mission context layer

The mission context layer contains the objectives extracted from mission.md.
Evidence: Provide a mission.md with `## Objectives\n- Build X\n- Ship Y`; assert both objectives appear verbatim in layer 3.

### VAL-PI-003: Includes features.json node fields in mission context layer

The mission context layer contains the current feature's `id`, `title`, `description`, `acceptanceCriteria`, and `preconditions` fields.
Evidence: Assert each field's value appears in the composed prompt.

### VAL-PI-004: Prompt is frozen (immutable) after injection

After `composePersona()` returns, the resulting object is `Object.isFrozen()` and any attempt to mutate it throws a TypeError in strict mode.
Evidence: `assert.ok(Object.isFrozen(persona))` and `assert.throws(() => { persona.prompt = 'hacked'; })`.

### VAL-PI-005: Missing SKILL.md uses fallback boilerplate

When the referenced `skillName` has no corresponding SKILL.md file, the skill template layer is replaced with a default fallback string (e.g., "Generic worker — no skill template available.") and no error is thrown.
Evidence: Call `composePersona({ skillName: 'nonexistent' })`; assert layer 2 equals the fallback string; assert no exception.

### VAL-PI-006: Empty mission.md objectives produce warning in prompt

When mission.md contains no `## Objectives` section or the section is empty, the mission context layer includes a warning string (e.g., "[WARNING] No objectives found in mission.md") and does not throw.
Evidence: Provide empty mission.md; assert warning string present in layer 3.

### VAL-PI-007: Token budget cap for injected context

The total character count of the composed prompt does not exceed a configurable `maxPromptChars` limit (default: 12000 chars ≈ 3000 tokens). If the raw content exceeds the limit, it is truncated with a `[TRUNCATED]` marker.
Evidence: Provide a 20 KB mission.md; assert output length ≤ `maxPromptChars`; assert `[TRUNCATED]` marker present.

---

## 4. Friction Loop Engine

### VAL-FL-001: Validation failure triggers worker revival

When a worker emits `worker-error` and the error is a validation failure (error.code === 'VALIDATION_FAILED' or similar), the friction loop engine re-enqueues the task rather than marking it as permanently failed.
Evidence: Simulate worker-error with validation failure; assert a new message is enqueued with `attempt_count` incremented.

### VAL-FL-002: Revived worker receives original context + stderr dump + iteration count

The re-enqueued message's payload includes the original feature context, the captured stderr output from the failed attempt, and the current iteration number.
Evidence: Parse the re-enqueued row; assert `originalContext`, `stderrDump`, and `iteration` fields are present and correct.

### VAL-FL-003: Escalation ladder — retry at iteration 1

At iteration 1 (first failure), the engine re-enqueues with strategy `retry` — same prompt, same context, plus the stderr dump.
Evidence: Trigger first failure; assert re-enqueued message has `strategy: 'retry'` and `iteration: 1`.

### VAL-FL-004: Escalation ladder — replan at iteration 2

At iteration 2 (second consecutive failure), the engine re-enqueues with strategy `replan` — includes a directive to reconsider the approach.
Evidence: Trigger second failure; assert `strategy: 'replan'` and `iteration: 2`.

### VAL-FL-005: Escalation ladder — human-intervention at iteration 3

At iteration 3 (third consecutive failure), the engine does NOT re-enqueue. Instead it emits a `human-intervention-required` event with a full context dump.
Evidence: Trigger third failure; assert no new enqueue; assert `human-intervention-required` event fired with `{ featureId, context, stderrHistory, iterations: 3 }`.

### VAL-FL-006: Repeated failure at same point does not loop infinitely

The engine tracks consecutive failures per feature. After reaching the escalation cap (iteration 3), subsequent failures for the same feature are dropped with a `friction-capped` event, not re-enqueued.
Evidence: Trigger 5 failures for the same feature; assert exactly 2 re-enqueues (iterations 1 and 2), 1 human-intervention event (iteration 3), and 2 `friction-capped` events (iterations 4 and 5).

### VAL-FL-007: Transient vs fundamental error discrimination

Errors with `error.transient === true` (e.g., network timeout, ECONNRESET) always use `retry` strategy regardless of iteration count, and do not advance the escalation counter.
Evidence: Trigger 3 transient errors; assert all 3 re-enqueues use `strategy: 'retry'`; assert escalation counter remains at 0.

### VAL-FL-008: Human escalation context dump is complete

The `human-intervention-required` event payload includes: `featureId`, `featureTitle`, `originalPrompt`, `stderrHistory` (array of all stderr dumps per iteration), `iterationCount`, and `suggestedAction`.
Evidence: Assert all 6 fields are present and non-null in the event payload.

---

## Summary

| Area                          | Prefix | Count  |
| ----------------------------- | ------ | ------ |
| Handoff Directory Watcher     | HW     | 9      |
| Worker-to-Features Dispatcher | WD     | 7      |
| Worker Persona Injection      | PI     | 7      |
| Friction Loop Engine          | FL     | 8      |
| **Total**                     |        | **31** |
