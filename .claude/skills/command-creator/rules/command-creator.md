# command-creator Rules

## Purpose

Creates command files for the Claude Code framework. Commands are user-facing shortcuts that delegate to skills.

## Best Practices

- Commands are thin delegation wrappers
- Always set disable-model-invocation: true
- Keep command files minimal (YAML frontmatter + one delegation line)

## Integration Points

See SKILL.md for complete documentation.
