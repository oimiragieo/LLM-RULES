<!-- Agent: planner | Task: #6 | Session: 2026-03-10 -->

# TDD Implementation Plan: Shift Change Context Handoff

**Status**: READY_FOR_IMPLEMENTATION
**Complexity**: HIGH (multi-file, new subsystem, hook integration)
**Council Approval**: APPROVE_WITH_MODIFICATIONS (all 4 modifications applied)
**Date**: 2026-03-10

---

## 1. Executive Summary

**What is being built (Phases 1-3):**

- **Phase 1 — Handover Log Foundation**: A JSON schema, atomic writer, and reader for the shift-change handover log that captures session state (objectives, tasks, memory pointers, subagent states, context summary) in a single machine-readable document
- **Phase 2 — Finish-Only Drain Mode**: A durable `drain-state.json` flag file plus a PreToolUse hook (`finish-only-guard.cjs`) that blocks new `TaskCreate` calls when the session enters drain mode, with sessionId-awareness to prevent new sessions from inheriting stale drain state
- **Phase 3 — Session Resume Detection**: A `handover-detector.cjs` UserPromptSubmit hook that detects fresh sessions with an existing handover log and injects resume context, plus a `session-id-manager.cjs` utility for per-session identity tracking

**What is NOT being built:**

- Phase 4 (Terminal Automation) is explicitly excluded and gated behind Phases 1-3 TDD suite passing. See Section 6 for placeholder.

**Council modifications applied:**

1. Marker-file over PID kill (primary handoff = `session-expired.json`, PID = best-effort)
2. Finish-Only mode = BOTH PreToolUse hook AND durable `drain-state.json` with `sessionId` + `drainDeadline`
3. Enhanced handover log schema with all council-approved fields (`schemaVersion`, `handoffId`, `generation`, `status`, `contextSummary`, `pendingMemoryWrites`, `subagentStates`, `resumeInstructions`, `drainDeadline`)
4. Phase 4 gated on Phases 1-3 TDD suite

---

## 2. Architecture Overview

### Component Diagram

```
                          Session Lifecycle
                          ================

  [spawn-token-guard.cjs]   --(80% threshold)-->  [drain-state.cjs]
          |                                              |
          |                                     writes drain-state.json
          |                                              |
  [finish-only-guard.cjs]  <--reads drain-state.json--+
          |
          | blocks TaskCreate when draining
          |
  [shift-change-log-writer.cjs]  --(atomic write)-->  shift-change-log.json
          |                                                    |
  [shift-change-log-reader.cjs]  <--(reads + validates)-------+
          |
  [handover-detector.cjs]  --(UserPromptSubmit hook)
          |                    detects fresh session + existing log
          |                    injects resume context
          |
  [session-id-manager.cjs]  --(generates/persists sessionId)
```

### File Locations — All New Artifacts

| Artifact | Path | Type |
|---|---|---|
| JSON Schema | `.claude/schemas/shift-change-log.schema.json` | Schema |
| Log Writer | `.claude/lib/context/shift-change-log-writer.cjs` | Library |
| Log Reader | `.claude/lib/context/shift-change-log-reader.cjs` | Library |
| Drain State Manager | `.claude/lib/context/drain-state.cjs` | Library |
| Session ID Manager | `.claude/lib/context/session-id-manager.cjs` | Library |
| Finish-Only Guard Hook | `.claude/hooks/routing/finish-only-guard.cjs` | Hook |
| Handover Detector Hook | `.claude/hooks/routing/handover-detector.cjs` | Hook |
| Phase 1 Tests | `tests/lib/context/shift-change-log.test.cjs` | Test |
| Phase 2 Tests | `tests/hooks/finish-only-guard.test.cjs` | Test |
| Phase 3 Tests | `tests/hooks/handover-detector.test.cjs` | Test |
| Runtime Data (generated) | `.claude/context/runtime/shift-change-log.json` | Runtime |
| Runtime Data (generated) | `.claude/context/runtime/drain-state.json` | Runtime |
| Runtime Data (generated) | `.claude/context/runtime/session-id.json` | Runtime |

### Integration Points with Existing Infrastructure

| Existing Component | Integration |
|---|---|
| `spawn-token-guard.cjs` | Future: can trigger drain mode at 80% (NOT in this plan — manual trigger first) |
| `routing-guard.cjs` | Unmodified — finish-only-guard is a SEPARATE hook |
| `compression-reminder.txt` mechanism | Pattern reused — drain-state.json follows same file-signal pattern |
| `session-handoff` skill | Complementary — handover log is machine-readable; skill produces human-readable |
| `safeParseJSON` from `safe-json.cjs` | Used by reader for safe parsing with prototype pollution protection |
| `settings.json` | Hook registration for finish-only-guard and handover-detector |

---

## 3. Phase 1: Handover Log Foundation

**Purpose**: Build the atomic handover log writer/reader with JSON schema validation.
**Duration**: ~4-6 hours
**Target Agents**: `nodejs-pro` (implementation), `qa` (test verification)
**Recommended Skills**: `tdd`, `verification-before-completion`

### Council-Approved Schema

The schema MUST include ALL of these fields (per LLM council decision):

```json
{
  "schemaVersion": "1.0.0",
  "handoffId": "uuid-v4",
  "generation": 1,
  "status": "WRITING|READY|CLAIMED|SUPERSEDED|FAILED",
  "sessionId": "string",
  "activePid": 12345,
  "currentObjective": "string",
  "contextPercent": 0.82,
  "contextSummary": "string (oral tradition capture)",
  "memoryPointers": [
    { "file": "string", "key": "string", "summary": "string" }
  ],
  "pendingActions": [
    { "taskId": "string", "description": "string", "priority": "high|medium|low" }
  ],
  "subagentStates": [
    { "taskId": "string", "agentType": "string", "status": "string", "outputFile": "string" }
  ],
  "resumeInstructions": "string",
  "pendingMemoryWrites": ["string"],
  "drainDeadline": "ISO8601",
  "timestamp": "ISO8601"
}
```

### Microtask M1.1: JSON Schema File

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing test first:

