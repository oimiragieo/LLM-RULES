# Outcome Reflection — Calibration Record Template

Use this template to record calibration data after completing a task.
Copy the JSON block into `.claude/context/memory/learnings.md` under a `## Calibration Records` section.

---

## Calibration Record

```json
{
  "taskId": "{{TASK_ID}}",
  "agentType": "{{AGENT_TYPE}}",
  "taskType": "{{TASK_TYPE}}",
  "completedAt": "{{ISO_DATE}}",
  "predictions": {
    "estimatedTokens": {{ESTIMATED_TOKENS}},
    "estimatedFiles": {{ESTIMATED_FILES}},
    "estimatedSteps": {{ESTIMATED_STEPS}},
    "predictedOutcome": "{{PREDICTED_OUTCOME}}",
    "confidence": "{{High|Medium|Low}}"
  },
  "actuals": {
    "actualTokens": {{ACTUAL_TOKENS}},
    "actualFiles": {{ACTUAL_FILES}},
    "actualSteps": {{ACTUAL_STEPS}},
    "actualOutcome": "{{ACTUAL_OUTCOME}}",
    "reworkLoops": {{REWORK_LOOPS}}
  },
  "scores": {
    "estimationAccuracy": {{ESTIMATION_SCORE}},
    "predictionQuality": {{PREDICTION_SCORE}},
    "decisionQuality": {{DECISION_SCORE}},
    "overall": {{OVERALL_SCORE}}
  },
  "flags": [{{FLAGS}}],
  "notes": "{{CALIBRATION_NOTES}}"
}
```

---

## Scoring Reference

### Estimation Accuracy Formula

For each predicted/actual pair (tokens, files, steps):

```
score = max(0, 1 - abs(predicted - actual) / max(predicted, actual))
estimationAccuracy = mean(all pair scores)
```

| Ratio (actual/predicted) | Interpretation                          |
| ------------------------ | --------------------------------------- |
| 0.7 – 1.3                | Well-calibrated (±30%)                  |
| > 1.3                    | Underestimated — add buffer next time   |
| < 0.7                    | Overestimated — reduce buffer next time |

### Decision Quality (Rework Loops)

| reworkLoops | decisionQuality | Interpretation                        |
| ----------- | --------------- | ------------------------------------- |
| 0           | 1.00            | Smooth execution, no pivots           |
| 1           | 0.75            | Minor course correction               |
| 2           | 0.50            | Significant rework needed             |
| 3           | 0.25            | Major rework — investigate root cause |
| 4+          | 0.00            | Excessive rework — process failure    |

### Prediction Quality (Qualitative, 0–1)

Assess how accurately qualitative predictions matched reality:

| Score | Meaning                                                      |
| ----- | ------------------------------------------------------------ |
| 1.00  | Outcome exactly as predicted, blockers correctly anticipated |
| 0.75  | Minor deviations from prediction                             |
| 0.50  | Some predictions correct, some missed                        |
| 0.25  | Predictions largely incorrect                                |
| 0.00  | Predictions completely wrong                                 |

### Overall Score

```
overall = mean(available dimension scores)
```

Dimensions with `null` values (not provided) are excluded from the mean.

---

## Flags Reference

| Flag               | Trigger                  | Action                                         |
| ------------------ | ------------------------ | ---------------------------------------------- |
| `high-miss`        | overall < 0.6            | Queue for reflection-agent root cause analysis |
| `estimation-miss`  | estimationAccuracy < 0.5 | Adjust estimation heuristics                   |
| `excessive-rework` | reworkLoops >= 3         | Investigate planning/decision process          |

---

## Example: Completed Record

```json
{
  "taskId": "task-42",
  "agentType": "developer",
  "taskType": "implementation",
  "completedAt": "2026-03-23T14:30:00Z",
  "predictions": {
    "estimatedTokens": 5000,
    "estimatedFiles": 3,
    "estimatedSteps": 5,
    "predictedOutcome": "Add JWT authentication middleware",
    "confidence": "Medium"
  },
  "actuals": {
    "actualTokens": 7200,
    "actualFiles": 5,
    "actualSteps": 8,
    "actualOutcome": "Added JWT middleware; discovered missing refresh token logic and added it",
    "reworkLoops": 1
  },
  "scores": {
    "estimationAccuracy": 0.72,
    "predictionQuality": 0.75,
    "decisionQuality": 0.75,
    "overall": 0.74
  },
  "flags": [],
  "notes": "estimatedTokens underestimated by 44%. Consider 1.5x buffer. estimatedFiles underestimated by 67%. Consider 1.7x buffer."
}
```

---

## Trend Tracking

After recording 5+ calibration entries, use `--analyze` mode to surface patterns:

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --analyze \
  --agentType developer \
  --taskType implementation \
  --last 10
```

Look for:

- Consistent underestimation of `estimatedTokens` → apply multiplier to future estimates
- Pattern of `reworkLoops >= 2` → improve upfront planning or decomposition
- `predictionQuality` consistently < 0.5 → review prediction methodology
