# Code Standards

## Code Organization

- Prefer small, cohesive files over large ones
- Keep interfaces narrow; separate concerns by feature
- Use `.cjs` extension for CommonJS modules (hooks, Node.js scripts)
- Use `.mjs` or `.ts` extension for ESM modules (tools, library code)
- Place tests in `tests/` directory mirroring source structure

## Code Style

- Favor immutability; avoid in-place mutation
- Validate inputs and handle errors explicitly
- Avoid ad-hoc console logging in production code
- Use lowercase kebab-case for filenames (e.g., `user-service.js`)
- Add provenance headers for generated files:
  ```markdown
  <!-- Agent: {type} | Task: #{id} | Session: {date} -->
  ```

## Patterns

- Prefer composition over inheritance
- Keep async boundaries explicit
- Use structured logging for diagnostics (not console.log)
- Avoid deeply nested conditionals (extract to functions)
- Apply single responsibility principle

## Error Handling

- Validate all inputs at boundaries
- Use explicit error handling (try/catch, .catch())
- Provide user-friendly error messages for 4xx errors
- Include debugging context for 5xx errors
- Never swallow exceptions silently

## Best Practices

- Make code self-documenting through clear naming
- Extract magic numbers to named constants
- Keep functions focused on one task
- Document public APIs and complex logic
- Leave code cleaner than you found it

## Lint and Format (MANDATORY)

- Run `pnpm lint:fix` before committing any code changes
- Run `pnpm format` before committing any code changes
- Both must pass with zero errors/changes before a task is marked complete
- This is a BLOCKING requirement - no exceptions
