# Hooks

Pre/Post tool-use enforcement scripts that run automatically before or after Claude Code tool calls. Hooks are `.cjs` files registered in `.claude/settings.json` under `hooks.PreToolUse` and `hooks.PostToolUse`. They exit `0` (allow), `2` (block), or `1` (error).

## Subdirectories

| Directory | Hooks | Purpose |
|-----------|-------|---------|
| `routing/` | 44 | **Largest category.** Routing guards, tool lockdown, creator guards, specialist-first enforcement. The backbone of the router-first architecture. |
| `safety/` | 14 | Security validators — bash command auditing, JSON parse safety, shell injection prevention, prototype pollution checks. Includes `validators/` subdirectory. |
| `reflection/` | 10 | Reflection system — triggers post-task reflection, scores outputs, manages reflection queue. |
| `validation/` | 9 | Input/output validation — schema checks, contract enforcement, parameter validation. |
| `session/` | 9 | Session lifecycle — gap detection, handoff, context management, session state tracking. |
| `monitoring/` | 8 | Observability — metrics collection, health checks, SLO monitoring, alert triggers. |
| `workflow/` | 5 | Workflow orchestration — phase gates, approval checks, workflow state management. |
| `lifecycle/` | 4 | Agent lifecycle — spawn tracking, completion validation, cleanup triggers. |
| `evolution/` | 4 | Framework evolution — artifact creation gates, evolution queue processing. |
| `metrics/` | 3 | Performance metrics — token counting, latency tracking, cost estimation. |
| `channels/` | 1 | Channel daemon launcher — `telegram-start.cjs` spawns the background Telegram daemon. Old VBScript/BAT system archived. |
| `startup/` | 2 | Session startup — initialization checks, preflight validation. |
| `a2a/` | 2 | Agent-to-agent protocol — A2A server hooks, inter-agent communication. |
| `quality/` | 1 | Code quality gates — lint/format enforcement. |
| `memory/` | 1 | Memory management — consolidation triggers, bloat detection. |
| `cleanup/` | 1 | Post-task cleanup — temp file removal, worktree pruning. |
| `benchmarks/` | 0 | Performance benchmarking (placeholder). |

## Key Hooks

- **`routing/routing-guard.cjs`** — Enforces specialist-first routing and tool lockdown.
- **`routing/unified-creator-guard.cjs`** — Blocks direct writes to creator paths (skills, agents, hooks, workflows).
- **`safety/bash-pretool-bundle.cjs`** — Audits bash commands against allowlist before execution.
- **`reflection/reflection-trigger.cjs`** — Queues reflection after task completion.

## Configuration

Hooks are registered in `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node .claude/hooks/safety/bash-pretool-bundle.cjs" }] }],
    "PostToolUse": [...]
  }
}
```
