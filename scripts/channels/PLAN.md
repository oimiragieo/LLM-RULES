# Channel Daemon Evolution Plan

**Created:** 2026-04-03
**Status:** Planning
**Approach:** TDD — write test → implement → verify → regression check

---

## Pre-Requisite: Regression Test Suite (Slice 0)

Before touching ANY code, lock down the existing behavior with tests.

### Slice 0.1: Unit tests for existing modules

```
tests/channels/daemon/router.test.cjs
tests/channels/daemon/memory.test.cjs
tests/channels/daemon/commands.test.cjs
tests/channels/daemon/dispatcher.test.cjs
tests/channels/daemon/config.test.cjs
```

**Tests to write:**

**router.test.cjs:**
- `resolve()` matches exact event type
- `resolve()` matches glob pattern (`telegram.*`)
- `resolve()` applies filter correctly
- `resolve()` returns default route when no match
- `resolve()` returns multiple routes when multiple match

**memory.test.cjs:**
- `addMessage()` stores message in chat history
- `addMessage()` auto-compacts at threshold (mock execSync)
- `getContext()` returns Tier 3 profile + Tier 2 summary + Tier 1 recent
- `getContext()` respects MAX_CONTEXT_CHARS
- `getProfile()` returns empty for unknown chat
- `dream()` skips when gate not met (not enough messages)
- `dream(true)` force-runs regardless of gate
- Session rotation triggers after SESSION_ROT_THRESHOLD compactions
- Session rotation preserves Tier 3 profile
- Persistence: save → reload → data intact

**commands.test.cjs:**
- Each command returns `true` (handled)
- Unknown `/` command returns `false` (pass to Claude)
- `/forget` clears all tiers
- `/new` clears Tier 1+2 but preserves Tier 3
- `/compress` triggers compaction
- `/status` includes all stat fields

**dispatcher.test.cjs:**
- `enqueue()` increments received counter
- Events process sequentially
- `[TASK]` tag triggers executor (mock)
- Idle recap fires after 1hr gap (mock Date.now)
- Dream auto-triggers when gate met (mock)
- `getHistory()` returns last N events
- `getStats()` returns correct counts

**config.test.cjs:**
- Loads from .env correctly
- Builds allowed users from all sources
- Default port is 3101
- Default model is sonnet

**Regression benchmark:** All existing tests pass. Record baseline:
- `node --test tests/channels/daemon/*.test.cjs` → 0 failures

### Slice 0.2: Integration smoke test

```
tests/channels/daemon/smoke.test.cjs
```

- Start daemon in-process (mock Telegram API)
- Inject event via `/event` HTTP endpoint
- Verify dispatcher processes it
- Verify HTTP `/status` returns correct shape
- Verify HTTP `/health` returns ok
- Stop daemon cleanly

**Gate:** Slice 0 must be 100% green before proceeding to any Phase 1 work.

---

## Phase 1: Make It Feel Alive

### Slice 1.1: Typing Indicator

**Impact:** High | **Risk:** None | **Effort:** 30 min

The simplest possible improvement. Send `sendChatAction("typing")` before rendering.

**Test first:**
```
tests/channels/daemon/sinks/telegram.test.cjs
- sendTyping() calls Telegram API with correct params
- sendTyping() doesn't throw on API error (fire-and-forget)
```

**Implementation:**
1. Add `sendTyping(chatId)` to `sinks/telegram.cjs`
2. Call it in `dispatcher._handleEvent()` before `renderer.render()`
3. Regression: all Slice 0 tests still pass

**Verification:** Send message on Telegram → see "typing..." before response arrives.

---

### Slice 1.2: Streaming Responses via `sendMessageDraft`

**Impact:** Critical | **Risk:** Medium | **Effort:** 4-6 hours

Replace blocking `execSync` renderer with async streaming that progressively updates the Telegram message using Bot API 9.5 `sendMessageDraft`.

**Test first:**
```
tests/channels/daemon/renderer.test.cjs
- renderStream() yields chunks as they arrive
- renderStream() records message in memory on completion
- renderStream() handles claude -p errors gracefully
- renderStream() returns full text on completion

tests/channels/daemon/sinks/telegram.test.cjs
- sendDraft() calls sendMessageDraft API
- sendDraft() with same draft_id updates existing draft
- finalizeDraft() sends final message without cursor
- Falls back to sendMessage if sendMessageDraft fails (older API)
```

**Implementation (4 sub-steps):**

