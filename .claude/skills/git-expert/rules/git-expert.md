# git-expert Rules

## Purpose

Advanced Git operations wrapper. Optimizes token usage by guiding complex git workflows into efficient CLI commands.

## Best Practices

- Never use git push --force
- Never commit secrets
- Always run tests before pushing
- Use SSH key signing instead of GPG for commit verification
- Use sparse-checkout cone mode for monorepo workflows
- Use Git Scalar for large repository performance optimization
- Prefer reftable backend for new repositories (Git 2.45+)

## Integration Points

See SKILL.md for complete documentation.
