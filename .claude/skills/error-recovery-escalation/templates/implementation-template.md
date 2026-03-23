# Error Recovery Escalation — Implementation Template

Use this template when invoking the `error-recovery-escalation` skill after an unhandled error, judge-verification FAIL, or behavioral-loop-detection trigger.

---

## Standard Recovery Invocation

```javascript
// After catching an unhandled error in agent execution:
Skill({ skill: 'error-recovery-escalation' });

// Then pipe to the script:
// echo '{"taskId":"<task-id>","errorMessage":"<error text>"}' \
//   | node .claude/skills/error-recovery-escalation/scripts/main.cjs
```

**Substitute these placeholders:**

| Placeholder    | Value                                 |
| -------------- | ------------------------------------- |
| `<task-id>`    | The current task ID (e.g. `task-22`)  |
| `<error text>` | The full error message or description |

---

## Template A: First-Time Error (No Previous Levels)

```json
{
  "taskId": "{{task_id}}",
  "errorMessage": "{{error_message}}"
}
```

**Expected output shape:**

```json
{
  "taskId": "{{task_id}}",
  "level": 1,
  "action": "retry",
  "errorType": "network-timeout",
  "timeoutMs": 30000,
  "instructions": ["..."],
  "taskUpdateMetadata": {
    "recoveryLevel": 1,
    "recoveryAction": "retry",
    "errorType": "network-timeout"
  }
}
```

---

## Template B: Escalation With History

When previous levels have been attempted:

```json
{
  "taskId": "{{task_id}}",
  "errorMessage": "{{error_message}}",
  "previousLevels": [1, 2]
}
```

The script will determine the next level automatically (next level = max(previousLevels) + 1).

---

## Template C: Force-Done (Level 5) With Partial Results

When the task cannot complete but partial work was done:

```json
{
  "taskId": "{{task_id}}",
  "errorMessage": "{{error_message}}",
  "errorType": "external-service-down",
  "completedSteps": ["{{step_1}}", "{{step_2}}"],
  "failedAt": "{{failed_step}}",
  "recommendation": "{{human_facing_recommendation}}"
}
```

**Result:** Level 5 (force-done) with partial output and TaskUpdate metadata including `partial: true`.

---

## Template D: Force Specific Level (Override)

When you know the correct level and want to skip classification:

```bash
echo '{"taskId":"{{task_id}}","errorMessage":"{{error_message}}"}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs --level {{level_number}}
```

---

## Acting on the Result

After receiving the escalation result, execute its `instructions` array in order:

```javascript
// 1. Record the escalation in TaskUpdate
TaskUpdate({
  taskId: result.taskId,
  status: 'in_progress',
  metadata: result.taskUpdateMetadata,
});

// 2. Follow instructions[0], instructions[1], etc.
// 3. Set a timer for result.timeoutMs (if not level 5)
// 4. If timer expires before resolution → escalate again with previousLevels updated
```

### Level-Specific Actions

| Level          | Action     | What to do                                                           |
| -------------- | ---------- | -------------------------------------------------------------------- |
| 1 (retry)      | retry      | Re-execute the same action with exponential backoff (1s, 2s, 4s)     |
| 2 (nudge)      | nudge      | Adjust parameters: file paths, output format, configuration          |
| 3 (replan)     | replan     | Invoke `plan-generator` skill for a new approach                     |
| 4 (fallback)   | fallback   | Spawn a different agent type or use a degraded alternative           |
| 5 (force-done) | force-done | Call `TaskUpdate(completed, { partial: true })` with completed steps |

---

## Integration with Other Skills

```javascript
// After judge-verification FAIL:
Skill({ skill: 'judge-verification' });
// result.verdict === 'FAIL' → invoke error-recovery-escalation

// After behavioral-loop-detection trigger:
Skill({ skill: 'behavioral-loop-detection' });
// result.loopDetected === true → invoke error-recovery-escalation with errorType: 'loop-detected'

// Level 3 replan → invoke plan-generator:
Skill({ skill: 'plan-generator' });

// Level 4 fallback → spawn alternative agent via Task()
```

---

## Anti-Patterns

- **Never skip levels** — if retry (L1) hasn't been attempted, don't jump to replan (L3)
- **Never re-enter the same level** — if L2 failed, go to L3, not another L2
- **Never use force-done as a shortcut** — exhaust lower levels first
- **Never omit TaskUpdate on level entry** — untracked escalations are invisible to reflection scoring
- **Never extend timeouts** — if time expires, escalate immediately
