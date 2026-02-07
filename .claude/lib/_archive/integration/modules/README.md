# Integration Library

This directory contains modules for integrating external systems and registering new capabilities.

## Files

| File                              | Purpose                                                   |
| --------------------------------- | --------------------------------------------------------- |
| `system-registration-handler.cjs` | Handles registration of new agents, skills, and workflows |

## Purpose

The integration library provides the glue between external systems (MCP servers, APIs, tools) and the multi-agent orchestration framework. It handles:

- **System Registration** - Registering new agents, skills, hooks
- **External Integrations** - Connecting to MCP servers, external APIs
- **Capability Discovery** - Finding and indexing available capabilities

## Usage

```javascript
const { SystemRegistrationHandler } = require('./system-registration-handler.cjs');

const handler = new SystemRegistrationHandler();

// Register a new agent
await handler.registerAgent({
  name: 'my-custom-agent',
  category: 'domain',
  definition: agentDefinition,
});

// Register a new skill
await handler.registerSkill({
  name: 'my-custom-skill',
  triggers: ['keyword1', 'keyword2'],
  definition: skillDefinition,
});
```

## Testing

Run tests with:

```bash
node --test .claude/lib/integration/*.test.cjs
```

## Related

- External integration workflow: `.claude/workflows/core/external-integration.md`
- Agent registration: `.claude/agents/`
- Skill registration: `.claude/skills/`
