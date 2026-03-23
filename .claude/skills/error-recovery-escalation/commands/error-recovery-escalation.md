# error-recovery-escalation Commands

## Command Surface

### Primary Invocation

```javascript
Skill({ skill: 'error-recovery-escalation' });
```

Invoke when an agent encounters an error and needs structured recovery guidance.

---

## CLI Commands

### Full Escalation Result

```bash
echo '{"taskId":"t1","errorMessage":"ENOENT: no such file or directory, open /output/result.json"}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs
```

**Expected output:**

```json
{
  "taskId": "t1",
  "level": 2,
  "action": "nudge",
  "errorType": "enoent",
  "timeoutMs": 300000,
  "instructions": ["Adjust parameters: try different file paths..."],
  "taskUpdateMetadata": { "recoveryLevel": 2, "recoveryAction": "nudge" }
}
```

### Classify Error Only

```bash
echo '{"taskId":"t1","errorMessage":"Connection timed out after 30000ms"}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs --classify
```

**Expected output:**

```json
{ "errorType": "network-timeout", "entryLevel": 1, "action": "retry" }
```

### Get Next Level

```bash
echo '{"taskId":"t1","errorMessage":"ENOENT","previousLevels":[1,2]}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs --next-level
```

**Expected output:**

```json
{ "nextLevel": 3, "action": "replan", "timeoutMs": 900000 }
```

### Force-Done (Level 5)

```bash
echo '{
  "taskId": "t1",
  "errorMessage": "External API service unavailable",
  "errorType": "external-service-down",
  "completedSteps": ["step1","step2"],
  "failedAt": "step3",
  "recommendation": "Retry when API service is restored"
}' | node .claude/skills/error-recovery-escalation/scripts/main.cjs
```

### Force Specific Level

```bash
echo '{"taskId":"t1","errorMessage":"goal mismatch"}' \
  | node .claude/skills/error-recovery-escalation/scripts/main.cjs --level 3
```

---

## Level Quick Reference

| Level | Action     | Timeout | Entry Condition       |
| ----- | ---------- | ------- | --------------------- |
| 1     | retry      | 30s     | Transient, idempotent |
| 2     | nudge      | 5 min   | Wrong params          |
| 3     | replan     | 15 min  | Wrong approach        |
| 4     | fallback   | 20 min  | Wrong agent/model     |
| 5     | force-done | none    | All else failed       |

---

## Integration

```bash
# After force-done, check task events
cat .claude/context/runtime/tool-events.jsonl | grep error-recovery-escalation | tail -3
```
