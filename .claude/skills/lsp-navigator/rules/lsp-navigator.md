# LSP Navigator Rules

## Core Rules

- Use lsp-navigator for **compiler-verified** navigation, not text discovery
- Always provide absolute file paths — relative paths cause wrong-file resolution
- Always use 1-based line and character numbers — LSP protocol is 1-based
- Always call `prepareCallHierarchy` before `incomingCalls`/`outgoingCalls`
- Verify LSP server is active for the file's language; fall back to ripgrep if empty

## When to Use

| Need                               | Use                              |
| ---------------------------------- | -------------------------------- |
| Find where a symbol is defined     | `lsp-navigator` (goToDefinition) |
| Find all usages before refactoring | `lsp-navigator` (findReferences) |
| Verify parameter/return types      | `lsp-navigator` (hover)          |
| Trace all callers of a function    | `lsp-navigator` (incomingCalls)  |
| List symbols in a file             | `lsp-navigator` (documentSymbol) |
| Discover code by concept           | `pnpm search:code`               |
| Search all text including comments | `ripgrep`                        |
| Find code by structural pattern    | `code-structural-search`         |

## Decision Table (Condensed)

```
Compiler-precise types/refs/defs? → lsp-navigator
Conceptual discovery? → search:code / code-semantic-search
Pattern shape? → code-structural-search
Text/literal match? → ripgrep
```

## Agent-Specific Contracts

### developer (always)

- After editing: hover to verify types, goToDefinition to verify imports
- Before completing refactor: findReferences to verify all callsites updated

### qa (always)

- documentSymbol on changed files before writing tests
- findReferences on exported symbols to identify test targets

### code-reviewer (always)

- findReferences when reviewing renamed/moved symbols
- hover to verify reviewer understands actual types being used

### architect (always)

- prepareCallHierarchy + incomingCalls + outgoingCalls to build dependency maps
- goToImplementation to trace concrete implementations of interfaces

### code-simplifier (always)

- findReferences BEFORE any rename — must be exhaustive, not text-based
- goToDefinition to understand full scope of a symbol before changing it

### advanced-debugging (always)

- incomingCalls to trace how a buggy code path is reached
- outgoingCalls to understand what a suspect function depends on

### reflection-agent (contextual)

- hover to ground-truth type claims made by other agents

### security-architect (contextual)

- outgoingCalls from entry points to trace how user input propagates
- findReferences on security-critical functions to verify all usages are safe

## Anti-Patterns

| Anti-Pattern                                      | Correct Approach                                  |
| ------------------------------------------------- | ------------------------------------------------- |
| Using LSP to "search for" a concept (no position) | Use search:code first, then LSP to navigate       |
| Relative file paths                               | Always use absolute paths                         |
| 0-based line/character                            | Use 1-based (LSP protocol)                        |
| Skipping prepareCallHierarchy                     | Always call it before incomingCalls/outgoingCalls |
| Trusting empty results as "no references"         | Verify LSP is active; fall back to ripgrep        |

## Integration Points

- **Prerequisite**: `pnpm search:code` or `ripgrep` to find initial entry points
- **Complement**: `code-structural-search` for pattern-based discovery
- **Complement**: `code-semantic-search` for conceptual discovery
- **Fallback**: `ripgrep` when LSP returns empty or language unsupported

## Related Skills

- `ripgrep` — fast text search for initial discovery
- `code-semantic-search` — conceptual/intent-based discovery
- `code-structural-search` — AST pattern matching
- `debugging` — systematic debugging (pairs well with lsp-navigator for call tracing)
