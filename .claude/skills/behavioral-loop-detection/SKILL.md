---
name: behavioral-loop-detection
description: Detect when agents are stuck in repetitive action loops using a rolling 20-action window with escalating nudges — replan after 3 similar actions, explore after 5, force-done after 8.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: false
tools: [Read, Write, Bash, TaskUpdate]
agents: [developer, qa, master-orchestrator, planner]
category: 'Validation & Quality'
tags: [loop-detection, agent-safety, escalation, monitoring, behavioral]
error_handling: strict
---

# Behavioral Loop Detection

## Overview

Detects when an agent is stuck in a repetitive action loop by maintaining a rolling 20-action
history window. Compares recent actions using normalized similarity scoring and applies
escalating interventions before the agent wastes tokens or blocks progress.

Designed for any agentic context — browser automation, file editing, API calls, or
multi-step orchestration — not tied to any specific tool type.

## When to Use

Invoke this skill when:

- An agent task has been running for more than 10 steps without clear progress
- The same tool is being called repeatedly with similar arguments
- A task appears stalled with no `TaskUpdate(completed)` after a long sequence
- You want proactive loop-prevention in a custom orchestrator

```javascript
Skill({ skill: 'behavioral-loop-detection' });
```

## The Iron Law

```
SAME ACTION × 3 = REPLAN
SAME ACTION × 5 = EXPLORE
SAME ACTION × 8 = FORCE-DONE
```

Never let an agent silently loop forever. Each repetition consumes tokens and produces no value.

## Action History Window

### Maintenance Rules

- Keep a rolling buffer of the **last 20 actions** (FIFO — drop oldest when full)
- Each entry in the buffer: `{ toolName, normalizedArgs, timestamp, stepIndex }`
- Reset the buffer only when a **fundamentally different** tool/action type appears
- Never reset on argument variation alone (e.g., same tool, different file path = still similar)

### Normalized Action Comparison

Two actions are **similar** when:

1. The `toolName` is identical, AND
2. The normalized argument string similarity score ≥ 0.75 (Jaccard over word tokens)

**Normalization rules (apply in order):**

1. Convert all values to lowercase
2. Strip file paths down to basename only (e.g., `/a/b/file.ts` → `file.ts`)
3. Remove timestamps, UUIDs (8-4-4-4-12 hex pattern), and numeric IDs
4. Sort object keys alphabetically before stringifying
5. Truncate the result to 200 characters

**Similarity scoring:**

```javascript
function jaccardSimilarity(a, b) {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
```

## Escalation Ladder

| Threshold | Trigger Condition          | Intervention      | Message to Agent                                                                                                          |
| --------- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Level 1   | 3 similar actions in a row | REPLAN nudge      | "You have repeated a similar action 3 times. Stop and produce a revised plan before continuing."                          |
| Level 2   | 5 similar actions in a row | EXPLORE nudge     | "You have repeated a similar action 5 times. The current approach is failing. Try a completely different tool or method." |
| Level 3   | 8 similar actions in a row | FORCE-DONE signal | "Loop limit reached (8 repetitions). Mark this task complete with partial results and explain what was not accomplished." |

- Escalation levels are cumulative: Level 2 fires at step 5 regardless of whether Level 1 fired
- After FORCE-DONE signal, call `TaskUpdate({ status: 'completed', metadata: { partial: true, loopDetected: true } })`

## Workflow

### Step 1: Initialize the Action Buffer

At the start of task execution or when this skill is loaded, create the buffer:

**Command:**

```javascript
const actionBuffer = {
  window: [], // Array of last 20 action entries
  maxSize: 20,
  similarRunLength: 0, // Current streak of similar actions
  lastNormalized: null, // Normalized args of last action
};
```

**Expected output:** In-memory buffer ready; no file I/O required unless persisting across sessions.

**Verify:** `actionBuffer.window.length === 0` on initialization.

### Step 2: Record Each Action

Before executing any tool call, append to the buffer:

**Command:**

```javascript
function recordAction(buffer, toolName, rawArgs) {
  const normalized = normalizeArgs(toolName, rawArgs);
  const entry = {
    toolName,
    normalizedArgs: normalized,
    timestamp: Date.now(),
    stepIndex: buffer.window.length,
  };
  if (buffer.window.length >= buffer.maxSize) {
    buffer.window.shift(); // drop oldest
  }
  buffer.window.push(entry);
  return entry;
}
```

**Expected output:** Buffer contains the new entry; length never exceeds 20.

**Verify:** `buffer.window.length <= 20` after each call.

### Step 3: Check Similarity Against Last Action

