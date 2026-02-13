# Tech Stack

## Runtime and Package Management

- JavaScript/Node.js ecosystem
- `pnpm` for dependency and script orchestration

## Core Project Areas

- `.claude/agents/` for agent definitions
- `.claude/skills/` for skill implementations and references
- `.claude/workflows/` for process definitions
- `.claude/schemas/` for JSON schemas and compatibility aliases
- `scripts/validation/` for reference and integrity checks

## Quality Tooling

- ESLint for linting
- Prettier for formatting
- Node.js test runner and project test scripts for verification

## Operational Constraints

- Keep compatibility aliases for legacy references only when required.
- Prefer canonical file locations and documented redirects.
- Regenerate indexes/registries after structural changes.
