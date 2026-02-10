# Agent Creator Rules

## Core Principles

- Agents are autonomous specialists with defined roles
- Every agent MUST have: markdown file (identity/capabilities), assigned skills, routing keywords
- Agents follow agent-type classification (core/domain/specialized/orchestrator)
- All agents integrate with Memory Protocol and TaskUpdate

## Standards

### Agent File Structure

```markdown
---
name: { agent-name }
type: { core|domain|specialized|orchestrator }
model: { haiku|sonnet|opus }
skills: [list-of-skills]
---

# {Agent Name}

<identity>Role description</identity>
<capabilities>What agent does</capabilities>
<instructions>How agent operates</instructions>
<workflow>Step-by-step process</workflow>

## Memory Protocol (MANDATORY)

[Standard memory protocol]
```

### Agent Types

| Type         | Purpose                  | Model  | Example            |
| ------------ | ------------------------ | ------ | ------------------ |
| core         | Framework infrastructure | sonnet | router, planner    |
| domain       | Technology specialists   | sonnet | typescript-expert  |
| specialized  | Niche expertise          | opus   | security-architect |
| orchestrator | Multi-agent coordination | opus   | master-orch        |

### File Placement

- Agent directory: `.claude/agents/{type}/{agent-name}.md`
- Registry: `.claude/context/agent-registry.json`
- Routing table: `.claude/lib/routing/routing-table.cjs`

## Anti-Patterns

- Generic "do everything" agents
- Agents without assigned skills
- Missing routing keywords (agents invisible to router)
- Agents duplicating existing specialists
- Orchestrators without `Task` tool

## Integration Points

### Related Agents

- `agent-creator` uses this skill
- `router` routes to created agents
- Orchestrators coordinate multiple agents

### Related Skills

- `skill-creator` - Creates skills for agents
- `research-synthesis` - Research before agent creation
- `artifact-integrator` - Post-creation integration

### Related Workflows

- `.claude/workflows/creation/ecosystem-creation-workflow.md`
- Agent creation triggers companion checks (skills, routing, registry)

## Post-Creation Checklist

After creating an agent, MUST:

- [ ] Create agent markdown file
- [ ] Update agent-registry.json
- [ ] Add routing keywords to routing-table.cjs
- [ ] Assign at least 3 relevant skills
- [ ] Update CLAUDE.md routing table (if new category)
- [ ] Test agent spawn with `Task({ subagent_type: '{agent-name}' })`
- [ ] Document in @AGENT_ROUTING_TABLE.md
