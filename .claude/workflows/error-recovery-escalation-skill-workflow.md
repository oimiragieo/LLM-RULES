# Error Recovery Escalation — Skill Workflow

**Skill:** `error-recovery-escalation`
**Version:** 1.0.0
**Trigger:** Any unhandled error, judge-verification FAIL, or behavioral-loop-detection trigger

---

## When to Invoke

```javascript
Skill({ skill: 'error-recovery-escalation' });
```

Invoke after:
- Any unhandled error in agent execution that wasn't resolved inline
- `judge-verification` returns `verdict: "FAIL"`
- `behavioral-loop-detection` returns `loopDetected: true`
- A tool call returns a non-recoverable error code

---

## Phase 1: Classify the Error

**Goal:** Determine the correct entry level to avoid wasting resources.

**Command:**
```bash
echo '{"taskId":"<task-id>","errorMessage":"<error-text>"}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs --classify
```

**Expected output:**
```json
{ "errorType": "network-timeout", "entryLevel": 1, "action": "retry" }
```

**Verify:** Exit code 0 and valid JSON with `entryLevel` in range 1-5.

---

## Phase 2: Get Full Escalation Result

**Goal:** Get the complete recovery plan with instructions and TaskUpdate metadata.

**Command:**
```bash
echo '{"taskId":"<task-id>","errorMessage":"<error-text>"}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs
```

**Expected output shape:**
```json
{
  "taskId": "<task-id>",
  "level": 1,
  "action": "retry",
  "errorType": "network-timeout",
  "timeoutMs": 30000,
  "instructions": ["Retry the action...", "Use exponential backoff..."],
  "taskUpdateMetadata": {
    "recoveryLevel": 1,
    "recoveryAction": "retry",
    "errorType": "network-timeout",
    "enteredAt": "2026-03-23T10:00:00.000Z"
  }
}
```

**Verify:** Exit code 0, `level` is 1-5, `instructions` is non-empty array.

---

## Phase 3: Execute Recovery Instructions

**Goal:** Follow the level-specific instructions in order.

### Level 1 — Retry

1. Wait for backoff: 1s (attempt 1), 2s (attempt 2), 4s (attempt 3)
2. Re-execute the exact same failed action
3. If success → call `TaskUpdate(in_progress, { recoveryMetadata })` and continue
4. If failure after 3 attempts → escalate to level 2

### Level 2 — Nudge

1. Read the error message carefully to understand what parameter was wrong
2. Adjust parameters: file paths, output formats, API parameters, configuration values
3. Re-execute with adjusted parameters
4. If success → continue; if failure or timeout (5 min) → escalate to level 3

### Level 3 — Replan

1. Invoke `plan-generator` skill for a new approach:
   ```javascript
   Skill({ skill: 'plan-generator' });
   ```
2. Execute the new plan from scratch (do not resume the old approach)
3. If success → continue; if failure or timeout (15 min) → escalate to level 4

### Level 4 — Fallback

1. Identify an alternative agent type or degraded mode:
   - Wrong agent → spawn the correct specialist via `Task()`
   - Model capability issue → spawn with `opus` model explicitly
   - Tool unavailable → identify alternative tool
2. Re-execute with the alternative
3. If success → continue; if failure or timeout (20 min) → escalate to level 5

### Level 5 — Force-Done

1. Collect completed steps and partial results
2. Call the script with force-done payload:
   ```bash
   echo '{
     "taskId":"<task-id>",
     "errorMessage":"<error>",
     "completedSteps":["step1","step2"],
     "failedAt":"step3",
     "recommendation":"<human-readable next steps>"
   }' | node .claude/skills/error-recovery-escalation/scripts/main.cjs
   ```
3. Call `TaskUpdate(completed, { partial: true, ...result.taskUpdateMetadata })`
4. Output partial results with explanation — never silent failure

---

## Phase 4: Record Escalation in TaskUpdate

**Goal:** Ensure every level transition is visible to reflection scoring.

**Command (call after entering any level):**
```javascript
TaskUpdate({
  taskId: result.taskId,
  status: 'in_progress',
  metadata: result.taskUpdateMetadata
});
```

**For force-done:**
```javascript
TaskUpdate({
  taskId: result.taskId,
  status: 'completed',
  metadata: {
    ...result.taskUpdateMetadata,
    partial: true,
    summary: 'Task force-completed with partial results. See recommendation for next steps.'
  }
});
```

**Verify:** TaskGet shows `metadata.recoveryLevel` set on the task.

---

## Integration Map

| Trigger Source | Skill to Invoke | Entry Point |
|----------------|-----------------|-------------|
| judge-verification FAIL | error-recovery-escalation | `errorType: "judge-fail"` |
| behavioral-loop-detection trigger | error-recovery-escalation | `errorType: "loop-detected"` |
| ENOENT / file not found | error-recovery-escalation | `errorType: "enoent"` (auto-classified) |
| API rate limit | error-recovery-escalation | `errorType: "rate-limit"` (auto-classified) |
| Service unavailable | error-recovery-escalation | `errorType: "external-service-down"` |
| L3 replan needed | plan-generator | From L3 instructions |

---

## Escalation Path Example

```
Error: "ENOENT: no such file or directory"

→ classify → L2 (nudge)
→ Adjust file paths
→ Still failing after 5 min timeout
→ get-next-level → L3 (replan)
→ Invoke plan-generator
→ New approach works
→ TaskUpdate(completed)
```

---

## Anti-Patterns

- **Never skip levels** — L1 must be attempted before L2, L2 before L3
- **Never re-enter the same level** — if L2 failed, go to L3 immediately
- **Never omit TaskUpdate** on level entry — untracked escalations break reflection scoring
- **Never use force-done as a shortcut** — exhaust all levels first
- **Never extend timeouts** — if a level times out, escalate immediately

---

## Related Skills

- `behavioral-loop-detection` — Triggers error-recovery-escalation when loop detected
- `judge-verification` — Triggers error-recovery-escalation on FAIL verdict
- `plan-generator` — Called at Level 3 (replan)
- `tdd` — Use before implementation to prevent errors that would trigger escalation
