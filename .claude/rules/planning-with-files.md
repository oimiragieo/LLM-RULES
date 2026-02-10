# Planning with Files Rules

## Core Principles

- Use persistent files for multi-step planning (task_plan.md, findings.md, progress.md)
- Files survive context resets and agent handoffs
- Manus-style: plan evolves as work progresses
- Clear separation: plan (what), findings (discovered), progress (done)
- Use for complex tasks spanning 50+ tool calls

## File Structure

### task_plan.md

- **Purpose**: Living plan that evolves with discoveries
- **Contains**: Steps, dependencies, blockers, next actions
- **Update**: When plan changes (new subtasks, reordering, scope changes)

### findings.md

- **Purpose**: Discoveries made during execution
- **Contains**: Patterns found, issues discovered, insights gained
- **Update**: When you learn something new

### progress.md

- **Purpose**: What's been completed with evidence
- **Contains**: Completed steps, verification results, timestamps
- **Update**: After completing each major step

## Standards

- Store files in `.claude/context/tmp/planning/`
- Use markdown for readability
- Include timestamps for all updates
- Cross-reference between files (link findings → plan)
- Clear headers and sections
- Use checkboxes for task tracking

## File Format Templates

### task_plan.md

```markdown
# Task Plan: [Task Name]

**Status**: [In Progress / Blocked / Complete]
**Last Updated**: [ISO timestamp]

## Objective

[Clear, measurable objective]

## Steps

- [ ] Step 1: [Description]
  - Dependencies: [List]
  - Status: [Not started / In progress / Done]
- [ ] Step 2: [Description]

## Blockers

- [Blocker description] - Needs: [What's needed]

## Next Action

[Single immediate next step]
```

### findings.md

```markdown
# Findings: [Task Name]

**Last Updated**: [ISO timestamp]

## Discovery 1 ([Date])

**Context**: [Where/when discovered]
**Finding**: [What was learned]
**Impact**: [How this affects plan]
**Action**: [What changed in plan]
```

### progress.md

```markdown
# Progress: [Task Name]

**Last Updated**: [ISO timestamp]

## Completed: [Step Name] ([Date])

**Duration**: [Time taken]
**Evidence**: [Test output, file diffs, verification]
**Notes**: [Any notes for future work]
```

## When to Use

Use planning-with-files for:

- Multi-phase implementations (4+ phases)
- Research + implementation tasks
- Tasks with uncertain scope
- Work spanning multiple sessions
- Tasks requiring discovery before planning

Don't use for:

- Single-step tasks
- Well-defined tasks with clear plan
- Tasks completing in <20 tool calls

## Anti-Patterns

- Creating files but never updating them
- Duplicating info across files (cross-reference instead)
- Vague progress entries ("worked on X")
- Not updating plan when discoveries change scope
- Forgetting to read files at session start
- Using files for simple linear tasks

## Integration Points

- **Session Handoff**: Reference planning files in handoff
- **Task Management**: Link task metadata to planning files
- **Memory Protocol**: Findings feed into learnings.md
- **Context Compressor**: Compress planning files when context fills
