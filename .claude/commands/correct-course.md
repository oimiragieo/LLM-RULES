---
description: Trigger a course correction workflow when a sprint or plan is off-track
---

# /correct-course

Invoke this command when the current sprint or plan requires correction due to blockers, scope changes, velocity drops, or priority shifts.

**Usage:** `/correct-course <reason for course correction>`

**Arguments:**
- `$ARGUMENTS` — A brief description of why course correction is needed (e.g., "critical API dependency changed", "scope expanded by 40%", "blocker discovered in auth module")

## What This Does

This command activates the Course Correction Workflow (`course-correction.md`) and invokes the `plan-generator` skill in course-correction mode. It will:

1. Detect and classify the trigger type
2. Assess the full impact on current tasks
3. Generate a revised plan with proposed changes
4. Request stakeholder approval before executing
5. Execute all approved changes

## Workflow

Invoke the `plan-generator` skill in course-correction mode with the provided reason:

```
Skill({ skill: 'plan-generator' })
```

Then follow the Course Correction Workflow at `.claude/workflows/enterprise/course-correction.md` starting from Phase 1 (Trigger Detection), using `$ARGUMENTS` as the initial trigger description.

Produce a `sprint-change-proposal` document conforming to `.claude/schemas/sprint-change-proposal.schema.json` and present it for approval before making any changes.

## Related

- Workflow: `.claude/workflows/enterprise/course-correction.md`
- Schema: `.claude/schemas/sprint-change-proposal.schema.json`
- Skill: `plan-generator`
