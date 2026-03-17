---
name: pipeline-evaluator
description: Evaluates completed agent pipelines across 5 scoring dimensions and produces a composite verdict with actionable recommendations
version: 1.0.0
tools:
  - Read
  - TaskList
  - TaskGet
tags:
  - evaluation
  - quality
  - pipeline
  - metrics
---

# Pipeline Evaluator

## Purpose

Score a completed agent pipeline across 5 dimensions and produce a structured evaluation report with a composite verdict (EXCELLENT/GOOD/ACCEPTABLE/NEEDS_IMPROVEMENT) and ranked recommendations.

## When to Invoke

`Skill({ skill: 'pipeline-evaluator' })`

Invoke when:

- A multi-task pipeline has completed and quality measurement is needed
- Router requests post-pipeline quality gate
- Reflection agent needs structured metrics for the rubric
- Continuous improvement loop requires baseline data

---

## Workflow

### Step 1: Gather Pipeline Data

1. Call `TaskList()` to retrieve all tasks associated with the pipeline.
2. For each task, call `TaskGet({ taskId })` to fetch full metadata including:
   - `status` (completed/failed/blocked/cancelled)
   - `metadata.summary`
   - `metadata.filesModified`
   - `metadata.deviations` (array)
   - `metadata.testResult` (PASS/FAIL + counts)
   - `metadata.completedAt` vs task `createdAt` (for time efficiency)
3. Read any plan file referenced in task metadata to cross-check task completion against planned scope.

### Step 2: Score 5 Dimensions

Calculate each dimension score (0–100 unless noted):

#### D1: Task Completion Rate (weight: 30%)

```
completionRate = (completedTasks / totalTasks) * 100
```

- Count tasks with `status: "completed"` as completed.
- Tasks with `status: "failed"` or `status: "cancelled"` count against.
- Blocked tasks that resolved and completed count as completed.

**Score mapping:**

- 100% → 100
- 90–99% → 85
- 75–89% → 70
- 60–74% → 50
- <60% → 20

#### D2: Deviation Count (weight: 20%)

Count total deviations logged across all task metadata `deviations[]` arrays.

**Score mapping (inverse — fewer is better):**

- 0 deviations → 100
- 1–2 deviations → 85
- 3–5 deviations → 65
- 6–10 deviations → 40
- > 10 deviations → 10

#### D3: Test Pass Rate (weight: 25%)

Parse `metadata.testResult` fields. Extract pass counts and fail counts from strings like `"PASS 42/42"` or `"FAIL 38/42"`.

```
testPassRate = (totalPassed / totalTests) * 100
```

If no test results reported: use 50 as neutral score.

#### D4: Time Efficiency (weight: 10%)

Compare actual pipeline duration vs estimated duration (if available in plan file).

```
efficiency = min(estimatedDuration / actualDuration, 1.0) * 100
```

If no estimate available: score 70 (neutral).

#### D5: Quality Score (weight: 15%)

Derived from code quality signals in task metadata:

- Each task that ran `pnpm lint:fix` with zero errors: +10 points base
- Each task that ran `pnpm format` with no changes: +5 points base
- Deduct 5 points per task that reported lint errors
- Deduct 10 points per task with unresolved TODOs in modified files

Cap at 100. Default to 60 if no quality signals present.

### Step 3: Calculate Composite Score

```
composite = (D1 * 0.30) + (D2 * 0.20) + (D3 * 0.25) + (D4 * 0.10) + (D5 * 0.15)
```

### Step 4: Determine Verdict

| Composite Score | Verdict           |
| --------------- | ----------------- |
| > 90            | EXCELLENT         |
| > 75            | GOOD              |
| > 60            | ACCEPTABLE        |
| ≤ 60            | NEEDS_IMPROVEMENT |

### Step 5: Generate Recommendations

For each dimension scoring below 80, generate a specific recommendation:

- **Task Completion Rate < 80**: "Investigate failed/cancelled tasks — review blocker patterns and add prerequisite checks to planner prompts."
- **Deviation Count > 5**: "High deviation count suggests scope creep. Add DR-3 architectural escalation gates and tighten task scoping in planner."
- **Test Pass Rate < 80**: "Failing tests indicate implementation gaps. Enforce TDD red-green cycle and add pre-completion test gate."
- **Time Efficiency < 70**: "Pipeline ran significantly over estimate. Profile slowest tasks and consider parallelization or task decomposition."
- **Quality Score < 70**: "Lint/format issues present. Add blocking lint gate to pre-completion validation hook."

Sort recommendations by severity (lowest score dimension first).

### Step 6: Write Evaluation Report

Write the structured evaluation to `.claude/context/reports/backend/pipeline-eval-{pipelineId}-{YYYY-MM-DD}.md`:

```markdown
<!-- Agent: pipeline-evaluator | Task: #{taskId} | Session: {date} -->

# Pipeline Evaluation: {pipelineId}

**Evaluated At**: {ISO timestamp}
**Verdict**: {VERDICT}
**Composite Score**: {score}/100

## Dimension Scores

| Dimension            | Score | Weight | Weighted   |
| -------------------- | ----- | ------ | ---------- |
| Task Completion Rate | {D1}  | 30%    | {D1\*0.3}  |
| Deviation Count      | {D2}  | 20%    | {D2\*0.2}  |
| Test Pass Rate       | {D3}  | 25%    | {D3\*0.25} |
| Time Efficiency      | {D4}  | 10%    | {D4\*0.1}  |
| Quality Score        | {D5}  | 15%    | {D5\*0.15} |

## Recommendations

{ranked recommendations list}
```

Also write the machine-readable JSON to `.claude/context/reports/backend/pipeline-eval-{pipelineId}-{YYYY-MM-DD}.json` conforming to `pipeline-evaluation.schema.json`.

---

## Scoring Reference

| Verdict           | Composite | Meaning                              |
| ----------------- | --------- | ------------------------------------ |
| EXCELLENT         | > 90      | Pipeline executed near-perfectly     |
| GOOD              | > 75      | Minor issues; no systemic problems   |
| ACCEPTABLE        | > 60      | Notable gaps but goals met           |
| NEEDS_IMPROVEMENT | ≤ 60      | Systemic issues require intervention |

---

## Anti-Patterns

- Never score a pipeline before all tasks have reached a terminal state (completed/failed/cancelled).
- Never use only task count as a proxy for quality — always check test pass rate.
- Never omit the JSON report — machine-readable output is required for trend tracking.
- Never assign EXCELLENT without verifying test pass rate > 90%.

## Related Skills

- `reflection` — Uses pipeline evaluation scores in the rubric
- `tdd` — Informs the Test Pass Rate dimension
- `verification-before-completion` — Pre-completion gates that feed quality signals
