# property-based-testing Rules

## Purpose

'fast-check patterns for JS/TS — 6 canonical property categories with worked examples targeting agent-studio utilities (path normalization, safe-json, glob-to-regex, routing logic)'

## Best Practices

- State properties as invariants that must hold for ALL inputs
- Use shrinkage to get minimal counterexamples on failure
- Combine with unit tests — property tests find edge cases, unit tests document examples

## Integration Points

See SKILL.md for complete documentation.
