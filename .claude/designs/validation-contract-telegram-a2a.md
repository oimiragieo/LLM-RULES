# Validation Contract: Telegram & A2A Wiring (Milestone 3)

> **Status**: Draft
> **Date**: 2026-03-28
> **Scope**: Testable assertions for A2A server auto-start, A2A client, router integration, and Telegram coexistence
> **Design Ref**: `.claude/lib/a2a/` (server, agent-card, jsonrpc-handler, task-state-machine, sse-stream)
> **Telegram Ref**: `.claude/hooks/channels/channel-auto-start.cjs`

---

## Area 1 — A2A Server Auto-Start

### VAL-A2A-001: A2A server auto-starts on session boot as detached background process

A hook (e.g., `a2a-auto-start.cjs` registered on `UserPromptSubmit` or equivalent) spawns the A2A Express server as a fully detached background subprocess, identical to how `channel-auto-start.cjs` launches the Telegram relay.

**Pass condition**: After a fresh session boot with `A2A_AUTO_START=true` (or equivalent env flag), the A2A Express server is listening on port 3100 within 10 seconds. The server process is a detached child — killing the parent hook process does NOT terminate the A2A server.

**Fail condition**: The A2A server is not running after session boot, or it dies when the hook process exits.

**Evidence**: `curl http://localhost:3100/.well-known/agent.json` returns HTTP 200 with valid JSON after session boot. `ps` / `tasklist` shows the A2A server PID as a separate process tree from the Claude session.

---

### VAL-A2A-002: A2A server does NOT block the Router's event loop

The A2A auto-start hook spawns the server asynchronously and exits promptly. The hook MUST NOT call `start()` synchronously or `await` the server's listen callback in a way that blocks the hook's stdin/stdout contract.

**Pass condition**: The auto-start hook exits with code 0 within 5 seconds of invocation. The Router session continues accepting user prompts immediately — no perceptible delay attributable to A2A startup. The Express `app.listen()` call executes in the detached child process, not in the hook process.

**Fail condition**: The hook hangs, the Router is unresponsive during A2A startup, or `app.listen()` runs inside the hook process.

**Evidence**: Time the hook execution: `time node .claude/hooks/a2a-auto-start.cjs < /dev/null` completes in < 5s. The hook's stdout contains only valid JSON (no Express log output). Router accepts a prompt within 1 second of hook return.

---

### VAL-A2A-003: A2A auto-start uses cooldown/lockfile to prevent duplicate spawns

The auto-start hook uses an atomic lockfile (O_EXCL / `wx` flag) with a cooldown period (≥ 60 seconds) to prevent multiple A2A server instances from being spawned across rapid session restarts.

**Pass condition**: Invoking the auto-start hook twice within the cooldown period results in exactly one A2A server process. The second invocation exits silently with code 0 without spawning.

**Fail condition**: Two A2A server processes are running, or the second invocation errors out, or port 3100 is bound twice (EADDRINUSE).

**Evidence**: Run the hook twice in quick succession. `netstat -tlnp | grep 3100` (or equivalent) shows exactly one listener. The lockfile (e.g., `.claude/context/runtime/a2a-autostart-cooldown.lock`) exists and contains a recent timestamp.

---

### VAL-A2A-004: A2A PID tracking prevents duplicate servers

The auto-start hook records the A2A server PID in `terminal-pids.json` (or equivalent tracker file) with `purpose: 'a2a-server'` and `status: 'active'`. Before spawning, the hook checks this tracker and skips if the recorded PID is still alive.

**Pass condition**: After auto-start, `terminal-pids.json` contains a session entry with `purpose: 'a2a-server'`, `status: 'active'`, and a valid numeric `pid`. Calling the hook again while the server is alive results in no new process. If the recorded PID is dead, the hook spawns a new server and updates the tracker.

**Fail condition**: No PID entry is recorded, or a stale PID entry prevents a legitimate restart, or duplicate entries accumulate.

**Evidence**: Read `terminal-pids.json` after auto-start; assert one entry with `purpose: 'a2a-server'`. Kill the server PID manually, re-run the hook, and verify a new PID is recorded.

---

### VAL-A2A-005: A2A server graceful shutdown on session end

When the Claude session ends (or a shutdown hook fires), the A2A server PID is sent a termination signal. The server closes all open SSE streams, stops accepting new connections, and exits cleanly.