- **File**: `tests/lib/context/shift-change-log.test.cjs`
- **Test name**: `shift-change-log schema > validates a well-formed handover log`
- **What it asserts**:
  - Load the schema from `.claude/schemas/shift-change-log.schema.json`
  - Create a valid log object with all required fields
  - Validate it against the schema using `ajv` or manual field checking
  - Assert validation passes
  - Assert validation FAILS when `schemaVersion` is missing
  - Assert validation FAILS when `status` is not one of the enum values
  - Assert validation FAILS when `generation` is negative
- **Command**: `node --test tests/lib/context/shift-change-log.test.cjs`
- **Expected**: Tests fail (schema file does not exist yet)

**GREEN** — Create the schema:

- **File**: `.claude/schemas/shift-change-log.schema.json`
- **Implementation**: Standard JSON Schema draft-07 with:
  - `required`: `schemaVersion`, `handoffId`, `generation`, `status`, `sessionId`, `timestamp`
  - `status` enum: `["WRITING", "READY", "CLAIMED", "SUPERSEDED", "FAILED"]`
  - `generation` minimum: 0
  - `contextPercent` minimum: 0, maximum: 1
  - `priority` enum on pendingActions items: `["high", "medium", "low"]`
  - All fields typed as per the council schema above
- **Command**: `node --test tests/lib/context/shift-change-log.test.cjs`
- **Expected**: All schema validation tests pass

**REFACTOR**: None expected — schema files are declarative.

### Microtask M1.2: Atomic Log Writer

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing tests:

- **File**: `tests/lib/context/shift-change-log.test.cjs` (append to same file)
- **Test names**:
  1. `shift-change-log writer > writes a valid handover log atomically`
     - Call `writeHandoverLog(data)` with valid data
     - Assert file exists at `.claude/context/runtime/shift-change-log.json` (use tmp dir in test)
     - Assert content parses to valid JSON matching input
     - Assert `status` is `"READY"` after write completes
  2. `shift-change-log writer > uses atomic temp-file-then-rename pattern`
     - Mock or spy on `fs.writeFileSync` and `fs.renameSync`
     - Assert writer creates `.shift-change-log.json.tmp` first, then renames
  3. `shift-change-log writer > sets status to WRITING during write`
     - Assert the tmp file has `status: "WRITING"` before rename
  4. `shift-change-log writer > rejects invalid data (missing required fields)`
     - Call `writeHandoverLog({})` — assert it throws with descriptive error
  5. `shift-change-log writer > generates handoffId as UUID v4 if not provided`
     - Call without `handoffId` — assert output has a valid UUID
  6. `shift-change-log writer > generates timestamp if not provided`
     - Call without `timestamp` — assert output has ISO8601 timestamp
- **Command**: `node --test tests/lib/context/shift-change-log.test.cjs`
- **Expected**: All 6 tests fail (writer module does not exist)

**GREEN** — Implement the writer:

- **File**: `.claude/lib/context/shift-change-log-writer.cjs`
- **Implementation**:
  ```javascript
  // Key logic:
  // 1. Validate input against schema (required fields check)
  // 2. Set defaults: handoffId (uuid v4 via crypto.randomUUID), timestamp (new Date().toISOString())
  // 3. Set status = 'WRITING'
  // 4. Write to tmp file: path + '.tmp'
  // 5. Set status = 'READY'
  // 6. fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  // 7. fs.renameSync(tmpPath, finalPath) — atomic on same filesystem
  // Exports: writeHandoverLog(data, outputDir?)
  ```
- **Dependencies**: `fs`, `path`, `crypto` (all Node.js built-ins)
- **Command**: `node --test tests/lib/context/shift-change-log.test.cjs`
- **Expected**: All 6 writer tests pass

**REFACTOR**: Extract schema validation into a shared `validateHandoverLog(data)` function usable by both writer and reader.

### Microtask M1.3: Log Reader with Safe Parsing

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing tests:

- **File**: `tests/lib/context/shift-change-log.test.cjs` (append)
- **Test names**:
  1. `shift-change-log reader > reads and parses a READY log`
     - Write a valid log file, call `readHandoverLog(dir)`
     - Assert returns parsed object with all fields
  2. `shift-change-log reader > returns null when no log exists`
     - Call `readHandoverLog(emptyDir)`
     - Assert returns `null`
  3. `shift-change-log reader > returns null for corrupt JSON`
     - Write `"not json{{"` to the log path
     - Assert returns `null` (uses `safeParseJSON`, does not throw)
  4. `shift-change-log reader > rejects log with status WRITING (incomplete write)`
     - Write log with `status: "WRITING"`
     - Assert returns `null` (treats as incomplete)
  5. `shift-change-log reader > rejects log with mismatched schemaVersion`
     - Write log with `schemaVersion: "99.0.0"`
     - Assert returns `null` with warning
  6. `shift-change-log reader > claimHandoverLog sets status to CLAIMED`
     - Write a READY log, call `claimHandoverLog(dir, newSessionId)`
     - Assert file now has `status: "CLAIMED"`
- **Command**: `node --test tests/lib/context/shift-change-log.test.cjs`
- **Expected**: All 6 reader tests fail

**GREEN** — Implement the reader:

- **File**: `.claude/lib/context/shift-change-log-reader.cjs`
- **Implementation**:
  ```javascript
  // Key logic:
  // 1. Check if shift-change-log.json exists
  // 2. Read with safeParseJSON (from ../../lib/utils/safe-json.cjs)
  // 3. Validate: status must be 'READY' (not 'WRITING', 'CLAIMED', 'FAILED')
  // 4. Validate: schemaVersion must start with '1.'
  // 5. Return parsed object or null
  // claimHandoverLog(dir, sessionId):
  //   1. Read log
  //   2. Set status = 'CLAIMED'
  //   3. Atomic rewrite
  // Exports: readHandoverLog(runtimeDir?), claimHandoverLog(runtimeDir, sessionId)
  ```
- **Command**: `node --test tests/lib/context/shift-change-log.test.cjs`
- **Expected**: All reader tests pass

**REFACTOR**: Ensure writer and reader share the `SCHEMA_VERSION = '1.0.0'` constant.

### Phase 1 Acceptance Gate

```bash
node --test tests/lib/context/shift-change-log.test.cjs  # All tests pass
pnpm lint:fix                                              # 0 errors
pnpm format                                                # No changes
```

---

