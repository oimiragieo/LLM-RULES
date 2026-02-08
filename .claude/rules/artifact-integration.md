# Artifact Integration

Verify all created artifacts are integrated with the framework. Artifacts created without integration are invisible and cannot be discovered by agents or users.

## Must-Have Integrations (Blocking)

| Artifact Type | Required Integration                        |
| ------------- | ------------------------------------------- |
| Skill         | Catalog entry + agent assignment            |
| Agent         | Registry + routing keywords + CLAUDE.md     |
| Hook          | settings.json + @ENFORCEMENT_HOOKS.md       |
| Workflow      | Registry + @WORKFLOW_AGENT_MAP.md           |
| Template      | Catalog entry in template-catalog.md        |
| Schema        | Catalog entry in schema-catalog.md          |

## Integration Tiers

**Must-Have (blocking):**
- Catalog/registry entry
- At least one consumer (agent/workflow/command)

**Should-Have (warning):**
- Documentation reference (@files)
- Enforcement mechanism (if applicable)

**Nice-to-Have (informational):**
- Test coverage
- Memory updates (learnings/decisions)
- Related templates/examples

## Post-Creation Protocol

After creating ANY artifact:

- Check catalog/registry for entry (verify it appears)
- Verify artifact-graph.json shows integration status
- Use artifact-integrator skill if integration status unclear
- Check integration-queue.jsonl before starting new work

## Cross-Creator Triggering

When creating one artifact reveals need for another:

- Document the gap in task metadata
- Queue it for artifact-integrator
- Do not ignore missing dependencies

Missing integrations = 70% orphan rate (current measurement).