**Pass condition**: After session end, `curl http://localhost:3100/.well-known/agent.json` returns connection refused. The `terminal-pids.json` entry for `a2a-server` is updated to `status: 'stopped'` (or removed). No orphaned node processes remain bound to port 3100.

**Fail condition**: The A2A server remains running after session end, or SSE clients receive no close event, or the port remains bound.

**Evidence**: Start a session, verify A2A is running, end the session, verify port 3100 is free. Check `terminal-pids.json` for cleanup.

---

## Area 2 — A2A Server Endpoints

### VAL-A2A-006: A2A server serves agent card at /.well-known/agent.json

The A2A server responds to `GET /.well-known/agent.json` with a valid A2A Agent Card containing `name`, `description`, `url`, `version`, `capabilities`, and `skills` fields.

**Pass condition**: `GET /.well-known/agent.json` returns HTTP 200 with `Content-Type: application/json`. The response body contains:

- `name`: non-empty string
- `url`: string matching the server's base URL
- `capabilities.streaming`: `true`
- `skills`: array (may be empty if no agents registered; non-empty when agent-registry.json is populated)

**Fail condition**: The endpoint returns non-200, the response is not valid JSON, or required fields are missing/maltyped.

**Evidence**: `curl -s http://localhost:3100/.well-known/agent.json | jq .` validates JSON structure. Unit test: supertest GET request asserts all required fields.

---

### VAL-A2A-007: A2A server accepts JSON-RPC tasks/send at POST /a2a

The A2A server accepts `POST /a2a` with a JSON-RPC 2.0 request body `{ jsonrpc: "2.0", id: 1, method: "tasks/send", params: {...} }` and returns a task object in `working` state.

**Pass condition**: Response is HTTP 200 with JSON-RPC success envelope. `result.id` is a valid UUID. `result.status` is `"working"`. `result.createdAt` is a valid ISO 8601 timestamp.

**Fail condition**: Non-200 response, missing `result.id`, wrong status, or JSON-RPC error envelope returned.

**Evidence**: `curl -X POST http://localhost:3100/a2a -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tasks/send","params":{"input":"test"}}'` returns `{ "jsonrpc": "2.0", "id": 1, "result": { "id": "...", "status": "working", ... } }`.

---

### VAL-A2A-008: A2A server handles tasks/get

The A2A server responds to `tasks/get` with the current state of a previously created task.

**Pass condition**: After creating a task via `tasks/send`, a subsequent `tasks/get` with `params.id` set to the task ID returns HTTP 200 with the task object including correct `id`, `status`, and timestamps. Requesting a non-existent task ID returns JSON-RPC error code `-32001` (task not found) with HTTP 404.

**Fail condition**: `tasks/get` returns wrong task data, crashes, or returns 200 for non-existent tasks.

**Evidence**: Unit test: create task → get task → assert fields match. Get with bogus ID → assert error code -32001.

---

### VAL-A2A-009: A2A server handles tasks/cancel

The A2A server responds to `tasks/cancel` by transitioning a non-terminal task to `canceled` state.

**Pass condition**: After creating a task via `tasks/send`, a `tasks/cancel` with the task ID returns the task with `status: "canceled"`. A subsequent `tasks/get` confirms the canceled state persists. Canceling an already-terminal task returns a JSON-RPC error.

**Fail condition**: Cancel does not change task status, or canceling a terminal task succeeds silently.

**Evidence**: Unit test: create → cancel → get → assert status is `"canceled"`. Cancel again → assert error response.

---

### VAL-A2A-010: A2A server supports SSE streaming at POST /a2a/subscribe

The A2A server accepts `POST /a2a/subscribe` with a `tasks/sendSubscribe` JSON-RPC request and returns a Server-Sent Events stream.

**Pass condition**: The response has `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive` headers. The first SSE event is `event: status` with `data` containing `taskId` and `status: "working"`. The connection remains open for subsequent events until the task reaches a terminal state or the client disconnects.

**Fail condition**: Response is not SSE (wrong content-type), no initial status event is emitted, or the connection closes prematurely before task completion.

**Evidence**: `curl -N -X POST http://localhost:3100/a2a/subscribe -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tasks/sendSubscribe","params":{"input":"test"}}'` streams SSE events. Unit test with supertest verifies headers and first event.

---

### VAL-A2A-011: A2A server rejects tasks/sendSubscribe on plain /a2a endpoint

Sending `tasks/sendSubscribe` to `POST /a2a` (instead of `/a2a/subscribe`) returns a JSON-RPC error directing the caller to use the SSE endpoint.

