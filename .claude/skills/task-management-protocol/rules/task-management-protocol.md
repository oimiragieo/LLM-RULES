# task-management-protocol Rules

## Purpose

Protocol for task synchronization, context handoff, and cross-session coordination using Claude Code task tools. Ensures agents properly update tasks with findings and enables seamless work continuation.

## Best Practices

- Always call TaskList() at session start and after completion
- Update task descriptions with discoveries as they happen
- Use structured metadata for context handoff
- Never mark complete without summary metadata
- Check for blocked tasks after completing work

## Integration Points

See SKILL.md for complete documentation.
