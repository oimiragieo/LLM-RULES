# memory-search Rules

## Purpose

Semantic search over global agent memory. Use to retrieve previously learned patterns, decisions, gotchas, and workarounds. Prevents stale-context errors across long sessions and multi-agent pipelines.

## Best Practices

- Run memory-search at the start of any non-trivial task
- Use focused queries, not broad ones
- Treat results as pointers to canonical sources, not ground truth
- Pair high-similarity results with explicit file reads for critical decisions

## Integration Points

See SKILL.md for complete documentation.
