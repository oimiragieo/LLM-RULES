---
paths:
  - .claude/skills/code-structural-search/**
---

# Code Structural Search Rules

## Core Rules

- Find code by AST structure, not keywords
- Use ast-grep for precise pattern matching
- Always specify language with `--lang` flag
- Combine with semantic search for best results

## When to Use

- Find all functions with exactly N arguments
- Find all classes that extend X
- Find all database queries
- Find all error handling patterns
- Precise code refactoring (change exact patterns)

## Best Practices

### Pattern Syntax

| Symbol  | Meaning                         | Example               |
| ------- | ------------------------------- | --------------------- |
| `$NAME` | Single node/identifier          | `function $NAME() {}` |
| `$$$`   | Zero or more statements/nodes   | `class $NAME { $$$ }` |
| `$$`    | Zero or more statements (block) | `if ($COND) { $$ }`   |
| `$_`    | Anonymous wildcard (discard)    | `console.log($_)`     |

### Language Support

ast-grep supports 20+ languages:

- **JavaScript/TypeScript**: `--lang js`, `--lang ts`
- **Python**: `--lang py`
- **Go**: `--lang go`
- **Rust**: `--lang rs`
- **Java**: `--lang java`
- **C/C++**: `--lang c`, `--lang cpp`

## Common Patterns

### JavaScript/TypeScript

**Find all functions:**

```
function $NAME($ARGS) { $$ }
```

**Find functions with exactly 2 arguments:**

```
function $NAME($A, $B) { $$ }
```

**Find async functions:**

```
async function $NAME($ARGS) { $$ }
```

**Find try-catch blocks:**

```
try { $$ } catch ($ERR) { $$ }
```

### Python

**Find all functions:**

```
def $NAME($ARGS): $$$
```

**Find class definitions:**

```
class $NAME: $$$
```

## Usage Workflow

1. **Broad search** with ripgrep:

   ```
   Skill({ skill: 'ripgrep', args: 'authenticate --type ts' })
   ```

2. **Structural refinement** with ast-grep:

   ```
   Skill({ skill: 'code-structural-search', args: 'function authenticate($$$) { $$ } --lang ts' })
   ```

3. **Semantic understanding** with Phase 1:
   ```
   Skill({ skill: 'code-semantic-search', args: 'authentication logic' })
   ```

## vs Other Tools

**vs Ripgrep (grep):**

- Ripgrep: Fast text search, finds keywords
- ast-grep: Structural search, finds exact code patterns
- **Use ripgrep first → then ast-grep to refine**

**vs Semantic Search (Phase 1):**

- Semantic: Understands code meaning
- ast-grep: Understands code structure
- **Combined: Best results (Phase 2)**

## Anti-Patterns

- Using structural search for simple keyword finding
- Not specifying language (causes mismatches)
- Forgetting to escape regex special chars in patterns
- Using wildcards without understanding their scope

## Security Patterns

**Find unvalidated inputs:**

```
router.post($PATH, ($REQ, $RES) => { $$ })
```

**Find SQL queries (potential injection):**

```
db.query("SELECT * FROM " + $VAR)
```

**Find eval usage:**

```
eval($$$)
```

## Related Skills

- `ripgrep` - Fast text search for initial discovery
- `code-semantic-search` - Semantic code understanding
- `code-analyzer` - Static code analysis

## Related References

- `.claude/skills/code-structural-search/SKILL.md` - Complete structural search documentation
- `.claude/skills/code-structural-search/PATTERNS.md` - Pattern library
