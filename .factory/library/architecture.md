# Architecture

Key architectural patterns and decisions for agent-studio.

**What belongs here:** Architectural decisions, module boundaries, integration patterns, routing architecture.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Codebase Structure
- `.claude/` — Main codebase: agents, skills, hooks, lib, tools, workflows, schemas, config, context
- `tests/` — Test suites organized by area (hooks/, lib/, skills/, agents/, audit/, commands/)
- `scripts/` — Build, validation, and utility scripts

## Key Subsystems
- **Routing:** Unified pipeline in `user-prompt-unified.core.cjs` (2,216 lines). Hierarchical routing via 9 domain sub-routers.
- **Creators:** skill-creator and agent-creator in `.claude/skills/`, with SKILL.md + docs/ + scripts/ structure.
- **Reflection:** RECE loop (Reflect-Evaluate-Correct-Execute) via 9 hook files + 1 agent + 2 workflows.
- **Memory:** Session handoff, learnings, patterns, gotchas, integration queue.
- **A2A:** Express HTTP server in `.claude/lib/a2a/` with JSON-RPC 2.0, SSE, SQLite persistence.
- **Telegram:** MCP relay server + auto-start hook + 10-command bot.

## Hook Contract
All hooks must:
- Read input from stdin (JSON)
- Write output to stdout (JSON)
- Use `safeParseJSON` from `.claude/lib/utils/safe-json.cjs`
- Exit promptly (hooks that block are fatal)