**1.2a: Add `sendDraft()` and `finalizeDraft()` to telegram sink**
```javascript
// sinks/telegram.cjs
async sendDraft(chatId, text, draftId) {
  return telegramApi(token, 'sendMessageDraft', {
    chat_id: chatId, text, draft_id: draftId
  });
}
async finalizeDraft(chatId, text, draftId, opts) {
  return telegramApi(token, 'sendMessage', {
    chat_id: chatId, text, draft_id: draftId, ...
  });
}
```

**1.2b: Convert renderer from `execSync` to async `execFile` with stdout piping**
```javascript
// renderer.cjs
async renderStream(event, onChunk) {
  // Spawn claude -p as child process
  // Pipe stdout line by line
  // Call onChunk(accumulatedText) every ~500ms
  // Return final text on completion
}
```

**1.2c: Update dispatcher to use streaming render + draft updates**
```javascript
// dispatcher.cjs — in _handleEvent()
const draftId = crypto.randomUUID();
let lastDraftTime = 0;
const response = await renderer.renderStream(event, (chunk) => {
  const now = Date.now();
  if (now - lastDraftTime > 500) { // Rate limit: max 2 edits/sec
    sink.sendDraft(chatId, chunk + ' ▉', draftId);
    lastDraftTime = now;
  }
});
sink.finalizeDraft(chatId, response, draftId, { replyTo: messageId });
```

**1.2d: Fallback for older Bot API (pre-9.5)**
If `sendMessageDraft` returns 400/404, fall back to:
1. `sendMessage` (initial)
2. `editMessageText` every 1s
3. Final `editMessageText` (remove cursor)

**Regression:**
- All Slice 0 tests pass
- Memory still records messages correctly
- `[TASK]` detection still works (check first line of streamed output)
- Commands still intercept before rendering

**Benchmark:**
- Before: user waits 30-60s with no feedback
- After: first text visible within 2-3s, streaming updates every 500ms
- Measure: time-to-first-visible-text (TTFVT)

---

### Slice 1.3: Clarification Loop

**Impact:** High | **Risk:** Low | **Effort:** 2-3 hours

Before blindly executing tasks, the daemon should ask 1-2 clarifying questions. This matches what users want from agentic AI — "ask questions, THEN execute."

**Test first:**
```
tests/channels/daemon/renderer.test.cjs
- Detects [CLARIFY] tag in response
- Returns clarification question without executing
- After user responds, re-renders with clarification context
- Falls through to [TASK] after clarification answered

tests/channels/daemon/dispatcher.test.cjs
- [CLARIFY] response sends question to user, doesn't execute
- Stores pending clarification in state
- Next message from same chat resolves the clarification
- Timeout: if no response in 5 min, cancel the clarification
```

**Implementation:**

**1.3a: Update system prompt to support `[CLARIFY]` tag**
```
If the user asks you to DO something complex or ambiguous, ask ONE clarifying
question first. Start your response with [CLARIFY] followed by your question.
After they answer, proceed with [TASK] to execute.

Examples:
- User: "deploy the app" → [CLARIFY] Which environment — staging or production?
- User: "fix the tests" → [TASK] Run the test suite and fix failures
  (no clarification needed — intent is clear)
```

**1.3b: Add pending clarifications map to dispatcher**
```javascript
this.pendingClarifications = new Map(); // chatId → { task, question, timestamp }
```

**1.3c: In _handleEvent(), check for pending clarification before routing**
```javascript
if (this.pendingClarifications.has(chatId)) {
  // User is answering a clarification — inject their answer as context
  const pending = this.pendingClarifications.get(chatId);
  event.data.text = `Context: You asked "${pending.question}" and the user answered: "${event.data.text}". Now execute the original request: ${pending.task}`;
  this.pendingClarifications.delete(chatId);
}
```

**Regression:** All Slice 0+1.1+1.2 tests pass. Regular messages still work.

---

### Slice 1.4: Permission Relay (`/approve` + `/deny`)

**Impact:** High | **Risk:** Medium | **Effort:** 3-4 hours

When the task executor's `claude -p` needs permission for a dangerous command, relay the approval request to Telegram.

**Test first:**
```
tests/channels/daemon/executor.test.cjs
- executeTask() detects permission prompt in stderr
- Calls onPermissionNeeded callback with command preview
- Waits for approval/denial (with timeout)
- Resumes execution on approval
- Aborts on denial
- Aborts on timeout (5 min default)

tests/channels/daemon/commands.test.cjs
- /approve resolves pending permission
- /deny rejects pending permission
- /approve with no pending → "Nothing pending"
```

