---
name: code-structural-search
description: Use ast-grep for AST-based code pattern matching.
version: 1.1.0
model: sonnet
invoked_by: user
user_invocable: true
tools: [Read, Write, Edit]
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Code Structural Search

Use ast-grep for AST-based code pattern matching.

## When to Use

- Find code by structure, not keywords
- "Find all functions with 3 arguments"
- "Find all classes that extend X"
- "Find all database queries"
- "Find all error handling patterns"
- Precise code refactoring (change exact patterns)

## Interface

```javascript
Skill({ skill: 'code-structural-search', args: 'pattern-here --lang ts' });
```

## Language Support

ast-grep supports 20+ languages via tree-sitter:

| Language   | Flag            | File Extensions      |
| ---------- | --------------- | -------------------- |
| JavaScript | `--lang js`     | .js, .jsx            |
| TypeScript | `--lang ts`     | .ts, .tsx            |
| Python     | `--lang py`     | .py, .pyi            |
| Go         | `--lang go`     | .go                  |
| Rust       | `--lang rs`     | .rs                  |
| Java       | `--lang java`   | .java                |
| C          | `--lang c`      | .c, .h               |
| C++        | `--lang cpp`    | .cpp, .cc, .hpp, .hh |
| C#         | `--lang cs`     | .cs                  |
| Kotlin     | `--lang kt`     | .kt, .kts            |
| Swift      | `--lang swift`  | .swift               |
| PHP        | `--lang php`    | .php                 |
| Ruby       | `--lang rb`     | .rb                  |
| Lua        | `--lang lua`    | .lua                 |
| Elixir     | `--lang ex`     | .ex, .exs            |
| HTML       | `--lang html`   | .html, .htm          |
| CSS        | `--lang css`    | .css                 |
| JSON       | `--lang json`   | .json                |
| Bash       | `--lang bash`   | .sh, .bash           |
| Thrift     | `--lang thrift` | .thrift              |

## Pattern Examples

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

**Find class methods:**

```
class $NAME {
  $METHOD($ARGS) { $$ }
}
```

**Find arrow functions:**

```
const $NAME = ($ARGS) => { $$ }
```

**Find console.log statements:**

```
console.log($$$)
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

**Find async functions:**

```
async def $NAME($ARGS): $$$
```

**Find imports:**

```
import $MODULE
```

**Find from imports:**

```
from $MODULE import $$$
```

### Go

**Find all functions:**

```
func $NAME($ARGS) $RETURN { $$ }
```

**Find struct definitions:**

```
type $NAME struct { $$$ }
```

**Find interface definitions:**

```
type $NAME interface { $$$ }
```

### Rust

**Find all functions:**

```
fn $NAME($ARGS) -> $RETURN { $$ }
```

**Find impl blocks:**

```
impl $NAME { $$$ }
```

**Find pub functions:**

```
pub fn $NAME($ARGS) -> $RETURN { $$ }
```

### Java

**Find all methods:**

```
public $RETURN $NAME($ARGS) { $$ }
```

**Find class definitions:**

```
public class $NAME { $$$ }
```

**Find interface definitions:**

```
public interface $NAME { $$$ }
```

## Pattern Syntax

| Symbol  | Meaning                         | Example               |
| ------- | ------------------------------- | --------------------- |
| `$NAME` | Single node/identifier          | `function $NAME() {}` |
| `$$$`   | Zero or more statements/nodes   | `class $NAME { $$$ }` |
| `$$`    | Zero or more statements (block) | `if ($COND) { $$ }`   |
| `$_`    | Anonymous wildcard (discard)    | `console.log($_)`     |

## Performance

- Speed: <50ms per search (typical)
- Best combined with semantic search (Phase 1)
- Use ripgrep first for initial file discovery

## vs Other Tools

**vs Ripgrep (grep):**

- Ripgrep: Fast text search, finds keywords
- ast-grep: Structural search, finds exact code patterns
- Use ripgrep first → then ast-grep to refine

**vs Semantic Search (Phase 1):**

- Semantic: Understands code meaning
- ast-grep: Understands code structure
- Combined: Best results (Phase 2)

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

## Common Use Cases

### Security Patterns

**Find unvalidated inputs:**

```
router.post($PATH, ($REQ, $RES) => { $$ })
```

**Find SQL queries (potential injection):**

```
db.query(`SELECT * FROM ${$VAR}`)
```

**Find eval usage:**

```
eval($$$)
```

### Code Quality Patterns

**Find deeply nested functions:**

```
function $NAME($ARGS) {
  if ($COND) {
    if ($COND2) {
      if ($COND3) { $$ }
    }
  }
}
```

**Find long parameter lists (>5 params):**

```
function $NAME($A, $B, $C, $D, $E, $F, $$$) { $$ }
```

**Find unused variables:**

```
const $NAME = $VALUE;
```

### Refactoring Patterns

**Find old API usage:**

```
oldAPI.deprecatedMethod($$$)
```

**Find callback patterns (convert to async/await):**

```
$FUNC($ARGS, ($ERR, $DATA) => { $$ })
```

**Find React class components (convert to hooks):**

```
class $NAME extends React.Component { $$$ }
```

## Iron Laws

1. **ALWAYS specify the language with `--lang` flag** — without a language flag, ast-grep applies heuristics that produce false positives; specify `--lang ts`, `--lang py`, etc. for accurate AST parsing.
2. **ALWAYS use ripgrep/keyword search first to narrow the target set** — structural search over the whole codebase is slow; use ripgrep to find candidate files first, then apply ast-grep for precise matching.
3. **NEVER use regex for structural code patterns** — regex breaks on formatting differences, nested structures, and multi-line code; AST patterns are format-independent and semantically precise.
4. **ALWAYS test patterns on a known match before running project-wide** — patterns with incorrect syntax silently match nothing; verify the pattern finds at least one known example before broad application.
5. **ALWAYS use `$$$` for variable argument lists, not `*` or `.`** — ast-grep uses metavariable syntax (`$NAME`, `$$$`, `$$`); regex or glob syntax in patterns produces silent failures.

## Anti-Patterns

| Anti-Pattern                                    | Why It Fails                                              | Correct Approach                                 |
| ----------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| No `--lang` flag                                | Wrong parser applied; produces false positives and misses | Always specify `--lang ts`, `--lang py`, etc.    |
| Running project-wide without ripgrep pre-filter | Slow on large codebases; many irrelevant results          | Use ripgrep to identify candidate files first    |
| Regex for structural matching                   | Breaks on multi-line, whitespace variations, nesting      | Use ast-grep AST patterns (`$NAME`, `$$$`, etc.) |
| Untested pattern on full codebase               | Incorrect patterns silently return nothing                | Test on one known match first                    |
| Using `*` or `.` for wildcards                  | Not valid ast-grep syntax; ignored or errors              | Use `$NAME` for single node, `$$$` for sequences |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