**Pass condition**: Response is HTTP 400 with JSON-RPC error code `-32600` and a message mentioning `/a2a/subscribe`.

**Fail condition**: The request succeeds, crashes, or returns a non-descriptive error.

**Evidence**: Unit test: POST to `/a2a` with method `tasks/sendSubscribe` → assert 400 + error message contains "subscribe".

---

### VAL-A2A-012: A2A server uses SQLite persistence for task state

When the A2A server is constructed with a `db` parameter, task state is persisted to the `a2a_tasks` SQLite table. On server restart, non-terminal orphaned tasks are recovered and transitioned to `failed`.

**Pass condition**:

1. After `tasks/send`, the `a2a_tasks` table contains a row with matching `id` and `status`.
2. After server restart, previously `working` tasks show `status = 'failed'` with error `'orphaned: server restarted while task was in-progress'`.
3. Terminal tasks older than 1 hour are pruned from the table on startup.

**Fail condition**: Tasks are not persisted to SQLite, orphan recovery does not run, or stale rows accumulate indefinitely.

**Evidence**: Unit test: create task with db → query `a2a_tasks` table directly → assert row exists. Destroy state machine, create new one with same db → assert orphaned task is `failed`. Insert terminal row with old timestamp → create new state machine → assert row is pruned.

---

## Area 3 — A2A Client Library

### VAL-A2A-013: A2A client library exists and can discover remote agents

An A2A client module (e.g., `.claude/lib/a2a/client.cjs`) exists and can fetch a remote agent's Agent Card from `GET /.well-known/agent.json`.

**Pass condition**: `const client = new A2aClient('http://localhost:3100')` (or equivalent factory function) succeeds. `client.discover()` (or `client.getAgentCard()`) returns an object with `name`, `skills`, and `capabilities` fields matching the remote server's agent card.

**Fail condition**: No client module exists, or discovery throws, or returned data does not match the server's card.

**Evidence**: Unit/integration test: start A2A server → create client → call discover → assert card fields. File `.claude/lib/a2a/client.cjs` exists and exports a class or factory.

---

### VAL-A2A-014: A2A client can send tasks to remote agents

The A2A client can send a `tasks/send` JSON-RPC request to a remote A2A server and receive the created task object.

**Pass condition**: `client.sendTask({ input: "test" })` returns a task object with a valid UUID `id` and `status: "working"`.

**Fail condition**: The client throws, returns null, or the task object is malformed.

**Evidence**: Integration test: start server → client.sendTask() → assert returned task has `id` (UUID format) and `status === "working"`.

---

### VAL-A2A-015: A2A client can poll task status

The A2A client can poll a task's current status via `tasks/get`.

**Pass condition**: `client.getTask(taskId)` returns the task object with current `status`, `id`, and timestamps. Polling a non-existent task ID throws or returns an error indicator (not null with no error signal).

**Fail condition**: Polling returns stale data, crashes, or silently returns null for missing tasks.

**Evidence**: Integration test: send task → get task → assert status matches. Get with fake ID → assert error/throw.

---

### VAL-A2A-016: A2A client can cancel remote tasks

The A2A client can cancel a running task via `tasks/cancel`.

**Pass condition**: `client.cancelTask(taskId)` returns the task with `status: "canceled"`. A subsequent `client.getTask(taskId)` confirms the `canceled` state.

**Fail condition**: Cancel does not propagate, or the task remains in a non-terminal state after cancel.

**Evidence**: Integration test: send → cancel → get → assert `status === "canceled"`.

---

### VAL-A2A-017: A2A client can subscribe to SSE task streams

The A2A client can open an SSE connection via `tasks/sendSubscribe` and receive streaming status events.

**Pass condition**: `client.sendSubscribe({ input: "test" })` returns an async iterable, EventEmitter, or callback-based stream. The first event contains `status: "working"` and a valid `taskId`. The stream closes when the task reaches a terminal state.

**Fail condition**: No streaming API exists on the client, or the stream never emits events, or it does not clean up on terminal state.

**Evidence**: Integration test: subscribe → collect first event → assert `status === "working"`. Force task to `completed` → assert stream ends.

---

## Area 4 — Router ↔ A2A Integration

### VAL-A2A-018: Router can dispatch tasks to channel session via A2A

The Router (or an orchestrator agent) can use the A2A client to dispatch a task to a channel session's A2A server. The task params include enough context (agent ID, prompt, metadata) for the remote session to execute.