## 4. Phase 2: Finish-Only Drain Mode

**Purpose**: Implement drain-state management and a PreToolUse hook that blocks new TaskCreate calls during drain.
**Duration**: ~4-6 hours
**Dependencies**: Phase 1 complete (shares runtime directory patterns)
**Target Agents**: `nodejs-pro` (implementation), `qa` (test verification)
**Recommended Skills**: `tdd`, `verification-before-completion`

### Microtask M2.1: Drain State Manager

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing tests:

- **File**: `tests/hooks/finish-only-guard.test.cjs`
- **Test names**:
  1. `drain-state > enterDrainMode writes drain-state.json with sessionId and deadline`
     - Call `enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 })`
     - Assert `drain-state.json` exists in runtime dir
     - Assert file contains `sessionId: 'abc'`
     - Assert `drainDeadline` is ~5 minutes from now (ISO8601)
     - Assert `activatedAt` is set
  2. `drain-state > isDraining returns true when drain-state.json exists with matching sessionId`
     - Write drain state with sessionId 'abc'
     - Call `isDraining('abc')` — assert `true`
  3. `drain-state > isDraining returns false when no drain-state.json`
     - Call `isDraining('abc')` in empty dir — assert `false`
  4. `drain-state > isDraining returns false for DIFFERENT sessionId (new session)`
     - Write drain state with sessionId 'old-session'
     - Call `isDraining('new-session')` — assert `false` (new session ignores old drain)
  5. `drain-state > isDraining returns false when drainDeadline has passed`
     - Write drain state with `drainDeadline` set to 1 minute ago
     - Call `isDraining('abc')` — assert `false` (deadline expired)
  6. `drain-state > exitDrainMode removes drain-state.json`
     - Enter drain, then call `exitDrainMode()`
     - Assert file is gone
  7. `drain-state > getDrainState returns parsed state or null`
     - Assert returns the full state object when file exists
     - Assert returns null when file does not exist
- **Command**: `node --test tests/hooks/finish-only-guard.test.cjs`
- **Expected**: All 7 tests fail

**GREEN** — Implement drain state manager:

- **File**: `.claude/lib/context/drain-state.cjs`
- **Implementation**:
  ```javascript
  // Exports:
  //   enterDrainMode({ sessionId, drainDeadlineMinutes = 5 }, runtimeDir?)
  //     - Writes drain-state.json with: sessionId, drainDeadline, activatedAt
  //   isDraining(currentSessionId, runtimeDir?)
  //     - Reads drain-state.json via safeParseJSON
  //     - Returns false if: file missing, sessionId mismatch, deadline expired
  //     - Returns true only if sessionId matches AND deadline not expired
  //   exitDrainMode(runtimeDir?)
  //     - Removes drain-state.json (fs.unlinkSync with try/catch)
  //   getDrainState(runtimeDir?)
  //     - Returns parsed object or null
  ```
- **Command**: `node --test tests/hooks/finish-only-guard.test.cjs`
- **Expected**: All drain-state tests pass

### Microtask M2.2: Finish-Only Guard Hook

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing tests:

- **File**: `tests/hooks/finish-only-guard.test.cjs` (append)
- **Test names**:
  1. `finish-only-guard hook > blocks TaskCreate when draining with matching sessionId`
     - Simulate hook stdin with `tool_name: "TaskCreate"` and drain-state active
     - Assert hook outputs `{ allow: false, message: "..." }`
  2. `finish-only-guard hook > allows TaskCreate when NOT draining`
     - Simulate with no drain-state.json
     - Assert `{ allow: true }`
  3. `finish-only-guard hook > allows TaskCreate when drain sessionId differs (new session)`
     - Drain state has sessionId 'old', hook receives context implying sessionId 'new'
     - Assert `{ allow: true }` (new session not affected by old drain)
  4. `finish-only-guard hook > allows TaskUpdate even during drain`
     - Simulate with `tool_name: "TaskUpdate"` during drain
     - Assert `{ allow: true }` (completions must flow)
  5. `finish-only-guard hook > allows TaskList even during drain`
     - Assert `{ allow: true }`
  6. `finish-only-guard hook > allows TaskCreate when drainDeadline expired`
     - Write expired drain state
     - Assert `{ allow: true }` (drain auto-expires)
  7. `finish-only-guard hook > is fail-closed (blocks on unexpected errors)`
     - Corrupt the drain-state.json to trigger parse error
     - Assert hook does NOT block (fail-open for advisory, or fail-closed — design decision below)
- **Command**: `node --test tests/hooks/finish-only-guard.test.cjs`
- **Expected**: All 7 hook tests fail

**Design Decision — Fail Policy**: The finish-only-guard MUST be **fail-open** (allow on error). Rationale: a drain guard that blocks all task creation on a parse error would freeze the entire framework. The drain state is advisory to the current session, not a security boundary. If drain-state.json is corrupt, the worst case is that a few extra tasks are created — not a security vulnerability.

**GREEN** — Implement the hook:

- **File**: `.claude/hooks/routing/finish-only-guard.cjs`
- **Implementation**:
  ```javascript
  // stdin JSON protocol (same pattern as spawn-token-guard.cjs)
  // 1. Read stdin, parse JSON
  // 2. If tool_name !== 'TaskCreate' and tool_name !== 'Task': allow
  // 3. Read drain-state.json via require('../../lib/context/drain-state.cjs').isDraining
  // 4. For sessionId: read from process.env.CLAUDE_SESSION_ID or
  //    from .claude/context/runtime/session-id.json
  // 5. If isDraining(currentSessionId): { allow: false, message: "Session draining..." }
  // 6. Else: { allow: true }
  // 7. Fail-open on ALL errors (try/catch → { allow: true })
  ```
- **Command**: `node --test tests/hooks/finish-only-guard.test.cjs`
- **Expected**: All hook tests pass

**REFACTOR**: Ensure the hook reads sessionId from a consistent source.

### Microtask M2.3: Hook Registration in settings.json

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `verification-before-completion`

The hook must be registered in `.claude/settings.json` under `PreToolUse`:

```json
{
  "matcher": "TaskCreate|Task",
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/routing/finish-only-guard.cjs"
    }
  ]
}
```

