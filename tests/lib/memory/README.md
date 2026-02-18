# Reflection Memory TDD Scenario Backlog (Source of Truth)

This file is the canonical scenario list for the memory hardening plan.

## Scenario IDs

- `S0`: Path canonicalizer helper normalizes forward/backslash/mixed path variants to identical canonical form.
- `S1`: Direct `Write` to `patterns.json` is blocked when `MEMORY_DIRECT_WRITE_ENFORCEMENT=block`.
- `S2`: Direct `Write` to `gotchas.json` is blocked when `MEMORY_DIRECT_WRITE_ENFORCEMENT=block`.
- `S3`: Direct `Edit` to `open-findings.json` / `access-stats.json` is blocked when enforcement is `block`.
- `S4`: Direct writes are allowed with warning when `MEMORY_DIRECT_WRITE_ENFORCEMENT=warn`.
- `S5`: Non-memory paths remain allowed (no regression).
- `S6`: `MemoryRecord` writes gotcha/pattern entries with source metadata.
- `S7`: Reflection event mapping recognizes `MemoryRecord` and extracts structured items.
- `S8`: Recording persists `source` / `writeSource` / `confidence`.
- `S9`: Duplicate gotcha is skipped.
- `S10`: Similar but non-duplicate gotcha is created.
- `S11`: Dedup failure is fail-open and records fallback status.
- `S12`: MemoryRecord flow writes STM entry.
- `S13`: Semantic read helper injects prior learnings.
- `S14`: Reflection log includes `memoryWrites` and `memoryReadSource`.
- `S15`: Audit fails for missing/invalid write source.
- `S16`: Migration backfills write source and audit passes.

## Primary test files

- `tests/lib/memory/path-canonicalizer.test.cjs` (`S0`)
- `tests/lib/memory/memory-write-enforcement.test.cjs` (`S1`-`S5`)
- `tests/lib/memory/reflection-memory-integration.test.cjs` (`S6`-`S8`, `S12`-`S14`)
- `tests/lib/memory/memory-dedup.test.cjs` (`S9`-`S11`)
- `tests/lib/memory/memory-write-audit.test.cjs` (`S15`-`S16`)
