# Code Graph Context Research Requirements (2026)

## Verified Tech Stack

- **AST**: tree-sitter multi-language parsing
- **Graph DB**: KuzuDB (embedded) or Neo4j (enterprise)
- **Query**: Cypher query language

## Tool Reference

| Tool                | Purpose                              |
| ------------------- | ------------------------------------ |
| find_callers        | All functions that call a symbol     |
| find_callees        | All symbols called by a function     |
| get_class_hierarchy | Superclasses, subclasses, interfaces |
| find_dead_code      | Functions with no callers in graph   |
| get_module_deps     | Import/require dependency graph      |
| query_graph         | Raw Cypher query against KuzuDB      |

## Source References

- [CodeGraphContext MCP](https://github.com/codetiger/code-graph-context-mcp)
- [KuzuDB Documentation](https://kuzudb.com/)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/)
