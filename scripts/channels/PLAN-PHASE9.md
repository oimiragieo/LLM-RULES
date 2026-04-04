# Channel Daemon Phase 9: Learning Agent & Parallel Execution

**Created:** 2026-04-03
**Baseline:** 120 tests, 0 failures (Phases 0-8 complete)
**Approach:** TDD — write test → implement → verify → regression check
**Iron Rule:** 120 existing tests MUST pass after every slice.

---

## Overview

Phase 9 adds the features that make the daemon a **self-improving autonomous agent**:
skill extraction (learns from its own work), deep Socratic interview (clarifies
before executing), and parallel ultrawork execution (splits tasks, runs concurrently).

These are the patterns that separate OMC from basic chatbots — the agent that gets
smarter every session.

---

## Slice 9.1: Skill Extraction Engine (`/learner`)

**Impact:** Critical — daemon gets smarter over time
**Risk:** Low — additive, writes to new skill files
**Effort:** 2-3 hours

After a successful [TASK] or [RALPH] execution, extract the problem/solution
pattern as a reusable skill file. On future messages, auto-inject matching
skills as context so Claude doesn't re-solve the same problem.

**Test first:**

```
tests/channels/daemon/skills.test.cjs
- extractSkill() creates a skill file with pattern + solution
- Skill file has frontmatter: name, triggers, description, source
- findMatchingSkills(text) returns skills whose triggers match
- Skills are stored in channel-memory/skills/
- Skills persist across daemon restarts
- Max 50 skills (LRU eviction)
- Duplicate detection: same trigger pattern → update, not create
```

**Implementation:**

**9.1a: Create `scripts/channels/daemon/skills.cjs` module**

```javascript
class SkillStore {
  constructor(storageDir) {
    this.skillsDir = path.join(storageDir, 'skills');
    this.skills = []; // { name, triggers: string[], description, solution, createdAt }
  }

  // Extract a skill from a completed task
  extractSkill(task, result, model) {
    // Use haiku to extract: trigger keywords, problem pattern, solution pattern
    // Write to skills/<slug>.json
  }

  // Find skills matching a user message
  findMatchingSkills(text) {
    // Check each skill's trigger keywords against the text
    // Return matching skill solutions as context
  }

  // Inject matching skills into renderer context
  getSkillContext(text) {
    const matches = this.findMatchingSkills(text);
    if (matches.length === 0) return '';
    return (
      '\n\nRelevant skills from previous sessions:\n' +
      matches.map(s => `- ${s.name}: ${s.solution}`).join('\n')
    );
  }
}
```

**9.1b: Extract skills after successful [TASK]/[RALPH] in dispatcher**
After a task completes successfully (no error), call:

```javascript
if (result && !result.startsWith('Error') && skillStore) {
  setImmediate(() => skillStore.extractSkill(taskDesc, result));
}
```

**9.1c: Inject matching skills in renderer.\_buildPrompt()**
Before building the prompt, check for matching skills:

```javascript
const skillContext = this.skillStore?.getSkillContext(text) || '';
if (skillContext) parts.push(skillContext);
```

**Regression:** 120 tests pass. Skill extraction is async (setImmediate),
doesn't affect response delivery. Skill injection is additive context.

**Benchmark:**

- First time solving "fix the CORS issue": full claude -p execution (~30s)
- Second time: skill auto-injected, solution in 5s (cached pattern)

---

## Slice 9.2: Deep Socratic Interview ([INTERVIEW] tag)

**Impact:** High — prevents wasted iterations on ambiguous tasks
**Risk:** Low — additive to clarification system
**Effort:** 2 hours

Upgrade [CLARIFY] (single question) to a multi-round Socratic interview
that scores clarity before proceeding. For complex/ambiguous tasks, the daemon
asks 3-5 probing questions, one at a time, then synthesizes the answers into
a clear task specification before executing.

**Test first:**

