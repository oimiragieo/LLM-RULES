# LSP Navigator Research Requirements

<!-- Agent: nodejs-pro | Task: #2 | Session: 2026-03-06 -->

## Research Summary

**Date**: 2026-03-06
**Query intent**: LSP (Language Server Protocol) best practices for AI agent code navigation
**Status**: Skill is wrapping a native Claude Code tool — no external dependencies needed

## Prior Art Search

Searched VoltAgent/awesome-agent-skills for "lsp", "language server protocol", "code navigation" — no matching skill found as of 2026-03-06.

This skill wraps Claude Code's **native LSP tool** — it does not require an external MCP server, CLI binary, or npm package. The 9 LSP operations (`goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`) are built into the Claude Code runtime.

## Key Design Constraints (Evidence-Backed)

### Constraint 1: Position-first, not query-first

LSP protocol (Microsoft Language Server Protocol Specification, Section 3) requires a `TextDocumentPositionParams` for most navigation operations. You cannot "search" with LSP — you must already have a file+line+character to navigate from. This drives the design decision to place lsp-navigator at **position 2** in the search hierarchy (after `pnpm search:code` finds the initial entry point).

**Impact**: Iron Law 3 — "NEVER use LSP for text discovery"

### Constraint 2: 1-based coordinates

LSP protocol uses 0-based positions internally (line and character), but Claude Code's native LSP tool implementation exposes **1-based** line and character numbers to align with standard editor UX (where line 1 is the first line). Agents accustomed to array-indexing (0-based) will produce off-by-one errors.

**Impact**: Iron Law 2 — "ALWAYS use 1-based line and character numbers"
**Risk**: Medium — agents trained on general coding may assume 0-based

### Constraint 3: Call hierarchy requires preparation step

The LSP call hierarchy protocol (LSP 3.16+) is a two-phase operation: `callHierarchy/prepare` returns a `CallHierarchyItem`, which is then passed to `callHierarchy/incomingCalls` or `callHierarchy/outgoingCalls`. Skipping `prepareCallHierarchy` results in an error or empty results.

**Impact**: Iron Law 5 — "ALWAYS use prepareCallHierarchy before incomingCalls/outgoingCalls"

## Non-Goals

- This skill does NOT wrap an external language server binary (no lsp-server installation)
- This skill does NOT provide syntax highlighting or diagnostics (use TypeScript compiler for that)
- This skill does NOT replace text search for discovery (ripgrep is still faster for literal text)
- This skill does NOT support all languages equally — TypeScript/JavaScript have best LSP support in this workspace; CJS files (.cjs) may have reduced support

## Sources

- Microsoft Language Server Protocol Specification: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- LSP call hierarchy protocol (3.16 feature): https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#callHierarchyClientCapabilities
- Claude Code native tool reference (internal to runtime)