**Placement**: AFTER `spawn-token-guard.cjs` in the hook chain (drain guard runs after token guard).

**Verification**:
- Manually confirm the hook fires by running the test suite
- Confirm existing hooks still pass: `pnpm test:framework`

### Phase 2 Acceptance Gate

```bash
node --test tests/hooks/finish-only-guard.test.cjs   # All tests pass
node --test tests/lib/context/shift-change-log.test.cjs  # Phase 1 still passes (regression)
pnpm lint:fix                                          # 0 errors
pnpm format                                            # No changes
```

---

## 5. Phase 3: Session Resume Detection

**Purpose**: Detect fresh sessions that have an existing handover log and inject resume context.
**Duration**: ~4-6 hours
**Dependencies**: Phase 1 (reader) + Phase 2 (drain-state + sessionId)
**Target Agents**: `nodejs-pro` (implementation), `qa` (test verification)
**Recommended Skills**: `tdd`, `verification-before-completion`

### Microtask M3.1: Session ID Manager

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing tests:

- **File**: `tests/hooks/handover-detector.test.cjs`
- **Test names**:
  1. `session-id-manager > generates a new sessionId on first call`
     - Call `getOrCreateSessionId(tmpDir)`
     - Assert returns a non-empty string
     - Assert `session-id.json` exists in dir
  2. `session-id-manager > returns same sessionId on subsequent calls`
     - Call twice with same dir
     - Assert both return same value
  3. `session-id-manager > generates NEW sessionId when called with force=true`
     - Call once, call again with `force: true`
     - Assert second call returns different value
  4. `session-id-manager > reads sessionId from env CLAUDE_SESSION_ID if set`
     - Set `process.env.CLAUDE_SESSION_ID = 'env-id'`
     - Assert returns `'env-id'`
     - Clean up env after test
- **Command**: `node --test tests/hooks/handover-detector.test.cjs`
- **Expected**: All 4 tests fail

**GREEN** — Implement:

- **File**: `.claude/lib/context/session-id-manager.cjs`
- **Implementation**:
  ```javascript
  // Exports:
  //   getOrCreateSessionId(runtimeDir?, { force? } = {})
  //     1. If process.env.CLAUDE_SESSION_ID is set, return it
  //     2. If session-id.json exists in runtimeDir, read and return
  //     3. Generate via crypto.randomUUID()
  //     4. Write to session-id.json
  //     5. Return the ID
  //   If force=true, skip step 2 (always regenerate)
  ```

### Microtask M3.2: Handover Detector Hook

**Target Agent**: `nodejs-pro`
**Recommended Skills**: `tdd`, `verification-before-completion`

**RED** — Write failing tests:

- **File**: `tests/hooks/handover-detector.test.cjs` (append)
- **Test names**:
  1. `handover-detector > detects existing READY handover log on fresh session`
     - Write a READY handover log to tmp runtime dir
     - Ensure NO session-id.json exists (fresh session)
     - Simulate UserPromptSubmit hook input
     - Assert hook outputs message containing resume instructions from log
  2. `handover-detector > does nothing when no handover log exists`
     - Empty runtime dir
     - Assert hook outputs `{ allow: true }` with no message
  3. `handover-detector > does nothing when handover log is CLAIMED`
     - Write a CLAIMED handover log
     - Assert `{ allow: true }` with no resume injection
  4. `handover-detector > claims the log after injecting resume context`
     - Write a READY log
     - Simulate hook
     - Assert log status changed to `CLAIMED` after hook runs
  5. `handover-detector > generates a new sessionId for the fresh session`
     - Write a READY log, no session-id.json
     - After hook runs, assert session-id.json now exists
  6. `handover-detector > clears stale drain-state.json from old session`
     - Write drain-state.json with OLD sessionId
     - Write READY handover log
     - After hook runs, assert drain-state.json is removed (new session should not inherit drain)
  7. `handover-detector > writes pending memory writes from handover log`
     - Write READY log with `pendingMemoryWrites: ["Decision: use JWT"]`
     - After hook runs, assert the content was appended to decisions.md (or equivalent action logged)
- **Command**: `node --test tests/hooks/handover-detector.test.cjs`
- **Expected**: All 7 tests fail

**GREEN** — Implement the hook:

- **File**: `.claude/hooks/routing/handover-detector.cjs`
- **Implementation**:
  ```javascript
  // UserPromptSubmit hook (fires on every user prompt)
  // 1. Read stdin JSON
  // 2. Check if session-id.json exists → if YES, this is NOT a fresh session → allow, exit
  // 3. Generate new sessionId via session-id-manager
  // 4. Read handover log via shift-change-log-reader
  // 5. If no log or log.status !== 'READY' → allow, exit
  // 6. CLAIM the log (set status = CLAIMED)
  // 7. Clear stale drain-state.json if sessionId differs
  // 8. Process pendingMemoryWrites (append to appropriate memory files)
  // 9. Output: { allow: true, message: "SHIFT CHANGE RESUME: [resumeInstructions]\n\nContext: [contextSummary]\n\nPending: [pendingActions summary]" }
  // 10. Fail-open on all errors (advisory hook)
  ```

**REFACTOR**: Extract the "inject resume context" message formatting into a pure function for testability.

### Microtask M3.3: Hook Registration

**Target Agent**: `nodejs-pro`

