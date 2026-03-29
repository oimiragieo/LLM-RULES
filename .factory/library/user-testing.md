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

| Surface | Tool | RAM per instance | Max concurrent |
|---------|------|-----------------|----------------|
| Unit tests | node --test | ~100 MB | 5 |
| Integration tests | node --test | ~200 MB | 5 |
| CLI validation | node script | ~100 MB | 5 |
