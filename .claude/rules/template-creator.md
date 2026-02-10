# Template Creator Rules

## Core Principles

- Templates standardize patterns for agents, skills, workflows, and code
- Every template MUST have: template file, catalog entry, consuming skill documentation
- Templates use placeholder syntax for substitution
- All templates support progressive disclosure patterns

## Standards

### Template Structure

Templates use `<PLACEHOLDER>` syntax for substitution:

```markdown
# <TITLE>

## Overview

<DESCRIPTION>

## Usage

<USAGE_PATTERN>
```

### Template Types

| Type     | Purpose                  | Example                        |
| -------- | ------------------------ | ------------------------------ |
| Spawn    | Agent spawn prompts      | universal-agent-spawn.md       |
| Artifact | Skill/workflow structure | skill-template.md              |
| Code     | Code patterns            | typescript-service-template.ts |

### File Placement

- Template directory: `.claude/templates/{category}/`
- Catalog: `.claude/context/artifacts/catalogs/template-catalog.md`

## Anti-Patterns

- Templates without placeholders (not reusable)
- Missing catalog entry (invisible template)
- Templates without consuming skill documentation
- No validation of placeholder substitution

## Integration Points

### Related Agents

- `template-creator` agent uses this skill
- All creator agents use templates

### Related Skills

- `skill-creator` - Uses skill templates
- `agent-creator` - Uses agent templates
- `workflow-creator` - Uses workflow templates

### Related Workflows

- `.claude/workflows/creation/ecosystem-creation-workflow.md`

## Post-Creation Checklist

After creating a template, MUST:

- [ ] Create template file with placeholders
- [ ] Add to template-catalog.md
- [ ] Document consuming skills
- [ ] Test placeholder substitution
- [ ] Validate output structure
- [ ] Document template usage pattern