```
tests/channels/daemon/dispatcher.test.cjs (additions)
- [INTERVIEW] response starts multi-round interview
- Each round sends one question, waits for answer
- After all questions answered, synthesizes into [TASK]
- Max 5 rounds (configurable)
- User can say "just do it" to skip remaining questions
- Timeout: 10 min per question, auto-cancel if no response
```

**Implementation:**

**9.2a: Add pendingInterviews map to dispatcher**

```javascript
this.pendingInterviews = new Map();
// chatId → { questions: [], answers: [], currentRound: 0, originalTask: '', maxRounds: 5 }
```

**9.2b: Add [INTERVIEW] detection in dispatcher**
When renderer returns `[INTERVIEW]`:

1. Parse questions (one per line after tag)
2. Store in pendingInterviews
3. Send first question to user
4. On next message, store answer, send next question
5. After all questions answered, synthesize into [TASK] and execute

**9.2c: Update system prompt with [INTERVIEW] tag**

```
### Deep interview (use [INTERVIEW] tag for complex/vague requests)
For tasks that are vague, have multiple interpretations, or could go wrong
without clarity, use [INTERVIEW] followed by 3-5 probing questions.

Examples:
- User: "refactor the codebase" → [INTERVIEW]
  1. Which modules should I focus on?
  2. What's the target architecture pattern?
  3. Should I preserve the current API surface?
  4. What's the test coverage requirement?
  5. Any files that should NOT be touched?
```

**Regression:** 120 tests pass. [INTERVIEW] only fires when renderer
explicitly uses the tag — normal [CLARIFY] still works as before.

---

## Slice 9.3: Ultrawork — Parallel Task Execution

**Impact:** High — 3-5x speed improvement for parallelizable tasks
**Risk:** Medium — concurrent claude -p calls can conflict on files
**Effort:** 3-4 hours

Split a task into independent subtasks, run them in parallel with multiple
claude -p calls, merge results. For tasks like "fix lint in 5 files" or
"add error handling to all API routes", this is 3-5x faster than sequential.

**Test first:**

```
tests/channels/daemon/executor.test.cjs (additions)
- executeParallel() splits task into subtasks via haiku
- Runs N subtasks concurrently (max 3 parallel)
- Merges results into single response
- Handles partial failures (some subtasks fail, others succeed)
- Respects concurrency limit
- Falls back to sequential on split failure
```

**Implementation:**

**9.3a: Add `executeParallel(task, opts)` to executor**

