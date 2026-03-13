# Documentation Always (IRON LAW)

Every feature, skill creation, agent creation, or capability addition MUST update docs before the work is considered complete. No exceptions.

## Mandatory on EVERY feature/fix commit

### 1. CHANGELOG.md (ALWAYS)

Add an entry under `## [Unreleased]` using Keep a Changelog format:

```markdown
## [Unreleased]

### Added

- Brief description of what was added and why
```

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`

### 2. README.md (when capabilities change)

Update when ANY of the following change:

- New commands, scripts, or CLI flags
- New environment variables (required or optional)
- New agents, skills, or tools added to the framework
- Setup or installation steps change
- Architecture diagrams become stale

### 3. .env.example (ALWAYS when new env vars introduced)

- Add every new environment variable with a placeholder value and inline comment
- Never leave env vars undocumented — they become invisible configuration debt

```bash
# Feature: <what this enables>
NEW_VAR=example_value
```

## Triggers

| Trigger                       | CHANGELOG   | README          | .env.example   |
| ----------------------------- | ----------- | --------------- | -------------- |
| New feature / capability      | YES         | if user-visible | if new env var |
| Bug fix                       | YES         | rarely          | no             |
| New agent or skill            | YES         | YES             | if new env var |
| New hook                      | YES         | no              | if new env var |
| New env var                   | YES         | if required     | YES            |
| Refactor (no behavior change) | YES (brief) | no              | no             |
| Docs-only change              | no          | YES             | no             |

## Anti-Patterns (NEVER)

- Marking a task `completed` without a CHANGELOG entry
- Adding a new env var without updating `.env.example`
- Shipping a new agent/skill without updating README capabilities section
- Deferring docs to "a follow-up PR" — docs are part of the feature, not optional cleanup
- Writing CHANGELOG entries so vague they are useless ("misc fixes", "updates")

## Enforcement

- `pre-completion-validation.cjs` checks for CHANGELOG modification on feature tasks
- Code reviewers MUST reject PRs that add env vars without `.env.example` updates
- README staleness is a blocking finding in proactive audits

## Format reference

CHANGELOG date format: `YYYY-MM-DD`
CHANGELOG entry: imperative mood, one sentence minimum, link to task ID if available
README sections: keep alphabetically sorted within each category
