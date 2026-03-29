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

## Flow Validator Guidance: CLI

- Note on PowerShell: When chaining commands with `&&` (e.g., `pnpm index-rules && git diff`), prepend the command with `cmd /c ` because `&&` is not supported in the default PowerShell runner.
- Isolation: Tests can generally be run concurrently as they do not mutate shared global state, except that heavy test suites (like `pnpm test:all`) might compete for CPU/RAM.
- Validation is purely CLI-based. Use `Execute` tool to run the required `pnpm` and `node` commands.
- Check the output of commands carefully to verify pass/fail criteria.
- Evidence can be saved as text files containing the command outputs.

- Note on format:check: increase execution timeout to 180s or more, because the default 60s is often not enough to check >10,000 files.
