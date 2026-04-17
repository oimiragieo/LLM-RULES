# Memory Consolidation

Worker-pool sub-modules for STM→MTM consolidation and retention enforcement.

## Contract

- `consolidate-agent.cjs` — exports `consolidate(db)`: scans `file_memory` rows pending
  consolidation, emits an insight row, marks rows as consolidated. Used by the A2A worker-pool
  dispatcher (`tests/integration/a2a-worker-ingest.test.cjs`).
- `retention-enforcer.cjs` — exports `enforceRetention(db, now?)`: purges `file_memory` rows
  whose `expires_at` has passed. Used by the same A2A ingest test.

## Usage Notes

- Both modules accept a `better-sqlite3` DB handle. They are **not** standalone binaries.
- Do **not** call these modules directly from hook scripts; use the worker-pool dispatcher.
- If the DB handle is null or missing `prepare`, both functions return safe zero-counts.
