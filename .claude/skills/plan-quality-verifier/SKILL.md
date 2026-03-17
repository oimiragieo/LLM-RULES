---
name: plan-quality-verifier
description: Verifies implementation plan quality across 8 dimensions (requirement-coverage, task-completeness, dependency-validity, scope-sanity, artifact-wiring, risk-assessment, testability, estimation-quality) and returns pass/fail with per-dimension scores.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: false
tools: [Read, Bash]
agents: [planner, architect, developer]
category: 'Validation & Quality'
tags: [planning, validation, quality, verification, plan]
---

# Plan Quality Verifier

## Purpose

Score an implementation plan across 8 quality dimensions and gate execution on a minimum threshold.
Returns `{ pass, score, dimensions }` where `pass` is true when overall score ≥ 60/100.

## When to Use

Invoke this skill before handing off a plan to executing agents:

```javascript
Skill({ skill: 'plan-quality-verifier' });
```

Use when:

- A planner agent has finished drafting an implementation plan
- The router wants to gate execution behind a quality check
- An architect needs to validate a submitted plan before approval
- A developer receives a plan and wants to sanity-check it before starting

## Iron Law

```
NO PLAN EXECUTES WITHOUT PASSING QUALITY VERIFICATION FIRST
```

A plan that scores < 60/100 must be revised before spawning executing agents.

## Workflow

### Step 1: Load the plan content

Read the plan file:

```bash
cat .claude/context/plans/<plan-file>.md
```

**Expected output:** Raw markdown text of the plan.

### Step 2: Run the verifier

```javascript
const { verifyPlan } = require('.claude/lib/validation/plan-quality-verifier.cjs');
const planContent = require('fs').readFileSync('<plan-path>', 'utf8');
const result = verifyPlan(planContent);
console.log(JSON.stringify(result, null, 2));
```

**Expected output:**

```json
{
  "pass": true,
  "score": 72,
  "dimensions": [
    { "name": "requirement-coverage", "score": 8 },
    { "name": "task-completeness", "score": 7 },
    { "name": "dependency-validity", "score": 9 },
    { "name": "scope-sanity", "score": 6 },
    { "name": "artifact-wiring", "score": 7 },
    { "name": "risk-assessment", "score": 8 },
    { "name": "testability", "score": 7 },
    { "name": "estimation-quality", "score": 9 }
  ]
}
```

**Verify:** `result.pass === true` and `result.score >= 60`.

### Step 3: Interpret results

| Result        | Action                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| `pass: true`  | Proceed — hand off plan to executing agents                                   |
| `pass: false` | Block — return feedback to planner with failing dimensions                    |
| Score 60-69   | Marginal pass — flag low-scoring dimensions for improvement in next iteration |
| Score < 40    | Hard block — plan needs significant rework before re-evaluation               |

### Step 4: Report failing dimensions

When `pass: false`, format feedback:

```
Plan quality check FAILED (score: {{score}}/100)

Failing dimensions (score < 6):
{{#each dimensions where score < 6}}
- {{name}}: {{score}}/10 — needs improvement
{{/each}}

Action required: Revise the plan and re-run verification.
```

## Dimension Reference

| Dimension            | What it Measures                                 | Good Signals                                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------- |
| requirement-coverage | Are all stated requirements addressed by tasks?  | Keywords: requirement, feature, user story        |
| task-completeness    | Do tasks have clear ownership and deliverables?  | Keywords: implement, create, update, agent        |
| dependency-validity  | Are task dependencies explicit and cycle-free?   | Keywords: depends, blocked by, after, before      |
| scope-sanity         | Is the plan scope realistic and bounded?         | Phase/wave structure, bounded scope language      |
| artifact-wiring      | Are output artifacts explicitly listed per task? | Keywords: artifact, output, file, deliverable     |
| risk-assessment      | Are risks identified with mitigations?           | Keywords: risk, mitigation, fallback, contingency |
| testability          | Are acceptance criteria and test hooks defined?  | Keywords: test, verify, acceptance, criteria      |
| estimation-quality   | Are effort/time estimates provided?              | Keywords: estimate, hours, days, effort, wave     |

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution.
Output contract defined in `schemas/output.schema.json`.

## Anti-Patterns

- Never skip verification to "save time" — a bad plan costs more to fix mid-execution
- Never treat a marginal pass (60-69) as a strong pass — flag and iterate
- Never modify verifier scoring thresholds per-project — the 60/100 gate is standard
- Never run verifier on a partial/draft plan — only run on complete plans

## Memory Protocol

**Before starting:**

Read `.claude/context/memory/learnings.md` for past plan quality issues and common failures.

**After completing:**

- Failed plan with specific dimension scores → Append to `.claude/context/memory/issues.md`
- New plan pattern discovered → Append to `.claude/context/memory/learnings.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

## Related Skills

- `plan-generator` — Generates plans that should pass this verifier
- `verification-before-completion` — Gates task completion (complements plan gating)
- `tdd` — TDD methodology that complements testability dimension scoring

## Implementation Reference

- Verifier lib: `.claude/lib/validation/plan-quality-verifier.cjs`
- Tests: `tests/lib/validation/plan-quality-verifier.test.cjs`
- Schema: `.claude/skills/plan-quality-verifier/schemas/input.schema.json`
