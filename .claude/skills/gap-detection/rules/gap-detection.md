# Gap Detection Rules

## Core Principles

- Every finding MUST cite a concrete file path and (when applicable) line number
- Gaps are ranked by blast radius: public API > module entrypoint > internal helpers > tests
- Run on unfamiliar codebases before starting any significant work
- Never report "0 gaps" without running the actual scan commands

## Anti-Patterns

- Never produce a gap report without file paths
- Never skip the TODO/FIXME scan — deferred debt is real debt
- Never run scans on `node_modules/`, `dist/`, `.git/`, or `build/` directories
- Never assume a file is documented without checking for a comment above its exports

## Integration Points

- Use before planning sessions to understand existing quality debt
- Use after adding new files to verify documentation coverage
- Feeds into `proactive-audit` for broader health checks
- Pair with `tdd` to address test coverage gaps discovered during scan

## When to Invoke

`Skill({ skill: 'gap-detection' })` — on session start or before planning sessions in unfamiliar repositories
