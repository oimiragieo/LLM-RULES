---
paths:
  - .claude/skills/test-generator/**
---

# Test Generator Rules

## Core Principles

- Test type determines strategy (unit, integration, E2E, contract, performance)
- Analyze existing test patterns before generating new tests
- Follow project testing conventions (framework, naming, structure)
- Comprehensive coverage includes happy paths, edge cases, and error scenarios
- Generated tests must be runnable and syntactically valid

## Test Type Selection Matrix

| Type            | Focus                    | Isolation | Speed     | Best For                               |
| --------------- | ------------------------ | --------- | --------- | -------------------------------------- |
| **Unit**        | Single function/class    | High      | Fast      | Business logic, pure functions         |
| **Integration** | Service interactions     | Medium    | Moderate  | API endpoints, database queries        |
| **E2E**         | Full user flows          | Low       | Slow      | Critical paths, authentication flows   |
| **Component**   | UI rendering/interaction | Medium    | Moderate  | React/Vue components, DOM manipulation |
| **Contract**    | API interface compliance | High      | Fast      | API contracts, schema validation       |
| **Performance** | Load/stress testing      | Low       | Very Slow | Throughput, latency, resource usage    |

## Fixture Generation Rules

### Fixture Types

| Fixture Type | Use For                 | Example                                      |
| ------------ | ----------------------- | -------------------------------------------- |
| Static Data  | Immutable test data     | `const mockUser = { id: '1', name: 'Test' }` |
| Factory      | Generate variations     | `createUser({ name: 'Custom' })`             |
| Builder      | Complex object assembly | `new UserBuilder().withEmail('x').build()`   |
| Snapshot     | Regression testing      | `expect(output).toMatchSnapshot()`           |

### Fixture Standards

- Use factory functions for dynamic data (not hardcoded objects)
- Seed random generators for reproducibility
- Store fixtures in `tests/fixtures/` directory
- Use descriptive names (mockAuthenticatedUser, invalidEmailFixture)
- Share fixtures across test files (avoid duplication)

## Naming Conventions

### Test File Naming

- Unit tests: `<filename>.test.ts` or `<filename>.spec.ts`
- Integration tests: `<feature>.integration.test.ts`
- E2E tests: `<flow>.e2e.test.ts`
- Contract tests: `<api>.contract.test.ts`

### Test Case Naming

Follow pattern: `it('should <behavior> when <condition>')`

**Good examples:**

- `it('should return 404 when user not found')`
- `it('should hash password before saving to database')`
- `it('should redirect to login when token expires')`

**Bad examples:**

- `it('test user creation')` (vague)
- `it('works')` (no context)
- `it('should do the thing')` (unclear)

## Edge Case Enumeration

### Required Edge Cases

| Category       | Test Cases                                                           |
| -------------- | -------------------------------------------------------------------- |
| **Boundaries** | Empty input, null, undefined, max/min values, overflow               |
| **Errors**     | Network timeout, database failure, invalid input, auth failure       |
| **State**      | First use, concurrent access, race conditions, retry logic           |
| **Data**       | Unicode, special characters, SQL injection, XSS, very long strings   |
| **Types**      | Type mismatches, missing required fields, extra fields, wrong format |

### Edge Case Checklist

Before finalizing tests, verify coverage:

- [ ] Empty/null/undefined inputs tested
- [ ] Boundary values tested (0, -1, MAX_INT)
- [ ] Error scenarios tested (network, auth, validation)
- [ ] Concurrent access scenarios tested (if applicable)
- [ ] Security scenarios tested (injection, XSS, CSRF)

## Anti-Patterns

| Anti-Pattern                   | Problem                           | Fix                                      |
| ------------------------------ | --------------------------------- | ---------------------------------------- |
| Testing implementation details | Brittle tests, breaks on refactor | Test public API behavior, not internals  |
| No assertions                  | Test passes but doesn't verify    | Add explicit assertions for every test   |
| Shared mutable state           | Tests interfere with each other   | Use beforeEach/afterEach for isolation   |
| Magic numbers in assertions    | Unclear expected values           | Use named constants or fixtures          |
| Overly complex setup           | Hard to understand test intent    | Extract to helper functions or factories |
| No error path testing          | Missing half the test coverage    | Test both success and failure scenarios  |
| Generic test names             | Can't identify what failed        | Use descriptive names matching behavior  |

## Integration Points

### Agents Using This Skill

- **developer** (TDD): Generates tests before implementation
- **qa**: Generates comprehensive test suites
- **code-reviewer**: Validates test coverage in PRs

### Related Skills

- **tdd**: Test-driven development methodology
- **verification-before-completion**: Test execution verification
- **code-analyzer**: Coverage analysis and metrics

### Workflows

- **feature-development-workflow.md**: Test generation in Implement phase
- **sparc-methodology.md**: Test-first refinement phase

## Test Generation Workflow

1. **Analyze Target Code**: Read component/function/API to understand behavior
2. **Identify Test Type**: Select unit/integration/E2E based on scope
3. **Review Existing Patterns**: Find similar tests to match conventions
4. **Enumerate Test Cases**: List happy paths, edge cases, error scenarios
5. **Generate Test Code**: Write tests following project patterns
6. **Validate Syntax**: Ensure tests are runnable (imports, framework setup)
7. **Check Coverage**: Verify all requirements covered

## Coverage Validation Checklist

Before marking test generation complete, verify:

- [ ] All public functions/methods have tests
- [ ] All error paths are tested
- [ ] All edge cases are covered
- [ ] Tests are syntactically valid
- [ ] Tests can be executed successfully
- [ ] Coverage meets project thresholds (target: ≥80%)
- [ ] Test names are descriptive
- [ ] Fixtures are reusable and shared

## Related References

- `.claude/skills/test-generator/SKILL.md` - Complete test generation guide
- `.claude/skills/tdd/SKILL.md` - TDD methodology
- `.claude/schemas/skill-test-generator-output.schema.json` - Output schema
