# Git Workflow

## Commit Guidelines

- Keep changes scoped and reviewable
- Prefer small, focused commits (one logical change per commit)
- Ensure tests and lint pass before committing
- Use descriptive branch names and commit messages

## Commit Message Format

### Conventional Commits (Strict Enforcement)

**Required format**: `<type>: <subject>`

**Types**:

- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code restructuring (no behavior change)
- `docs:` - Documentation changes
- `chore:` - Maintenance (deps, config)
- `test:` - Test changes
- `perf:` - Performance improvements

**Rules**:

- Keep subject line under 72 characters
- Use imperative mood: "Add feature" not "Added feature"
- No period at end of subject
- Body (optional) separated by blank line

**Example**:

```
feat: add JWT authentication middleware

Implements authentication using JWT tokens with refresh capabilities.
Includes rate limiting and token rotation.
```

### AI Commit Attribution (MANDATORY)

**For ALL AI-assisted commits**, add:

```
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Why**: Transparency about AI contribution, audit trail

**Pattern**:

```
feat: add user authentication

Implements JWT-based authentication with refresh tokens.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### Frequent Commits as Save Points

**Pattern**: Commit every logical unit of work, not just at "done".

**Benefits**:

- Easy rollback to working state
- Clear history of thought process
- Prevents large, hard-to-review commits

**Frequency**: Commit when:

- Feature increment works (even if incomplete)
- Test passes
- Before risky refactor
- End of work session

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

## Related References

- `commit-validator` skill - Validates commit message format
- `.claude/hooks/git/commit-msg` - Pre-commit hook for validation
