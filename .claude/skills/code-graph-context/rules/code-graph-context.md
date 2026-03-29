# code-graph-context Rules

## Purpose

Structural code graph queries using tree-sitter AST + KuzuDB property graph.

## Best Practices

- Use find_callers for impact analysis before refactoring
- Use find_dead_code for cleanup candidates (verify before removing)
- Run wrangler types after editing configs
- Use Neo4j backend for >100K node graphs
- Do not use raw Cypher before checking purpose-built tools

## Integration Points

See SKILL.md for complete documentation.
