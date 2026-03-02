# hook-creator Rules

## Purpose

'Creates and registers hooks for the Claude Code framework. Handles pre/post tool execution, validation, memory, and session hooks. Use when new validation, safety, or automation hooks are needed.'

## Best Practices

- Always register hooks in appropriate config
- Test hooks before deployment
- Include error handling in all hooks
- Document hook triggers and behavior
- Use explicit enforcement modes (block|warn|off) with env overrides; default warn unless spec requires block

## Integration Points

See SKILL.md for complete documentation.
