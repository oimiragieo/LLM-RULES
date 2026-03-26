# Go Development Standards

## Core Principles

- Simplicity over cleverness
- Composition over inheritance (embed structs, use interfaces)
- Explicit error handling (never ignore returned errors)
- Format with gofmt / goimports

## Project Layout

Follow standard Go project layout:

- cmd/ — Main applications (one dir per binary)
- internal/ — Private code (not importable)
- pkg/ — Public library code
- api/ — OpenAPI/Swagger specs, proto definitions
- test/ — Integration tests and test data

## Error Handling

- Always check errors: never use blank identifier for errors in production
- Wrap errors with context: fmt.Errorf("operation: %w", err)
- Use errors.Is() and errors.As() for comparison
- Define sentinel errors: var ErrNotFound = errors.New("not found")
- Use custom error types for structured error data

## Concurrency

- Never start a goroutine without knowing when it stops
- Use context.Context for cancellation propagation
- Prefer sync.Mutex over channels for protecting shared state
- Use errgroup.Group for concurrent tasks with error handling
- Always run tests with -race detector

## Interface Design

- Keep interfaces small (1-3 methods preferred)
- Define interfaces where used, not where implemented
- Accept interfaces, return structs
- Leverage stdlib interfaces: io.Reader, io.Writer, fmt.Stringer

## Testing

- Use table-driven tests for multiple cases
- Use t.Helper() in test helper functions
- Use t.Parallel() for independent tests
- Run go test -race ./... in CI

## Anti-Patterns

- init() with side effects (hard to test)
- Package-level mutable state (use DI instead)
- Naked returns in long functions
- interface{}/any when concrete types are known
- Goroutine leaks (always drain channels, use context cancellation)

## Linting

- go vet ./...
- golangci-lint run
- staticcheck ./...

## When to invoke

Skill({ skill: "go-expert" }) for Go development tasks
