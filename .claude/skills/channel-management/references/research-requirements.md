<!-- Agent: skill-creator | Task: channel-management | Session: 2026-03-24 -->

# Channel Management — Research Requirements

## Research Date

2026-03-24

## Search Summary

Searched VoltAgent/awesome-agent-skills for "channel management", "telegram bot lifecycle", "process tracking" — no matching skill found in the community catalog.

This skill is specific to the agent-studio framework's `channel-manager.cjs` and `terminal-tracker.cjs` CLI tools, which are custom implementations not present in the broader community ecosystem.

## Prior Art: Windows Process Management Patterns

The `channel-manager.cjs` implementation follows established Node.js process management patterns:

- PID tracking via JSON file registry (standard approach for long-running spawned processes)
- PowerShell `Get-Process` for Windows PID liveness checks (`shell: false` for security)
- `terminal-pids.json` as a simple process registry with age-based orphan pruning

## Design Constraints (mapped to hooks/rules/schemas)

### Constraint 1: Idempotency is safety-critical (→ hooks/pre-execute.cjs)

Starting a channel session without checking `isChannelRunning()` first spawns a duplicate Windows Terminal tab with no cleanup path. The pre-execute hook validates that callers are aware of this pattern by requiring an explicit `action` field rather than allowing free-form invocation.

### Constraint 2: Token credential safety (→ rules/channel-management.md)

`TELEGRAM_BOT_TOKEN` must never appear in process argument lists (`process.argv`) or shell commands. The `.env` bootstrap pattern in `channel-manager.cjs` is the correct implementation — this constraint is documented in the rules file to prevent regressions.

### Constraint 3: PowerShell invocation overhead (→ SKILL.md Anti-Patterns)

`isPidAlive()` invokes PowerShell for each liveness check, adding ~200-500ms latency. The skill documents that polling `isChannelRunning()` in a tight loop is an anti-pattern. Health checks should be event-driven (on startup, on cron, on user request) — not continuous polling.

## Non-Goals

- This skill does NOT manage Discord, Slack, or other non-Telegram channel integrations (those require separate plugins configured via `CHANNEL_PLUGINS`)
- This skill does NOT implement cross-platform support — it is Windows-specific (Windows Terminal + PowerShell)
- This skill does NOT provide real-time session log streaming
- This skill does NOT implement automatic restart on crash — that responsibility belongs to a heartbeat cron or `heartbeat-orchestrator`

## Key Files Referenced

- `.claude/tools/cli/channel-manager.cjs` — Core implementation (read in full before modifications)
- `.claude/tools/cli/terminal-tracker.cjs` — PID registry (exports: `registerSpawn`, `listTracked`, `killOrphaned`, `cleanup`)
- `.claude/context/runtime/terminal-pids.json` — Live state file (never edit directly)
