# Observability and Debugging

This guide explains where to find runtime signals and how to enable additional diagnostics.

## How to get debug output

- `LOG_LEVEL=debug` enables verbose structured logging (JSONL to stderr).
- `DEBUG_HOOKS=true` enables hook debugLog output.

## Where to look when something breaks

- Hook timing metrics: `.claude/context/metrics/hook-metrics.jsonl`
- Hook errors: `.claude/context/metrics/error-metrics.jsonl`
- Spawn events: `.claude/context/metrics/spawn-log.jsonl`
- Event bus sink: `.claude/context/runtime/event-bus.jsonl` (when `EVENT_BUS_SINK` is not `off`)
- Worker status: `.claude/context/metrics/worker.jsonl` and `.claude/context/runtime/worker-heartbeat.json`
- Memory metrics: `.claude/context/memory/metrics/` and `pnpm run memory:dashboard`

## Correlation notes

The host does not provide a stable cross-hook correlation id. Use `session_id`, `tool_name`, and timestamps to correlate PreToolUse and PostToolUse signals.

## Router vs worker vs agents

- Router: the main chat agent that routes to TaskList/Task; does not run maintenance.
- Subagents: spawned by Task; run in separate contexts.
- Worker: optional headless loop (`WORKER_ENABLED=1`) that runs maintenance/indexing/reflection.

## Hook execution order

Hooks run in the order listed in `.claude/settings.json`. If an earlier hook exits non-zero, later hooks may not run. Keep monitoring hooks early when possible.

## Reflection reminder (Step 0)

Reflections are reminder-driven. If Step 0 is skipped, pending reflections do not run. Check `.claude/context/runtime/reflection-reminder.txt` and `reflection-spawn-request.json`, or run the reflection queue processor manually.
