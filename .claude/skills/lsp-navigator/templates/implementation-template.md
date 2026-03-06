# LSP Navigator Implementation Template

Use this template when implementing a task that requires LSP navigation.

## Pre-Task Checklist

- [ ] I have a known file path and position to start from (if not, use `pnpm search:code` first)
- [ ] The file path is absolute (not relative)
- [ ] I know which LSP operation I need from the decision table in SKILL.md

## Operation Selection

```
Need definition?       → goToDefinition
Need all usages?       → findReferences
Need type info?        → hover
Need file symbols?     → documentSymbol
Need workspace search? → workspaceSymbol
Need implementations?  → goToImplementation
Need call hierarchy?   → prepareCallHierarchy THEN incomingCalls/outgoingCalls
```

## Standard Code Pattern

```javascript
// Step 1: Anchor — find/confirm the symbol location
// Use pnpm search:code or ripgrep to find the file and approximate line first
// Then call LSP:

// Step 2: Navigate
lsp_goToDefinition({
  filePath: '/absolute/path/to/file.ts', // MUST be absolute
  line: 42, // 1-based
  character: 10, // 1-based
});

// Step 3: Reference check (if refactoring)
lsp_findReferences({
  filePath: '/absolute/path/to/file.ts',
  line: 42,
  character: 10,
});

// Step 4: Type verification (if in doubt)
lsp_hover({
  filePath: '/absolute/path/to/file.ts',
  line: 42,
  character: 10,
});
```

## Call Hierarchy Template

```javascript
// Always use this 3-step sequence for call hierarchies:
// 1. Prepare
lsp_prepareCallHierarchy({ filePath, line, character });

// 2. Get callers
lsp_incomingCalls({ filePath, line, character });

// 3. Get callees
lsp_outgoingCalls({ filePath, line, character });
```

## Fallback Pattern

If LSP returns empty results:

1. Verify the file is in a language the LSP server supports
2. Try ripgrep: `rg -F "symbolName" --type ts`
3. For .cjs files: fall back to ripgrep (CJS may have limited LSP support)
4. For pattern matching: fall back to `code-structural-search`

## Post-Navigation Checklist

- [ ] Verified types match expectations (hover)
- [ ] Verified all callsites identified (findReferences count matches expectations)
- [ ] Verified imports resolve (goToDefinition returns valid location)
- [ ] Fell back to ripgrep if LSP returned empty (and verified LSP was active)
