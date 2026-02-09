# Workflow Creator Rules

## Core Principles

- Workflows orchestrate multi-agent collaboration for complex tasks
- Every workflow MUST have: markdown file (phases/agents/gates), agent assignments
- Workflows follow phased execution (Triage → Design → Implement → Review → Deploy → Document → Reflect)
- All workflows integrate with quality gates and task management

## Standards

### Workflow Structure

```markdown
# {Workflow Name}

## Overview
Purpose and when to use

## Phases
### Phase 1: {Name}
- Agents: [list]
- Inputs: [requirements]
- Outputs: [artifacts]
- Gates: [quality checks]

## Agent Coordination
How agents interact

## Quality Gates
What must pass before advancing
```

### Workflow Types

| Type       | Purpose                   | Example                 |
| ---------- | ------------------------- | ----------------------- |
| Core       | Framework operations      | router-decision.md      |
| Enterprise | Multi-phase development   | feature-development.md  |
| Creation   | Artifact creation         | ecosystem-creation.md   |
| Security   | Security workflows        | security-review.md      |
| Operations | Operational procedures    | incident-response.md    |

### File Placement

- Workflow directory: `.claude/workflows/{category}/`
- Registry: `@ENTERPRISE_WORKFLOWS.md`
- Agent map: `@WORKFLOW_AGENT_MAP.md`

## Anti-Patterns

- Workflows without clear phases
- Missing quality gates
- No agent coordination patterns
- Workflows that duplicate existing orchestration
- Missing phase advance conditions

## Integration Points

### Related Agents

- `workflow-creator` agent uses this skill
- Orchestrators execute workflows
- Specialist agents participate in workflow phases

### Related Skills

- `agent-creator` - Assigns workflows to agents
- `sparc-methodology` - SPARC workflow pattern
- `artifact-integrator` - Post-workflow integration

### Related Workflows

- `.claude/workflows/creation/ecosystem-creation-workflow.md`
- Workflow creation triggers documentation updates

## Post-Creation Checklist

After creating a workflow, MUST:

- [ ] Create workflow markdown file
- [ ] Add to `@ENTERPRISE_WORKFLOWS.md`
- [ ] Add to `@WORKFLOW_AGENT_MAP.md`
- [ ] Document participating agents
- [ ] Define quality gates
- [ ] Test workflow execution
- [ ] Document phase advance conditions
