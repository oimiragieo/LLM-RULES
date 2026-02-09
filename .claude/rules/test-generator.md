# Test Generator

Generates test code from specifications, components, and API endpoints. Creates unit tests, integration tests, and E2E tests following project testing patterns and conventions.

## When to Use

- Generating unit tests from code
- Creating integration tests for APIs
- Building E2E test suites
- Generating test fixtures and mocks
- Converting manual tests to automated
- Expanding test coverage

## Test Types

| Type            | Use For                                      |
| --------------- | -------------------------------------------- |
| **Unit**        | Functions, classes, modules                  |
| **Integration** | API endpoints, services, databases           |
| **E2E**         | User flows, critical paths                   |
| **Component**   | UI components, interactions                  |
| **Contract**    | API contracts, schemas                       |
| **Performance** | Load testing, benchmarks                     |

## Usage

```javascript
Skill({ skill: 'test-generator', args: 'unit' });
```

## Features

- Extracts test cases from specifications
- Generates fixtures and mocks
- Follows project testing conventions
- Includes edge cases and error handling
- Creates descriptive test names
- Adds helpful comments

## Related References

- `.claude/skills/test-generator/SKILL.md` - Complete test generation guide
- `.claude/skills/tdd/SKILL.md` - TDD methodology
- `.claude/schemas/skill-test-generator-output.schema.json` - Output schema
