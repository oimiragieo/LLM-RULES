---
name: error-recovery-escalation
description: '5-level error recovery escalation: retry, nudge, replan, fallback, force-done — each with entry criteria and timeout before escalating'
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, TaskUpdate, TaskList, TaskGet]
agents: [developer, qa, master-orchestrator, planner, devops-troubleshooter]
category: 'Validation & Quality'
tags: [error-recovery, escalation, retry, resilience, agent-safety, recovery]
best_practices:
  - Always enter at the correct level based on error classification
  - Record every escalation in task metadata for reflection scoring
  - Force-done at level 5 emits partial results — never silent failure
  - Timeout between levels prevents infinite escalation loops
error_handling:
  - If error type is ambiguous, default to level 2 (nudge)
  - If a level's timeout expires with no progress, escalate immediately
  - If level 5 is reached and still no output, emit empty partial result with explanation
---

# Error Recovery Escalation

## Purpose

Provide a structured, 5-level escalation ladder for recovering from agent errors. Each level has specific entry criteria, an action, and a timeout before escalating to the next level.

```
Level 1: RETRY         — Same action, transient error
Level 2: NUDGE         — Adjust parameters, same approach
Level 3: REPLAN        — New approach, same goal
Level 4: FALLBACK      — Different agent or model
Level 5: FORCE-DONE    — Partial results with explanation
```

## When to Invoke

```javascript
Skill({ skill: 'error-recovery-escalation' });
```

Invoke when:

- An agent action fails with an error
- A judge-verification FAIL verdict is received
- A behavioral loop is detected (complement to `behavioral-loop-detection`)
- A task has been in_progress longer than expected
- A tool call returns unexpected output

---

## Iron Laws

1. **Always enter at the correct level** — do not skip to level 3 for a transient network error
2. **Respect timeouts** — if a level times out, escalate immediately regardless of progress
3. **Record every escalation** — every level transition must be logged in task metadata
4. **Force-done is not failure** — partial results with explanation are valid outcomes
5. **Level 5 always emits output** — silent failure is never acceptable

---

## Escalation Ladder

### Level 1: RETRY

**Entry criteria:**

- Transient error: network timeout, rate limit, temporary unavailability
- Error is idempotent (repeating the exact same call is safe)
- Less than 3 retries have occurred for this action

**Action:**

- Wait for backoff period (1s, 2s, 4s — exponential)
- Retry the identical action unchanged

**Timeout:** 3 attempts × backoff = max ~30 seconds total
**Escalate to Level 2 when:** 3 retries exhausted without success

**Example:**

```
Read('.claude/context/data/index.db') → ENOENT
→ Level 1: Retry 3 times with 1s backoff
→ Still fails → escalate to Level 2
```

---

### Level 2: NUDGE

**Entry criteria:**

- Action failed 3 times at Level 1 (retry exhausted)
- Error suggests wrong parameters (wrong path, wrong key, malformed input)
- Judge-verification FAIL with evidenceOfCompletion < 8 (no artifacts found)

**Action:**

- Adjust parameters: different path, different key, simplified input
- Keep same overall approach and goal
- Try 2-3 variants

**Timeout:** 5 minutes total for all nudge variants
**Escalate to Level 3 when:** All nudge variants fail or timeout expires

**Example:**

```
Write('output/result.json', ...) → EPERM
→ Level 2: Try .claude/context/tmp/result.json, then /tmp/result.json
→ All fail → escalate to Level 3
```

---

### Level 3: REPLAN

**Entry criteria:**

- Level 2 nudges exhausted or timed out
- Judge-verification FAIL with goalAlignment < 15 (wrong approach)
- Behavioral loop detected at REPLAN threshold (≥3 similar actions)
- Architectural blocker requiring different approach

**Action:**

- Abandon current approach entirely
- Spawn `planner` agent or invoke `plan-generator` skill for a new plan
- Document old approach as a known-bad path in task metadata

**Timeout:** 15 minutes for new plan + initial execution
**Escalate to Level 4 when:** Replan also fails, or planner cannot produce a viable plan

**Example:**

```
Auth middleware implementation fails repeatedly
→ Level 3: Replan with different auth library (passport → jose)
→ New plan also fails due to dependency conflict → escalate to Level 4
```

---

### Level 4: FALLBACK

**Entry criteria:**

- Level 3 replan exhausted or timed out
- Current agent type is inappropriate for the task
- Different model tier may improve outcome (haiku → sonnet → opus)
- Behavioral loop detected at EXPLORE threshold (≥5 similar actions)

