---
name: implementation-readiness
description: Gate for HIGH/EPIC tasks that validates plan completeness and architecture compliance before implementation begins
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Glob, Grep]

verified: true
best_practices:
  - Run before spawning implementation agents for HIGH/EPIC tasks
  - Skip for TRIVIAL/LOW complexity tasks
  - Produce structured pass/fail verdict with reasons
error_handling: graceful
streaming: supported
---

# Implementation Readiness Gate

Validates that a plan is ready for implementation before agents are spawned. Prevents wasted compute from incomplete plans, missing acceptance criteria, or architectural misalignment.

## When to Invoke

```javascript
Skill({ skill: 'implementation-readiness' });
```

Invoke when:

- Router is about to spawn agents for a HIGH or EPIC complexity task
- A planner has produced a plan that needs validation before execution
- Step 0.6 creation preflight in the router decision workflow

**Skip when:**

- Task complexity is TRIVIAL or LOW
- Task is a single-file bug fix or documentation update
- User has explicitly bypassed the gate via `READINESS_GATE=off`

## Readiness Checks

### Check 1: Plan Completeness

Every task in the plan must have:

- A clear subject/title
- Acceptance criteria (at least 1 testable condition)
- File paths to create or modify (at least 1)
- Dependency declarations (blockedBy, if any)

**Pass**: All tasks have all required fields.
**Fail**: Tasks missing acceptance criteria or file paths.

### Check 2: Architecture Compliance

Verify that planned changes align with framework conventions:

- New skills use `.claude/skills/<name>/SKILL.md` path pattern
- New agents use `.claude/agents/<category>/<name>.md` path pattern
- New hooks use `.claude/hooks/<category>/<name>.cjs` path pattern
- New modules follow kebab-case naming
- Gate 4 paths use creator skills (not direct writes)

**Pass**: All planned paths follow conventions.
**Fail**: Non-standard paths or direct writes to creator-managed paths.

### Check 3: Dependency Graph Validity

- No circular dependencies between tasks
- All blockedBy references point to existing tasks
- Critical path identified (longest chain of dependencies)

**Pass**: DAG is valid with no cycles.
**Fail**: Circular dependencies or dangling references.

### Check 4: Risk Assessment Present

For HIGH/EPIC tasks:

- Rollback strategy documented
- Known risks identified
- Performance impact considered (hooks < 100ms)

**Pass**: Risk section present in plan.
**Fail**: Missing risk assessment for HIGH/EPIC task.

### Check 5: Test Strategy Defined

- Each feature task has associated test file path
- Test approach specified (unit, integration, or both)
- TDD order confirmed (tests before implementation)

**Pass**: Test strategy present.
**Fail**: No test strategy for implementation tasks.

## Output Format

```json
{
  "verdict": "PASS",
  "complexity": "HIGH",
  "checks": [
    { "name": "plan-completeness", "passed": true, "details": "8/8 tasks complete" },
    {
      "name": "architecture-compliance",
      "passed": true,
      "details": "All paths follow conventions"
    },
    { "name": "dependency-graph", "passed": true, "details": "DAG valid, critical path: 4 tasks" },
    { "name": "risk-assessment", "passed": true, "details": "Rollback strategy documented" },
    { "name": "test-strategy", "passed": false, "details": "Task 3 missing test file path" }
  ],
  "blockers": ["Task 3 missing test file path"],
  "warnings": []
}
```

## Integration with Router

This gate integrates into `router-decision.md` Step 7 as a pre-implementation check:

1. Router classifies task as HIGH/EPIC
2. Router invokes `Skill({ skill: 'implementation-readiness' })`
3. If verdict is PASS: proceed with agent spawning
4. If verdict is FAIL: return blockers to planner for resolution

Environment variable override: `READINESS_GATE=off` disables the gate.

## Anti-Patterns

- Never skip this gate for HIGH/EPIC tasks to "save time"
- Never auto-pass tasks with missing acceptance criteria
- Never treat warnings as passes — address them before spawning
- Never apply this gate to TRIVIAL tasks — it adds unnecessary overhead
