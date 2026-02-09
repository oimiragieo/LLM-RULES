# TDD (Test-Driven Development) Rules

## Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions.

## Red-Green-Refactor Cycle

### RED - Write Failing Test
- Write one minimal test showing what should happen
- Test one behavior
- Clear name describes behavior
- Real code (no mocks unless unavoidable)

### Verify RED - Watch It Fail
**MANDATORY. Never skip.**
- Confirm test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

### GREEN - Minimal Code
- Write simplest code to pass the test
- Just enough to pass
- No features beyond the test
- No refactoring other code

### Verify GREEN - Watch It Pass
**MANDATORY.**
- Confirm test passes
- Other tests still pass
- Output pristine (no errors, warnings)

### REFACTOR - Clean Up
- After green only
- Remove duplication
- Improve names
- Extract helpers
- Keep tests green

## When to Use

**Always:**
- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions** (ask your human partner):
- Throwaway prototypes
- Generated code
- Configuration files

## Red Flags - STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- Tests added "later"
- "Just try this first, then investigate"
- "Keep as reference" or "adapt existing code"
- "I already manually tested it"

## Common Rationalizations

| Excuse                              | Reality                                    |
|-------------------------------------|--------------------------------------------|
| "Too simple to test"                | Simple code breaks. Test takes 30 seconds. |
| "I'll test after"                   | Tests passing immediately prove nothing.   |
| "Already manually tested"           | Ad-hoc does not equal systematic.          |
| "Deleting X hours is wasteful"      | Sunk cost fallacy. Keep = technical debt.  |
| "Need to explore first"             | Fine. Throw away exploration, start TDD.   |
| "Test hard = design unclear"        | Listen to test. Hard to test = hard to use.|
| "TDD will slow me down"             | TDD faster than debugging.                 |

## Pre-Completion Requirements (BLOCKING)

Before marking any task complete:

1. `pnpm lint:fix` — fix all linting issues (0 errors)
2. `pnpm format` — format all files (no changes)
3. All tests pass
4. Every new function/method has a test
5. Watched each test fail before implementing

**Tasks are NOT complete until all pass.**

## Bug Fix Pattern

1. Write failing test reproducing bug
2. Verify test fails (RED)
3. Fix bug
4. Verify test passes (GREEN)
5. Verify existing tests still pass
6. Refactor if needed

## Verification Checklist

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] `pnpm lint:fix` passes with 0 errors
- [ ] `pnpm format` produces no changes
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

## Related Skills

- `debugging` - Systematic debugging process
- `verification-before-completion` - Pre-completion gates
- `code-analyzer` - Static code analysis

## Related References

- `.claude/skills/tdd/SKILL.md` - Complete TDD documentation
- `.claude/skills/tdd/testing-anti-patterns.md` - Common testing mistakes
- `.claude/rules/testing.md` - Testing organization and best practices
- `.claude/rules/code-standards.md` - Lint and format requirements
