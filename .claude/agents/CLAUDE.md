# Agents

The agent system contains 119 specialized AI agents organized into 4 tiers. Each agent is a markdown file defining its role, tools, model preference, and behavioral instructions. Agents are spawned by the router via `Task()` — they never run independently.

## Subdirectories

| Directory                                   | Count | Purpose                                                                                                            |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------ |
| [`core/`](core/CLAUDE.md)                   | 10    | Essential agents used in every pipeline — router, planner, developer, QA, architect, etc.                          |
| [`domain/`](domain/CLAUDE.md)               | 68    | Technology-specific specialists — one per language, framework, or domain (python-pro, kubernetes-specialist, etc.) |
| [`orchestrators/`](orchestrators/CLAUDE.md) | 16    | Multi-agent coordinators — domain routers, swarm coordinator, master orchestrator, etc.                            |
| [`specialized/`](specialized/CLAUDE.md)     | 25    | Cross-cutting concern specialists — code-reviewer, security-architect, devops, researcher, etc.                    |

## How Agents Work

- **Definition**: Each `.md` file has YAML frontmatter (`model`, `tools`, `description`) followed by system prompt instructions.
- **Spawning**: Router calls `Task({ subagent_type: 'agent-name', prompt: '...' })`.
- **Registry**: All agents are indexed in `.claude/context/agent-registry.json` (source of truth for routing).
- **Iron Law**: The `developer` agent is the LAST RESORT — always use a specialist if one fits.

## Related

- `.claude/context/agent-registry.json` — Agent lookup registry
- `.claude/docs/@AGENT_ROUTING_TABLE.md` — Full routing matrix
- `.claude/rules/agents.md` — Quick-reference routing rules
