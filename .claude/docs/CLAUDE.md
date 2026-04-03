# Docs

Reference documentation loaded on-demand by the router and agents. Files prefixed with `@` are key references linked from the main CLAUDE.md. Non-prefixed files provide detailed topic coverage.

## Key References (@ Files)

| File                       | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `@AGENT_ROUTING_TABLE.md`  | Complete 119-agent routing matrix — which agent handles which task type  |
| `@CREATOR_SKILLS_TABLE.md` | Creator skill catalog — skill-creator, agent-creator, hook-creator, etc. |
| `@DIRECTORY_STRUCTURE.md`  | Canonical directory layout reference                                     |
| `@ENFORCEMENT_HOOKS.md`    | Hook enforcement documentation — which hooks block what                  |
| `@ENTERPRISE_WORKFLOWS.md` | Multi-phase enterprise pipeline documentation                            |
| `@ENVIRONMENT_CONFIG.md`   | Environment variables and configuration reference                        |
| `@EVOLUTION_WORKFLOW.md`   | Framework evolution workflow documentation                               |
| `@HOOK_AGENT_MAP.md`       | Mapping of hooks to the agents they affect                               |
| `@MEMORY_PROTOCOL.md`      | STM/MTM/LTM memory tier protocol                                         |
| `@MODEL_SELECTION.md`      | Model selection guide — when to use haiku/sonnet/opus                    |
| `@ROUTER_OPERATIONS.md`    | Router operational procedures and gap protocol                           |
| `@SKILL_CATALOG_TABLE.md`  | Complete skill catalog with categories                                   |
| `@SKILL_USAGE_GUIDE.md`    | How to invoke and use skills                                             |
| `@TASK_TRACKING_GUIDE.md`  | TaskUpdate protocol and lifecycle                                        |
| `@TOOL_REFERENCE.md`       | Available tools reference                                                |
| `@WORKFLOW_AGENT_MAP.md`   | Mapping of workflows to participating agents                             |

## Topic Documentation

| File                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `AGENT_ROUTING_CARD.md`        | Quick-reference routing decision card                            |
| `AGENT_TIERS.md`               | Agent tier definitions (core, specialized, domain, orchestrator) |
| `ARCHITECTURE.md`              | System architecture overview                                     |
| `CI_GOVERNANCE.md`             | CI/CD governance policies                                        |
| `CODE_INDEXING_DESIGN.md`      | Code search system design (BM25 + semantic)                      |
| `CONFIGURATION.md`             | Configuration system documentation                               |
| `DEVELOPER_ONBOARDING.md`      | New developer onboarding guide                                   |
| `DEVELOPER_WORKFLOW.md`        | Day-to-day development workflow                                  |
| `FILE_PLACEMENT_RULES.md`      | Canonical file placement specification                           |
| `GETTING_STARTED.md`           | Quick start guide                                                |
| `HEARTBEAT_STATE_CONTRACTS.md` | Heartbeat loop state contracts                                   |
| `HOOKS_REFERENCE.md`           | Detailed hooks reference                                         |
| `LOCK_ORDER.md`                | File lock ordering to prevent deadlocks                          |
| `MEMORY_SYSTEM.md`             | Memory system deep-dive                                          |
| `SELF_EVOLUTION.md`            | Self-evolution system documentation                              |
| `SKILLCATALOG_USAGE.md`        | Skill catalog usage patterns                                     |
| `SUBAGENT_MEMORY_CONTRACT.md`  | Memory contract for spawned subagents                            |
| `TELEGRAM_ARCHITECTURE.md`     | Telegram integration architecture                                |
| `TOOL_STUB_POLICY.md`          | Tool stubbing policies for testing                               |
| `TROUBLESHOOTING.md`           | Common issues and solutions                                      |
| `skill-catalog.md`             | Alternative skill catalog format                                 |

## Subdirectories

| Directory          | Purpose                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `CLAUDE_CLI_DOCS/` | Claude Code CLI documentation and references                                             |
| `reference-rules/` | Reference rule files, including `frameworks/` subdirectory with framework-specific rules |
