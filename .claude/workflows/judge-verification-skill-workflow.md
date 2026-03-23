# Judge Verification Skill Workflow

**Skill:** `judge-verification`
**Invocation:** `Skill({ skill: 'judge-verification' })`
**Purpose:** Independent LLM evaluation of task completion with evidence gating.

---

## When to Use This Workflow

Invoke after any high-stakes task completes, or when completion metadata seems inconsistent. The judge is independent — it never sees the executing agent's chain-of-thought.

**Triggers:**
- Agent reports `TaskUpdate(completed)` on a HIGH/EPIC task
- Completion summary lacks file diffs or test output
- A previous judge verdict was CONDITIONAL and you want to re-evaluate
- `behavioral-loop-detection` fires FORCE-DONE and you need to assess partial output

---

## Phase 1: Gather Evidence (Pre-Judge)

Do NOT invoke the judge yet. First gather independent evidence.

**Step 1.1: Read task goal**

```bash
# Get the original task specification
# From task metadata or the spawning agent's prompt
```

**Step 1.2: Examine file changes**

```bash
git diff HEAD~1 HEAD --stat
git diff HEAD~1 HEAD -- <relevant_files>
```

**Expected output:** List of modified files with line change counts.

**Step 1.3: Verify test results (if applicable)**

```bash
node --test tests/<relevant_test>.test.cjs 2>&1 | tail -20
```

**Expected output:** Test pass/fail summary.

**Step 1.4: Check output artifacts**

```bash
ls -la <output_path>
# OR
node -e "const fs=require('fs');console.log(fs.existsSync('<path>') ? 'EXISTS' : 'MISSING')"
```

---

## Phase 2: Score Dimensions

Score each dimension independently based on evidence gathered in Phase 1. Do NOT use the executing agent's self-report as evidence.

### goalAlignment (0-25)
- 22-25: Output precisely matches every requirement
- 15-21: Core requirements met, minor gaps
- 8-14: Partial match, significant gaps
- 0-7: Misses or contradicts goal

### actionCompleteness (0-25)
- 22-25: All required actions taken
- 15-21: Most actions taken
- 8-14: Key actions taken, several gaps
- 0-7: Actions insufficient

### evidenceOfCompletion (0-25) — GATE DIMENSION
- 22-25: git diff + passing tests + file content examined
- 15-21: At least one concrete artifact examined
- 8-14: Indirect evidence only
- 0-7: Only agent's verbal claim

**IRON LAW: If evidenceOfCompletion < 15, verdict is FAIL regardless of total.**

### finalStateCoherence (0-25)
- 22-25: System fully consistent
- 15-21: Minor inconsistencies
- 8-14: Notable inconsistencies
- 0-7: Broken state

---

## Phase 3: Invoke Judge

```javascript
Skill({ skill: 'judge-verification' });

// Then emit verdict via CLI:
// echo '<json-with-scores>' | node .claude/tools/judge-verification/judge-verification.cjs --verdict
```

**Input JSON:**

```json
{
  "taskId": "<task-id>",
  "taskGoal": "<original task description>",
  "scores": {
    "goalAlignment": <0-25>,
    "actionCompleteness": <0-25>,
    "evidenceOfCompletion": <0-25>,
    "finalStateCoherence": <0-25>
  },
  "reasoning": "<narrative of evidence examined>",
  "failureReasons": ["<reason if FAIL>"],
  "recommendations": ["<next step if FAIL or CONDITIONAL>"]
}
```

**Verify:** Exit code 0 and valid JSON verdict emitted to stdout.

---

## Phase 4: Act on Verdict

### If PASS (totalScore ≥ 70 AND evidenceOfCompletion ≥ 15)

```javascript
TaskUpdate({
  taskId: '<task-id>',
  status: 'completed',
  metadata: {
    judgeVerdict: 'PASS',
    judgeScore: <totalScore>,
    judgedAt: new Date().toISOString(),
  }
});
```

### If FAIL

```javascript
// Do NOT mark completed.
// Invoke error-recovery-escalation for structured recovery:
Skill({ skill: 'error-recovery-escalation' });

// Escalation starts at Level 2 (nudge) for evidence failures,
// Level 3 (replan) for goal misalignment failures.
```

### If CONDITIONAL (totalScore 60-69 AND evidenceOfCompletion ≥ 15)

```javascript
// Flag for human review. Do NOT auto-promote to PASS.
TaskUpdate({
  taskId: '<task-id>',
  status: 'blocked',
  metadata: {
    judgeVerdict: 'CONDITIONAL',
    judgeScore: <totalScore>,
    blockerType: 'review-required',
    needsFrom: 'user',
    recommendations: ['<from verdict>'],
  }
});
```

---

## Integration Map

| Skill | Relationship |
|-------|-------------|
| `verification-before-completion` | Pre-completion gate (runs before judge) |
| `behavioral-loop-detection` | Fires FORCE-DONE → judge evaluates partial output |
| `error-recovery-escalation` | Handles FAIL verdicts with structured recovery |
| `qa-workflow` | Provides test evidence that raises evidenceOfCompletion score |

---

## Anti-Patterns

- Never pass executing agent's chain-of-thought to the judge
- Never auto-promote CONDITIONAL to PASS
- Never give evidenceOfCompletion > 0 without examining an artifact
- Never infer "file must have changed" without checking git diff
