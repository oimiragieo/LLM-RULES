# Judge Verification — Implementation Template

Use this template when invoking `judge-verification` to evaluate task completion.

---

## Template: Standard Task Evaluation

```javascript
// Step 1: Gather evidence — examine what was actually done
// DO NOT pass reasoning from the executing agent. Judge sees only:
//   - Task goal (what was asked)
//   - Actions taken (tool calls made)
//   - Final state (files, test results, diffs)

// Step 2: Score each dimension independently
const dimensions = {
  goalAlignment: {{score_0_to_25}},         // Did output match the task spec?
  actionCompleteness: {{score_0_to_25}},    // Were all required actions taken?
  evidenceOfCompletion: {{score_0_to_25}},  // Git diff / test output / file content
  finalStateCoherence: {{score_0_to_25}},   // Is system state internally consistent?
};

// Step 3: Invoke skill
Skill({ skill: 'judge-verification' });

// Step 4: Report verdict and act
// PASS      → proceed, mark TaskUpdate(completed)
// FAIL      → escalate, call error-recovery-escalation
// CONDITIONAL → flag for human review, do NOT auto-promote
```

---

## Template: Minimal Evidence Check

When you need to quickly verify a single completed action:

```bash
# Check git diff for file changes
git diff HEAD~1 HEAD -- {{file_path}}

# Check test results
node --test {{test_file}} 2>&1 | tail -20

# Check file exists and has content
ls -la {{output_path}}
```

**Score evidenceOfCompletion:**

- File was modified (git diff shows changes): +10
- Tests pass with output confirming behavior: +10
- Artifact/output exists and non-empty: +5

---

## Template: Full Evaluation Prompt

Use this structure when composing the judge evaluation prompt:

```
TASK GOAL:
{{task_goal}}

ACTIONS TAKEN:
{{numbered_list_of_tool_calls_with_inputs_and_outputs}}

FINAL STATE:
{{git_diff_or_file_listing_or_test_output}}

AGENT SUMMARY (optional, treat as weak evidence only):
{{agent_completion_summary}}

EVALUATE:
Score each dimension 0-25. Apply evidence gate: evidenceOfCompletion < 15 = FAIL regardless of total.
```

---

## Scoring Rubric Quick Reference

### goalAlignment (0-25)

| Score | Evidence                                               |
| ----- | ------------------------------------------------------ |
| 22-25 | Output precisely matches every requirement in the goal |
| 15-21 | Output matches core requirements, minor gaps           |
| 8-14  | Output partially matches, significant gaps             |
| 0-7   | Output misses or contradicts the goal                  |

### actionCompleteness (0-25)

| Score | Evidence                                     |
| ----- | -------------------------------------------- |
| 22-25 | All expected actions taken, no skipped steps |
| 15-21 | Most actions taken, 1-2 minor skips          |
| 8-14  | Key actions taken, several gaps              |
| 0-7   | Actions insufficient or wrong approach       |

### evidenceOfCompletion (0-25) — GATE DIMENSION

| Score | Evidence                                                 |
| ----- | -------------------------------------------------------- |
| 22-25 | Strong: git diff + passing tests + file content examined |
| 15-21 | Good: at least one concrete artifact examined            |
| 8-14  | Weak: indirect evidence only                             |
| 0-7   | None: only agent's verbal claim                          |

**IRON LAW: evidenceOfCompletion < 15 = FAIL. No exceptions.**

### finalStateCoherence (0-25)

| Score | Evidence                                            |
| ----- | --------------------------------------------------- |
| 22-25 | System state fully consistent, no broken references |
| 15-21 | Minor inconsistencies that don't affect function    |
| 8-14  | Notable inconsistencies present                     |
| 0-7   | Broken state, errors, contradictions                |

---

## Anti-Patterns (Do Not Do These)

```
# BAD: Agent describes its own completion
"I successfully implemented the feature and all tests pass."
→ This is NOT evidence. Score evidenceOfCompletion: 0.

# BAD: Inferring changes without checking
"The file must have been modified because the agent said so."
→ Check git diff. Never infer.

# BAD: Promoting CONDITIONAL to PASS
CONDITIONAL verdict → auto-mark as PASS
→ CONDITIONAL requires human review. Never auto-promote.
```
