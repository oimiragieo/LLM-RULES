---
paths:
  - .claude/skills/hook-creator/**
---

# Hook Creator Rules

## Core Principles

- Hooks intercept tool execution for validation/metrics/safety
- Every hook MUST have: `.cjs` file, settings.json registration, enforcement mode
- Hooks follow stdin/stdout JSON protocol
- All hooks must handle errors gracefully (exit 0 on non-critical)

## Standards

### Hook Structure

```javascript
#!/usr/bin/env node
/**
 * {Hook Name}
 * {Description}
 *
 * Mode: PreToolUse | PostToolUse
 * Priority: {number}
 * Enforcement: block | warn | off
 */

async function preToolUse(input) {
  // Validation logic
  return { allow: true / false, message: 'reason' };
}

// Export for registration
module.exports = { preToolUse }; // or { postToolUse }
```

### Hook Categories

| Category   | Purpose                  | Examples                   |
| ---------- | ------------------------ | -------------------------- |
| routing    | Agent routing validation | routing-guard.cjs          |
| safety     | File safety, paths       | unified-creator-guard.cjs  |
| validation | Input/output validation  | spawn-prompt-validator.cjs |
| reflection | Reflection enforcement   | reflection-step0-guard.cjs |

### File Placement

- Hook directory: `.claude/hooks/{category}/`
- Settings: `.claude/settings.json` (registration)
- Documentation: `@ENFORCEMENT_HOOKS.md`

## Anti-Patterns

- Hooks with blocking operations (network calls, long computation)
- Hooks that mutate global state
- Hooks without graceful degradation
- Missing error handling
- Hooks >500ms execution time

## Integration Points

### Related Agents

- `hook-creator` agent uses this skill
- All agents affected by hook enforcement

### Related Skills

- `schema-creator` - Creates hook input/output schemas
- `workflow-creator` - Documents hook workflows

### Related Workflows

- `.claude/workflows/creation/ecosystem-creation-workflow.md`

## Post-Creation Checklist

After creating a hook, MUST:

- [ ] Create hook `.cjs` file
- [ ] Register in `.claude/settings.json`
- [ ] Add to `@ENFORCEMENT_HOOKS.md`
- [ ] Test hook with sample input
- [ ] Verify exit codes (0 = allow, 2 = block)
- [ ] Measure execution time (<100ms target)
- [ ] Document enforcement mode override
