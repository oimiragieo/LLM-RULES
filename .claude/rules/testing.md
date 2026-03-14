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

## Test-Driven Generation (TDG)

**AI Integration Throughout Testing Lifecycle**:

1. **Test Generation**: AI generates test cases from requirements
2. **Test Execution**: AI runs tests and interprets results
3. **Failure Analysis**: AI analyzes failures and suggests fixes
4. **Test Maintenance**: AI refactors tests as code evolves

**Pattern**:

```javascript
// AI generates test from requirement
User: "I need login to handle invalid credentials"
AI: [Generates test case with assertions]

// AI interprets test failure
Test fails: "Expected 401, got 500"
AI: "Server error suggests validation missing - check auth middleware"
```

**Benefits**: Faster test authoring, better coverage, faster debugging

## Integration Boundary Testing (ADR-103)

**Focus**: Test at integration boundaries, not internal implementation.

**Why**: Internal refactors shouldn't break tests; API contracts should.

**Pattern**:

```javascript
// X BAD: Testing internal state
expect(authService._tokens).toHaveLength(1);

// V GOOD: Testing boundary behavior
const response = await fetch('/api/login', { credentials });
expect(response.status).toBe(200);
expect(response.headers.get('Set-Cookie')).toContain('token=');
```

**Reference**: ADR-103 defines boundary testing principles

## Property-Based Testing

**Use Case**: Algorithmic correctness across input ranges.

**Pattern**: Instead of testing specific inputs, test properties that should hold for ALL inputs.

**Tool**: `fast-check` (JavaScript)

**Example**:

```javascript
import fc from 'fast-check';

// Instead of testing specific cases
test('sort orders numbers correctly', () => {
  expect(sort([3, 1, 2])).toEqual([1, 2, 3]);
});

// Test property for ALL inputs
fc.assert(
  fc.property(fc.array(fc.integer()), arr => {
    const sorted = sort(arr);
    // Property: adjacent elements should be ordered
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i]).toBeLessThanOrEqual(sorted[i + 1]);
    }
  })
);
```

**Benefits**: Finds edge cases you wouldn't write manually

## Mutation Testing

**Purpose**: Verify test quality, not just code coverage.

**How**: Introduce bugs (mutations) into code; tests should catch them.

**Pattern**:

```javascript
// Original code
if (user.age >= 18) return true;

// Mutation: change >= to >
if (user.age > 18) return true;

// Good test suite catches mutation
test('allows 18-year-old users', () => {
  expect(canVote({ age: 18 })).toBe(true); // Fails with mutation
});
```

**Tool**: Stryker (JavaScript), PITest (Java)

**Metric**: Mutation score (% of mutations caught)

## Skills Reference

- `tdd` skill - Test-Driven Development methodology
- `verification-before-completion` skill - Evidence-based completion gates
- `qa-workflow` skill - Systematic QA validation with fix loops

## Related References

- `ADR-103` - Integration boundary testing principles
- `.claude/agents/core/qa.md` - QA agent responsibilities

## VoltAgent Testing Patterns

**Snapshot Testing for Agent Outputs:**

Capture and assert on agent output structure to prevent regressions across LLM updates:

```typescript
import { expect, test } from 'vitest';

test('agent returns expected structure', async () => {
  const result = await agent.run({ input: 'summarize this document' });
  // Snapshot the shape, not the exact text (LLM output varies)
  expect(result).toMatchObject({
    status: 'success',
    output: expect.any(String),
    toolCallCount: expect.any(Number),
  });
  // Snapshot stable structural properties
  expect(Object.keys(result)).toMatchSnapshot();
});
```

**Contract Testing for Multi-Agent Pipelines:**

Define and verify contracts between agents in a pipeline:

```typescript
// Define the contract
interface PlannerOutputContract {
  tasks: Array<{ id: string; description: string; agent: string }>;
  estimatedSteps: number;
}

test('planner output satisfies developer input contract', async () => {
  const plannerOutput = await plannerAgent.run({ goal: 'add auth' });
  // Validate against contract schema (Zod)
  const parsed = PlannerOutputContractSchema.safeParse(plannerOutput);
  expect(parsed.success).toBe(true);
  // Each task must name a valid agent
  parsed.data!.tasks.forEach(task => {
    expect(VALID_AGENTS).toContain(task.agent);
  });
});
```

**When to invoke**: `Skill({ skill: 'agent-evaluation' })` for LLM-as-judge agent output evaluation

## Cross-Cutting Test Standards (2026 Update)

**Test File Placement:**

- Skill tests: `tests/skills/<skill-name>.test.cjs`
- Agent tests: `tests/agents/<agent-name>.test.cjs`
- Hook tests: `tests/hooks/<hook-name>.test.cjs`
- Library tests: `tests/lib/<module>.test.cjs`

**Coverage Requirements:**

- All hooks must have unit tests covering: allow path, block path, and error/edge cases
- All skills must have integration tests verifying `Skill()` invocation wiring
- Agents must have tool-compliance tests (see `tests/agents/agent-tool-compliance.test.cjs`)

**Test Isolation (MANDATORY):**

- Never share mutable state between `test()` blocks — use `beforeEach` for fresh state
- Never write to `.claude/context/` in tests — use `tests/_tmp/` and clean up in `afterEach`
- Never call real LLM APIs in unit tests — mock at the SDK boundary

**Determinism Gate:**

- Seed random number generators in tests that use randomness
- Pin timestamps with `vi.setSystemTime()` / `MockDate` for date-sensitive logic
- CI must pass with `--seed` for reproducible test ordering