**Pass condition**: From a Router context, calling `a2aClient.sendTask({ agent: "developer", prompt: "fix bug #123" })` creates a task on the target A2A server. The target server's task state machine shows the task in `working` state with the correct params.

**Fail condition**: The Router cannot reach the A2A server, the task is not created, or params are lost/corrupted in transit.

**Evidence**: Integration test: start A2A server → Router sends task via client → query server's task state machine → assert task exists with correct params.

---

### VAL-A2A-019: Channel session can report task results back via A2A

When a channel session completes work on an A2A task, it transitions the task to `completed` and pushes a result artifact through the SSE stream (if subscribed) or makes it available via `tasks/get`.

**Pass condition**: After a task is dispatched and the channel session completes it, `tasks/get` returns `status: "completed"` with a `result` or `artifacts` field containing the output. If an SSE subscriber is connected, it receives a `status` event with `completed` and the result payload.

**Fail condition**: Task stays in `working` forever, no result is attached, or SSE subscribers are not notified.

**Evidence**: Integration test: send task → simulate channel completion (call `stateMachine.transition(taskId, 'completed')`) → get task → assert `status === "completed"`. Verify SSE stream received the completion event.

---

### VAL-A2A-020: A2A task failure propagates correctly

When a channel session fails to complete an A2A task, the task transitions to `failed` with an error message, and SSE subscribers are notified.

**Pass condition**: After transitioning a task to `failed` with an error string, `tasks/get` returns `status: "failed"`. SSE subscribers receive a `status` event with `failed`. The error message is preserved in the task object.

**Fail condition**: Failed tasks show wrong status, error message is lost, or SSE subscribers are not notified.

**Evidence**: Integration test: send task → transition to failed → get → assert status and error. SSE stream receives failure event.

---

## Area 5 — Coexistence & Regression

### VAL-A2A-021: Existing Telegram integration still works after A2A wiring

Adding the A2A auto-start hook and client library does not break the existing Telegram channel auto-start, relay server, 10 Telegram commands, or voice pipeline.

**Pass condition**: With both `CHANNEL_AUTO_START=true` and `A2A_AUTO_START=true`, both the Telegram channel session and the A2A server start successfully. The Telegram relay server binds to its port; the A2A server binds to port 3100. No port conflicts. All 10 Telegram commands respond correctly.

**Fail condition**: Telegram auto-start fails, commands error out, or the two hooks interfere (e.g., shared lockfile collision, PID tracker corruption).

**Evidence**: Start session with both flags → verify both services are running (`curl` both endpoints). Run Telegram command smoke test. Verify `terminal-pids.json` contains separate entries for `channel-session` and `a2a-server`.

---

### VAL-A2A-022: A2A and Telegram use independent lockfiles

The A2A auto-start hook uses its own lockfile (e.g., `a2a-autostart-cooldown.lock`) separate from the Telegram channel's lockfile (`channel-autostart-cooldown.lock`). Neither hook's cooldown interferes with the other.

**Pass condition**: Both lockfiles exist independently in `.claude/context/runtime/`. Triggering the A2A cooldown does not prevent Telegram from starting, and vice versa.

**Fail condition**: A shared lockfile causes one service's cooldown to block the other, or both hooks write to the same lockfile.

**Evidence**: Inspect runtime directory after both hooks fire. Assert two distinct lockfile paths. Trigger A2A hook during Telegram cooldown → A2A still starts.

---

### VAL-A2A-023: A2A server does not interfere with existing Express/HTTP services

If other services (e.g., MCP servers, Telegram relay) are running on different ports, the A2A server on port 3100 does not conflict. The A2A server's `express.json()` middleware and routes are scoped to its own app instance.

**Pass condition**: A2A server starts on port 3100 while Telegram relay runs on its port. Both respond to requests independently. No shared global state or middleware leakage between Express instances.

**Fail condition**: Port conflict (EADDRINUSE), middleware from one server affects the other, or shared state corruption.

**Evidence**: Start both services → `curl` each independently → both return correct responses. No error logs about port conflicts.

---

### VAL-A2A-024: A2A server zombie watchdog transitions stuck tasks

The `TaskStateMachine` zombie watchdog transitions tasks stuck in `working` or `input-required` state for longer than `ZOMBIE_TIMEOUT_MS` (30 minutes) to `failed`.

**Pass condition**: A task created and left in `working` state without updates is automatically transitioned to `failed` after 30 minutes. The watchdog interval (`ZOMBIE_CHECK_INTERVAL_MS` = 5 minutes) runs via `setInterval` with `.unref()` so it does not prevent process exit.

