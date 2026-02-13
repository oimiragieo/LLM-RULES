# Development Workflow

## Default Flow

1. Define scope and acceptance criteria.
2. Write or update failing test(s) for expected behavior.
3. Implement minimal change to pass tests.
4. Refactor while keeping tests green.
5. Validate lint and formatting.
6. Re-check related docs/references and registries.
7. Prepare commit with clear scope and verification notes.

## Required Commands (Adjust Scope as Needed)

- Tests: project-appropriate targeted tests first
- Lint: `pnpm lint` or scoped lint command
- Format: `pnpm format` or formatter check command
- Reference integrity: `pnpm validate:references`

## Completion Gate

- No placeholder content in committed artifacts.
- No broken cross-file references.
- No skipped verification without explicit rationale.
