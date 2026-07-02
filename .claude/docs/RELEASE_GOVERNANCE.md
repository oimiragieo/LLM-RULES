# Release Governance

Agent Studio uses branch-aware CI, full PR validation, and semver-aware release handling.

## Branches

Fast CI triggers automatically on pushes to:

- `main`
- `feature/**`
- `fix/**`
- `refactor/**`

Do not use a custom release branch prefix unless the workflow triggers are updated first.

## Local Preflight

Minimum local verification before opening or updating a release PR:

```bash
pnpm lint
pnpm format:check
pnpm validate
pnpm validate:schemas
pnpm validate:commands
pnpm validate:agent-skill-refs
pnpm validate:hooks:docs
pnpm agents:registry:validate
pnpm validate:status-check-governance
pnpm test
```

Use the targeted helpers before the full run when you need a tighter loop:

```bash
pnpm validate:affected --file .claude/lib/routing/router.cjs --file .claude/agents/core/developer.md
pnpm flake:report
pnpm release:gate --commit-message "docs: refresh release runbook" --changed-file README.md
```

## New Helpers

### Flake Ledger

`pnpm flake:report`

- Reads `.claude/context/ci/flake-ledger.json`
- Summarizes total entries, total occurrences, and failure categories
- Quarantines malformed ledgers during write recovery before continuing

### Impacted Validation Planner

`pnpm validate:affected`

- Maps changed paths to repo-specific validation commands
- Recommends targeted test areas and benchmark slices
- Falls back conservatively to `lint`, `format:check`, `validate`, and `test` when it cannot classify a change safely

### Release Gate

`pnpm release:gate`

- Reuses the semver diff logic for artifact-level change classification
- Treats docs-only changes as non-breaking
- Requires both:
  - explicit breaking-change signaling in the commit message
  - a migration guide
    for semver-major releases

Example major-release gate:

```bash
pnpm release:gate --old old.md --new new.md --type agent --commit-message "feat(agent)!: remove write tool" --migration-guide .claude/docs/MIGRATION.md
```

## Minor Release Path

Use the minor path when the change is additive, compatibility-preserving, or a bug fix.

Required:

- conventional commit aligned with scope
- changelog updated
- local preflight green
- PR opened
- remote checks green:
  - `CI`
  - `Full Validation`
  - `Global Quality Gates`
  - `memory-ci`
  - `memory-mvp-gate`
  - `nightly-strict-gate`
  - `creator-ecosystem-validation`
  - `validate-commands`
  - `validate-skills`

## Major Release Path

Use the major path when a public contract changes incompatibly:

- agent or skill frontmatter removals
- schema incompatibilities
- CLI or hook contract breaks
- operator workflow breaks that need migration

Required in addition to the minor path:

- semver-major evidence from `release:gate`
- migration guide present
- changelog breaking-change callout
- PR-only merge path after all required checks pass

## Merge Guidance

- Prefer PRs over direct pushes for all release work
- Prefer merge queue when the branch is carrying validation-sensitive changes
- Treat retries as diagnosis support, not policy: deterministic failure evidence should be captured first
