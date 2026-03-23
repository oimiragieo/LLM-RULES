# Behavioral Loop Detection Rules

## Core Principle

Never let an agent silently loop. Repetitive actions waste tokens, stall progress,
and obscure genuine failures. Early intervention is always better than silent waste.

## Iron Laws

1. **Maintain the buffer** — Every action must be recorded before execution. No skipping.
2. **Normalize before comparing** — Raw args include timestamps and paths that mask real loops.
3. **Threshold is 0.75** — At or above this Jaccard score means "similar" and increments the run-length.
4. **Escalation is cumulative** — Level 3 fires at 8 regardless of whether levels 1 and 2 were acknowledged.
5. **FORCE-DONE is a completion, not a failure** — Always call `TaskUpdate(completed, { partial: true })`.

## Anti-Patterns

- Never reset the buffer on argument-only variation (same tool = potentially looping)
- Never skip the similarity check just because the tool name changed within the last 2 actions
- Never leave a FORCE-DONE task marked `in_progress`
- Never apply manual similarity overrides without logging the reason

## Integration Points

Use alongside `error-recovery-escalation` for comprehensive agent safety:

- Loop detection fires on repetition
- Error recovery fires on failure
- Both complement `verification-before-completion` as pre-completion gates

## When to Invoke

```javascript
Skill({ skill: 'behavioral-loop-detection' });
```

Invoke at the start of any long-running task that involves repeated tool calls.
