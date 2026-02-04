# Agents Library

## Agent config (agent-config.cjs)

- **Config:** `.claude/config/agent-config.json`
- **Schema:** `.claude/schemas/agent-config.schema.json`
- **Purpose:** Per-agent defaults for allowed tools and thinking level.
- **Used by:** Spawn prompt tool enrichment when the registry has no requiredTools.

Exports:
- `getAgentConfig(agentType)`
- `getDefaultTools(agentType)`
- `getDefaultThinkingLevel(agentType)`
- `getThinkingBudget(level)`
- `getPhaseForAgent(agentType)`
- `listAgentTypes()`

See `.claude/docs/AGENT_CONFIG_AND_QA_REFERENCE.md` for the full reference.
