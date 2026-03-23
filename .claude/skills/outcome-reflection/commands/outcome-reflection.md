# outcome-reflection — Command Reference

## Invocation

```javascript
Skill({ skill: 'outcome-reflection' });
```

## CLI Usage

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs [options]
```

## Modes

### reflect (default) — Score a single completed task

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --taskId task-42 \
  --predicted '{"estimatedTokens":5000,"estimatedFiles":3,"estimatedSteps":5}' \
  --actual '{"actualTokens":7200,"actualFiles":5,"actualSteps":8,"reworkLoops":1}'
```

### reflect with qualitative prediction score

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --taskId task-42 \
  --predicted '{"estimatedTokens":5000,"estimatedFiles":3}' \
  --actual '{"actualTokens":4800,"actualFiles":3,"reworkLoops":0}' \
  --predictionScore 0.9
```

### analyze — Trend analysis across recent tasks

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --analyze \
  --agentType developer \
  --taskType implementation \
  --last 10
```

### trend — Same as analyze (alias)

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --trend \
  --agentType planner \
  --last 5
```

## Options

| Option              | Type        | Required           | Description                                        |
| ------------------- | ----------- | ------------------ | -------------------------------------------------- |
| `--taskId`          | string      | Yes (reflect mode) | Task ID to score (e.g., `task-42`)                 |
| `--predicted`       | JSON string | No                 | Predictions object (tokens, files, steps)          |
| `--actual`          | JSON string | No                 | Actuals object (tokens, files, steps, reworkLoops) |
| `--predictionScore` | float 0–1   | No                 | Qualitative prediction quality score               |
| `--analyze`         | flag        | No                 | Run trend analysis mode                            |
| `--trend`           | flag        | No                 | Same as `--analyze`                                |
| `--agentType`       | string      | No                 | Filter trend by agent type                         |
| `--taskType`        | string      | No                 | Filter trend by task type                          |
| `--last`            | integer     | No                 | Number of recent records to include (default: 10)  |

## Predictions Object Fields

```json
{
  "estimatedTokens": 5000,
  "estimatedFiles": 3,
  "estimatedSteps": 5
}
```

## Actuals Object Fields

```json
{
  "actualTokens": 7200,
  "actualFiles": 5,
  "actualSteps": 8,
  "reworkLoops": 1
}
```

`reworkLoops` is the number of times a substantial approach revision was required (0 = smooth execution).

## Output Format

```json
{
  "taskId": "task-42",
  "mode": "reflect",
  "scores": {
    "estimationAccuracy": 0.72,
    "predictionQuality": null,
    "decisionQuality": 0.75,
    "overall": 0.74
  },
  "estimationDetails": {
    "estimatedTokens": { "predicted": 5000, "actual": 7200, "score": 0.69 },
    "estimatedFiles": { "predicted": 3, "actual": 5, "score": 0.6 },
    "estimatedSteps": { "predicted": 5, "actual": 8, "score": 0.63 }
  },
  "flags": [],
  "notes": "estimatedTokens underestimated by 44%. Consider 1.5x buffer.",
  "reflectionQueued": false
}
```

## Exit Codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | Success — calibration record produced                                |
| 1    | Error — invalid arguments or JSON parse failure                      |
| 2    | Validation failure — missing required fields (from pre-execute hook) |

## Integration with Task Lifecycle

### At Task Creation (Planner)

Record predictions in task metadata:

```javascript
TaskCreate({
  subject: 'Implement feature X',
  metadata: {
    predictions: {
      estimatedTokens: 4000,
      estimatedFiles: 2,
      estimatedSteps: 4,
      confidence: 'Medium',
    },
  },
});
```

### At Task Completion (Agent)

1. Read predictions from task metadata
2. Run outcome-reflection with actuals
3. Append JSON record to `.claude/context/memory/learnings.md`
4. If `reflectionQueued: true`, append to `reflection-spawn-request.json`
5. Call `TaskUpdate(completed)`

## Use Cases

| Scenario                          | Command Pattern                                 |
| --------------------------------- | ----------------------------------------------- |
| Post-implementation calibration   | `--taskId --predicted --actual`                 |
| Architecture decision calibration | `--taskId --actual --predictionScore 0.8`       |
| Agent-level trend analysis        | `--analyze --agentType developer --last 20`     |
| Task-type trend analysis          | `--analyze --taskType implementation --last 15` |
| Quick decision quality check      | `--taskId --actual '{"reworkLoops":2}'`         |
