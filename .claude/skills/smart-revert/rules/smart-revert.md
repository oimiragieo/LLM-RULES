# smart-revert Rules

## Purpose

Git-aware smart revert for tracks, phases, and tasks. Handles rewritten history, finds related commits, and provides safe rollback with multiple confirmation gates.

## Best Practices

- Always require user confirmation before any destructive action
- Handle ghost commits (rewritten history) gracefully
- Find ALL related commits (implementation + plan updates)
- Present clear execution plan before reverting
- Verify plan state after revert completes

## Integration Points

See SKILL.md for complete documentation.
