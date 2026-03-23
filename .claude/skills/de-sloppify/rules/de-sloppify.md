# De-Sloppify Rules

## Iron Law: Cleanup Must Not Change Behavior

Every removal must be verifiable as dead code, unused import, or formatting-only.
**If there is any doubt — LEAVE IT.**

## Core Principles

1. **Two-phase separation**: Implementer and cleanup agent are distinct roles. Never combine cleanup with logic changes.
2. **Conservative by default**: When in doubt, don't remove. A false negative (leaving slop) is better than a false positive (removing live code).
3. **Diff verification required**: Every cleanup session must produce a diff. Review it before committing.
4. **Snapshot first**: Always capture pre-cleanup state before editing any file.

## What Is Safe to Remove

- Import statements where the imported identifier appears nowhere else in the file
- `console.log`, `console.warn`, `console.debug`, `console.info`, `console.trace` in non-catch contexts
- Commented-out code that matches code patterns (assignments, function calls, control flow)
- Trailing whitespace
- More than 2 consecutive blank lines

## What Must NOT Be Removed

- `console.error` inside catch blocks — may be intentional error logging
- JSDoc comments (`/** ... */`) and section comments (`/* ... */`)
- TODO comments with ticket references or explanations
- Disabled test blocks (`it.skip(...)`, `describe.skip(...)`)
- Feature-flag guarded dead code — may be awaiting activation
- Any code with a comment referencing a ticket number, ADR, or explanation

## Scanning Tools

Use the CLI scanner — never regex-hunt for "unused" code manually:

```bash
node .claude/skills/de-sloppify/scripts/main.cjs --action find-unused-imports --files "..."
node .claude/skills/de-sloppify/scripts/main.cjs --action find-console-logs --files "..."
node .claude/skills/de-sloppify/scripts/main.cjs --action find-commented-code --files "..."
```

## Anti-Patterns

- Never remove code you can't verify is unused without running it
- Never skip the snapshot step
- Never commit cleanup and logic changes in the same commit
- Never remove console.error without checking if it's in a catch block
- Never remove a TODO that has a linked ticket
