# Channel Daemon Phase 5 Plan: Intelligence & Autonomy

**Created:** 2026-04-03
**Baseline:** 79 tests, 0 failures (Phases 0-4 complete)
**Approach:** TDD — write test → implement → verify → regression check

---

## Overview

Phase 5 adds cost-intelligent model routing, task progress visibility,
KAIROS-style proactive heartbeat, file delivery, and per-user cost tracking.
These are the features that separate a chatbot from an autonomous agent.

**Iron Rule:** The 79 existing tests MUST pass after every slice. Any regression = revert.

---

## Slice 5.1: Multi-Model Routing (Smart Cost Control)

**Impact:** Critical — cuts API cost ~60%
**Risk:** Low — additive change to renderer
**Effort:** 1 hour

Route messages to the cheapest model that can handle them.

| Message Type                       | Model  | Cost/MTok |
| ---------------------------------- | ------ | --------- |
| Greetings, simple chat (<30 chars) | haiku  | $0.80     |
| Regular conversation               | sonnet | $3.00     |
| Complex tasks, code, analysis      | opus   | $15.00    |
| Compaction, suggestions, dream     | haiku  | $0.80     |

**Test first:**

```
tests/channels/daemon/renderer.test.cjs
- _selectModel('hello') → 'haiku'
- _selectModel('explain the reactor pattern in distributed systems') → 'sonnet'
- _selectModel('[complex 500+ char technical question]') → 'sonnet'
- _selectModel() uses config.model as default
- Compaction always uses haiku
- Dream always uses sonnet
```

**Implementation:**

**5.1a: Add `_selectModel(text)` to renderer**

```javascript
_selectModel(text) {
  if (!text || text.length < 30) return 'haiku';
  // Keyword triggers for opus (if configured)
  if (this.opusEnabled && /architect|refactor|security audit|complex/i.test(text)) return 'opus';
  return this.model; // default: sonnet
}
```

**5.1b: Use `_selectModel` in `render()` and `renderStream()`**
Replace hardcoded `--model ${this.model}` with `--model ${this._selectModel(text)}`.

**5.1c: Log model selection for cost visibility**

```
[dispatcher] Using haiku for "hello" (5 chars)
[dispatcher] Using sonnet for "explain the reactor..." (89 chars)
```

**Regression:** 79 tests pass. Existing behavior unchanged for sonnet-length messages.

**Benchmark:**

- Before: 100% sonnet ($3/MTok)
- After: ~40% haiku ($0.80), ~55% sonnet ($3), ~5% opus ($15)
- Estimated cost reduction: 35-60%

---

## Slice 5.2: Task Progress Streaming

**Impact:** High — users see "Running task..." for 60s with zero feedback
**Risk:** Medium — requires async executor refactor
**Effort:** 2-3 hours

When a [TASK] executes, send periodic progress updates to the user.

**Test first:**

```
tests/channels/daemon/executor.test.cjs
- executeTaskAsync() returns an async iterator of progress events
- Progress events include: { type: 'started'|'progress'|'complete'|'error', text }
- stderr lines matching tool patterns are extracted as progress
- Timeout produces partial result + timeout event
```

**Implementation:**

**5.2a: Add `executeTaskAsync(task, onProgress)` to executor**
Switch from `execSync` to `execFile` (async). Monitor stderr for:

```
Tool: Reading file.js
Tool: Running bash command
Tool: Writing output.ts
```

Call `onProgress(text)` for each detected tool call.

**5.2b: Update dispatcher [TASK] handler to use async executor**

```javascript
// Send initial notification
await sink.send(chatId, '⚙️ Starting task...');
let lastProgress = Date.now();

const result = await executor.executeTaskAsync(taskDesc, async progress => {
  // Rate limit: max 1 update per 5 seconds
  if (Date.now() - lastProgress > 5000) {
    await sink.send(chatId, `⏳ ${progress}`);
    lastProgress = Date.now();
  }
});
```