Register in `.claude/settings.json` under `UserPromptSubmit`:

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/routing/handover-detector.cjs"
    }
  ]
}
```

**Placement**: AFTER `user-prompt-unified.cjs` (handover detection runs after standard prompt processing).

### Phase 3 Acceptance Gate

```bash
node --test tests/hooks/handover-detector.test.cjs        # All tests pass
node --test tests/hooks/finish-only-guard.test.cjs         # Phase 2 still passes
node --test tests/lib/context/shift-change-log.test.cjs    # Phase 1 still passes
pnpm lint:fix                                               # 0 errors
pnpm format                                                 # No changes
```

---

## 6. Phase 4: Terminal Automation (ENGINEERED -- GATED)

**This phase is NOT part of the current implementation scope.**

Phase 4 may proceed ONLY after ALL of the following gates pass:

1. Phases 1-3 TDD suite: zero test failures across all three test files
2. Lint + format clean
3. Integration test: write handover log → start new session → detect log → inject context → claim log (end-to-end)

### Core UX Requirement (CONFIRMED)

The successor session MUST be **interactive** — a visible terminal window the user can see and type in.
This rules out:
- `omega-claude-cli` (headless, no user interaction)
- `claude --print` (outputs to stdout, not interactive)
- `claude --resume <oldSessionId>` (would restore the saturated session context, defeating the purpose)

Correct spawn: bare `claude` (no flags) → new interactive session → `handover-detector.cjs` fires on
first user prompt → detects READY log → claims it → injects resume context before Claude responds.

**Note on `claude --resume`:** This flag exists (`-r, --resume [sessionId]`) and reopens a previous
conversation. It is explicitly NOT used here — it restores old context rather than starting fresh.
It may be useful for a future "soft resume" mode (see §6.5).

### Answered Questions (verified 2026-03-10)

| Question | Answer |
|---|---|
| Does `claude --resume` exist? | YES — `-r, --resume [sessionId]` resumes by session ID |
| Is `--resume` right for hard reset? | NO — restores old context. Use bare `claude` instead |
| Is `/rewind` programmatic? | NO — UI-only (slash command + Esc+Esc). Cannot be called from hooks |
| Windows Terminal detection? | `process.env.WT_SESSION` is set when running inside Windows Terminal |
| Terminal spawn on Windows? | `cmd.exe /c wt -w new new-tab ...` (WT) or `Start-Process cmd.exe` (fallback) — see §M4.1 |
| Can Node.js spawn wt.exe directly? | NO — App Execution Alias; route via `cmd.exe /c wt` or `powershell Start-Process wt` |
| Force NEW WINDOW (not tab in current WT)? | Use `-w new` flag: `wt -w new new-tab ...` (also `-w -1`) |
| WT CLI command separator? | Semicolons: `wt cmd1 ; cmd2`. In PowerShell: backtick-escaped `` `; `` |
| Open specific profile? | `wt -w new new-tab -p "Profile Name" cmd /k claude` |
| Set tab title? | `wt -w new new-tab --title "Claude New Session" cmd /k claude` |
| macOS terminal spawn? | `osascript` only — `open -a Terminal cmd` cannot run a command. Two targets: Terminal.app (`do script`) and iTerm2 (`create window with default profile command`) |
| macOS terminal detection? | `process.env.TERM_PROGRAM` — `'iTerm.app'` for iTerm2, `'Apple_Terminal'` for Terminal.app, `'WarpTerminal'` for Warp (no API — fall back to Terminal.app) |
| Linux terminal spawn? | Check `$DISPLAY` + `$WAYLAND_DISPLAY`. Try in order: wezterm, kitty, alacritty, gnome-terminal, konsole, xfce4-terminal, xterm |
| gnome-terminal command arg? | Use `--` separator: `gnome-terminal -- bash -c claude`. The `-e`/`--command` flags are DEPRECATED |
| tmux integration? | When `$TMUX` is set: `tmux new-window claude` → immediately visible. Takes priority over all platform paths |
| Zellij integration? | When `$ZELLIJ` is set: `zellij action new-tab --command claude` → immediately visible |
| Headless Linux (no DISPLAY)? | If tmux installed: `tmux new-session -d -s claude-handoff claude` + print attach instructions. Else: print manual instruction |

### Windows Terminal CLI Quick Reference (from learn.microsoft.com docs, 2026-03-10)

```
wt [options] [command ; ]

Options:
  --window/-w <id>     Target window: 'new'/'-1' = always new, '0'/'last' = most recent
  --maximized/-M       Launch maximized
  --focus/-f           Launch in focus mode
  --pos x,y            Launch at position
  --size c,r           Launch with columns/rows

Commands (separated by ; ):
  new-tab/nt           New tab
    -p <profile>       Profile name
    -d <dir>           Starting directory
    --title <text>     Tab title
    --tabColor <hex>   Tab color (#RGB or #RRGGBB)
    --suppressApplicationTitle
    <commandline>      Command to run in tab

  split-pane/sp        Split pane
    -H/--horizontal    Horizontal split
    -V/--vertical      Vertical split
    (same flags as new-tab)

  focus-tab/ft         Focus tab
    -t <index>         Tab index (0-based)
```

**App Execution Alias resolution from Node.js (verified patterns):**
- `spawn('wt.exe', ...)` → FAILS: App Execution Aliases not on PATH for child processes
- `cmd.exe /c wt ...` → WORKS: cmd.exe resolves App Execution Aliases (as documented for WSL)
- `powershell.exe -Command Start-Process wt ...` → WORKS: Start-Process uses shell infrastructure

### M4.1: spawn-new-session.cjs

**File:** `.claude/lib/context/spawn-new-session.cjs`

**Responsibility:** Spawn an interactive Claude session in a new visible terminal window,
wait briefly to confirm the process started, then write `session-spawned.json` marker.

