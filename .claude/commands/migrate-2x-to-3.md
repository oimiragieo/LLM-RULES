---
name: migrate-2x-to-3
description: Backfill v3.0.0 manifests on existing agents; flag mcp.transport SSE configs; create backups.
usage: pnpm migrate:2x-to-3 [--dry-run]
---

# migrate-2x-to-3

Upgrade-path helper for agents moving from v2.x → v3.0.0.

## What it does
- Scans `.claude/agents/**/*.md` for agents lacking a `manifest:` frontmatter block
- For each: emits a minimal v1.0 manifest with safe defaults (STM tier, sonnet preferred, ephemeral session)
- Backs up modified files to `.claude/context/tmp/agents-pre-v3-migration/`
- Warns on any `mcp.transport: "sse"` config (BC-1 removal)

## Flags
- `--dry-run` — print changes without writing

## Related breaking changes
- BC-1 (SSE transport removed), BC-2 (manifest required), BC-3 (AIP tokens), BC-4 (registry v3 schema)
