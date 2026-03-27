# User Testing

Testing surface, validation approach, and resource cost classification.

**What belongs here:** How to test the user-facing surface, tool requirements, resource costs.
**What does NOT belong here:** Unit test details (those are in services.yaml commands).

---

## Validation Surface
- **Primary surface:** CLI (Claude Code terminal session)
- **No web UI** — agent-studio is a Claude Code extension, not a web application
- **No browser testing needed** — all validation is via test suites, CLI scripts, and integration tests

## Validation Tools
- `node --test` — Unit and integration tests (984 files)
- `pnpm validate:full` — 20+ validation scripts (reference integrity, schema compliance, routing consistency)
- `pnpm integration:headless` — Full agent framework integration test
- `pnpm metrics:ci` — Routing, spawn, memory, and findings metrics validation

## Validation Concurrency
- Machine: 128GB RAM, 16 logical processors, ~65GB available
- Test concurrency: 1 (set in test command, node --test --test-concurrency=1)
- Validation scripts can run sequentially via `pnpm validate:full` or parallel via `pnpm validate:full:parallel`
- Max concurrent validators: 5 (CLI-only surface, each validator uses ~200MB for node process)

## Resource Cost Classification
- **Unit tests:** Lightweight (~200MB per node process). Can run with concurrency=1 safely.
- **Validation suite:** Medium (~500MB peak for schema validation with --max-old-space-size=4096). Run sequentially.
- **Integration test:** Heavier (~1GB for full framework simulation). Run alone.
- **Metrics CI:** Lightweight (~200MB). Can run after other tests.
