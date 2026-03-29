# notification-triggers Rules

## Purpose

Configurable regex-based alert system for detecting patterns in tool calls and session activity. Supports error triggers, content regex matching, token threshold triggers, and pattern detection with configurable actions.

## Best Practices

- Follow existing project patterns
- Document all outputs clearly
- Handle errors gracefully
- Configure triggers in `.claude/context/runtime/notification-triggers.json`
- Use appropriate action types: log, alert, spawn_agent, interrupt
- Set appropriate thresholds to avoid alert fatigue

## Trigger Types

- **error**: Detect exception patterns in tool output
- **regex**: Match patterns against tool stdout/stderr
- **token_threshold**: Alert when token usage exceeds limits
- **pattern**: Count regex occurrences before triggering

## Action Types

- **log**: Write to notifications.jsonl
- **alert**: Display in session output
- **spawn_agent**: Create Task() to handle notification
- **interrupt**: Pause execution for user input

## Integration Points

See SKILL.md for complete documentation.