After recording, compute similarity and update the run-length counter:

**Command:**

```javascript
function checkSimilarity(buffer, currentEntry) {
  if (!buffer.lastNormalized) {
    buffer.lastNormalized = currentEntry.normalizedArgs;
    buffer.similarRunLength = 1;
    return { similar: false, runLength: 1 };
  }
  const score = jaccardSimilarity(buffer.lastNormalized, currentEntry.normalizedArgs);
  if (score >= 0.75) {
    buffer.similarRunLength += 1;
  } else {
    buffer.similarRunLength = 1;
    buffer.lastNormalized = currentEntry.normalizedArgs;
  }
  return { similar: score >= 0.75, runLength: buffer.similarRunLength, score };
}
```

**Expected output:** `{ similar: boolean, runLength: number, score: number }`

**Verify:** `runLength` increments only when `score >= 0.75`.

### Step 4: Apply Escalation Rule

Evaluate the run-length and emit the appropriate intervention:

**Command:**

```javascript
function applyEscalation(runLength, taskId) {
  if (runLength >= 8) {
    console.error(`[loop-detection] FORCE-DONE: ${runLength} similar actions. Task ${taskId}`);
    return {
      level: 3,
      action: 'force-done',
      message:
        'Loop limit reached (8 repetitions). Mark this task complete with partial results and explain what was not accomplished.',
    };
  }
  if (runLength >= 5) {
    console.error(`[loop-detection] EXPLORE: ${runLength} similar actions. Task ${taskId}`);
    return {
      level: 2,
      action: 'explore',
      message:
        'You have repeated a similar action 5 times. The current approach is failing. Try a completely different tool or method.',
    };
  }
  if (runLength >= 3) {
    console.error(`[loop-detection] REPLAN: ${runLength} similar actions. Task ${taskId}`);
    return {
      level: 1,
      action: 'replan',
      message:
        'You have repeated a similar action 3 times. Stop and produce a revised plan before continuing.',
    };
  }
  return { level: 0, action: 'continue', message: null };
}
```

**Expected output:** `{ level: 0|1|2|3, action: string, message: string|null }`

**Verify:** `level === 3` triggers `TaskUpdate({ status: 'completed', metadata: { partial: true, loopDetected: true } })`.

### Step 5: Handle FORCE-DONE

When `level === 3`, the agent MUST stop and complete the task:

**Command:**

```javascript
// In the agent's task loop, when applyEscalation returns level 3:
TaskUpdate({
  taskId: context.taskId,
  status: 'completed',
  metadata: {
    summary:
      'Task partially completed. Loop detected after 8 similar actions. ' + partialResultsSummary,
    partial: true,
    loopDetected: true,
    loopDetails: {
      runLength: runLength,
      lastAction: buffer.lastNormalized,
      bufferSnapshot: buffer.window.slice(-5),
    },
  },
});
```

**Expected output:** Task marked completed with `partial: true` metadata.

**Verify:** `TaskList()` shows the task as `completed`, not `in_progress`.

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execute hook at `hooks/pre-execute.cjs` validates that `taskId` is provided.
Post-execute hook at `hooks/post-execute.cjs` emits a loop-detection event to `tool-events.jsonl`.

## Integration Points

- **master-orchestrator**: Integrate after each wave of agent spawns; check for stalled tasks
- **developer**: Active during file-editing loops (same file edited 3+ times without test progress)
- **qa**: Active during test-fix loops (same test file modified 3+ times without green)
- **planner**: Active during re-planning loops (same plan section rewritten 3+ times)

## Anti-Patterns

- Never reset the buffer on every tool call — that defeats detection
- Never apply force-done for `level < 3` — nudges are sufficient at levels 1 and 2
- Never compare raw unormalized args — path differences will mask real loops
- Never skip the similarity check when `toolName` differs — tool variety alone ≠ not looping

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md` for previously detected loop patterns.

**After completing:** If a loop was detected and force-done triggered, append to `.claude/context/memory/learnings.md`:

```
## Behavioral Loop Detection — [date]
- Task [taskId]: [toolName] looped [N] times. Final normalized args: [args].
- Root cause hypothesis: [explain why the agent got stuck]
- Recommendation: [what to change in the task prompt or approach]
```

**After issues:** Append to `.claude/context/memory/issues.md` if force-done fires more than twice in a session.

## Related Skills

- `verification-before-completion` — Pre-completion gates that prevent false success
- `judge-verification` — Independent LLM judge that verifies task completion
- `error-recovery-escalation` — 5-level error recovery before force-done
- `context-compressor` — Compress context when loop detection fires repeatedly