**Implementation:**

**1.4a: Switch executor from `execSync` to async `execFile` with stderr monitoring**
Monitor stderr for patterns like:
```
Do you want to allow? (y/n)
Allow Bash(rm -rf ...)?
```

**1.4b: Add permission relay to dispatcher**
```javascript
this.pendingPermissions = new Map(); // chatId → { resolve, reject, command, timestamp }
```

**1.4c: Add `/approve` and `/deny` commands**

**1.4d: Update executor to call `onPermissionNeeded` callback**
The callback sends the permission prompt to Telegram and returns a Promise that resolves when `/approve` or `/deny` is received.

**Regression:** All previous tests pass. Non-dangerous tasks still execute without permission relay.

**Benchmark:**
- Before: dangerous tasks fail silently (timeout)
- After: user approves/denies from phone, task completes

---

## Phase 2: Make It Smart

### Slice 2.1: Structured Session Scratchpad (KAIROS template)

**Impact:** High | **Risk:** Low | **Effort:** 2 hours

Replace flat Tier 2 summaries with KAIROS 9-section markdown template.

**Test first:**
```
tests/channels/daemon/memory.test.cjs
- _compactChat() produces structured summary with sections
- getContext() includes structured summary properly
- Session rotation preserves profile but clears structured summary
```

**Implementation:**
- Update `_compactChat()` prompt to use KAIROS template:
  ```
  Summarize into these sections (omit empty ones):
  # Current Topic: ...
  # Key Facts: ...
  # User Preferences: ...
  # Errors & Corrections: ...
  # Learnings: ...
  ```
- Update `getContext()` to format structured summary

**Regression:** All previous tests pass. Memory persistence still works.

---

### Slice 2.2: Daily Activity Logs

**Impact:** Medium | **Risk:** None | **Effort:** 1 hour

Append-only daily log for richer dream input.

**Test first:**
```
tests/channels/daemon/memory.test.cjs
- appendDailyLog() creates date-stamped file
- appendDailyLog() appends, doesn't overwrite
- dream() reads daily logs for extraction context
```

**Implementation:**
- Add `appendDailyLog(chatId, user, text, response)` to memory
- Call after each message/response pair in dispatcher
- Update dream prompt to read recent daily logs

**Regression:** All previous tests pass.

---

### Slice 2.3: Prompt Suggestions

**Impact:** Medium | **Risk:** Low | **Effort:** 2 hours

After responding, generate 2-3 suggested follow-ups.

**Test first:**
```
tests/channels/daemon/renderer.test.cjs
- generateSuggestions() returns 2-3 short strings
- Uses haiku model (cheap)
- Returns empty array on error
```

**Implementation:**
- Add `generateSuggestions(event, response)` to renderer
- Call after successful render in dispatcher
- Send as a separate message: "💡 Suggestions:\n• ...\n• ...\n• ..."
- Use haiku for cost efficiency

**Regression:** All previous tests pass. Suggestions are optional — failure doesn't block response.

---

### Slice 2.4: Session Resume (`/resume` + `/title`)

**Impact:** Medium | **Risk:** Low | **Effort:** 2-3 hours

Named sessions that persist and can be resumed.

**Test first:**
```
tests/channels/daemon/commands.test.cjs
- /title saves session name
- /resume loads named session's history + summary
- /resume with unknown name → "Session not found"
- /sessions lists available named sessions
```

**Implementation:**
- Add `namedSessions` map to memory (persisted)
- `/title <name>` saves current chat state under that name
- `/resume <name>` loads named session into current chat
- `/sessions` lists all named sessions with timestamps

**Regression:** All previous tests pass.

---

## Phase 3: Business Mode

### Slice 3.1: Mode Configuration

**Impact:** High | **Risk:** Low | **Effort:** 2 hours

Add `mode` field to config with developer/business presets.

**Test first:**
```
tests/channels/daemon/config.test.cjs
- Default mode is "developer"
- Business mode sets different persona
- Business mode disables task execution
- Business mode enables knowledge base
```

**Implementation:**
- Add `mode` to config schema
- Renderer switches persona based on mode
- Executor respects `canExecuteTasks` flag

---

### Slice 3.2: Knowledge Base Injection

**Impact:** High | **Risk:** Low | **Effort:** 3 hours

Load business docs into renderer context for customer-facing mode.

