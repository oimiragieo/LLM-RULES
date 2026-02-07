# Hooks

## Core Rules

- Hooks must never break the tool pipeline
- Use stderr for logging; stdout for structured hook outputs only
- All hooks must handle errors gracefully (exit 0 on non-critical failures)

## Hook Protocol

- Hooks use **stdin/stdout JSON protocol**
- Input: JSON object via stdin with tool invocation details
- Output: JSON object via stdout with `{ allow: true/false, message?: string }`
- Exit codes: `0` = allow, `2` = block
- Never use blocking operations or network calls in pre-commit hooks

## Hook Organization

- Hooks live in `.claude/hooks/` organized by concern:
  - `routing/` - Agent routing and spawning validation
  - `safety/` - File safety, path validation, Windows compatibility
  - `validation/` - Input validation, schema validation
  - `reflection/` - Reflection enforcement and verification
  - `git/` - Git-related hooks (pre-commit, commit-msg)

## Creating New Hooks

- Use `hook-creator` skill for new hooks
- Test hooks with hook test framework: `pnpm test:hooks`
- Add graceful degradation (try/catch wrapping)
- Document hook behavior in frontmatter

## Reference Documentation

See `.claude/docs/HOOKS_REFERENCE.md` for comprehensive hook authoring guide.
