# Ralph Loop Implementation Template

## Task Definition

### PROMPT.md Template

````markdown
# Ralph Loop: [Task Name]

## Mission

[One-line directive — what the agent must accomplish]

## Before Doing Anything

1. Read previous findings: `[findings-file-path]`
2. Load context skills: `Skill({ skill: 'ripgrep' })`
3. Read guardrails: `.claude/ralph/guardrails.md`

## Scope

### 1. [Area 1]

- [Specific check or task]
- [Specific check or task]

### 2. [Area 2]

- [Specific check or task]

## Validation Commands

```bash
[command 1]  # Must pass
[command 2]  # Must pass
```
````

## Findings Log

Write findings to: `[findings-file-path]`

Format:

```
### FINDING-NNN: [Category] Short title
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **File:** path/to/file
- **Problem:** What is wrong
- **Status:** OPEN | FIXED_THIS_ITERATION
```

## Completion Condition

**If findings remain open:**

```
RALPH_ITERATION_COMPLETE: N findings remain open.
```

**If ALL findings fixed and ALL validations pass:**

```
RALPH_AUDIT_COMPLETE_NO_FINDINGS
```

````

## Settings Configuration

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/ralph-stop-hook.cjs"
          }
        ]
      }
    ]
  }
}
````

## Launcher Script

**CRITICAL:** The launcher MUST set `RALPH_ACTIVE=1` before invoking Claude.
Without this env var, the Stop hook exits immediately (no-op) and no looping occurs.

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")/../.."

# REQUIRED: Activate the Ralph stop hook for this session.
# Without this, the stop hook is a no-op (prevents trapping normal sessions).
export RALPH_ACTIVE=1

STATE_FILE=".claude/context/runtime/ralph-state.json"
[ -f "$STATE_FILE" ] && rm "$STATE_FILE"
claude --print-output-format text < .claude/ralph/PROMPT.md
```
