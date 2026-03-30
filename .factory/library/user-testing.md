# User Testing

Testing surface, resource cost classification, and validation approach.

**What belongs here:** How to validate the mission's output, testing tools, concurrency limits.

---

## Validation Surface

This mission builds programmatic infrastructure (no UI). Validation is through:

1. **Unit test suites** - Each module's test file in tests/mission/, tests/services/, tests/readiness/
2. **Integration tests** - E2E pipeline tests with mock workers
3. **CLI command validation** - readiness-report produces valid JSON
4. **JSON output contract verification** - All outputs validated against AJV schemas

### Test Execution

```bash
# Individual module tests
node --test tests/mission/<module>.test.cjs

# Full test suite (must not break existing tests)
pnpm test

# Format check
pnpm format:check

# Full validation suite
pnpm validate:full
```

## Validation Concurrency

**Machine specs:** 128 GB RAM, 57 GB free, multiple CPU cores
**Max concurrent validators:** 5 (all programmatic, minimal resource per instance)

All validation is programmatic (unit/integration tests). Each validator instance:

- ~100 MB RAM for Node.js process
- Temp directory for filesystem tests
- No long-running services needed

5 concurrent validators = ~500 MB additional, well within the 57 GB available headroom.

## Resource Cost Classification

| Surface           | Tool        | RAM per instance | Max concurrent |
| ----------------- | ----------- | ---------------- | -------------- |
| Unit tests        | node --test | ~100 MB          | 5              |
| Integration tests | node --test | ~200 MB          | 5              |
| CLI validation    | node script | ~100 MB          | 5              |

## Flow Validator Guidance: Unit Tests

When testing assertions via unit tests:

1. Run the specific test file associated with the module using `node --test tests/mission/<module>.test.cjs`.
2. Do not run the full `pnpm test` suite as it may time out and takes a long time.
3. Assertions are considered passed if the relevant tests in the file pass. You may need to inspect the test file briefly to map the tests to the assertion IDs, or simply run the test file and if all pass, assume the implementation meets the contract.
4. If a test fails, capture the error output as evidence.
5. You can execute multiple test files if your group spans multiple modules.
6. The tests use temporary directories for filesystem interactions and should be safe to run concurrently. Do not modify global state or create files outside of the test temporary directories.

## Flow Validator Guidance: Integration Tests

For cross-area integration assertions (VAL-INFRA-*, VAL-CROSS-*, VAL-E2E-*):

1. Run integration tests: `node --test tests/integration/<file>.test.cjs`
2. Each describe() block maps to a validation assertion ID
3. Integration tests create temp workspaces and clean up after themselves
4. Tests use mock workers (no real LLM calls) — should complete quickly
5. Some tests (VAL-E2E-003, VAL-E2E-004) run against the real agent-studio repo
