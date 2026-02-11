---
paths:
  - .claude/skills/artifact-integrator/**
---

# Artifact Integrator Rules

## Core Principles

- Never create artifacts without verifying integration status
- All artifacts must have consumers (agents/workflows/commands)
- Orphaned artifacts = invisible artifacts = wasted work
- Integration analysis is non-blocking but MUST be queued
- Companion artifacts follow must-have/should-have/nice-to-have tiers

## Integration Tiers

### Must-Have (Blocking)

- Catalog/registry entry (skill-catalog, agent-registry, etc.)
- At least one consumer assigned (agent, workflow, or command)
- Routing keywords for discovery (agents only)
- Valid schema validation (if applicable)

### Should-Have (Warning)

- Documentation reference in @files or CLAUDE.md
- Enforcement mechanism (hooks only)
- Usage examples in consumers
- Related artifact cross-references

### Nice-to-Have (Informational)

- Test coverage for the artifact
- Memory updates (learnings/decisions)
- Related templates or examples
- Visual diagrams or flowcharts

## Post-Creation Protocol

After ANY artifact creation (skill/agent/hook/workflow/template/schema):

1. Check catalog/registry for entry
2. Verify artifact-graph.json shows relationships
3. Confirm at least one consumer exists
4. Queue integration gaps for Router Step 0.5

## Standards

- Use `artifact-integrator` skill for deep analysis
- Check `integration-queue.jsonl` before starting new work
- Update `artifact-graph.json` companion matrix
- Follow ecosystem-creation-workflow.md lifecycle
- Record integration issues in memory/issues.md

## Anti-Patterns

- Creating artifacts without consumer assignment
- Skipping catalog registration "just this once"
- Assuming "someone will integrate it later"
- Ignoring integration-queue.jsonl entries
- Creating batch artifacts without orchestrator coordination

## Integration Points

- **Router**: Checks integration queue at Step 0.5
- **Creators**: Invoke artifact-integrator after creation
- **Evolution-orchestrator**: Coordinates batch creation with integration
- **Reflection-agent**: Reviews integration completeness
