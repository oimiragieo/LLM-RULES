# Skill Creator Rules

## Core Principles

- Skills are reusable behavioral modules for agents
- Every skill MUST have: SKILL.md (identity), rules, schema, command
- Skills follow progressive disclosure (basic → advanced)
- All skills integrate with Memory Protocol (mandatory)

## Standards

### SKILL.md Structure

```markdown
# {Skill Name}

<identity>One-line description</identity>
<capabilities>Bullet list of what skill does</capabilities>
<instructions>Step-by-step execution process</instructions>
<examples>Usage examples</examples>
<best_practices>Do/don't guidelines</best_practices>

## Memory Protocol (MANDATORY)
[Standard memory protocol section]
```

### File Placement

- Skill directory: `.claude/skills/{skill-name}/`
- Main file: `SKILL.md`
- Rules: `.claude/rules/{skill-name}.md`
- Schema: `.claude/schemas/skill-{skill-name}-output.schema.json`
- Command: `.claude/commands/{skill-name}.md`

### Naming Conventions

- Skill names: lowercase kebab-case
- Single-purpose and focused
- Verbs for action skills (debugging, planning)
- Nouns for domain skills (typescript-expert, security-architect)

## Anti-Patterns

- Generic "do everything" skills
- Skills without clear execution process
- Missing memory protocol integration
- No progressive disclosure (dumping all details upfront)
- Skills that duplicate agent responsibilities

## Integration Points

### Related Agents

- `skill-creator` agent uses this skill
- `agent-creator` assigns skills to agents
- `developer`, `qa`, `architect` invoke skills via `Skill()` tool

### Related Skills

- `agent-creator` - Creates agents that use skills
- `template-creator` - Creates skill templates
- `schema-creator` - Creates skill output schemas

### Related Workflows

- `.claude/workflows/creation/ecosystem-creation-workflow.md` - Complete artifact lifecycle
- Skill creation triggers companion checks (hooks, commands, schemas)

## Post-Creation Checklist

After creating a skill, MUST:

- [ ] Create rules file (`.claude/rules/{skill-name}.md`)
- [ ] Create schema (`.claude/schemas/skill-{skill-name}-output.schema.json`)
- [ ] Create command (`.claude/commands/{skill-name}.md`)
- [ ] Update skill catalog (`.claude/context/artifacts/catalogs/skill-catalog.md`)
- [ ] Assign to at least one agent
- [ ] Add CLAUDE.md reference (if routing keyword applies)
- [ ] Test skill invocation with `Skill({ skill: '{skill-name}' })`
