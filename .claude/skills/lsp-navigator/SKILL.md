---
name: lsp-navigator
description: Compiler-level code intelligence via native LSP — definitions, references, types, call hierarchies, and diagnostics.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Bash]
verified: true
lastVerifiedAt: '2026-03-13'
dependencies: []
agents:
  [
    developer,
    qa,
    code-reviewer,
    architect,
    code-simplifier,
    nodejs-pro,
    typescript-pro,
    advanced-debugging,
    reflection-agent,
    security-architect,
  ]
category: 'Code Intelligence'
tags: [lsp, navigation, definitions, references, types, call-hierarchy, diagnostics]
---

# LSP Navigator

> **PREREQUISITE**: LSP tools are deferred. Load first: ToolSearch({query:"select:LSP"})
> **CRITICAL**: LSP returns EMPTY for .cjs files. Use ripgrep for .cjs instead.

<identity>
Compiler-level code intelligence. Uses Claude Code's native LSP tool for type-safe navigation: go-to-definition, find-references, hover info, call hierarchies, and workspace symbol search. Includes an automated diagnostics runner for dead-code and broken-import scanning.
</identity>

<capabilities>
- goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol
- goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls
- Automated dead-code and broken-import scans via `lsp-diagnostics-runner.cjs`
</capabilities>

## When to Use

Use for **compiler-verified precision** — not for text discovery (use `pnpm search:code` first):

- Trace where a symbol is defined, follow imports and re-exports
- Find every callsite before refactoring
- Verify parameter/return types
- Build call hierarchy trees

## Operations

| Operation              | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `goToDefinition`       | Find where a symbol is defined                  |
| `findReferences`       | Find all usages                                 |
| `hover`                | Get type info and docs                          |
| `documentSymbol`       | List all symbols in a file                      |
| `workspaceSymbol`      | Search symbols by name workspace-wide           |
| `goToImplementation`   | Find concrete implementations                   |
| `prepareCallHierarchy` | ⚠️ MUST call before incomingCalls/outgoingCalls |
| `incomingCalls`        | Find all callers                                |
| `outgoingCalls`        | Find all callees                                |

All operations: `{ filePath: string (absolute), line: number (1-based), character: number (1-based) }`

## Invocation

```javascript
Skill({ skill: 'lsp-navigator' });
lsp_goToDefinition({ filePath, line, character });
lsp_findReferences({ filePath, line, character });
lsp_hover({ filePath, line, character });
lsp_prepareCallHierarchy({ filePath, line, character }); // REQUIRED before incomingCalls/outgoingCalls
lsp_incomingCalls({ filePath, line, character });
lsp_outgoingCalls({ filePath, line, character });
```

## Diagnostics Runner

```bash
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check dead-exports
node .claude/tools/cli/lsp-diagnostics-runner.cjs --check broken-imports --format markdown
```

Flags: `--check dead-exports|broken-imports`, `--glob <pattern>`, `--exclude-pattern <pat>`, `--format table|json|markdown`

Hook files (`.claude/hooks/**`) dead-export findings are LOW severity — they export for testability only.

## Search Decision Table

| Question                          | Tool                           |
| --------------------------------- | ------------------------------ |
| "Where is `foo` defined?"         | lsp-navigator (goToDefinition) |
| "Who calls `foo`?"                | lsp-navigator (incomingCalls)  |
| "What type does `foo` return?"    | lsp-navigator (hover)          |
| "Find files about authentication" | code-semantic-search           |
| "Find `foo` in .cjs files"        | ripgrep (`rg -F "foo"`)        |
| "Find all async functions"        | code-structural-search         |

## CJS Limitation

LSP returns EMPTY for `.cjs` files — TypeScript server does not fully index CJS modules. For `.cjs`: use `rg -F` for references, `require.resolve()` for import validation. Fall back to ripgrep immediately on empty LSP results.

## Windows Path Normalization (SE-01)

Always normalize before LSP: `filePath.replace(/\\/g, '/')`. Never use raw `path.relative()` output in regex or glob patterns.

## Iron Laws

1. **ALWAYS absolute file paths** — relative paths cause silent failures.
2. **ALWAYS 1-based line/character** — 0-based produces off-by-one errors.
3. **NEVER use for text discovery** — use `pnpm search:code` first, then navigate with LSP.
4. **ALWAYS fall back to ripgrep if LSP returns empty** — server may not index that file type.
5. **ALWAYS call `prepareCallHierarchy` first** — required before incomingCalls/outgoingCalls.

## Anti-Patterns

- LSP to "search for" a concept → use search:code for discovery, LSP only to navigate from a known position
- Relative file paths → always absolute
- 0-based line numbers → LSP is 1-based
- Skip prepareCallHierarchy → incomingCalls/outgoingCalls silently empty
- LSP on .cjs files expecting results → fall back to ripgrep

## Memory Protocol (MANDATORY)

**Before starting:** Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