```javascript
// Pseudocode — TDD to flesh out exact implementation
// VERIFIED 2026-03-10: Full cross-platform decision tree for spawning an interactive
// Claude session in a new visible terminal window.
//
// Decision order (highest-priority first):
//   1. $TMUX set         → tmux new-window (any platform, already in tmux)
//   2. $ZELLIJ set       → zellij action new-tab (any platform, already in Zellij)
//   3. win32 + WT_SESSION → cmd.exe /c wt -w new new-tab (Windows Terminal)
//   4. win32 (no WT)     → powershell Start-Process cmd.exe (plain cmd window)
//   5. darwin + iTerm2   → osascript iTerm "create window with default profile command"
//   6. darwin (other)    → osascript Terminal.app "do script" (covers Warp, Apple_Terminal)
//   7. linux + DISPLAY   → try wezterm/kitty/alacritty/gnome-terminal/konsole/xterm
//   8. headless linux    → tmux new-session -d + print attach instructions
//
// KEY GOTCHAS (verified 2026-03-10):
//   - open -a Terminal cmd  CANNOT run a command — always use osascript
//   - Terminal.app: use "do script CMD" (not "make new window") to get a new window
//   - iTerm2: use "create window with default profile command CMD" (iTerm2 3.x+)
//   - Warp has no CLI/AppleScript API — falls back to Terminal.app osascript (acceptable)
//   - gnome-terminal: use "--" separator; "-e"/"--command" flags are DEPRECATED
//   - Check both $DISPLAY and $WAYLAND_DISPLAY for Linux display server detection
//   - wt.exe is an App Execution Alias — direct spawn() FAILS; route via cmd.exe /c wt
//   - ALWAYS use -w new with wt to force a new WINDOW (not a tab in current session)
//   - ALWAYS call child.unref() — without it, parent waits for child, hangs the hook
//   - ALWAYS shell: false with array args — prevents shell metacharacter injection
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function spawnInteractiveSession(runtimeDir, opts = {}) {
  const { title = 'Claude New Session', profile } = opts;
  const cmd = 'claude';

  let child;
  let terminalType;

  // ── Priority 1: tmux (any platform) ──────────────────────────────────────
  if (process.env.TMUX) {
    child = spawn('tmux', ['new-window', '-n', 'claude-handoff', cmd], {
      detached: true, shell: false, stdio: 'ignore'
    });
    terminalType = 'tmux';

  // ── Priority 2: Zellij (any platform) ────────────────────────────────────
  } else if (process.env.ZELLIJ) {
    child = spawn('zellij', ['action', 'new-tab', '--command', cmd], {
      detached: true, shell: false, stdio: 'ignore'
    });
    terminalType = 'zellij';

  // ── Priority 3/4: Windows ─────────────────────────────────────────────────
  } else if (process.platform === 'win32') {
    if (process.env.WT_SESSION) {
      // cmd.exe resolves App Execution Aliases (wt.exe is not on Node.js PATH)
      // -w new: force a new WINDOW (not a tab in the user's current WT session)
      const profileArgs = profile ? ['-p', profile] : [];
      child = spawn('cmd.exe', [
        '/c', 'wt', '-w', 'new', 'new-tab',
        '--title', title,
        ...profileArgs,
        'cmd', '/k', cmd
      ], { detached: true, shell: false, stdio: 'ignore' });
      terminalType = 'windows-terminal';
    } else {
      child = spawn('powershell.exe', [
        '-NoProfile', '-Command',
        `Start-Process cmd.exe -ArgumentList "/k ${cmd}" -WindowStyle Normal`
      ], { detached: true, shell: false, stdio: 'ignore' });
      terminalType = 'cmd';
    }

  // ── Priority 5/6: macOS ───────────────────────────────────────────────────
  } else if (process.platform === 'darwin') {
    let script;
    if (process.env.TERM_PROGRAM === 'iTerm.app') {
      // iTerm2 3.x+ AppleScript API
      script = `tell application "iTerm"\ncreate window with default profile command "/bin/bash -c \\"${cmd}\\""\nend tell`;
    } else {
      // Terminal.app (covers Apple_Terminal, Warp fallback, VS Code terminal, unknown)
      // NOTE: "do script CMD" opens a new window when Terminal is already running
      script = `tell application "Terminal"\nif it is running then\ndo script "${cmd}"\nelse\ndo script "${cmd}" in window 1\nend if\nactivate\nend tell`;
    }
    child = spawn('osascript', ['-e', script], {
      detached: true, shell: false, stdio: 'ignore'
    });
    terminalType = process.env.TERM_PROGRAM === 'iTerm.app' ? 'iterm2' : 'terminal-app';

  // ── Priority 7/8: Linux ───────────────────────────────────────────────────
  } else {
    const hasDisplay = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    if (hasDisplay) {
      // Try terminal emulators in priority order
      // gnome-terminal: use "--" separator (not -e, which is deprecated)
      // kitty/alacritty/wezterm: each has their own flag style
      const terminals = [
        ['wezterm', ['start', '--', cmd]],
        ['kitty', [cmd]],
        ['alacritty', ['-e', cmd]],
        ['gnome-terminal', ['--', 'bash', '-c', cmd]],
        ['konsole', ['-e', cmd]],
        ['xfce4-terminal', ['-e', cmd]],
        ['xterm', ['-e', cmd]],
      ];
      for (const [bin, args] of terminals) {
        try {
          execFileSync('which', [bin], { stdio: 'ignore' });
          child = spawn(bin, args, { detached: true, shell: false, stdio: 'ignore' });
          terminalType = bin;
          break;
        } catch { continue; }
      }
    }
    if (!child) {
      // Headless fallback: create detached tmux session + print attach instructions
      try {
        execFileSync('which', ['tmux'], { stdio: 'ignore' });
        child = spawn('tmux', ['new-session', '-d', '-s', 'claude-handoff', cmd], {
          detached: true, shell: false, stdio: 'ignore'
        });
        terminalType = 'tmux-headless';
        process.stderr.write(`[shift-change] New session started headlessly.\nAttach with: tmux attach -t claude-handoff\n`);
      } catch {
        process.stderr.write(`[shift-change] No terminal emulator available. Run manually: ${cmd}\n`);
        throw new Error('No suitable terminal emulator found');
      }
    }
  }

  child.unref(); // MANDATORY — prevents parent hook from waiting for child to exit

  // Write spawned marker (O_EXCL — atomic, race-safe, prevents double-spawn)
  const markerPath = path.join(runtimeDir, 'session-spawned.json');
  const marker = {
    spawnedAt: new Date().toISOString(),
    parentPid: process.pid,
    terminalType,
    title
  };
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), { flag: 'wx' });

  return marker;
}

module.exports = { spawnInteractiveSession };
```

**ANTI-PATTERNS (do not use):**
```javascript
// ❌ WRONG — wt.exe is an App Execution Alias, not resolvable from Node.js spawn()
spawn('wt.exe', ['-w', 'new', 'new-tab', 'cmd', '/k', 'claude'], { shell: false });
// → CommandNotFoundException

// ❌ WRONG — new-tab without -w new will open a TAB in the user's current WT window
spawn('cmd.exe', ['/c', 'wt', 'new-tab', 'cmd', '/k', 'claude'], ...);
// → Opens tab in existing session, confusing UX

// ❌ WRONG — shell: true opens a security attack surface
spawn('wt', ['-w', 'new', 'new-tab', ...], { shell: true });

// ❌ WRONG — open -a Terminal cannot pass a command to run
spawn('open', ['-a', 'Terminal', 'claude'], ...);
// → Opens Terminal.app but doesn't run claude

// ❌ WRONG — gnome-terminal -e is DEPRECATED (use -- separator instead)
spawn('gnome-terminal', ['-e', 'claude'], ...);
// → Warning/failure on modern GNOME

// ❌ WRONG — missing child.unref() on macOS/Linux
const child = spawn('osascript', ['-e', script], { detached: true });
// child.unref() missing → hook hangs until Terminal.app exits (never)
```