**5.2c: Fallback to sync for short tasks**
If the task completes in <5 seconds, skip progress updates (not worth the noise).

**Regression:** 79 tests pass. `executeTask` (sync) preserved as fallback.

**Benchmark:**

- Before: user waits 30-60s with "⚙️ Running task..." and no feedback
- After: progress updates every 5s ("⏳ Reading 3 files...", "⏳ Running tests...")

---

## Slice 5.3: KAIROS Tick/Heartbeat Engine (Proactive Mode)

**Impact:** High — transforms bot from reactive to proactive
**Risk:** Medium — must not spam user or burn API credits
**Effort:** 3-4 hours

Wire the existing `TimerSource` with a KAIROS-style tick engine.

**Test first:**

```
tests/channels/daemon/sources/timer.test.cjs
- TimerSource fires events at configured intervals
- TickEngine decides 'act' or 'sleep' based on context
- Proactive actions have a 15-second budget (mock timer)
- Idle for 1hr+ triggers "good morning" if configured
- No proactive action when user is actively chatting (<5min since last msg)
```

**Implementation:**

**5.3a: Define tick schedules in config**

```json
{
  "proactive": {
    "enabled": true,
    "tickIntervalMs": 60000,
    "schedules": [
      {
        "name": "morning-checkin",
        "cron": "0 9 * * 1-5",
        "prompt": "Send a brief good morning and ask what to work on today."
      },
      {
        "name": "eod-summary",
        "cron": "0 17 * * 1-5",
        "prompt": "Summarize what was accomplished today."
      }
    ],
    "budgetMs": 15000
  }
}
```

**5.3b: Implement TickEngine in timer source**
On each tick:

1. Check if user is active (last message < 5 min ago → sleep)
2. Check if any cron schedule matches current time
3. If schedule matches → render proactive message via renderer
4. Send to user's home chatId
5. Enforce 15s budget — abort if exceeded

**5.3c: Wire into daemon index**

```javascript
if (config.proactive?.enabled) {
  const tickEngine = new TimerSource(config.proactive, event => dispatcher.enqueue(event));
  sources.push(tickEngine);
  tickEngine.start();
  log('Proactive tick engine started');
}
```

**Regression:** 79 tests pass. Proactive mode is opt-in (disabled by default).

---

## Slice 5.4: File Sending

**Impact:** High — enables report/code/screenshot delivery
**Risk:** Low — additive to sinks
**Effort:** 1-2 hours

Add file sending to all sinks. When a [TASK] result includes a file path,
send it as a document attachment.

**Test first:**

```
tests/channels/daemon/sinks/telegram.test.cjs
- sendFile() calls sendDocument API with file path
- sendFile() handles missing files gracefully
- Large files (>50MB) are skipped with warning

tests/channels/daemon/dispatcher.test.cjs
- [TASK] result containing file path triggers sendFile
- File path detection: matches /path/to/file or C:\path\to\file patterns
```

**Implementation:**

**5.4a: Add `sendFile(chatId, filePath, opts)` to telegram sink**

```javascript
async sendFile(chatId, filePath, opts = {}) {
  const FormData = require('form-data');
  // Use multipart form upload via Telegram Bot API sendDocument
}
```

**5.4b: Add `sendFile` to discord sink (uses Discord attachments API)**

**5.4c: Detect file paths in [TASK] results**
After task execution, scan result for file paths:

```javascript
const filePaths = result.match(/(?:\/[\w.-]+)+\.(?:md|pdf|csv|txt|json|png|jpg)/g);
if (filePaths?.length > 0) {
  for (const fp of filePaths.slice(0, 3)) {
    // max 3 files
    await sink.sendFile(chatId, fp);
  }
}
```

**Regression:** 79 tests pass. Text responses unaffected.

---

## Slice 5.5: Per-User Cost Tracking

