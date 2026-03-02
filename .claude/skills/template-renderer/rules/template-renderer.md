# template-renderer Rules

## Purpose

Render templates by replacing {{TOKEN}} placeholders with actual values, supporting all three templates (specification, plan, tasks) with schema validation and security sanitization

## Best Practices

- Sanitize all token values to prevent injection attacks
- Validate template paths within PROJECT_ROOT only
- Use token whitelist (only allow predefined tokens)
- Validate output against schema for specification templates
- Preserve Markdown formatting during token replacement
- Error on missing required tokens
- Warn on unused tokens provided

## Integration Points

See SKILL.md for complete documentation.
