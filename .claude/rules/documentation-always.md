# Documentation Always (IRON LAW)

Every feature, skill creation, agent creation, or capability addition MUST update docs before the work is considered complete. No exceptions.

## Mandatory on EVERY feature/fix commit

**1. CHANGELOG.md (ALWAYS)**: Add entry under `## [Unreleased]` using Keep a Changelog format with categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Use imperative mood, link to task ID if available.

**2. README.md** (when capabilities change): Update for new commands/scripts/CLI flags, new env vars, new agents/skills/tools, changed setup steps, stale architecture diagrams.

**3. .env.example** (ALWAYS when new env vars introduced): Add every new env var with placeholder value and inline comment. Never leave env vars undocumented.

## Triggers

| Trigger                | CHANGELOG   | README          | .env.example   |
| ---------------------- | ----------- | --------------- | -------------- |
| New feature/capability | YES         | if user-visible | if new env var |
| Bug fix                | YES         | rarely          | no             |
| New agent or skill     | YES         | YES             | if new env var |
| New env var            | YES         | if required     | YES            |
| Refactor               | YES (brief) | no              | no             |

## Anti-Patterns (NEVER)

- Mark a task `completed` without a CHANGELOG entry
- Add a new env var without updating `.env.example`
- Ship a new agent/skill without updating README
- Defer docs to "a follow-up PR"

## Enforcement

`pre-completion-validation.cjs` checks for CHANGELOG modification on feature tasks.
