# Outcome Reflection Rules

## Core Principles

### 1. Record Before Memory Fades (Mandatory Timing)

Calibration records MUST be written immediately after task completion, before the next task begins.
Delayed recording produces inaccurate actuals due to context decay.

**Correct pattern:**

1. Task completes
2. Call `outcome-reflection` with actuals
3. Record calibration to `learnings.md`
4. Call `TaskUpdate(completed)`

**Anti-pattern:**

- Writing calibration records retroactively from vague memory
- Skipping calibration for "simple" tasks (all tasks accumulate into trends)

---

### 2. Honest Actuals (No Retroactive Adjustment)

Report what actually happened, not what should have happened.

- `reworkLoops` = number of times you had to substantially revise your approach (not minor edits)
- `actualTokens` = total tokens consumed by the task agent (use ccusage or session estimate)
- `actualFiles` = count of files read + written during execution
- Do NOT round down rework loops or inflate scores to avoid `high-miss` flags

---

### 3. Calibration Is Not Blame

High-miss scores and `excessive-rework` flags are diagnostic signals, not performance ratings.
A `high-miss` task queues a reflection-agent investigation — this is a learning opportunity, not a penalty.

---

### 4. Prediction Format Matters

Predictions recorded at task start must use the canonical field names from `schemas/input.schema.json`:

- `estimatedTokens` (number)
- `estimatedFiles` (integer)
- `estimatedSteps` (integer)
- `predictedOutcome` (string)
- `confidence` (High | Medium | Low)

Non-canonical fields (e.g., `token_estimate`, `predicted_files`) cannot be scored.

---

### 5. Trend Analysis Requires Consistent Agent + Task Type Grouping

For `--analyze` / `--trend` mode comparisons to be valid:

- Use the same `agentType` spelling across all records (`developer`, not `dev` or `Developer`)
- Use the same `taskType` enum values — only `implementation | planning | estimation | architecture | security | documentation | review | other`

---

## Anti-Patterns

### Skip-and-Rationalize

> "This was a quick task, calibration isn't worth it."

Every uncalibrated task is a missed data point. Trends require density. Always record.

### Score Inflation

> "I'll call the rework a 'minor revision' to keep the score high."

Inflated scores corrupt trend data and prevent the system from improving estimates.
The only beneficiary of honest low scores is the future agent who inherits better calibration heuristics.

### Prediction-Free Completion

> "I forgot to record predictions at task start, so I'll skip calibration entirely."

If predictions were not recorded, still record actuals with `predictions: {}`.
The system will warn about empty predictions but will still compute `decisionQuality` from `reworkLoops`.
Partial calibration is better than none.

### Aggregate Instead of Per-Task

> "I'll write one calibration record for 3 tasks I did today."

One record per task. Aggregated records cannot be used for agent-type or task-type trend analysis.

---

## Integration Points

### With Planner Agent

The planner agent should record `predictions` at task creation time in the task metadata:

```javascript
TaskCreate({
  subject: 'Implement auth middleware',
  metadata: {
    predictions: {
      estimatedTokens: 5000,
      estimatedFiles: 3,
      estimatedSteps: 5,
      predictedOutcome: 'Add JWT middleware',
      confidence: 'Medium',
    },
  },
});
```

### With Developer Agent

On task completion, the developer reads predictions from task metadata and calls outcome-reflection:

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --taskId task-42 \
  --predicted '{"estimatedTokens":5000,"estimatedFiles":3,"estimatedSteps":5}' \
  --actual '{"actualTokens":7200,"actualFiles":5,"actualSteps":8,"reworkLoops":1}'
```

### With Reflection Agent

When `reflectionQueued: true` (overall score < 0.6), the outcome-reflection skill signals for
a reflection-agent investigation. The developer agent should append a pending reflection to
`.claude/context/runtime/reflection-spawn-request.json`.

### With Memory System

All calibration records go to `.claude/context/memory/learnings.md` under the
`## Calibration Records` heading. Records accumulate over time for trend analysis.

---

## When to Invoke

`Skill({ skill: 'outcome-reflection' })` — after every completed agent task that had quantitative
predictions recorded at planning time. Minimum viable: after any task where
`estimatedTokens` or `reworkLoops` data is available.
