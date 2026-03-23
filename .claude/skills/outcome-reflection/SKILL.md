---
name: outcome-reflection
description: Feed actual task results back into agent memory for calibration. Compares predicted vs actual outcomes, records accuracy scores, and tracks estimation quality, prediction quality, and decision quality over time to improve future agent performance.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep, Skill, MemoryRecord, TaskGet]
agents: [planner, reflection-agent, architect, general-assistant]
category: Memory & Context
tags:
  [
    reflection,
    calibration,
    memory,
    accuracy,
    prediction,
    estimation,
    decision-quality,
    feedback-loop,
  ]
best_practices:
  - Run outcome-reflection immediately after a task completes — delay degrades accuracy
  - Include predicted outcome in task metadata at task creation time (so comparison is possible)
  - Score on three independent dimensions — estimation, prediction, decision — never aggregate prematurely
  - Persist calibration scores to memory so future tasks benefit from the history
  - Flag high-miss tasks for reflection-agent followup to identify root cause
error_handling: graceful
streaming: supported
related_skills:
  [reflection-agent, plan-generator, verification-before-completion, instinct-learning]
verified: false
lastVerifiedAt: 2026-03-23T00:00:00.000Z
---

# Outcome Reflection

## Overview

Closes the feedback loop between prediction and reality in agent task execution. After a task completes, this skill compares the predicted outcome (recorded at planning time) against the actual outcome (observed at completion), scores the accuracy on three dimensions, and persists the calibration record to memory for future use.

Over time, accumulated calibration data reveals systematic biases (e.g., consistent underestimation of implementation tasks) that planners can use to improve future predictions.

## When to Use

Invoke immediately after any task that had a predicted outcome recorded:

- After HIGH/EPIC pipeline completion (planner predictions vs actual)
- After estimation tasks (token counts, time estimates, file counts)
- After architectural decision tasks (expected impact vs observed impact)
- After any task where the planner recorded explicit predictions in task metadata

Do **not** invoke for:

- Tasks where no prediction was recorded (nothing to compare)
- Trivial tasks (single-file edits) — overhead not justified
- Ongoing tasks — invoke only after `TaskUpdate(completed)`

## Iron Law

```
NO CALIBRATION WITHOUT A PRIOR PREDICTION
```

If no prediction was recorded at planning time, outcome-reflection cannot score accuracy. The fix is to ensure planners record predictions. See `plan-generator` for prediction metadata format.

## Calibration Dimensions

### Dimension 1: Estimation Accuracy

Measures how accurately the agent estimated measurable quantities:

- Token count predictions vs actual
- File count predictions vs actual
- Step count predictions vs actual
- Time/effort predictions vs actual

**Score:** 0.0–1.0 (1.0 = exact, 0.0 = off by >10x)

```
score = max(0, 1 - abs(predicted - actual) / max(predicted, actual))
```

### Dimension 2: Prediction Quality

Measures how accurately the agent predicted qualitative outcomes:

- Did the implementation meet stated requirements?
- Did the plan identify the actual blockers?
- Were edge cases predicted that actually occurred?

**Score:** 0.0–1.0 (1.0 = predicted outcome exactly matched, 0.0 = outcome unrecognized)

Scored by reading task completion metadata and comparing against task creation metadata.

### Dimension 3: Decision Quality

Measures whether the decisions made during the task were appropriate in retrospect:

- Did the chosen approach work without significant pivots?
- Were there rework loops that a better decision would have avoided?
- Did the agent's confidence match the actual difficulty?

**Score:** 0.0–1.0 (1.0 = no rework, smooth execution; 0.0 = multiple pivots or failure)

## Calibration Record Format

Each outcome-reflection run produces one calibration record:

```json
{
  "taskId": "task-N",
  "taskType": "implementation|planning|estimation|architecture|security",
  "completedAt": "ISO-8601",
  "agentType": "developer|planner|architect|...",
  "predictions": {
    "estimatedTokens": 5000,
    "estimatedFiles": 3,
    "estimatedSteps": 5,
    "predictedOutcome": "Add JWT auth with refresh tokens",
    "predictedBlockers": ["Redis not available"],
    "confidence": "Medium"
  },
  "actuals": {
    "actualTokens": 7200,
    "actualFiles": 5,
    "actualSteps": 8,
    "actualOutcome": "Added JWT auth with refresh tokens; added Redis fallback",
    "actualBlockers": ["Redis not available", "JWT library version mismatch"],
    "reworkLoops": 1
  },
  "scores": {
    "estimationAccuracy": 0.72,
    "predictionQuality": 0.85,
    "decisionQuality": 0.8,
    "overall": 0.79
  },
  "flags": [],
  "notes": "Token estimate was 44% low. Consider 1.5x buffer for JWT auth tasks."
}
```

## Workflow

### Step 0: Load Memory and Task Data

```bash
# Check calibration history for this agent type
grep -r "outcome-reflection" C:/dev/projects/agent-studio/.claude/context/memory/learnings.md 2>/dev/null | tail -10
```

