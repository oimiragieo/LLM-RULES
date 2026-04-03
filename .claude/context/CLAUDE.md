# Context

Runtime data, artifacts, and state files generated during agent operation. This directory is the "working memory" of the framework — it stores everything agents produce, reference, and consume between sessions.

## Subdirectories

| Directory       | Purpose                                                                                                                                                                                                                                                       | Persistence       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `artifacts/`    | Generated deliverables — analysis reports, research reports, specs, diagrams, validation contracts, audit logs, error summaries. Organized by type in subdirectories.                                                                                         | Long-lived        |
| `memory/`       | **Structured memory system** — STM (short-term), MTM (medium-term), LTM (long-term) tiers. Also contains `learnings.md`, `decisions.md`, `issues.md`, named memories, audit logs, and the consolidation queue.                                                | Permanent         |
| `runtime/`      | **Transient session state** — reflection queue (`reflection-spawn-request.json`), session gap log, stale tasks, heartbeat reminders, pipeline obligations. Cleared between sessions via `reset-context.cjs`. Also has `quarantine/` for suspicious artifacts. | Session-scoped    |
| `code-index/`   | Code search index — Merkle tree hashes, metadata, embedding vectors. Rebuilt by `pnpm search:code`.                                                                                                                                                           | Rebuilt on demand |
| `data/`         | Persistent data stores — LanceDB vector databases, SQLite indexes, code index lance files.                                                                                                                                                                    | Long-lived        |
| `config/`       | Runtime configuration overrides (distinct from `.claude/config/` which holds design-time config).                                                                                                                                                             | Session-scoped    |
| `metrics/`      | Performance metrics — token usage, latency tracking, cost estimation, SLO measurements.                                                                                                                                                                       | Accumulates       |
| `reports/`      | Operational reports organized by domain — `architecture/`, `backend/`, `devops/`, `docs/`, `ecosystem-audit/`, `qa/`, `reflections/`, `security/`, `stakeholder-updates/`.                                                                                    | Long-lived        |
| `logs/`         | Session and operation logs.                                                                                                                                                                                                                                   | Accumulates       |
| `sessions/`     | Session state snapshots for recovery and handoff.                                                                                                                                                                                                             | Session-scoped    |
| `backups/`      | Configuration backups (e.g., `env/` for .env file backups).                                                                                                                                                                                                   | Long-lived        |
| `self-healing/` | Self-healing system state — known failure patterns and auto-recovery records.                                                                                                                                                                                 | Long-lived        |
| `teams/`        | Multi-agent team state for swarm/party coordination.                                                                                                                                                                                                          | Session-scoped    |
| `test-results/` | Test execution results and coverage reports.                                                                                                                                                                                                                  | Session-scoped    |
| `tmp/`          | Temporary files — council workspaces, debug artifacts. Cleaned up between sessions.                                                                                                                                                                           | Ephemeral         |
| `workflows/`    | Workflow execution state — phase progress, approvals, completion status.                                                                                                                                                                                      | Session-scoped    |

## Memory Tiers (memory/)

| Tier    | Directory         | Purpose                                                  |
| ------- | ----------------- | -------------------------------------------------------- |
| STM     | `memory/stm/`     | Short-term: current session context, recent tool calls   |
| MTM     | `memory/mtm/`     | Medium-term: cross-session patterns, recent learnings    |
| LTM     | `memory/ltm/`     | Long-term: persistent knowledge, architectural decisions |
| Named   | `memory/named/`   | Named memory entries keyed by topic                      |
| Archive | `memory/archive/` | Expired memories moved to cold storage                   |

## Key Files

| File                                    | Purpose                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `runtime/reflection-spawn-request.json` | Queue of pending reflection requests — processed at session start                      |
| `runtime/session-gap-log.jsonl`         | Log of deviations, gaps, and cleanup events                                            |
| `runtime/heartbeat-reminder.txt`        | Trigger for heartbeat-orchestrator                                                     |
| `memory/learnings.md`                   | Accumulated learnings from agent work                                                  |
| `memory/decisions.md`                   | Architectural decisions log                                                            |
| `memory/issues.md`                      | Known issues and blockers                                                              |
| `agent-registry.json`                   | **Master agent registry** — source of truth for all 119 agents (lives at context root) |
