# Judge Verification Rules

## Core Principle

The judge is independent. It has no access to the executing agent's internal reasoning,
previous tool responses, or accumulated context. It sees only: task goal, action list, final state.

## Iron Laws

1. **Evidence gate is mandatory** — PASS requires dim3 (evidenceOfCompletion) >= 15. No exceptions.
2. **No shared context** — Never pass the executing agent's chain-of-thought to the judge.
3. **CONDITIONAL requires human review** — Do not auto-promote CONDITIONAL to PASS.
4. **FAIL is not failure of the framework** — It is the correct detection of an incomplete task.
5. **Score honestly** — Rationalized scores that push a failing task to PASS are worse than FAIL.

## Score Calibration

| Score | Meaning                                         |
| ----- | ----------------------------------------------- |
| 25/25 | Strong, unambiguous evidence for this dimension |
| 18-24 | Good evidence, minor gaps                       |
| 10-17 | Partial evidence, notable gaps                  |
| 0-9   | Little or no credible evidence                  |

## Anti-Patterns

- Never accept a verbal claim of completion as evidence (dim3)
- Never infer "file must have changed" without checking git diff or file content
- Never mark PASS when tests are not run for a code-change task
- Never give dim3 > 0 if no artifact, output, or diff was examined

## When to Invoke

```javascript
Skill({ skill: 'judge-verification' });
```

Invoke after any high-stakes task completion, or whenever completion metadata seems inconsistent.
