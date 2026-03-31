# Git Workflow

## Commit Guidelines

- Keep changes scoped and reviewable; prefer small, focused commits
- Ensure tests and lint pass before committing
- Each agent task produces exactly one atomic commit (1:1 task-to-commit)

## Commit Message Format (Conventional Commits — Strict)

**Format**: `<type>: <subject>` (subject ≤72 chars, imperative mood, no period)

**Types**: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`

**AI Attribution (MANDATORY)**: All AI-assisted commits must include:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

## Branch Workflow

- Create branches from main: `git switch -c feature/name`
- Never force-push to main/master
- Use `feature/`, `fix/`, `refactor/` prefixes

## Pre-Commit Requirements

- `pnpm lint:fix` — 0 errors
- `pnpm format` — no changes
- Validate commit messages via `commit-validator` skill
- Security scan via pre-commit hooks
- No `console.log` in production code

## Related References

- `commit-validator` skill - Validates commit message format
- Pre-commit hooks enforced via `.claude/settings.json`
