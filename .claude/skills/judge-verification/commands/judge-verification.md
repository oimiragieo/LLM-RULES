# judge-verification Commands

## Command Surface

### Primary Invocation

```javascript
Skill({ skill: 'judge-verification' });
```

Invoke after any high-stakes task completion to verify whether it truly succeeded.

---

## CLI Commands

### Verdict Calculation

```bash
echo '{"taskId":"t1","scores":{"goalAlignment":22,"actionCompleteness":20,"evidenceOfCompletion":18,"finalStateCoherence":21},"reasoning":"Tests pass, files modified, git diff confirmed."}' \
  | node .claude/skills/judge-verification/scripts/main.cjs --verdict
```

**Expected output:**

```json
{
  "taskId": "t1",
  "verdict": "PASS",
  "confidence": 0.92,
  "totalScore": 81,
  "dimensions": {
    "goalAlignment": 22,
    "actionCompleteness": 20,
    "evidenceOfCompletion": 18,
    "finalStateCoherence": 21
  },
  "reasoning": "Tests pass, files modified, git diff confirmed.",
  "judgedAt": "2026-03-23T10:00:00.000Z"
}
```

### Score Only (No Verdict Label)

```bash
echo '{"scores":{"goalAlignment":10,"actionCompleteness":8,"evidenceOfCompletion":5,"finalStateCoherence":12}}' \
  | node .claude/skills/judge-verification/scripts/main.cjs --score-only
```

**Expected output:**

```json
{ "totalScore": 35, "verdict": "FAIL", "evidenceGatePassed": false }
```

### Pre-execution Validation

```bash
echo '{"input":{"taskId":"t1","taskGoal":"Add authentication middleware"}}' \
  | node .claude/skills/judge-verification/hooks/pre-execute.cjs
```

**Exit code 0:** Input valid, continue execution.
**Exit code 2:** Input invalid (missing required fields), block execution.

---

## Dimension Scoring Reference

| Dimension              | Key                    | Max | Evidence Required                       |
| ---------------------- | ---------------------- | --- | --------------------------------------- |
| Goal Alignment         | `goalAlignment`        | 25  | Task specification vs. delivered output |
| Action Completeness    | `actionCompleteness`   | 25  | Actions taken vs. actions required      |
| Evidence of Completion | `evidenceOfCompletion` | 25  | Git diff, test results, file content    |
| Final State Coherence  | `finalStateCoherence`  | 25  | System state consistency                |

## Verdict Thresholds

| Verdict       | Condition                                      |
| ------------- | ---------------------------------------------- |
| `PASS`        | totalScore ≥ 70 AND evidenceOfCompletion ≥ 15  |
| `CONDITIONAL` | totalScore 60–69 AND evidenceOfCompletion ≥ 15 |
| `FAIL`        | totalScore < 60 OR evidenceOfCompletion < 15   |

## Evidence Gate

`PASS` requires `evidenceOfCompletion >= 15`. This gate cannot be bypassed.
A task scoring 95/100 total with 0 evidence = **FAIL**.

---

## Related Commands

```bash
# Check recent judgements
cat .claude/context/runtime/tool-events.jsonl | grep judge-verification | tail -5

# Run integration validation
node .claude/tools/cli/validate-integration.cjs .claude/skills/judge-verification/SKILL.md
```