### M4.2: Session Trigger Integration

**Where triggered:** `spawn-token-guard.cjs` at 80% threshold (currently only writes
`compression-reminder.txt`). Phase 4 adds a second action: if `SHIFT_CHANGE_ENABLED=true`,
trigger drain mode + write handover log + spawn interactive session.

**Sequence:**
```
spawn-token-guard.cjs detects 80% tokens
  → enterDrainMode({ sessionId, drainDeadlineMinutes: 5 })  [drain-state.cjs]
  → writeHandoverLog({ currentObjective, contextSummary, ... })  [shift-change-log-writer.cjs]
  → spawnInteractiveSession(RUNTIME_DIR)  [spawn-new-session.cjs]
  → write compression-reminder.txt (existing — tells current session to finish only)
  → process.exit(0) after brief delay (optional — user may prefer to let old session idle)
```

### M4.3: Old Session Cleanup

Two options (implement both, default to option A):

**Option A — Graceful idle (default):** Old session stays open, enters Finish-Only mode via
`finish-only-guard.cjs`. User can manually close it. No `process.exit()`.

**Option B — Self-terminate:** Old session calls `process.exit(0)` after confirming new terminal
spawned (checks `session-spawned.json` exists). Cleaner but loses old session immediately.

`SHIFT_CHANGE_EXIT_OLD_SESSION=false` (default) controls which option is used.

### M4.4: Rate Limiting

Prevent runaway shift changes (e.g., model stuck in a loop that keeps hitting 80%):
- Max 3 shift changes per hour per working directory (tracked in `shift-change-history.json`)
- If rate limit hit: emit warning only, do NOT spawn (fall back to compression-reminder.txt)

### §6.5: Future — Soft Resume Mode

When `SHIFT_CHANGE_SOFT=true`, use `claude --resume <sessionId>` instead of bare `claude`.
This restores the compressed conversation rather than starting fresh. Useful when:
- Context is 80-90% but still coherent (soft compression preferred over full reset)
- User wants to maintain full conversation history across the handoff

### Phase 4 Acceptance Gate

```bash
node --test tests/lib/context/spawn-new-session.test.cjs   # All tests pass
node --test tests/lib/context/shift-change-log.test.cjs    # Phase 1 regression
node --test tests/hooks/finish-only-guard.test.cjs          # Phase 2 regression
node --test tests/hooks/handover-detector.test.cjs          # Phase 3 regression
pnpm lint:fix && pnpm format                                 # Clean
# Manual: confirm new terminal window opens with interactive claude
```

### Phase 4 Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `SHIFT_CHANGE_ENABLED` | `false` | Master switch — Phase 4 opt-in |
| `SHIFT_CHANGE_EXIT_OLD_SESSION` | `false` | Option B: self-terminate old session after spawn |
| `SHIFT_CHANGE_SOFT` | `false` | Use `--resume` instead of fresh spawn |
| `SHIFT_CHANGE_MAX_PER_HOUR` | `3` | Rate limit for shift changes |
| `SHIFT_CHANGE_RUNTIME_DIR` | `.claude/context/runtime` | Override runtime dir (used in tests) |

---

## 7. Enterprise Workflow Execution Order

**Complexity Classification**: HIGH

This is a new subsystem with 7 new files, 3 new hooks, and integration with existing hook infrastructure. It requires TDD, code review, and documentation.

### Agent Sequence per Phase

| Phase | Step | Agent | Task |
|---|---|---|---|
| 1 | Design + Implement | `nodejs-pro` | Schema + writer + reader with TDD |
| 1 | Test Verification | `qa` | Run all Phase 1 tests, verify red-green cycle |
| 2 | Implement | `nodejs-pro` | Drain state manager + hook with TDD |
| 2 | Hook Registration | `nodejs-pro` | Update settings.json |
| 2 | Test Verification | `qa` | Run all Phase 1+2 tests |
| 3 | Implement | `nodejs-pro` | Session ID manager + detector hook with TDD |
| 3 | Hook Registration | `nodejs-pro` | Update settings.json |
| 3 | Test Verification | `qa` | Run all Phase 1+2+3 tests |
| Post | Code Review | `code-reviewer` | Review all new code for patterns, security |
| Post | Lint + Format | `devops` | Run `pnpm lint:fix` + `pnpm format` + commit |
| Post | Documentation | `technical-writer` | Update memory files with ADR for shift-change design |

### Why `nodejs-pro` over `developer`

Per MEMORY.md: "nodejs-pro > developer for framework tasks -- works on main (no worktree), commits reliably." All new code is Node.js CJS modules in `.claude/lib/` and `.claude/hooks/` -- nodejs-pro is the correct specialist.

---

## 8. Execution Topology (Microtask DAG)

