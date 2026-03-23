---
name: judge-verification
description: Independent LLM judge evaluates task completion separately from the executing agent, catching false success claims by reviewing task goal, actions taken, final state, and evidence. Produces PASS/FAIL with confidence score and reasoning.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: false
tools: [Read, Write, Bash, TaskUpdate, TaskGet]
agents: [qa, developer, master-orchestrator, planner, code-reviewer]
category: 'Validation & Quality'
tags: [verification, judge, llm-evaluation, completion-gate, quality-assurance]
error_handling: strict
---

# Judge Verification

## Overview

An independent LLM evaluation layer that verifies whether a task was genuinely completed.
The judge reviews the original task goal, the sequence of actions taken, the final state of
relevant artifacts, and the claimed completion evidence — then produces a PASS/FAIL verdict
with a confidence score and actionable reasoning.

This skill is distinct from `verification-before-completion`: that skill runs checklist gates
within the same agent context. Judge-verification uses a **fresh, independent perspective**
with no access to the executing agent's prior reasoning, catching hallucinated success claims.

## When to Use

```javascript
Skill({ skill: 'judge-verification' });
```

Invoke when:

- Task claims completion but no test output, diff, or artifact is visible
- High-stakes tasks (security fixes, data migrations, API changes) require independent sign-off
- An agent's completion metadata seems inconsistent with the work described
- The `verification-before-completion` skill passes but human review is not available
- Loop detection force-done fired (partial completion needs judging)

## The Iron Law

```
JUDGE IS INDEPENDENT — NO SHARED CONTEXT WITH EXECUTING AGENT
```

The judge must receive only: (1) the original task goal, (2) the list of actions, (3) the
final file states. Never pass the executing agent's reasoning or internal notes to the judge.

## Judge Evaluation Framework

The judge reviews four dimensions and produces a combined verdict:

### Dimension 1: Task Goal Alignment

**Question:** Does the final state match what the task requested?

**Evidence to check:**

- Original task subject/description from `TaskGet({ taskId })`
- Files or outputs explicitly mentioned in the task
- Expected behavior described in the task goal

**Score:** 0-25 points

**Commands:**

```bash
# Get the original task goal
# (replace task-ID with actual task ID)
node -e "const fs=require('fs');const tasks=JSON.parse(fs.readFileSync('.claude/context/runtime/tasks.json','utf8')||'[]');const t=tasks.find(x=>x.id==='{{TASK_ID}}');console.log(JSON.stringify(t?.subject||'not found'));"
```

**Expected output:** Task subject string showing the original goal.
**Verify:** Subject matches what the agent claimed to accomplish.

### Dimension 2: Action Completeness

**Question:** Were the claimed actions sufficient to accomplish the goal?

**Evidence to check:**

- List of tool calls from task metadata (`filesModified`, `outputArtifacts`)
- Were necessary tools invoked? (e.g., Write for file creation, Bash for command execution)
- Are there obvious gaps? (e.g., claimed to run tests but no Bash call with `pnpm test`)

**Score:** 0-25 points

**Commands:**

```bash
# Check files modified were actually touched
git diff --name-only HEAD~1 HEAD 2>/dev/null || git status --short
```

**Expected output:** List of changed files that should match the agent's `filesModified` metadata.
**Verify:** At least one file changed; file list is plausible given the task.

### Dimension 3: Evidence of Completion

**Question:** Is there concrete, verifiable evidence the task succeeded?

**Evidence to check:**

- Test results (exit code 0, pass counts)
- File contents reflect the requested change
- No error output in last bash call
- Build/lint passes

**Score:** 0-25 points

**Commands:**

```bash
# Check if tests pass (if task involved code changes)
cd /c/dev/projects/agent-studio && pnpm test 2>&1 | tail -5
```

**Expected output:** Test summary showing pass/fail counts.
**Verify:** Zero failures for tasks that touched tested code.

```bash
# Verify target file content matches task intent
# (judge reads the file and checks against task description)
head -50 {{TARGET_FILE_PATH}}
```

**Expected output:** File content consistent with the claimed change.
**Verify:** Content is not placeholder/stub; change is real.

### Dimension 4: Final State Coherence

**Question:** Is the system in a coherent state — no regressions, no broken references?

**Evidence to check:**

- Lint and format pass
- No new TODO/FIXME introduced without justification
- Referenced files exist
- No circular imports or broken requires

**Score:** 0-25 points

**Commands:**

```bash
# Quick coherence check
cd /c/dev/projects/agent-studio && pnpm lint:fix 2>&1 | tail -10
```

**Expected output:** Zero errors, possibly auto-fix count.
**Verify:** Exit code 0 or only style fixes (no logic errors).

## Verdict Calculation

```
totalScore = dim1 + dim2 + dim3 + dim4  (max 100)

PASS:        totalScore >= 70 AND dim3 >= 15  (evidence gate — cannot pass with no evidence)
FAIL:        totalScore < 70  OR  dim3 < 15
CONDITIONAL: totalScore 60-69 with dim3 >= 15 — requires human review
```

## Output Format

The judge produces a structured verdict:

```json
{
  "verdict": "PASS | FAIL | CONDITIONAL",
  "confidence": 0.87,
  "totalScore": 82,
  "dimensions": {
    "goalAlignment": 20,
    "actionCompleteness": 22,
    "evidenceOfCompletion": 20,
    "finalStateCoherence": 20
  },
  "reasoning": "Task goal was to add input validation. Files modified include auth.ts and auth.test.ts. Tests pass. Validation logic present in auth.ts lines 45-67. No regressions detected.",
  "failureReasons": [],
  "recommendations": ["Consider adding edge case tests for empty string input"]
}
```