```javascript
async executeParallel(task, opts = {}) {
  const maxParallel = opts.maxParallel || 3;

  // Step 1: Use haiku to split the task into independent subtasks
  const splitPrompt = `Split this task into independent subtasks that can run in parallel.
    Return ONLY a JSON array of strings. Task: ${task}`;
  const splitResult = this.executeTask(splitPrompt);
  const subtasks = JSON.parse(splitResult.match(/\[[\s\S]*\]/)?.[0] || '[]');

  if (subtasks.length <= 1) return this.executeTask(task); // Not parallelizable

  // Step 2: Run subtasks in parallel (limited concurrency)
  const results = await Promise.allSettled(
    subtasks.map(st => new Promise(resolve => resolve(this.executeTask(st))))
  );

  // Step 3: Merge results
  return results.map((r, i) =>
    `### Subtask ${i+1}: ${subtasks[i]}\n${r.status === 'fulfilled' ? r.value : 'FAILED: ' + r.reason}`
  ).join('\n\n');
}
```

**9.3b: Add [ULTRAWORK] tag detection in dispatcher**
When renderer returns `[ULTRAWORK]`, route to `executeParallel()` instead
of `executeTask()`.

**9.3c: Update system prompt**

```
### Ultrawork parallel execution (use [ULTRAWORK] tag)
For tasks with multiple independent parts that can run simultaneously:
- User: "fix lint in all 5 service files" → [ULTRAWORK] Fix lint errors in each service file
- User: "add error handling to all API routes" → [ULTRAWORK] Add try/catch to each route handler
```

**Regression:** 120 tests pass. [ULTRAWORK] is a new tag — doesn't affect
existing [TASK]/[RALPH]/[CLARIFY] paths.

---

## Slice 9.4: Auto-Resume on Rate Limit

**Impact:** Medium — prevents lost work during long tasks
**Risk:** Low — additive retry logic in executor
**Effort:** 1 hour

When `claude -p` fails with a rate limit error, instead of failing the task,
wait for the rate limit to reset and retry automatically.

**Test first:**

```
tests/channels/daemon/executor.test.cjs (additions)
- _isRateLimitError() detects rate limit in stderr/output
- Rate-limited executeTask retries after delay
- Max 3 retries with exponential backoff (30s, 60s, 120s)
- Reports retry to onProgress callback
```

**Implementation:**

**9.4a: Add rate limit detection to executor**

```javascript
_isRateLimitError(output) {
  return /rate.limit|429|too many requests|overloaded/i.test(output);
}
```

**9.4b: Wrap executeTask with retry logic**

```javascript
executeTaskWithRetry(task, context, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = this.executeTask(task, context);
    if (!this._isRateLimitError(result)) return result;
    if (attempt < maxRetries) {
      const delay = 30000 * Math.pow(2, attempt); // 30s, 60s, 120s
      this.log(`[executor] Rate limited, retrying in ${delay/1000}s...`);
      // Sync sleep (we're already blocking)
      const start = Date.now();
      while (Date.now() - start < delay) {} // Busy wait (sync context)
    }
  }
  return 'Rate limit exceeded after 3 retries. Try again later.';
}
```

**Regression:** 120 tests pass. Retry is opt-in (only used by Ralph and Ultrawork).

---

## Dependency Graph

```
Slice 9.1 (skill extraction) ← independent, highest value
Slice 9.2 (deep interview) ← builds on [CLARIFY] infrastructure
Slice 9.3 (ultrawork parallel) ← independent, needs careful concurrency
Slice 9.4 (auto-resume) ← independent, enhances executor reliability
```

All slices are independent — can be done in any order.
Recommend: 9.1 → 9.4 → 9.2 → 9.3 (value order, risk ascending).

---

## Regression Protocol

**After EVERY slice:**

1. Run all 120+ tests
2. Manual: send Telegram message, verify response
3. Manual: `curl http://127.0.0.1:3101/status`
4. Verify no new files break existing skill/memory/command paths

**After Phase 9 complete:**

1. Full `pnpm test`
2. Trigger skill extraction: solve a problem, verify skill file created
3. Trigger interview: send ambiguous request, verify multi-round questions
4. Trigger ultrawork: send parallelizable task, verify concurrent execution
5. Trigger rate limit retry: (hard to test live — unit test covers this)

---

## Benchmarks

| Metric                   | Phase 8 (current)                 | Phase 9 Target                       |
| ------------------------ | --------------------------------- | ------------------------------------ |
| Repeated problem-solving | Full execution each time          | Auto-inject cached skill (5s vs 30s) |
| Ambiguous task waste     | Wrong interpretation → redo       | Interview catches ambiguity upfront  |
| Multi-file task speed    | Sequential (N × 30s)              | Parallel (30s for 3 concurrent)      |
| Rate limit failures      | Task fails, user retries manually | Auto-retry with backoff              |
| Skill count              | 0                                 | Growing library per project          |
| Test count               | 120                               | 135+                                 |

---

## New Files

```
scripts/channels/daemon/
└── skills.cjs              # Slice 9.1 (skill store)

tests/channels/daemon/
└── skills.test.cjs          # Slice 9.1
(+ additions to executor.test.cjs for 9.3, 9.4)
(+ additions to dispatcher.test.cjs for 9.2)
```
