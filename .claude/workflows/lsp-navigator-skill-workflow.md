# lsp-navigator Skill Workflow

1. Identify the symbol, file path, and position for the LSP query.
2. Execute the appropriate LSP operation (goToDefinition, findReferences, hover, etc.).
3. Parse and format LSP results for the requesting agent.
4. Fall back to ripgrep if LSP returns empty results.
