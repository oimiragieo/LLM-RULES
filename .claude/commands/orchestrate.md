---
description: Sequential agent workflow for complex tasks
---

# Orchestrate Command

Sequential agent workflow for complex tasks.

## Usage

`/orchestrate [workflow-type] [task-description]`

## Workflow Types

### feature

Full feature implementation workflow:

```
planner -> developer -> code-reviewer -> security-architect
```

### bugfix

Bug investigation and fix workflow:

```
researcher -> developer -> code-reviewer
```

### refactor

Safe refactoring workflow:

```
architect -> code-reviewer -> developer
```

### security

Security-focused review:

```
security-architect -> code-reviewer -> architect
```

## Execution Pattern

For each agent in the workflow:

1. **Invoke agent** with context from previous agent
2. **Collect output** as structured handoff document
3. **Pass to next agent** in chain
4. **Aggregate results** into final report

## Handoff Document Format

Between agents, create handoff document:

```markdown
## HANDOFF: [previous-agent] -> [next-agent]

### Context

[Summary of what was done]

### Findings

[Key discoveries or decisions]

### Files Modified

[List of files touched]

### Open Questions

[Unresolved items for next agent]

### Recommendations

[Suggested next steps]
```

## Example: Feature Workflow

```
/orchestrate feature "Add user authentication"
```

Executes:

1. **Planner Agent**
   - Analyzes requirements
   - Creates implementation plan
   - Identifies dependencies
   - Output: `HANDOFF: planner -> developer`
2. **Developer Agent**
   - Reads planner handoff
   - Implements feature (TDD)
   - Output: `HANDOFF: developer -> code-reviewer`
3. **Code Reviewer Agent**
   - Reviews implementation
   - Checks for issues
   - Suggests improvements
   - Output: `HANDOFF: code-reviewer -> security-architect`
4. **Security Architect Agent**
   - Security audit
   - Vulnerability check
   - Final approval
   - Output: Final Report

## Final Report Format

```
ORCHESTRATION REPORT
====================
Workflow: feature
Task: Add user authentication
Agents: planner -> developer -> code-reviewer -> security-architect

SUMMARY
-------
[One paragraph summary]

AGENT OUTPUTS
-------------
Planner: [summary]
Developer: [summary]
Code Reviewer: [summary]
Security Architect: [summary]

FILES CHANGED
-------------
[List all files modified]

TEST RESULTS
------------
[Test pass/fail summary]

SECURITY STATUS
---------------
[Security findings]

RECOMMENDATION
--------------
[SHIP / NEEDS WORK / BLOCKED]
```

## Parallel Execution

For independent checks, run agents in parallel:

```markdown
### Parallel Phase

Run simultaneously:

- code-reviewer (quality)
- security-architect (security)
- architect (design)

### Merge Results

Combine outputs into single report
```

## Arguments

$ARGUMENTS:

- `feature <description>` - Full feature workflow
- `bugfix <description>` - Bug fix workflow
- `refactor <description>` - Refactoring workflow
- `security <description>` - Security review workflow
- `custom <agents> <description>` - Custom agent sequence

## Custom Workflow Example

```
/orchestrate custom "architect,developer,code-reviewer" "Redesign caching layer"
```

## Tips

1. **Start with planner** for complex features
2. **Always include code-reviewer** before merge
3. **Use security-architect** for auth/payment/PII
4. **Keep handoffs concise** - focus on what next agent needs
5. **Run verification** between agents if needed
