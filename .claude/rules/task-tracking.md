# Task Tracking

- Call `TaskUpdate(in_progress)` immediately when starting a task.
- Call `TaskUpdate(completed)` only after verifying work is done.
- Never mark completed if tests fail or implementation is partial.
- Call `TaskList()` after completing a task to find the next one.
- Include task IDs in spawn prompts for traceability.
- Use `TaskCreate` for multi-step work; prefer sequential dependencies over parallel.

## Agent-to-Agent Coordination (Structured Metadata)

Pass structured metadata on task completion for handoff: `status`, `progress`, `discoveredFiles`, `keyDecisions`, `blocker`/`blockerType`/`needsFrom`, `summary`, `filesModified`, `outputArtifacts`.

## Conductor Pattern

One orchestrator (master-orchestrator) creates tasks with `addBlockedBy` dependencies. Specialists execute in sequence. Each task unblocks automatically when its dependencies complete. Benefits: clear dependencies, no duplicate work, traceable execution.

## Related References

- `@TASK_TRACKING_GUIDE.md` - Complete TaskUpdate protocol
- `task-management-protocol` skill - Session handoff patterns
