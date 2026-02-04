# Continuation Template

This template provides a standardized format for presenting next steps after completing work.

## Usage

Agents should use this template when completing tasks, plans, or workflows to present clear next steps to users.

## Template Variables

- `{identifier}` - Task/phase identifier (e.g., "Task 2.3", "Phase 2")
- `{name}` - Task/phase name (e.g., "Implement Statusline Hook")
- `{description}` - One-line description
- `{command}` - Command to copy-paste
- `{alternatives}` - Array of alternative options

## Basic Template

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{identifier}: {name}** — {description}

`{command}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
{for each alternative}
- `{alt.command}` — {alt.description}
{end for}

───────────────────────────────────────────────────────────────
```

## Example Usage

### After Plan Completion

```
───────────────────────────────────────────────────────────────

## ✓ Plan Complete

3/3 tasks executed

## ▶ Next Up

**Task 2.4: Create Todo Commands** — Implement todo management system

`/execute-plan`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/verify` — verify implementation
- Review completed work

───────────────────────────────────────────────────────────────
```

## Integration with UI Formatter

Agents can use the UI formatter utility to generate continuation blocks programmatically:

```javascript
const { createNextUpBlock } = require('.claude/lib/ui/formatter.cjs');

const continuation = createNextUpBlock(
  'Task 2.3',
  'Implement Statusline Hook',
  'Create hook for real-time status display',
  '/execute-plan',
  [
    { command: '/verify', description: 'verify implementation' },
    { command: '/write-plan', description: 'create new plan' },
  ]
);
```

## Reference

See `.claude/references/continuation-format.md` for complete documentation.
