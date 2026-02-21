---
title: Skill Usage Guide
section: Tools & Skills Reference
---

# Skill Usage Decision Guide

This guide helps agents choose the right skill for code search tasks.

## Quick Decision Tree

```
Task: Search for code
    |
    +---> [Q1] Know exact text/keyword?
    |         |
    |         +---> YES: Simple keyword (1-2 words)
    |         |         -> Use: pnpm search:code "<keyword>"
    |         |         -> Speed: Fast (ms), Accuracy: High
    |         |
    |         +---> YES: Complex regex (PCRE2, lookahead)
    |         |         -> Use: Skill({ skill: 'ripgrep' })
    |         |         -> Speed: Fast (ms), Accuracy: 85%
    |         |
    |         +---> NO: Searching by concept/meaning?
    |                   |
    |                   +---> YES: "Find X pattern/logic"
    |                   |         -> Use: Skill({ skill: 'code-semantic-search' })
    |                   |         -> Speed: Medium (50-150ms), Accuracy: 95%
    |                   |
    |                   +---> NO: Searching by code structure?
    |                             -> Use: Skill({ skill: 'code-structural-search' })
    |                             -> Speed: Medium (50ms), Accuracy: 100%
```

## Skill Comparison Matrix

### Ripgrep vs Grep vs Semantic Search

| Feature                | Grep            | Ripgrep           | Semantic                  | Structural             |
| ---------------------- | --------------- | ----------------- | ------------------------- | ---------------------- |
| **Use Case**           | Exact text      | Complex regex     | Concept search            | Structure match        |
| **Speed**              | Fast            | Very Fast         | Medium                    | Medium                 |
| **Accuracy**           | 70%             | 85%               | 95%                       | 100%                   |
| **ES Module Support**  | ❌              | ✅ (.mjs/.cjs)    | ✅                        | ✅                     |
| **.gitignore Respect** | ❌              | ✅                | ✅                        | ✅                     |
| **PCRE2 Regex**        | ❌              | ✅ (-P flag)      | ❌                        | ❌                     |
| **Query Examples**     | "TaskUpdate"    | "Task\\w+\\("     | "task state tracking"     | "function \$(\$) { }"  |
| **Best For**           | Single keywords | Advanced patterns | "What does this code do?" | "Find exact structure" |

## Skill-by-Skill Guide

### 1. Grep (Built-in Tool, Fallback Only)

Prefer `pnpm search:code` or `Skill({ skill: 'ripgrep' })` for multi-file/codebase search. Use `Grep` only as fallback (advanced regex edge cases or explicit single-file checks).

**When to use**:

- Simple keyword search (1-2 words)
- Single-file searches (when file is known)
- Quick pattern checks

**Example**:

```javascript
Grep({ pattern: 'TaskUpdate', type: 'js' });
```

**Pros**: Fast, simple, no dependencies
**Cons**: Limited regex, doesn't respect .gitignore well

---

### 2. Ripgrep Skill

**When to use**:

- Multi-file searches in large codebases
- Complex regex patterns (PCRE2)
- Need .gitignore respecting
- Must find .mjs/.cjs files

**Invocation**:

```javascript
// Simple search
Skill({ skill: 'ripgrep', args: 'pattern' });

// Complex regex with PCRE2
Skill({ skill: 'ripgrep', args: '-P "foo(?=bar)" --type ts' });

// Using quick-search presets
Skill({ skill: 'ripgrep', args: 'agent "name:" -tmd' });
```

**Pros**: 10-100x faster than grep, PCRE2 support, respects .gitignore
**Cons**: Learning curve for advanced patterns

**Performance Baseline**:

- Ripgrep: 50-200ms typical search
- Grep: 500ms-2s typical search
- 10x improvement for large codebases

---

### 3. Code Semantic Search Skill

**When to use**:

- Don't know exact function/variable names
- Searching for concepts ("error handling", "auth logic")
- Finding similar code patterns
- Discovering implementations of ideas

**Invocation**:

```javascript
// Hybrid search (recommended, 95% accuracy)
Skill({ skill: 'code-semantic-search', args: 'find authentication logic' });

// Semantic-only (faster, 85% accuracy)
Skill({
  skill: 'code-semantic-search',
  args: 'database queries',
  options: { mode: 'semantic-only' },
});

// Structural-only (precise, 100% accuracy)
Skill({
  skill: 'code-semantic-search',
  args: 'function with 3 parameters',
  options: { mode: 'structural-only' },
});
```

**Pros**: Understands code meaning, hybrid approach, excellent accuracy
**Cons**: Slower than ripgrep, requires understanding vectors

**Performance Baseline**:

- Hybrid mode: <150ms (95% accuracy)
- Semantic-only: <50ms (85% accuracy)

---

### 4. Code Structural Search Skill (ast-grep)