| task_id | target_agent | owned_paths | forbidden_paths | depends_on | dependency_type | parallel_group | acceptance_checks |
|---|---|---|---|---|---|---|---|
| M1.1 | nodejs-pro | `.claude/schemas/shift-change-log.schema.json`, `tests/lib/context/shift-change-log.test.cjs` | `.claude/hooks/**` | - | - | G1 | Schema tests pass |
| M1.2 | nodejs-pro | `.claude/lib/context/shift-change-log-writer.cjs`, `tests/lib/context/shift-change-log.test.cjs` | `.claude/hooks/**` | M1.1 | blocks | G1 | Writer tests pass |
| M1.3 | nodejs-pro | `.claude/lib/context/shift-change-log-reader.cjs`, `tests/lib/context/shift-change-log.test.cjs` | `.claude/hooks/**` | M1.2 | blocks | G1 | Reader tests pass |
| --- | --- | --- COMMIT CHECKPOINT --- | --- | M1.3 | blocks | --- | `git commit` Phase 1 |
| M2.1 | nodejs-pro | `.claude/lib/context/drain-state.cjs`, `tests/hooks/finish-only-guard.test.cjs` | `.claude/hooks/routing/**` | M1.3 | blocks | G2 | Drain state tests pass |
| M2.2 | nodejs-pro | `.claude/hooks/routing/finish-only-guard.cjs`, `tests/hooks/finish-only-guard.test.cjs` | `.claude/lib/context/shift-change-*` | M2.1 | blocks | G2 | Hook tests pass |
| M2.3 | nodejs-pro | `.claude/settings.json` | `.claude/hooks/routing/finish-only-guard.cjs` | M2.2 | blocks | G2 | Hook fires in test suite |
| --- | --- | --- COMMIT CHECKPOINT --- | --- | M2.3 | blocks | --- | `git commit` Phase 2 |
| M3.1 | nodejs-pro | `.claude/lib/context/session-id-manager.cjs`, `tests/hooks/handover-detector.test.cjs` | `.claude/hooks/routing/**` | M2.3 | blocks | G3 | Session ID tests pass |
| M3.2 | nodejs-pro | `.claude/hooks/routing/handover-detector.cjs`, `tests/hooks/handover-detector.test.cjs` | `.claude/lib/context/drain-state.cjs` | M3.1 | blocks | G3 | Detector tests pass |
| M3.3 | nodejs-pro | `.claude/settings.json` | `.claude/hooks/routing/handover-detector.cjs` | M3.2 | blocks | G3 | Hook fires in test suite |
| --- | --- | --- COMMIT CHECKPOINT --- | --- | M3.3 | blocks | --- | `git commit` Phase 3 |
| M4.1 | qa | `tests/**` | `.claude/lib/**`, `.claude/hooks/**` | M3.3 | blocks | G4 | All 3 test files green |
| M4.2 | code-reviewer | - | - | M4.1 | blocks | G4 | Review approved |
| M4.3 | devops | - | - | M4.2 | blocks | G4 | Lint + format + commit + push |
| M4.4 | technical-writer | `.claude/context/memory/decisions.md` | - | M4.3 | blocks | G4 | ADR documented |

### Parallelization Guardrails

- Max active parallel microtasks: 1 (this is a sequential TDD pipeline -- each step depends on the prior)
- Commit checkpoints at Phase 1, Phase 2, and Phase 3 boundaries (15+ files total -- checkpoint pattern required per plan template)
- Merge gate: all 3 test files must pass before code review

---

## 9. Lint/Format/Commit Checklist

**After each phase:**

```bash
pnpm lint:fix    # Must produce 0 errors
pnpm format      # Must produce no changes
pnpm test        # Full test suite must pass (or at minimum, no regressions)
```

**Commit message format (per git-workflow rules):**

- Phase 1: `feat: add shift-change handover log schema, writer, and reader`
- Phase 2: `feat: add finish-only drain mode guard hook`
- Phase 3: `feat: add session resume handover detection hook`
- Final: `feat: shift-change context handoff system (Phases 1-3)`

**All commits include:**
```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Partial write of shift-change-log.json (crash mid-write) | Low | High | Atomic temp-file-then-rename pattern; reader rejects `status: WRITING` |
| New session inherits stale drain-state.json | Medium | Medium | SessionId-aware: `isDraining()` returns false for different sessionId; handover-detector clears stale drain state |
| Token estimation triggers drain too early/late | Medium | Low | Phase 1-3 do NOT auto-trigger drain -- manual only. Future auto-trigger in Phase 4 |
| Hook registration order conflicts with existing hooks | Low | Medium | finish-only-guard placed AFTER spawn-token-guard; handover-detector AFTER user-prompt-unified |
| safeParseJSON returns null on valid edge-case JSON | Low | Low | All tests use real JSON; safeParseJSON is battle-tested in codebase |
| Windows path issues in runtime dir creation | Medium | Low | Use `path.join` consistently; `mkdirSync` with `recursive: true` |
| PID reuse in activePid field (if read by future Phase 4) | Medium | High (future) | PID is informational only in Phases 1-3; Phase 4 uses marker-file, not PID kill |
| Duplicate hook execution (settings.json misconfiguration) | Low | Medium | Tests validate hook output; hook is idempotent |
| Context poisoning via handover log injection | Low | High | Handover log generated from structured data only (not conversation); schema-validated on read |
| drainDeadline clock skew between sessions | Low | Low | Uses system clock consistently; 5-minute default is generous |

---

## 11. Definition of Done

**All of the following MUST be true:**

- [ ] All Phase 1 tests green: `node --test tests/lib/context/shift-change-log.test.cjs`
- [ ] All Phase 2 tests green: `node --test tests/hooks/finish-only-guard.test.cjs`
- [ ] All Phase 3 tests green: `node --test tests/hooks/handover-detector.test.cjs`
- [ ] `pnpm lint:fix` produces 0 errors
- [ ] `pnpm format` produces no changes
- [ ] `pnpm test` produces no regressions in existing tests
- [ ] All new hooks registered in `settings.json`
- [ ] Memory files updated:
  - `decisions.md`: ADR for shift-change design (marker-file over PID, fail-open drain guard, sessionId-aware drain)
  - `learnings.md`: Atomic write pattern for handover log, sessionId-aware hook design
- [ ] Council approval artifacts preserved:
  - `.claude/context/reports/architecture/shift-change-llm-council-2026-03-10.md`
  - `.claude/context/reports/architecture/shift-change-arch-review-2026-03-10.md`
  - `.claude/context/artifacts/research-reports/shift-change-research-2026-03-10.md`
- [ ] All code committed with conventional commit format
- [ ] No untracked files left behind (except runtime data files which are gitignored)

---

## Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed shift-change implementation
2. Extract learnings about session lifecycle patterns and update memory files
3. Check for evolution opportunities:
   - Should a `session-lifecycle-manager` agent be created?
   - Should `session-handoff` skill be updated to produce machine-readable JSON alongside markdown?
   - Should `context-degradation` skill be extended to trigger drain mode?

**Routing Command (Router-owned)**:
Ask Router to spawn:
- `subagent_type: "reflection-agent"`
- `description: "Session reflection on shift-change implementation. Extract learnings about: atomic file write patterns, sessionId-aware hooks, drain mode design, TDD red-green-refactor cycle effectiveness."`

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected
