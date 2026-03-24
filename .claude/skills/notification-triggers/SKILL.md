---
name: notification-triggers
description: Configurable regex-based alert system for detecting patterns in tool calls and session activity. Supports error triggers, content regex matching, token threshold triggers, and pattern detection with configurable actions.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash, Grep, Write, TaskUpdate]

verified: true
lastVerifiedAt: 2026-03-23T23:18:08.049Z
best_practices:
  - Follow existing project patterns
  - Document all outputs clearly
  - Handle errors gracefully
error_handling: graceful
streaming: supported
---

# Notification Triggers

<identity>
Notification Triggers Skill - Configurable regex-based alert system for detecting patterns in tool calls and session activity. Supports error triggers, content regex matching, token threshold triggers, and pattern detection with configurable actions.
</identity>

<capabilities>
- Notification Triggers primary function
- Integration with agent ecosystem
- Standardized output generation
</capabilities>

<instructions>
<execution_process>

### Step 1: Gather Context

Read relevant files and understand requirements

### Step 2: Execute

Perform the skill's main function using available tools

### Step 3: Output

Return results and save artifacts if applicable

</execution_process>

<best_practices>

1. **Follow existing project patterns**: Follow this practice for best results
2. **Document all outputs clearly**: Follow this practice for best results
3. **Handle errors gracefully**: Follow this practice for best results

</best_practices>
</instructions>

<examples>
<usage_example>
**Example Commands**:

```bash
# Invoke this skill
/notification-triggers [arguments]

# Or run the script directly
node .claude/skills/notification-triggers/scripts/main.cjs --help
```

</usage_example>
</examples>

## Trigger Configuration Schema

Notification triggers are defined in `.claude/context/runtime/notification-triggers.json`:

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

**Condition Fields:**

- `pattern` — JavaScript RegExp (error/regex triggers)
- `minTokens` — Token threshold for alert (token_threshold trigger)
- `minOccurrences` — Pattern match count before triggering (pattern trigger)
- `scope` — Where to evaluate: current session, task, or cumulative

**Action Types:**

- `log` — Write to `.claude/context/runtime/notifications.jsonl`
- `alert` — Display alert in session output
- `spawn_agent` — Create Task() to handle the notification
- `interrupt` — Pause execution for user input

## Trigger Evaluation Workflow

**Step 1: Load Configuration**

1. Read `.claude/context/runtime/notification-triggers.json`
2. Validate schema against notification-triggers.schema.json
3. Filter to enabled triggers only

**Step 2: Evaluate Conditions**
For each enabled trigger:

- **Error triggers**: Check tool output for exception patterns
- **Regex triggers**: Match `pattern` against tool stdout/stderr
- **Token threshold**: Sum session tokens, compare to `minTokens`
- **Pattern triggers**: Count regex occurrences in recent output, compare to `minOccurrences`

**Step 3: Execute Matched Actions**
If condition is true:

1. Process action in order (log → alert → spawn → interrupt)
2. Render message templates with context variables
3. Record trigger fire in `.claude/context/runtime/notification-log.jsonl`

**Step 4: Record Event**

```json
{
  "timestamp": "ISO-8601",
  "triggerId": "id",
  "triggerName": "name",
  "matched": true,
  "context": {
    "sessionId": "current session",
    "taskId": "current task",
    "tokenCount": number
  }
}
```

## Action Execution Logic

**Log Action**

```javascript
// Append to notifications.jsonl
fs.appendFileSync(
  notificationsPath,
  JSON.stringify({
    timestamp: new Date().toISOString(),
    triggerId: trigger.id,
    message: renderTemplate(action.message, context),
    severity: 'info|warn|error',
  }) + '\n'
);
```

**Alert Action**

```javascript
// Write to stdout with standard format
console.log(`\n🔔 NOTIFICATION [${trigger.name}]\n${renderedMessage}\n`);
```

**Spawn Agent Action**

```javascript
// Create async task to handle notification
Task({
  task_id: `notify-${trigger.id}-${Date.now()}`,
  subagent_type: action.target,
  prompt: `Handle notification: ${trigger.description}\nContext: ${JSON.stringify(context)}`,
});
```

**Interrupt Action**

```javascript
// Pause and ask user
const response = await AskUserQuestion({
  question: `${trigger.name}: ${action.message}\n\nContinue? [y/n]`,
});
if (response.toLowerCase() !== 'y') {
  process.exit(0);
}
```

## Example Configurations

### Example 1: High Token Usage Alert

```json
{
  "id": "token-threshold-warning",
  "name": "High Token Usage Warning",
  "description": "Alert when session exceeds 120K tokens",
  "type": "token_threshold",
  "enabled": true,
  "condition": {
    "minTokens": 120000,
    "scope": "session"
  },
  "actions": [
    {
      "type": "log",
      "message": "Session token count: ${tokenCount}"
    },
    {
      "type": "alert",
      "message": "⚠️ Token budget at 60% — consider compression"
    },
    {
      "type": "spawn_agent",
      "target": "context-compressor",
      "message": "Proactive context compression triggered"
    }
  ]
}
```

### Example 2: Error Pattern Detection

```json
{
  "id": "hook-error-pattern",
  "name": "Hook Execution Errors",
  "description": "Detect repeated hook failures in session",
  "type": "pattern",
  "enabled": true,
  "condition": {
    "pattern": "hook.*error|hook.*failed|HOOK_ERROR",
    "minOccurrences": 3,
    "scope": "session"
  },
  "actions": [
    {
      "type": "log",
      "message": "Hook error pattern detected: ${patternMatches} occurrences"
    },
    {
      "type": "alert",
      "message": "🚨 Hook system unstable — check logs"
    }
  ]
}
```

### Example 3: Security Pattern Alert

```json
{
  "id": "security-violation-detect",
  "name": "Security Policy Violation",
  "description": "Alert on potential security violations",
  "type": "regex",
  "enabled": true,
  "condition": {
    "pattern": "shell:\\s*true|JSON\\.parse\\(|eval\\(|exec\\(",
    "scope": "task"
  },
  "actions": [
    {
      "type": "alert",
      "message": "⚠️ Potential security issue detected — review code"
    },
    {
      "type": "spawn_agent",
      "target": "security-architect",
      "message": "Review potential security issue in task output"
    },
    {
      "type": "interrupt",
      "message": "Continue despite security concern?"
    }
  ]
}
```

## Search Protocol

For code discovery, follow this priority order:

1. `pnpm search:code "<query>"` (Primary intent-based search)
2. `ripgrep` (for exact keyword/regex matches)
3. semantic/structural search via code tools if available

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
```

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
