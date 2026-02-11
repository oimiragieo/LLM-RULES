---
paths:
  - .claude/skills/code-semantic-search/**
---

# Code Semantic Search Rules

## Core Rules

- Search code by what it does, not what it's called
- Use hybrid mode (default) for best accuracy (95%)
- Use semantic-only mode for fast conceptual searches (<50ms)
- Use structural-only mode for exact pattern matching

## When to Use

**Always:**

- Finding authentication logic without knowing function names
- Searching for error handling patterns
- Locating database queries
- Finding similar code to a concept

**Don't Use:**

- Exact text matching (use Grep instead)
- File name searches (use Glob instead)
- Simple keyword searches (use ripgrep instead)

## Best Practices

### Search Strategy Workflow

1. **Broad Discovery**: `ripgrep` for fast keyword search (10-100x faster)
2. **Semantic Understanding**: `code-semantic-search` (hybrid) to find by meaning
3. **Structural Refinement**: `code-structural-search` for exact patterns

### Mode Selection

| Mode            | Speed  | Accuracy | Best For          |
| --------------- | ------ | -------- | ----------------- |
| Hybrid          | <150ms | 95%      | General search    |
| Semantic-only   | <50ms  | 85%      | Concepts          |
| Structural-only | <50ms  | 100%     | Exact patterns    |
| Phase 1 only    | <50ms  | 80%      | Legacy (fallback) |

## Usage Patterns

### Basic Hybrid Search (Recommended)

```javascript
Skill({ skill: 'code-semantic-search', args: 'find authentication logic' });
```

### Fast Conceptual Search

```javascript
Skill({
  skill: 'code-semantic-search',
  args: 'error handling',
  options: { mode: 'semantic-only' },
});
```

### Exact Pattern Matching

```javascript
Skill({
  skill: 'code-semantic-search',
  args: 'find function authenticate',
  options: { mode: 'structural-only' },
});
```

## Integration Points

- **developer**: Code exploration, implementation discovery
- **architect**: System understanding, pattern analysis
- **code-reviewer**: Finding similar patterns, consistency checks
- **reverse-engineer**: Understanding unfamiliar codebases
- **researcher**: Research existing implementations

## Anti-Patterns

- Using semantic search for exact string matching
- Searching without understanding the query
- Ignoring search results that don't match expectations
- Not combining with ripgrep for initial discovery

## Related Skills

- `ripgrep` - Fast text search for keyword discovery
- `code-structural-search` - AST-based pattern matching
- `code-analyzer` - Static code analysis

## Related References

- `.claude/skills/code-semantic-search/SKILL.md` - Complete semantic search documentation
- `.claude/lib/code-indexing/hybrid-search.cjs` - Hybrid search implementation
- `.claude/lib/code-indexing/query-analyzer.cjs` - Query analysis logic
