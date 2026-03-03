# TDD Skill Observations

This directory contains observations and learnings from applying the Test-Driven Development skill in agent-studio.

## Purpose

The `observations/` directory serves as a feedback loop for continuous improvement of the TDD skill. Agents should record:

1. **Patterns that worked well** - Successful test-driven patterns and approaches
2. **Recurring obstacles** - Common blockers when applying TDD with AI
3. **Failure cases** - Tests that were hard to write or scenarios that exposed design issues
4. **Edge cases discovered** - New scenarios not covered by original skill documentation
5. **Model-specific insights** - Observations about how different LLM models handle TDD cycles

## Structure

Observations are recorded in JSONL format:

```json
{
  "timestamp": "2026-03-03T10:00:00Z",
  "type": "pattern|obstacle|failure|edge_case|model_insight",
  "description": "Human-readable description of the observation",
  "context": "Where this observation applies (implementation, testing, refactoring, etc.)",
  "severity": "critical|high|medium|low",
  "suggestedImprovement": "Potential skill update or documentation fix"
}
```

## When to Write Observations

- **After a TDD cycle** completes (Red-Green-Refactor)
- When RED phase is particularly clear or particularly difficult
- When GREEN phase reveals design issues
- When REFACTOR exposes duplication patterns
- When a test cannot be written without violating TDD principles
- When a model struggles with the canonical sequence

## Example Observations

### Pattern (what worked)

```json
{
  "timestamp": "2026-03-03T10:30:00Z",
  "type": "pattern",
  "description": "Writing test names as behavior statements (test_user_can_login_with_valid_credentials) made test purpose crystal clear during implementation",
  "context": "RED phase",
  "severity": "medium",
  "suggestedImprovement": "Emphasize behavior-driven test naming in TDD skill documentation"
}
```

### Obstacle (what blocked progress)

```json
{
  "timestamp": "2026-03-03T11:00:00Z",
  "type": "obstacle",
  "description": "Testing async database calls required complex mocking setup, violating 'real code' principle",
  "context": "RED and GREEN phases",
  "severity": "high",
  "suggestedImprovement": "Add guidance for testing async I/O boundaries without excessive mocking"
}
```

## Integration with Skill Evolution

Observations are automatically analyzed quarterly to:

1. Identify patterns requiring documentation updates
2. Discover new guidance needed in SKILL.md
3. Assess model-specific coaching requirements
4. Refine the canonical TDD sequence

## References

- [TDD Skill Documentation](../SKILL.md)
- [Testing Anti-Patterns](../testing-anti-patterns.md) - Common patterns to avoid
- [Agent Studio TDD Rules](../../rules/tdd.md)