**When to use**:

- Find functions/classes with specific structure
- "Find all methods with exactly 3 parameters"
- "Find classes extending Service"
- Precise refactoring (change exact patterns)

**Invocation**:

```javascript
// Find all functions
Skill({ skill: 'code-structural-search', args: 'function \$NAME(\$ARGS) { \$\$ } --lang ts' });

// Find classes extending specific parent
Skill({
  skill: 'code-structural-search',
  args: 'class \$NAME extends Service { \$\$\$ } --lang ts',
});

// Find specific error handling
Skill({ skill: 'code-structural-search', args: 'try { \$\$ } catch (\$ERR) { \$\$ } --lang ts' });
```

**Pros**: 100% structural accuracy, great for refactoring, supports 20+ languages
**Cons**: Requires learning AST pattern syntax

---

## Common Scenarios

### Scenario 1: "Find all uses of TaskUpdate"

```
Known exact name? YES
Complex regex? NO
-> Use hybrid: pnpm search:code "TaskUpdate"
```

### Scenario 2: "Find all error handling patterns"

```
Concept search? YES
-> Use Semantic: Skill({ skill: 'code-semantic-search', args: 'error handling' })
```

### Scenario 3: "Find functions with > 5 parameters"

```
Structure search? YES
-> Use ast-grep: Skill({ skill: 'code-structural-search', args: 'function \$(\$A, \$B, \$C, \$D, \$E, \$F, \$\$\$)' })
```

### Scenario 4: "Find socket.io connections that don't validate origin"

```
Complex + security-relevant? YES
-> Use Ripgrep: Skill({ skill: 'ripgrep', args: "socket\\.on.*{" --type js })
```

## Debugging Skill Selection

### When to Use Each Debugging Skill

**Quick rule**: Start with `debugging` for straightforward bugs. Escalate to `smart-debug` when the bug is intermittent, production-only, or needs hypothesis ranking before any fix.

### Decision Tree

```
Bug to debug?
├── Is it locally reproducible and straightforward?
│   ├── YES → Use `debugging` (4-phase systematic)
│   └── NO → Is it intermittent or production-only?
│       ├── YES → Use `smart-debug` (hypothesis-first, instrumented)
│       └── NO → Is it multi-component or requires observability data?
│           ├── YES → Use `smart-debug`
│           └── NO → Start with `debugging`, escalate if stuck after Phase 2
```

### Comparison Table

| Feature                | `debugging`              | `smart-debug`                        |
| ---------------------- | ------------------------ | ------------------------------------ |
| **Approach**           | 4-phase systematic       | 11-step Cursor Debug Mode            |
| **Hypothesis ranking** | No                       | Yes (blocking gate)                  |
| **Instrumentation**    | Manual                   | Structured with session scoping      |
| **Log confirmation**   | Optional                 | Mandatory before fix                 |
| **Best for**           | Local, reproducible bugs | Runtime, intermittent, production    |
| **Agents**             | All developer agents     | developer, devops-troubleshooter, qa |
| **Complexity**         | Low-Medium               | Medium-High                          |

### Invocation

```javascript
// Simple/local bug
Skill({ skill: 'debugging' });

// Runtime/production/intermittent bug
Skill({ skill: 'smart-debug' });
```

---

## Agent-Specific Skill Recommendations

| Agent                  | Primary Skills                            | When Applicable        |
| ---------------------- | ----------------------------------------- | ---------------------- |
| **developer**          | ripgrep, semantic-search, code-structural | Daily code discovery   |
| **architect**          | ripgrep, semantic-search, code-structural | System understanding   |
| **qa**                 | code-semantic-search                      | Test coverage analysis |
| **security-architect** | ripgrep, code-structural-search           | Vulnerability patterns |
| **code-reviewer**      | semantic-search, structural-search        | Pattern consistency    |

## Performance Tips

1. **Use ripgrep for large codebases** (>1000 files)
   - 10-100x faster than grep
   - Respects .gitignore automatically

2. **Use semantic search for concepts**
   - 95% accuracy with hybrid mode
   - Faster than manual structural inspection

3. **Combine skills in sequence**
   - Ripgrep first for initial filtering
   - Then semantic/structural for refinement

4. **Exclude large directories** with ripgrep
   - `-g "!node_modules/**"`
   - `-g "!.git/**"`

## Related References

- [Ripgrep Skill Documentation](./../skills/ripgrep/SKILL.md)
- [Code Semantic Search Skill](./../skills/code-semantic-search/SKILL.md)
- [Code Structural Search Skill](./../skills/code-structural-search/SKILL.md)
- [CLAUDE.md Section 1.4 - Tools Reference](./@TOOL_REFERENCE.md)

## Back to Main

← [Return to CLAUDE.md](./CLAUDE.md)
