# outcome-reflection Skill Workflow

**Skill:** `outcome-reflection`
**Category:** Memory & Context
**Invocation:** `Skill({ skill: 'outcome-reflection' })`

---

## When to Invoke

After any agent task that had predictions recorded at planning time. Minimum viable:
after any task where `estimatedTokens` or `reworkLoops` data is available.

---

## Workflow

### Phase 1: Gather Actuals

```bash
# Read predictions from task metadata (if planner recorded them)
# Then measure actuals from the completed task:
#   actualTokens  — from ccusage or session estimate
#   actualFiles   — count files touched
#   actualSteps   — count major implementation steps
#   reworkLoops   — count substantial approach revisions (0 = smooth)
```

### Phase 2: Run Calibration Scoring

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --taskId {{TASK_ID}} \
  --predicted '{{PREDICTIONS_JSON}}' \
  --actual '{{ACTUALS_JSON}}'
```

**Expected output:** JSON with `scores`, `flags`, `notes`, `reflectionQueued`

**Verify:** Exit code 0 and valid JSON printed to stdout.

### Phase 3: Record to Memory

Append the calibration record to `.claude/context/memory/learnings.md`:

````bash
# Add under ## Calibration Records section
# Format: ```json { ...calibration record... } ```
````

### Phase 4: Handle Flags

If `flags` contains `high-miss` or `reflectionQueued === true`:

```javascript
// Append to reflection spawn request
// .claude/context/runtime/reflection-spawn-request.json
{
  "id": "{{UUID}}",
  "trigger": "outcome-reflection-high-miss",
  "priority": "medium",
  "context": "Task {{TASK_ID}} scored {{OVERALL}} overall. Flags: {{FLAGS}}. Notes: {{NOTES}}",
  "taskId": "{{TASK_ID}}"
}
```

### Phase 5: Complete Task

```javascript
TaskUpdate({
  taskId: '{{TASK_ID}}',
  status: 'completed',
  metadata: {
    summary: '{{TASK_SUMMARY}}',
    calibration: {
      overall: {{OVERALL_SCORE}},
      flags: [{{FLAGS}}],
      reflectionQueued: {{REFLECTION_QUEUED}}
    }
  }
})
```

---

## Trend Analysis Workflow

Run after accumulating 5+ calibration records:

```bash
node .claude/skills/outcome-reflection/scripts/main.cjs \
  --analyze \
  --agentType {{AGENT_TYPE}} \
  --taskType {{TASK_TYPE}} \
  --last 10
```

Review output for:

- Consistent underestimation patterns → adjust multipliers
- Recurring `excessive-rework` flag → improve planning process
- Declining `predictionQuality` → review prediction methodology

---

## Integration Points

| Component           | Role                                                |
| ------------------- | --------------------------------------------------- |
| `plan-generator`    | Records `predictions` in task metadata at creation  |
| `developer` agent   | Calls outcome-reflection after task completion      |
| `planner` agent     | Calls outcome-reflection after planning tasks       |
| `reflection-agent`  | Processes `reflectionQueued: true` signals          |
| `instinct-learning` | Receives calibration insights for pattern recording |

---

## Related Skills

- `plan-generator` — structured planning with prediction recording
- `instinct-learning` — atomic pattern recording from calibration insights
- `context-compressor` — compress learnings.md when calibration records accumulate
