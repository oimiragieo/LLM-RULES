# behavioral-loop-detection Skill Workflow

## Purpose

Workflow for integrating behavioral loop detection into agent tasks to prevent infinite repetition loops.

## Invocation

```javascript
Skill({ skill: 'behavioral-loop-detection' });
```

## Phases

### Phase 1: Initialize Buffer (task start)

1. Create in-memory action buffer (maxSize: 20)
2. Set `similarRunLength = 0`, `lastNormalized = null`

**Expected output:** Empty buffer ready

### Phase 2: Per-Action Monitoring (during task execution)

Before each tool call:
1. Normalize tool args (strip paths, UUIDs, timestamps)
2. Record action in buffer (FIFO, drop oldest when full)
3. Compute Jaccard similarity vs. last action
4. Apply escalation: REPLAN (3), EXPLORE (5), FORCE-DONE (8)
5. If level >= 1: inject escalation message into agent context
6. If level == 3: call `TaskUpdate({ status: 'completed', metadata: { partial: true, loopDetected: true } })`

**Expected output:** Escalation level 0-3 with message or null

### Phase 3: Completion

On force-done (level 3):
- Task is marked completed with partial metadata
- Loop details appended to `learnings.md` if root cause is clear

## Entry Criteria

- Agent has been running for > 10 tool calls
- Same tool called twice in a row (start detection)
- Explicit invocation by orchestrator

## Exit Criteria

- Level 0: Continue normally
- Level 1-2: Nudge applied, agent continues
- Level 3: Task completed (partial), loop details logged

## Related Skills

- `error-recovery-escalation` — handles error recovery (complement to loop detection)
- `verification-before-completion` — pre-completion gates
- `judge-verification` — independent completion verification
