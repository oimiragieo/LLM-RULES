# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Platform
- Windows 10, 128GB RAM, 16 logical processors
- Node.js v22+, pnpm package manager
- PowerShell default shell (use semicolons not && for command chaining)

## Key Dependencies
- `proper-lockfile` — File locking (MUST use for concurrent state file access on Windows)
- `@lancedb/lancedb` + `fastembed` — Vector search for code indexing and memory
- `tree-sitter` — AST parsing for code indexing
- `@ast-grep/cli` — Structural code search
- `ajv` + `ajv-formats` — JSON Schema validation

## Environment Variables
- See `.env.example` for full list
- `HIERARCHICAL_ROUTING` — Feature flag for hierarchical routing (M2). Values: `on`/`off`. Default: `off`.
- `MEMORY_MODE` — Memory injection mode: `hybrid` (default) or `observational`
