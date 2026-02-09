# Complexity Assessment Rules

## Core Principles

- Accuracy over speed - wrong complexity = wrong workflow = failed implementation
- Be conservative - when in doubt, go higher complexity
- Flag research needs for unfamiliar technologies
- Consider hidden complexity in optional features

## Input Requirements

- Task description with clear scope
- Context about existing system (if modifying)
- User requirements or acceptance criteria
- Technology stack involved

## Output Standards

### Required Output Elements
1. **Workflow Type**: FEATURE, REFACTOR, INVESTIGATION, MIGRATION, or SIMPLE
2. **Complexity Tier**: SIMPLE, STANDARD, COMPLEX, or EPIC
3. **Justification**: Why this tier (file count, service count, integrations, risk)
4. **Recommended Workflow**: Which workflow pattern to use
5. **Validation Depth**: QA level (spot check, standard, comprehensive, multi-phase)
6. **Risk Factors**: Hidden complexity, unknowns, dependencies

### Workflow Types

| Type           | Description                         | Examples                                          |
| -------------- | ----------------------------------- | ------------------------------------------------- |
| FEATURE        | Adding new functionality            | "Add screenshot paste", "Build user dashboard"    |
| REFACTOR       | Replacing existing implementation   | "Migrate auth to JWT", "Refactor cache layer"     |
| INVESTIGATION  | Debugging, root cause analysis      | "Find slow page load cause", "Debug crash"        |
| MIGRATION      | Data migrations, schema changes     | "Migrate to new schema", "Import legacy data"     |
| SIMPLE         | Very small, well-defined changes    | "Fix typo", "Update button color"                 |

### Complexity Tiers

| Tier     | Files   | Services | Integration | Infrastructure | Examples                       |
| -------- | ------- | -------- | ----------- | -------------- | ------------------------------ |
| SIMPLE   | 1-2     | 1        | None        | None           | Typos, colors, text updates    |
| STANDARD | 3-10    | 1-2      | Maybe       | None/Minor     | CRUD endpoints, UI components  |
| COMPLEX  | 10-30   | 2-4      | Yes         | Yes            | Multi-service features, auth   |
| EPIC     | 30+     | 4+       | Multiple    | Major          | Platform migrations, rewrites  |

## Anti-Patterns

| Anti-Pattern                          | Problem                             | Fix                                          |
| ------------------------------------- | ----------------------------------- | -------------------------------------------- |
| Assessing as SIMPLE without file scan | Underestimated complexity           | Scan codebase first, count affected files    |
| Ignoring integrations                 | External dependencies missed        | List all external services/APIs involved     |
| "Quick fix" bias                      | User's perception != actual work    | Assess objectively, not based on user words  |
| Skipping research flag                | Unknown tech treated as known       | Flag unfamiliar technologies for research    |
| Ignoring optional features            | "Optional" features add complexity  | Include optional features in complexity calc |
| Not considering rollback              | No recovery plan for risky changes  | Flag risky changes as higher complexity      |

## Integration Points

### Agents Using This Skill
- **planner** (primary): Determines workflow before creating plan
- **router**: Determines which agent to spawn based on complexity
- **master-orchestrator**: Selects phases based on complexity tier

### Related Skills
- **plan-generator**: Uses complexity tier to determine phase count
- **spec-gathering**: Provides input for complexity assessment
- **architecture-review**: Validates complexity assessment for architecture changes
- **task-breakdown**: Breaks COMPLEX/EPIC into smaller units

### Workflows
- **router-decision.md**: Uses complexity to determine routing strategy
- **enterprise-workflow.md**: Uses complexity tier to determine phase skipping
- **feature-development-workflow.md**: Uses complexity for validation depth

## Validation Depth Guidelines

| Complexity | Validation Depth | What This Means                                           |
| ---------- | ---------------- | --------------------------------------------------------- |
| SIMPLE     | Spot check       | Manual test, basic verification                           |
| STANDARD   | Standard         | Unit tests, integration tests, QA review                  |
| COMPLEX    | Comprehensive    | Full test suite, security review, performance testing     |
| EPIC       | Multi-phase      | Staged rollout, canary deployment, extensive monitoring   |

## Assessment Checklist

Before finalizing complexity assessment, verify:
- [ ] Counted affected files (not guessed)
- [ ] Identified all services involved
- [ ] Listed all external integrations
- [ ] Flagged unfamiliar technologies
- [ ] Considered optional features
- [ ] Assessed infrastructure changes
- [ ] Evaluated rollback complexity
- [ ] Checked for hidden dependencies
- [ ] Conservative estimate (when in doubt, go higher)

## Iron Law

```
NO PLANNING WITHOUT COMPLEXITY ASSESSMENT FOR NEW TASKS
```

New tasks must be assessed before selecting a workflow approach. Wrong complexity = wrong workflow = failed implementation.

## Related References
- `.claude/skills/complexity-assessment/SKILL.md` - Full skill documentation
- `.claude/lib/routing/complexity-classifier.cjs` - Automated classifier
- `enterprise-workflow.md` - Phase selection based on complexity
