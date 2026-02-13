---
paths:
  - .claude/skills/go-expert/**
---

# Go Expert Rules

## Core Principles

- Use latest stable Go version (1.22+) with modern idioms
- Use standard library net/http for API development (ServeMux Go 1.22+)
- Follow RESTful API design principles
- Leverage Go's built-in concurrency features (goroutines, channels)
- Write idiomatic Go code (effective Go guidelines)

## Code Standards

- Implement proper error handling (return errors, don't panic)
- Use custom error types when beneficial
- Follow Go naming conventions (camelCase for unexported, PascalCase for exported)
- Write clear, concise code with descriptive variable names
- Keep functions small and focused

## API Development

- Use appropriate HTTP status codes
- Format JSON responses correctly
- Implement input validation for API endpoints
- Implement proper logging (standard log package or custom logger)
- Consider middleware for cross-cutting concerns (logging, auth)
- Implement rate limiting and authentication when appropriate

## Performance & Concurrency

- Use goroutines for concurrent operations
- Implement proper channel patterns (avoid leaks)
- Use context for cancellation and timeouts
- Implement connection pooling for databases
- Profile and optimize hot paths

## Testing

- Write tests using Go's testing package
- Include table-driven tests for multiple cases
- Use subtests for organized test suites
- Implement benchmarks for performance-critical code
- Aim for high test coverage

## Integration Points

- Used by: `backend-architect`, `go-pro`, `developer` (Go projects)
- Related skills: `api-designer`, `microservices-architect`
- Works with: `security-architect`, `performance-engineer`, `grpc-expert`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
