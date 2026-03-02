# agent-tool-design Rules

## Purpose

'The Agent Tool Contract — 5 principles for designing tools agents call reliably: predictable signature, rich errors, token-efficient output, idempotency, graceful degradation. Includes anti-pattern table with 8 common mistakes.'

## Best Practices

- Parameters are named not positional
- Errors include machine-readable code plus human message plus context
- Output is structured data only — no prose
- Tools are idempotent (safe to retry)
- Partial failure returns partial results rather than throws

## Integration Points

See SKILL.md for complete documentation.
