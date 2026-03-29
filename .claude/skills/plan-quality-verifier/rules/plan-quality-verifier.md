# plan-quality-verifier Rules

## Purpose

Verifies implementation plan quality across 8 dimensions (requirement-coverage, task-completeness, dependency-validity, scope-sanity, artifact-wiring, risk-assessment, testability, estimation-quality) and returns pass/fail with per-dimension scores.

## Best Practices

- Run verification before handing off plans to executing agents
- Score threshold: 60/100 required for pass
- Marginal pass (60-69) should be flagged for improvement
- Score < 40: Hard block — plan needs significant rework
- Never skip verification to "save time"

## Quality Dimensions

| Dimension            | What it Measures                                 |
| -------------------- | ------------------------------------------------ |
| requirement-coverage | Are all stated requirements addressed by tasks?  |
| task-completeness    | Do tasks have clear ownership and deliverables?  |
| dependency-validity  | Are task dependencies explicit and cycle-free?   |
| scope-sanity         | Is the plan scope realistic and bounded?         |
| artifact-wiring      | Are output artifacts explicitly listed per task? |
| risk-assessment      | Are risks identified with mitigations?           |
| testability          | Are acceptance criteria and test hooks defined?  |
| estimation-quality   | Are effort/time estimates provided?              |

## Iron Law

```
NO PLAN EXECUTES WITHOUT PASSING QUALITY VERIFICATION FIRST
```

## Integration Points

See SKILL.md for complete documentation.
