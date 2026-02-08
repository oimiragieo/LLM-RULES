# Git Workflow

## Commit Guidelines

- Keep changes scoped and reviewable
- Prefer small, focused commits (one logical change per commit)
- Ensure tests and lint pass before committing
- Use descriptive branch names and commit messages

## Commit Message Format

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Add `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` for AI-assisted commits
- Keep subject line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"

## Branch Workflow

- Create feature branches from main: `git switch -c feature/auth`
- Never force-push to main/master
- Use descriptive branch names: `feature/`, `fix/`, `refactor/`

## Pre-Commit Requirements

- Run lint: `pnpm lint:fix` (all must pass with 0 errors)
- Run format: `pnpm format` (no changes produced)
- Run tests: `pnpm test` (all must pass)
- Validate commit messages via `commit-validator` skill
- Security scan via pre-commit hooks
- No console.log statements in production code

## Large Changes

- Create commit checkpoints for changes affecting 40+ files
- Use `git commit -m` with clear checkpoint descriptions
- Break large refactors into multiple commits
