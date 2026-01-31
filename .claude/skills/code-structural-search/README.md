# Code Structural Search - README

## Overview

The `code-structural-search` skill provides AST-based code pattern matching using [ast-grep](https://ast-grep.github.io/), a fast structural search and replace tool.

**Key Benefits:**

- **Structure-aware**: Matches code patterns, not just text
- **Fast**: <50ms typical search time
- **Multi-language**: 20+ languages via tree-sitter
- **Precise**: Find exact code patterns for refactoring

## Installation

### Option A: npm (Recommended)

```bash
npm install -g @ast-grep/cli
```

### Option B: Cargo (if Rust available)

```bash
cargo install ast-grep
```

### Verify Installation

```bash
ast-grep --version
# or
sg --version
```

## Quick Start

### 1. Basic Search

Find all functions in TypeScript:

```bash
sg -p 'function $NAME($$$) { $$ }' --lang ts
```

### 2. Find Security Issues

Find unvalidated SQL queries:

```bash
sg -p 'db.query(`SELECT * FROM ${$VAR}`)' --lang js
```

### 3. Refactoring Support

Find old API usage:

```bash
sg -p 'oldAPI.deprecatedMethod($$$)' --lang js
```

## Pattern Syntax

| Symbol     | Meaning                         | Example                  |
| ---------- | ------------------------------- | ------------------------ |
| `$NAME`    | Single node/identifier          | `function $NAME() {}`    |
| `$$$`      | Zero or more statements/nodes   | `class $NAME { $$$ }`    |
| `$$`       | Zero or more statements (block) | `if ($COND) { $$ }`      |
| `$_`       | Anonymous wildcard (discard)    | `console.log($_)`        |

## Supported Languages

| Language   | Flag        | Extensions        |
| ---------- | ----------- | ----------------- |
| JavaScript | `--lang js` | .js, .jsx         |
| TypeScript | `--lang ts` | .ts, .tsx         |
| Python     | `--lang py` | .py, .pyi         |
| Go         | `--lang go` | .go               |
| Rust       | `--lang rs` | .rs               |
| Java       | `--lang java` | .java           |
| C          | `--lang c`  | .c, .h            |
| C++        | `--lang cpp` | .cpp, .cc, .hpp |
| C#         | `--lang cs` | .cs               |

**Full language support:** See PATTERNS.md for complete list.

## Common Use Cases

### 1. Find All Async Functions

```bash
sg -p 'async function $NAME($$$) { $$ }' --lang ts
```

### 2. Find Classes Extending a Base

```bash
sg -p 'class $NAME extends React.Component { $$$ }' --lang tsx
```

### 3. Find Error Handling Gaps

```bash
sg -p 'function $NAME($$$) { $$ }' --lang js | grep -v 'try'
```

### 4. Find Deprecated Patterns

```bash
sg -p 'oldAPI.method($$$)' --lang js
```

### 5. Security Audit

Find SQL injection risks:

```bash
sg -p 'db.query(`$$$${$VAR}$$$`)' --lang js
```

Find XSS risks:

```bash
sg -p '$ELEM.innerHTML = $DATA' --lang js
```

## Integration with Agent-Studio

### From Skills

```javascript
// Use the skill
Skill({ skill: 'code-structural-search', args: 'function authenticate($$$) { $$ } --lang ts' })
```

### From CLI

```bash
# Run directly
ast-grep -p 'pattern-here' --lang ts

# or with short name
sg -p 'pattern-here' --lang ts
```

### Workflow Integration

Combine with other skills for best results:

1. **Broad search** (ripgrep):
   ```javascript
   Skill({ skill: 'ripgrep', args: 'authenticate --type ts' })
   ```

2. **Structural refinement** (ast-grep):
   ```javascript
   Skill({ skill: 'code-structural-search', args: 'function authenticate($$$) { $$ } --lang ts' })
   ```

3. **Semantic understanding** (Phase 1):
   ```javascript
   Skill({ skill: 'code-semantic-search', args: 'authentication logic' })
   ```

## Output Formats

### Default (Human-Readable)

```bash
sg -p 'function $NAME() {}' --lang js
# Shows filename, line number, matched code
```

### JSON (Machine-Parsable)

```bash
sg -p 'function $NAME() {}' --lang js --json
# Returns structured JSON for parsing
```

### With Context

```bash
sg -p 'function $NAME() {}' --lang js -A 3 -B 3
# Shows 3 lines before and after each match
```

## Performance Tips

### 1. Use Specific Language Flags

```bash
# GOOD - Fast, precise
sg -p '$PATTERN' --lang ts

# BAD - Slow, tries all languages
sg -p '$PATTERN'
```

### 2. Search Specific Directories

```bash
# GOOD - Focused search
sg -p '$PATTERN' --lang ts src/

# BAD - Searches entire project
sg -p '$PATTERN' --lang ts
```

### 3. Exclude Irrelevant Directories

```bash
# Skip node_modules, dist, etc.
sg -p '$PATTERN' --lang ts --no-ignore tests/
```

### 4. Use Parallel Threads (Large Codebases)

```bash
sg -p '$PATTERN' --lang ts --threads 4
```

## Common Patterns Reference

### JavaScript/TypeScript

```bash
# All functions
sg -p 'function $NAME($$$) { $$ }' --lang js

# Async functions
sg -p 'async function $NAME($$$) { $$ }' --lang ts

# Arrow functions
sg -p 'const $NAME = ($$$) => { $$ }' --lang js

# Classes
sg -p 'class $NAME { $$$ }' --lang ts

# React components
sg -p 'function $NAME($PROPS) { return $$$ }' --lang tsx
```

### Python

```bash
# All functions
sg -p 'def $NAME($$$): $$$' --lang py

# Async functions
sg -p 'async def $NAME($$$): $$$' --lang py

# Classes
sg -p 'class $NAME: $$$' --lang py
```

### Go

```bash
# All functions
sg -p 'func $NAME($$$) $RETURN { $$ }' --lang go

# Structs
sg -p 'type $NAME struct { $$$ }' --lang go
```

### Rust

```bash
# All functions
sg -p 'fn $NAME($$$) -> $RETURN { $$ }' --lang rs

# Impl blocks
sg -p 'impl $NAME { $$$ }' --lang rs
```

## Troubleshooting

### Issue: "command not found: sg"

**Solution:**

1. Check installation: `npm list -g @ast-grep/cli`
2. Verify PATH includes npm global bin directory
3. Try full command: `npx @ast-grep/cli` (if npm install local)

### Issue: "Pattern not matching expected code"

**Solution:**

1. Verify language flag is correct (`--lang ts` for TypeScript)
2. Check pattern syntax matches AST structure (not text)
3. Use `--debug-query` to see AST representation

### Issue: "Too many results"

**Solution:**

1. Make pattern more specific (use more metavariables)
2. Search specific directory: `sg -p '$PATTERN' --lang ts src/`
3. Exclude directories: `sg -p '$PATTERN' --lang ts --no-ignore tests/`

### Issue: "Performance is slow"

**Solution:**

1. Add language flag: `--lang ts` (don't make ast-grep guess)
2. Search specific directory: `sg -p '$PATTERN' --lang ts src/`
3. Use parallel threads: `--threads 4`
4. Exclude large directories (node_modules, dist)

## Advanced Features

### 1. Rewrite Mode (Find and Replace)

```bash
sg -p 'oldAPI.method($$$)' -r 'newAPI.method($$$)' --lang js
```

### 2. Interactive Mode

```bash
sg -p '$PATTERN' --lang ts --interactive
# Shows matches one by one, confirm each replacement
```

### 3. Rule Files (Complex Searches)

Create `.ast-grep/rules/security.yml`:

```yaml
id: no-sql-injection
language: js
rule:
  pattern: db.query(`SELECT * FROM ${$VAR}`)
message: Potential SQL injection vulnerability
severity: error
```

Run with:

```bash
sg scan
```

### 4. Combining Patterns (AND logic)

```yaml
rule:
  all:
    - pattern: function $NAME($$$) { $$ }
    - not:
        pattern: try { $$ } catch { $$ }
```

## Documentation

- **SKILL.md**: Quick reference for skill usage
- **PATTERNS.md**: Comprehensive pattern library (all languages)
- **README.md**: This file (setup, usage, troubleshooting)

## Related Skills

- **ripgrep**: Fast text-based search (use first for broad filtering)
- **code-semantic-search**: Semantic understanding (Phase 1)
- **code-hybrid-search**: Combined semantic + structural (Phase 2)

## External Resources

- Official docs: https://ast-grep.github.io/
- Pattern guide: https://ast-grep.github.io/guide/rule-config.html
- GitHub: https://github.com/ast-grep/ast-grep
- Playground: https://ast-grep.github.io/playground.html

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