Read the completed task's metadata using `TaskGet`:

```javascript
const taskData = TaskGet({ taskId: 'task-N' });
// Access: taskData.metadata.predictions, taskData.metadata.actuals
```

### Step 1: Validate Input

```bash
node .claude/skills/outcome-reflection/hooks/pre-execute.cjs \
  '{"taskId":"task-N","predictions":{},"actuals":{}}'
```

**Expected output:** `{ "valid": true }` or error listing missing fields.

### Step 2: Compute Estimation Accuracy Score

For each measurable quantity where a prediction exists:

```
estimationScore = max(0, 1 - abs(predicted - actual) / max(predicted, actual))
```

**Command to compute:**

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --taskId task-N \
  --predicted '{"tokens":5000,"files":3,"steps":5}' \
  --actual '{"tokens":7200,"files":5,"steps":8}'
```

**Expected output:** JSON with per-dimension scores and overall score.

### Step 3: Score Prediction Quality (Qualitative)

Read task creation metadata (what was predicted qualitatively) and task completion metadata (what actually happened). Score on 0.0–1.0:

| Outcome Match           | Score   |
| ----------------------- | ------- |
| Exact match             | 1.0     |
| Minor deviations        | 0.8–0.9 |
| Moderate deviations     | 0.6–0.7 |
| Significant differences | 0.3–0.5 |
| Completely wrong        | 0.0–0.2 |

### Step 4: Score Decision Quality

Check completion metadata for rework signals:

- `reworkLoops: 0` → Decision quality: 1.0
- `reworkLoops: 1` → Decision quality: 0.75
- `reworkLoops: 2` → Decision quality: 0.5
- `reworkLoops: 3+` → Decision quality: 0.25
- Task `status: "failed"` → Decision quality: 0.0

### Step 5: Persist Calibration Record

Append to `.claude/context/memory/learnings.md`:

```
## [DATE] Calibration: task-N (AGENT_TYPE)
- Estimation: SCORE (note what was under/over-estimated)
- Prediction: SCORE (note what was missed)
- Decision: SCORE (note rework loops)
- Overall: SCORE
- Action: [flag for reflection | no action needed]
```

Also emit structured record via `MemoryRecord` for semantic search:

```javascript
MemoryRecord({
  type: 'pattern',
  text: `Calibration for ${taskType} tasks: estimation=${score}, prediction=${score}, decision=${score}`,
  area: 'calibration',
});
```

### Step 6: Flag High-Miss Tasks

If `overall < 0.6`, append a reflection request:

```bash
echo '{"id":"'$(node -e "console.log(require('crypto').randomUUID())")'","trigger":"calibration-miss","priority":"low","context":"Task task-N had calibration score SCORE. Identify root cause of estimation/prediction miss."}' >> .claude/context/runtime/reflection-spawn-request.json
```

### Step 7: Emit Observability Event

```javascript
const { sendEvent } = require('.claude/tools/observability/send-event.cjs');
sendEvent({
  tool_name: 'outcome-reflection',
  agent_id: process.env.AGENT_ID || 'unknown',
  session_id: process.env.SESSION_ID || 'unknown',
  outcome: 'success',
  metadata: { taskId, overallScore, flagged: overallScore < 0.6 },
});
```

## Calibration Trend Analysis

After 5+ calibrations for the same task type and agent, the planner should query the trend:

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --analyze --agentType developer --taskType implementation --last 10
```

**Expected output:** Mean, median, trend direction (improving/degrading/stable), and top 3 miss patterns.

Use trend data to adjust future estimates:

- Systematic underestimation → apply correction factor
- Systematic overestimation → reduce buffers
- High variance → flag for human review before HIGH tasks

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execution hook: `hooks/pre-execute.cjs` — validates taskId, predictions object, actuals object.
Post-execution hook: `hooks/post-execute.cjs` — emits observability event via `send-event.cjs`.

## Anti-Patterns

- **Never invoke without a prior prediction** — meaningless calibration score
- **Never aggregate scores before trending** — premature aggregation hides per-dimension biases
- **Never skip low-score flagging** — misses compound if root cause is not investigated
- **Never use calibration to blame agents** — use it to improve planning accuracy
- **Never run on trivial tasks** — calibration overhead is not justified for single-file edits

## Related Skills

- `plan-generator` — records predictions at planning time (prerequisite for calibration)
- `instinct-learning` — records atomic learned patterns (complementary to calibration)
- `reflection-agent` — investigates high-miss tasks flagged by outcome-reflection
- `verification-before-completion` — gate that runs before completion (runs before this skill)

## Memory Protocol

**Before starting:** Read `.claude/context/memory/learnings.md` to find prior calibrations for the same agent type and task type. This provides baseline context.

**After completing:** Append calibration record to `.claude/context/memory/learnings.md`. Use `MemoryRecord` tool for structured pattern recording. Do NOT write directly to `patterns.json`.

**Assume interruption:** If calibration context is lost, re-read the completed task's metadata from `TaskGet` — all predictions and actuals should be in task metadata.
