# Notification Triggers Research Requirements (2026)

## Core Components

- **Configuration File**: `.claude/context/runtime/notification-triggers.json`
- **Schema Validation**: `notification-triggers.schema.json`
- **Log Output**: `.claude/context/runtime/notifications.jsonl`
- **Event Log**: `.claude/context/runtime/notification-log.jsonl`

## Trigger Configuration Schema

```json
{
  "version": "1.0",
  "triggers": [
    {
      "id": "unique-trigger-id",
      "name": "Human-readable trigger name",
      "description": "What this trigger detects",
      "type": "error|regex|token_threshold|pattern",
      "enabled": true,
      "condition": {
        "pattern": "regex pattern to match",
        "minTokens": 120000,
        "minOccurrences": 3,
        "scope": "session|task|global"
      },
      "actions": [
        {
          "type": "log|alert|spawn_agent|interrupt",
          "target": "agent-name|file-path",
          "message": "Action message template"
        }
      ]
    }
  ]
}
```

## Implementation Patterns

### Pattern Matching

```javascript
// Regex trigger evaluation
const regex = new RegExp(trigger.condition.pattern, 'gi');
const matches = output.match(regex) || [];
if (matches.length >= trigger.condition.minOccurrences) {
  // Execute actions
}
```

### Token Threshold

```javascript
// Token threshold evaluation
const tokenCount = session.tokens.input + session.tokens.output;
if (tokenCount >= trigger.condition.minTokens) {
  // Execute actions
}
```

## Best Practices

1. Set appropriate thresholds to avoid alert fatigue
2. Use specific regex patterns to reduce false positives
3. Order actions by priority (log → alert → spawn → interrupt)
4. Test triggers in non-production environments first
5. Document trigger purposes and expected behaviors

## Source References

- Node.js Events Documentation
- Regex Pattern Best Practices
- Agent Studio Runtime Configuration