## Workflow

### Step 1: Collect Task Context

**Command:**

```bash
node -e "
const fs = require('fs');
const taskId = '{{TASK_ID}}';
// Read task context from metadata
const logPath = '.claude/context/runtime/session-gap-log.jsonl';
const lines = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean) : [];
const relevant = lines.filter(l => l.includes(taskId)).map(l => JSON.parse(l));
console.log(JSON.stringify(relevant.slice(-5), null, 2));
"
```

**Expected output:** Recent task log entries with metadata (filesModified, summary).
**Verify:** At least one entry for the task ID.

### Step 2: Verify Artifacts Exist

For each file in `filesModified`, verify it exists and has non-zero size:

**Command:**

```bash
# For each file claimed as modified:
stat "{{FILE_PATH}}" 2>/dev/null && echo "EXISTS" || echo "MISSING: {{FILE_PATH}}"
```

**Expected output:** "EXISTS" for each file.
**Verify:** No MISSING entries — missing files = automatic FAIL for dim2.

### Step 3: Score Each Dimension

Score dimensions 1-4 using the criteria above. Record each score with one-sentence justification.

**Expected output:** Four scores totaling 0-100.
**Verify:** Total is consistent with the evidence collected.

### Step 4: Calculate Verdict

Apply verdict formula. Check evidence gate (dim3 >= 15 required for PASS).

**Command:**

```javascript
const total = dim1 + dim2 + dim3 + dim4;
const verdict =
  total >= 70 && dim3 >= 15 ? 'PASS' : total >= 60 && dim3 >= 15 ? 'CONDITIONAL' : 'FAIL';
const confidence = Math.min(1.0, total / 100 + (dim3 >= 20 ? 0.1 : 0));
```

**Expected output:** `{ verdict, confidence, totalScore }`.
**Verify:** Verdict is consistent with the evidence — do not rationalize a PASS without evidence.

### Step 5: Write Verdict to Task Metadata

**Command:**

```javascript
TaskUpdate({
  taskId: '{{TASK_ID}}',
  status: 'completed', // or keep as-is if just judging
  metadata: {
    judgeVerdict: {
      verdict: '{{VERDICT}}',
      confidence: {{CONFIDENCE}},
      totalScore: {{SCORE}},
      dimensions: { goalAlignment: {{D1}}, actionCompleteness: {{D2}}, evidenceOfCompletion: {{D3}}, finalStateCoherence: {{D4}} },
      reasoning: '{{REASONING}}',
      failureReasons: [{{FAILURES}}],
      recommendations: [{{RECS}}],
      judgedAt: new Date().toISOString(),
    },
  },
});
```

**Expected output:** TaskUpdate succeeds with judge verdict in metadata.
**Verify:** `TaskGet({ taskId })` returns `metadata.judgeVerdict.verdict`.

## FAIL Handling

When verdict is FAIL:

1. Do NOT mark the task complete
2. Write failure reasons to `issues.md`
3. Notify the originating agent or Router with the specific failure reasons
4. Suggest concrete remediation steps based on which dimension failed

## CONDITIONAL Handling

When verdict is CONDITIONAL:

1. Mark task as `blocked` with `blockerType: 'review'`
2. Output: "Judge verdict CONDITIONAL (score {{N}}/100). Human review required before marking complete."
3. List specific gaps that prevented PASS

## Integration with verification-before-completion

This skill is **complementary** to `verification-before-completion`, not a replacement:

| Skill                            | Perspective | When                 | Catches                              |
| -------------------------------- | ----------- | -------------------- | ------------------------------------ |
| `verification-before-completion` | Same agent  | Before claiming done | Missing steps in agent's own context |
| `judge-verification`             | Independent | After claiming done  | False success, hallucinated evidence |

Use both: `verification-before-completion` first, then `judge-verification` for sign-off.

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

Pre-execute hook at `hooks/pre-execute.cjs` validates that `taskId` and `taskGoal` are provided.
Post-execute hook at `hooks/post-execute.cjs` emits a judge-verification event to `tool-events.jsonl`.

## Anti-Patterns

- Never share the executing agent's internal reasoning with the judge
- Never accept a PASS verdict without a non-zero dim3 score (evidence gate is mandatory)
- Never judge a task that hasn't called `TaskUpdate(completed)` yet — wait for the completion claim
- Never skip this skill for security-sensitive tasks, even when other verification passes

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md` for past judge verdicts and common failure patterns.

**After completing:** If verdict is FAIL or CONDITIONAL, append to `.claude/context/memory/issues.md`:

```
## Judge Verification FAIL — Task {{TASK_ID}} — [date]
- Verdict: FAIL (score {{N}}/100)
- Failed dimensions: {{DIMS}}
- Root cause: {{REASONING}}
- Recommendation: {{RECS}}
```

## Related Skills

- `verification-before-completion` — Pre-completion checklist (same-agent perspective)
- `behavioral-loop-detection` — Detect loops before completion claim
- `error-recovery-escalation` — Handle errors before reaching judge
- `agent-evaluation` — Full LLM-as-judge 5-dimension rubric (broader scope)
