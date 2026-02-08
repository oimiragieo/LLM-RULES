# Testing

## Test-Driven Development

- Use TDD for new features and bug fixes (Red-Green-Refactor cycle)
- Write failing test first, then minimal code to pass, then refactor
- Never write production code without a failing test first

## Test Organization

- Add unit tests for utilities and business logic
- Add integration tests for API boundaries
- Keep tests deterministic and isolated (no shared state)
- Place test files in `tests/` directory mirroring source structure

## Test Execution

- Use `node --test` as test runner
- Run tests before committing: `pnpm test`
- Record test commands and results in progress notes
- All tests must pass before marking work complete

## Code Quality Gates (BLOCKING)

- Run `pnpm lint:fix` after all tests pass
- Run `pnpm format` after all tests pass
- Both are blocking requirements before task completion
- No exceptions - lint and format must be clean

## Regression Tests

- Create regression test for every bug fix
- Verify Red-Green cycle: test fails → fix → test passes
- Revert fix → verify test fails again → restore fix
- Use TDD pattern to prevent future regressions

## Skills Reference

- `tdd` skill - Test-Driven Development methodology
- `verification-before-completion` skill - Evidence-based completion gates
- `qa-workflow` skill - Systematic QA validation with fix loops
