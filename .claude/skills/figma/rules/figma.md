# figma Rules

## Purpose

Design-to-code workflow: extract design tokens, components, translate designs to implementation.

## Best Practices

- Extract tokens before building components
- Use Figma REST API for programmatic access
- Map auto-layout to CSS flexbox/grid
- Preserve design intent over pixel-perfect
- Never hardcode Figma colors/spacing

## Auto-Layout Mapping

| Figma         | CSS                            |
| ------------- | ------------------------------ |
| Horizontal    | flex-direction: row            |
| Vertical      | flex-direction: column         |
| Space between | justify-content: space-between |
| Gap: 16       | gap: 1rem                      |

## Integration Points

See SKILL.md for complete documentation.
