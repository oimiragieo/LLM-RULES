---
name: code-graph-context
description: Structural code graph queries via CodeGraphContext MCP (tree-sitter + KuzuDB). Find callers, callees, class hierarchies, dead code, and module dependencies.
version: 1.0.0
category: code-analysis
agents:
  - architect
  - code-reviewer
  - advanced-debugging
tools:
  - mcp__CodeGraphContext__find_callers
  - mcp__CodeGraphContext__find_callees
  - mcp__CodeGraphContext__get_class_hierarchy
  - mcp__CodeGraphContext__find_dead_code
  - mcp__CodeGraphContext__get_module_deps
  - mcp__CodeGraphContext__query_graph
---

# CodeGraphContext Skill

Structural code graph queries using the CodeGraphContext MCP server (tree-sitter AST + KuzuDB property graph).

## When to Use vs Other Search Tools

| Need                                     | Tool                               |
| ---------------------------------------- | ---------------------------------- |
| Who calls `foo()`?                       | `find_callers` (this skill)        |
| What does `foo()` call?                  | `find_callees` (this skill)        |
| Class hierarchy / interface implementors | `get_class_hierarchy` (this skill) |
| Dead code / unreachable functions        | `find_dead_code` (this skill)      |
| Module-level import graph                | `get_module_deps` (this skill)     |
| Keyword / regex search                   | `pnpm search:code` or ripgrep      |
| Semantic / conceptual search             | `code-semantic-search` skill       |
| AST shape matching                       | `code-structural-search` skill     |
| Compiler-verified definition/references  | `lsp-navigator` skill              |

Use this skill when you need **relationship traversal** across the call graph or import graph, not text matching.

## MCP Tool Reference

| Tool                  | Purpose                                  | Key Parameters                   |
| --------------------- | ---------------------------------------- | -------------------------------- |
| `find_callers`        | All functions/methods that call a symbol | `symbol`, `file?`, `depth?`      |
| `find_callees`        | All symbols called by a function         | `symbol`, `file?`, `depth?`      |
| `get_class_hierarchy` | Superclasses, subclasses, interfaces     | `class_name`, `direction?`       |
| `find_dead_code`      | Functions with no callers in graph       | `scope?`, `min_confidence?`      |
| `get_module_deps`     | Import/require dependency graph          | `module`, `direction?`, `depth?` |
| `query_graph`         | Raw Cypher query against KuzuDB          | `cypher`, `params?`              |

## Setup

```bash
# Install CodeGraphContext MCP server
npm install -g @codetiger/code-graph-context-mcp

# Index your codebase (run from project root)
code-graph-context index --root . --lang typescript,javascript
```

Add to `.claude/settings.json` under `mcpServers`:

```json
"CodeGraphContext": {
  "command": "code-graph-context-mcp",
  "args": ["--db", ".claude/context/data/code-graph.kuzu"]
}
```

## Usage Pattern

```javascript
// 1. Find all callers of a function
mcp__CodeGraphContext__find_callers({ symbol: 'shouldUseWorktree', depth: 2 });

// 2. Trace what a function depends on
mcp__CodeGraphContext__find_callees({ symbol: 'routeRequest', file: 'routing-table.cjs' });

// 3. Dead code candidates (low confidence = more results)
mcp__CodeGraphContext__find_dead_code({ scope: 'src/', min_confidence: 0.8 });

// 4. Raw Cypher for custom traversal
mcp__CodeGraphContext__query_graph({
  cypher: 'MATCH (a:Function)-[:CALLS]->(b:Function) WHERE b.name = $name RETURN a',
  params: { name: 'handleAuth' },
});
```

## Integration with Agent-Studio Memory

After graph analysis, record structural findings:

```javascript
MemoryRecord({
  type: 'pattern',
  content: 'routeRequest has 12 callers — high-risk refactor target',
  area: 'architecture',
});
MemoryRecord({
  type: 'gotcha',
  content: 'worktree-utils dead code: shouldPruneWorktree() never called',
  area: 'cleanup',
});
```

## Anti-Patterns

- Do not use `query_graph` raw Cypher before checking if a purpose-built tool covers the need
- Do not treat `find_dead_code` results as certain — dynamic dispatch and reflection create false positives
- Re-index after significant refactors: `code-graph-context index --incremental`
- Graph queries do not cross language boundaries (TypeScript ≠ Python in same repo)

## When to Invoke

```javascript
Skill({ skill: 'code-graph-context' });
```

Invoke for: impact analysis before refactoring, call chain debugging, dead code audits, module dependency reviews, and architectural dependency mapping.
