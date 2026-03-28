# User Testing

Testing surface, validation approach, and resource cost classification.

**What belongs here:** How to validate mission output through its real user surface.

---

## Validation Surface

Primary surface: CLI test commands and validation scripts.
No browser-based UI to test.

### Available Test Commands
- `pnpm test` — Unit/integration tests (~9000 tests, ~2-3 min)
- `pnpm test:framework` — Framework tests (~3250 tests, ~2-3 min)
- `pnpm test:all` — Combined (runs both in parallel)
- `pnpm test:tools` — Tool tests (currently 0 on Windows due to glob issue)
- `pnpm test:code-indexing` — Code indexing (79 tests, ~30s)
- `pnpm validate:full` — Full validation pipeline (~2-5 min)
- `pnpm validate:routing` — Routing consistency
- `pnpm validate:skills` — Skill-agent consistency
- `pnpm skills:ecosystem:gate` — Skill ecosystem scoring
- `pnpm metrics:ci` — Metrics and SLO checks
- `pnpm integration:headless` — Headless integration (144 checks, ~90s)
- `pnpm format:check` — Formatting validation

## Validation Concurrency

Machine: 128GB RAM, 16 cores.
Max concurrent validators: 5 (CLI-based validation is lightweight).
Each test suite uses ~500MB-1GB RAM.
All suites complete within 5 minutes individually.
