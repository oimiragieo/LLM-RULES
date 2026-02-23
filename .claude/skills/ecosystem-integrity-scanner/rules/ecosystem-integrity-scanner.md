# ecosystem-integrity-scanner Rules

## Purpose

deeply analyzes framework structural health, catching phantom references, wrong require() depth paths, missing dependencies inside agents and hooks, bloated configurations, and empty tool directories.

## Best Practices

- Run scripts/validation/validate-ecosystem-integrity.cjs
- Never allow missing skills (phantom references) within agent context
- Report broken `require()` depths immediately to avoid runtime crashes

## Integration Points

See SKILL.md for complete documentation.