**Test first:**
```
tests/channels/daemon/renderer.test.cjs
- In business mode, knowledge base files are loaded into prompt
- Knowledge base content is truncated at 4000 chars
- Missing knowledge base dir → graceful fallback
```

**Implementation:**
- Read `*.md` files from configured `knowledgeBase` directory
- Inject as "## Business Context" section in system prompt
- Cache with mtime invalidation

---

### Slice 3.3: Human Handoff

**Impact:** High | **Risk:** Medium | **Effort:** 3-4 hours

When the bot can't confidently handle a request, escalate to a human.

**Test first:**
```
tests/channels/daemon/renderer.test.cjs
- Detects [HANDOFF] tag in response
- Sends notification to configured handoff destination
- Informs user that a human will follow up
```

**Implementation:**
- Add `[HANDOFF]` tag support (like `[TASK]` and `[CLARIFY]`)
- Send handoff notification via configured channel (email, Telegram group, etc.)
- Log handoff in history for audit trail

---

## Phase 4: Multi-Platform

### Slice 4.1: Discord Source + Sink

**Test first:**
```
tests/channels/daemon/sources/discord.test.cjs
tests/channels/daemon/sinks/discord.test.cjs
```

### Slice 4.2: Slack Source + Sink

### Slice 4.3: Web Widget (HTTP SSE endpoint)

---

## Regression Protocol

**After EVERY slice:**

1. Run: `node --test tests/channels/daemon/*.test.cjs`
2. Run: `node --test tests/channels/daemon/**/*.test.cjs`
3. Manual smoke: start daemon, send message on Telegram, verify response
4. Check: `curl http://127.0.0.1:3101/status` returns valid JSON
5. Check: `/help` on Telegram shows all commands
6. Check: `/memory` still returns profile facts
7. Check: `/dream` still works

**After EVERY phase:**

1. Full regression: `pnpm test`
2. Manual smoke: 5-message conversation → verify memory persistence
3. Manual smoke: task execution → verify `[TASK]` flow
4. Manual smoke: restart daemon → verify memory survives
5. Benchmark: measure TTFVT (time to first visible text)

---

## Benchmarks

| Metric | Baseline (current) | Phase 1 Target | Phase 2 Target |
|--------|-------------------|----------------|----------------|
| Time to first visible text | 30-60s | 2-3s (streaming) | 2-3s |
| Time to complete response | 30-60s | 30-60s (same) | 30-60s |
| Memory load time | <100ms | <100ms | <200ms |
| Dream consolidation time | 30-60s | 30-60s | 30-60s |
| Command response time | <50ms | <50ms | <50ms |
| Max concurrent chats | untested | 10+ | 10+ |
| Context quality (subjective) | 6/10 | 7/10 | 9/10 |

---

## Dependency Graph

```
Slice 0 (regression tests) ← GATE: must pass before any work
  ├── Slice 1.1 (typing indicator) ← independent
  ├── Slice 1.2 (streaming) ← requires async renderer refactor
  │     └── Slice 1.3 (clarification) ← requires [TAG] detection in stream
  │     └── Slice 1.4 (permissions) ← requires async executor
  ├── Slice 2.1 (structured scratchpad) ← independent
  ├── Slice 2.2 (daily logs) ← independent
  ├── Slice 2.3 (suggestions) ← requires async renderer
  └── Slice 2.4 (session resume) ← independent

Phase 3 depends on Phase 1+2 being stable.
Phase 4 depends on Phase 1+2+3 architecture being proven.
```

---

## Rollback Points

Each slice is atomic. If a slice breaks something:

1. `git stash` the slice changes
2. Verify regression tests pass on the stashed state
3. Debug the slice in isolation
4. Only merge when ALL regression tests pass

No slice modifies files from another slice — they add new capabilities without changing existing behavior (Open/Closed principle).

---

## File Plan (new files to create)

```
tests/channels/
├── daemon/
│   ├── router.test.cjs          # Slice 0.1
│   ├── memory.test.cjs          # Slice 0.1
│   ├── commands.test.cjs        # Slice 0.1
│   ├── dispatcher.test.cjs      # Slice 0.1
│   ├── config.test.cjs          # Slice 0.1
│   ├── renderer.test.cjs        # Slice 1.2, 1.3, 2.3
│   ├── executor.test.cjs        # Slice 1.4
│   ├── smoke.test.cjs           # Slice 0.2
│   ├── sources/
│   │   └── telegram.test.cjs    # Slice 0.1
│   └── sinks/
│       └── telegram.test.cjs    # Slice 1.1, 1.2
```