**Fail condition**: Zombie tasks remain in `working` state indefinitely, or the watchdog blocks process exit in tests.

**Evidence**: Unit test: create task → advance timer past 30 minutes (or mock interval) → assert task status is `failed`. Verify interval handle is `.unref()`'d.

---

### VAL-A2A-025: A2A JSON-RPC validates request shape

All `POST /a2a` requests are validated against JSON-RPC 2.0 spec before dispatch. Invalid requests receive appropriate error codes.

**Pass condition**:

1. Missing `jsonrpc` field → HTTP 400 with error code `-32600`.
2. Wrong `jsonrpc` version (e.g., `"1.0"`) → HTTP 400 with error code `-32600`.
3. Missing `method` field → HTTP 400 with error code `-32600`.
4. Unknown method → HTTP 404 with error code `-32601`.
5. Invalid `id` type (e.g., boolean) → HTTP 400 with error code `-32600`.
6. Notification (no `id`) → HTTP 204 with no body.

**Fail condition**: Invalid requests are processed without error, or wrong error codes are returned.

**Evidence**: Unit tests exercising each invalid-request case with supertest; assert HTTP status and JSON-RPC error code for each.

---

### VAL-A2A-026: A2A server interrupt endpoint cancels task and closes SSE

`POST /a2a/tasks/:id/interrupt` cancels a running task and closes its associated SSE stream.

**Pass condition**: After subscribing via `/a2a/subscribe`, calling `POST /a2a/tasks/{taskId}/interrupt` returns `{ taskId, status: "canceled" }`. The SSE stream receives a `status: canceled` event and then closes. A subsequent `tasks/get` confirms `canceled` status.

**Fail condition**: The interrupt endpoint does not cancel the task, the SSE stream remains open, or the status is not updated.

**Evidence**: Integration test: subscribe → interrupt → assert SSE receives canceled event → assert stream closes → get task → assert canceled.

---

## Summary

| ID          | Area        | Assertion                                              |
| ----------- | ----------- | ------------------------------------------------------ |
| VAL-A2A-001 | Auto-Start  | A2A server auto-starts as detached background process  |
| VAL-A2A-002 | Auto-Start  | A2A server does NOT block Router's event loop          |
| VAL-A2A-003 | Auto-Start  | Cooldown/lockfile prevents duplicate spawns            |
| VAL-A2A-004 | Auto-Start  | PID tracking in terminal-pids.json                     |
| VAL-A2A-005 | Auto-Start  | Graceful shutdown on session end                       |
| VAL-A2A-006 | Endpoints   | Serves agent card at /.well-known/agent.json           |
| VAL-A2A-007 | Endpoints   | Accepts JSON-RPC tasks/send at POST /a2a               |
| VAL-A2A-008 | Endpoints   | Handles tasks/get                                      |
| VAL-A2A-009 | Endpoints   | Handles tasks/cancel                                   |
| VAL-A2A-010 | Endpoints   | Supports SSE streaming at POST /a2a/subscribe          |
| VAL-A2A-011 | Endpoints   | Rejects sendSubscribe on plain /a2a endpoint           |
| VAL-A2A-012 | Endpoints   | SQLite persistence for task state                      |
| VAL-A2A-013 | Client      | Client library exists and can discover remote agents   |
| VAL-A2A-014 | Client      | Client can send tasks to remote agents                 |
| VAL-A2A-015 | Client      | Client can poll task status                            |
| VAL-A2A-016 | Client      | Client can cancel remote tasks                         |
| VAL-A2A-017 | Client      | Client can subscribe to SSE task streams               |
| VAL-A2A-018 | Integration | Router can dispatch tasks via A2A                      |
| VAL-A2A-019 | Integration | Channel session reports results back via A2A           |
| VAL-A2A-020 | Integration | Task failure propagates correctly                      |
| VAL-A2A-021 | Regression  | Telegram integration still works after A2A wiring      |
| VAL-A2A-022 | Regression  | A2A and Telegram use independent lockfiles             |
| VAL-A2A-023 | Regression  | A2A server does not interfere with other HTTP services |
| VAL-A2A-024 | Resilience  | Zombie watchdog transitions stuck tasks                |
| VAL-A2A-025 | Validation  | JSON-RPC validates request shape                       |
| VAL-A2A-026 | Resilience  | Interrupt endpoint cancels task and closes SSE         |
