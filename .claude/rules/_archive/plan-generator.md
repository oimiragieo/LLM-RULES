---
paths:
  - .claude/skills/plan-generator/**
---

# Plan Generator Rules

## Core Principles

- Every task MUST have an executable command (no wishes, only actions)
- Plans are templates for execution, not documentation
- Break complexity into <=7 phases, <=7 tasks per phase
- All verification and rollback must be automated

## Input Requirements

- Clear objectives or requirements
- Target scope (feature, refactor, migration, architecture)
- Complexity level (from complexity-assessment skill)
- Specialist input (analyst, PM, architect as needed)

## Output Standards

### Mandatory Task Elements

Every task must include:

1. Checkbox (`- [ ]`) for progress tracking
2. ID in N.M format for reference
3. Time estimate (`(~X min)`)
4. **Command**: Actual executable shell/Task command
5. **Verify**: Command to confirm success
6. **Rollback**: Command to undo (if destructive)
7. Parallel marker (`[⚡ parallel OK]`) if concurrent execution allowed

### Mandatory Phase Elements

Every phase must include:

1. Dependencies (phase numbers or "None")
2. Parallel OK (Yes/No/Partial)
3. Error handling section (what to do if tasks fail)
4. Verification gate (commands to run before proceeding)

### Mandatory Plan Elements

Every plan must include:

1. Executive summary (2-3 sentences)
2. Objectives (clear, measurable goals)
3. Phases with tasks (structured as above)
4. Risks table (Risk, Impact, Mitigation, Rollback)
5. Timeline summary (Phase, Tasks, Est. Time, Parallel?)

## Anti-Patterns

| Anti-Pattern                | Problem                        | Fix                                  |
| --------------------------- | ------------------------------ | ------------------------------------ |
| "Install X" without command | Not executable                 | Add exact command: `npm install X`   |
| "Verify Y works"            | Vague                          | Add: `npm test \| grep PASS`         |
| "Update Z"                  | No file/change specified       | Add exact `Edit` or `sed` command    |
| No time estimates           | Can't track progress           | Add `(~X min)` to every task         |
| No rollback                 | Can't recover from failure     | Add rollback command for destructive |
| Phases depend without order | Unclear execution sequence     | Specify dependencies explicitly      |
| >7 tasks in phase           | Too complex to track           | Split into sub-phases                |
| No verification gates       | Can proceed with failed phases | Add command-based verification gates |

## Integration Points

### Agents Using This Skill

- **planner** (primary): Generates plans from requirements
- **master-orchestrator**: Creates multi-phase execution plans
- **architect**: Creates architecture implementation plans

### Related Skills

- **complexity-assessment**: Determines plan complexity level
- **task-breakdown**: Breaks large tasks into atomic units
- **template-renderer**: Formats plans using templates
- **spec-gathering**: Gathers requirements before planning
- **architecture-review**: Reviews architectural plans

### Workflows

- **feature-development-workflow.md**: Uses plan-generator in Design phase
- **enterprise-workflow.md**: Uses plan-generator for phased execution
- **migration-workflow.md**: Uses plan-generator for migration plans

## Quality Checklist

Before finalizing any plan, verify:

- [ ] Can I copy-paste every command and run it?
- [ ] Does every verify command have clear pass/fail output?
- [ ] Is there a rollback for every destructive operation?
- [ ] Are time estimates realistic and granular?
- [ ] Are parallel tasks marked with ⚡?
- [ ] Does every phase have error handling?
- [ ] Does every phase have verification gates?
- [ ] Are dependencies between phases explicit?
- [ ] Is total plan duration <= 4 hours? (If not, split into sub-plans)

## Iron Laws

### 1. The Executable Command Law

```
EVERY TASK MUST HAVE AN EXECUTABLE COMMAND
```

A task without a command is not a task - it's a wish.

### 2. The Verification Law

```
EVERY TASK MUST HAVE A VERIFICATION COMMAND
```

Without verification, you can't confirm success.

### 3. The Rollback Law

```
EVERY DESTRUCTIVE OPERATION MUST HAVE A ROLLBACK
```

Without rollback, you can't recover from failures.

### 4. The Complexity Law

```
<=7 PHASES, <=7 TASKS PER PHASE
```

More than 7 = cognitive overload = split the plan.

## Related References

- `.claude/skills/plan-generator/SKILL.md` - Full skill documentation
- `.claude/workflows/core/router-decision.md` - When to spawn planner
- `complexity-assessment` skill - Determines plan complexity