**Action:**

- Switch agent type (e.g., `developer` → `devops-troubleshooter`)
- OR escalate model tier (haiku → sonnet, or sonnet → opus)
- Provide full context of what was tried and why it failed
- Pass accumulated error context as explicit input

**Timeout:** 20 minutes for fallback agent execution
**Escalate to Level 5 when:** Fallback agent also fails or timeout expires

**Example:**

```
Developer agent cannot resolve platform-specific build error
→ Level 4: Spawn devops-troubleshooter with full error log
→ Still unresolved after 20min → escalate to Level 5
```

---

### Level 5: FORCE-DONE

**Entry criteria:**

- Level 4 fallback exhausted or timed out
- Behavioral loop detected at FORCE-DONE threshold (≥8 similar actions)
- Total escalation time exceeds session budget
- External blocker (service down, missing credentials, unavailable resource)

**Action:**

- Emit partial results — whatever was completed successfully
- Write detailed explanation of what failed and why
- Call TaskUpdate with `{ partial: true, escalationLevel: 5, explanation: '...' }`
- Recommend follow-up actions for human resolution

**Output contract:**

```json
{
  "status": "partial",
  "completedSteps": ["step1", "step2"],
  "failedAt": "step3",
  "failureReason": "<specific error>",
  "escalationPath": [1, 2, 3, 4, 5],
  "recommendation": "<what a human should do to finish>"
}
```

**Example:**

```
External API service is down
→ Level 5: Emit partial results (all non-API steps completed)
→ TaskUpdate with partial: true, explanation of API outage
→ Recommend retry when service is restored
```

---

## Error Classification Matrix

| Error Type                     | Entry Level            | Rationale                       |
| ------------------------------ | ---------------------- | ------------------------------- |
| Network timeout                | 1 (retry)              | Transient, safe to retry        |
| Rate limit                     | 1 (retry with backoff) | Transient, wait and retry       |
| File not found                 | 2 (nudge)              | Wrong path, try alternatives    |
| Permission denied              | 2 (nudge)              | Wrong path/permissions          |
| Wrong output format            | 2 (nudge)              | Adjust input parameters         |
| Goal misalignment (judge FAIL) | 3 (replan)             | Need different approach         |
| Agent capability mismatch      | 4 (fallback)           | Need different agent            |
| External service down          | 5 (force-done)         | Cannot resolve programmatically |
| Missing credentials            | 5 (force-done)         | Requires human intervention     |

---

## TaskUpdate Protocol

Every level transition MUST be recorded:

```javascript
// On entering a level
TaskUpdate({
  taskId: '<task-id>',
  status: 'in_progress',
  metadata: {
    recoveryLevel: <1-5>,
    recoveryAction: 'retry|nudge|replan|fallback|force-done',
    errorType: '<classification>',
    previousLevels: [<completed levels>],
    enteredAt: new Date().toISOString(),
  }
});

// On Level 5 completion
TaskUpdate({
  taskId: '<task-id>',
  status: 'completed',
  metadata: {
    partial: true,
    escalationLevel: 5,
    escalationPath: [1, 2, 3, 4, 5],
    completedSteps: ['<step1>', '<step2>'],
    failedAt: '<step>',
    failureReason: '<specific error>',
    recommendation: '<human follow-up action>',
    summary: 'Force-done: partial results emitted after 5-level escalation',
  }
});
```

---

## Integration Points

| Skill                            | Relationship                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| `behavioral-loop-detection`      | Feeds escalation triggers (REPLAN at 3, EXPLORE at 5, FORCE-DONE at 8) |
| `judge-verification`             | FAIL verdict triggers escalation at appropriate level                  |
| `plan-generator`                 | Called at Level 3 (replan) to produce new approach                     |
| `verification-before-completion` | Gates completion before escalation is declared unnecessary             |
| `debugging`                      | Provides root cause analysis before Level 3 escalation                 |

---

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execution hook: `hooks/pre-execute.cjs`
Post-execution hook: `hooks/post-execute.cjs` (emits observability event)

---

## Memory Protocol

**Before starting:**
Read `.claude/context/memory/learnings.md` for known error patterns in this codebase.
Check `.claude/context/memory/issues.md` for known blockers.

**After completing:**

- Level 5 reached → Append to `.claude/context/memory/issues.md` with root cause
- New error classification discovered → Append to `.claude/context/memory/learnings.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