**Impact:** Medium — visibility into spend, enables budgeting
**Risk:** Low — additive metadata
**Effort:** 1-2 hours

Track estimated token usage and cost per user per day.

**Test first:**

```
tests/channels/daemon/memory.test.cjs
- trackUsage() increments user's token count
- getUsage() returns { today, week, month, total } stats
- estimateCost() returns $ amount based on model tiers
- /usage command returns formatted stats
```

**Implementation:**

**5.5a: Add usage tracking to DaemonMemory**

```javascript
// Per-user usage tracking
this.usagePath = path.join(storageDir, 'usage.json');
this.usage = new Map(); // chatId → { dates: { '2026-04-03': { tokens, cost, messages } } }

trackUsage(chatId, model, estimatedTokens) {
  const today = new Date().toISOString().split('T')[0];
  const costPerMTok = { haiku: 0.80, sonnet: 3.00, opus: 15.00 }[model] || 3.00;
  const cost = (estimatedTokens / 1_000_000) * costPerMTok;
  // Increment today's stats
}

getUsage(chatId) {
  // Returns { today: { tokens, cost, messages }, week: {...}, month: {...}, total: {...} }
}
```

**5.5b: Call `trackUsage` in renderer after each claude -p call**
Estimate tokens from response length (response.length / 4).

**5.5c: Add `/usage` command**

```
📊 Your usage:
  Today: 12 messages, ~24K tokens, ~$0.07
  This week: 45 messages, ~90K tokens, ~$0.27
  This month: 180 messages, ~360K tokens, ~$1.08
  Model split: 40% haiku, 55% sonnet, 5% opus
```

**Regression:** 79 tests pass. Usage tracking is metadata-only, no behavioral change.

---

## Dependency Graph

```
Slice 5.1 (multi-model) ← independent, do first (everything else benefits)
  ├── Slice 5.2 (task progress) ← requires async executor
  ├── Slice 5.3 (tick engine) ← requires timer source wiring
  ├── Slice 5.4 (file sending) ← independent
  └── Slice 5.5 (cost tracking) ← depends on 5.1 (model selection)
```

Do 5.1 first — all other slices benefit from model routing.

---

## Regression Protocol

**After EVERY slice:**

1. `node --test tests/channels/daemon/*.test.cjs tests/channels/daemon/**/*.test.cjs`
2. Verify: 79+ tests, 0 failures
3. Manual: start daemon, send Telegram message, verify response
4. Manual: `curl http://127.0.0.1:3101/status` returns valid JSON

**After Phase 5 complete:**

1. Full: `pnpm test` (all tests)
2. Cost audit: check haiku vs sonnet routing works
3. Task progress: run a [TASK] and verify updates appear
4. Proactive: wait for tick → verify it fires or sleeps correctly
5. File: ask bot to generate a file → verify it's sent

---

## Benchmarks

| Metric                     | Phase 4 (current)      | Phase 5 Target           |
| -------------------------- | ---------------------- | ------------------------ |
| API cost per message (avg) | ~$0.003 (all sonnet)   | ~$0.0012 (mixed routing) |
| Task feedback latency      | 30-60s (zero feedback) | 5s between updates       |
| Proactive messages/day     | 0                      | 2-4 (morning + EOD)      |
| File delivery              | text only              | PDF/CSV/MD/PNG           |
| Cost visibility            | none                   | /usage per user          |
| Test count                 | 79                     | 90+                      |

---

## Rollback Points

Each slice is atomic. If a slice breaks:

1. `git stash` the changes
2. Verify 79 tests pass
3. Debug in isolation
4. Only merge when ALL tests pass

---

## New Test Files

```
tests/channels/daemon/
├── renderer.test.cjs        # Slice 5.1 (model selection)
├── executor.test.cjs        # Slice 5.2 (async progress)
├── sources/timer.test.cjs   # Slice 5.3 (tick engine)
└── (existing files get new tests for 5.4, 5.5)
```
