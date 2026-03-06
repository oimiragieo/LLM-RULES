# File Deletion Safety

## Untracked Files Are NOT Disposable (IRON LAW)

**NEVER delete untracked files without explicit user confirmation.**

Untracked files (`??` in `git status`) are often in-progress work that hasn't been committed yet. Deleting them destroys work permanently — there is no git recovery.

## Before ANY File Deletion

1. **Check if tracked:** `git ls-files <path>` — if empty, the file is untracked
2. **If untracked:** ASK the user before deleting. No exceptions.
3. **If tracked:** Deletion is recoverable via git, but still confirm for non-trivial files

## Rules

- Never bulk-delete untracked files during cleanup
- Never assume untracked files are "test artifacts" or "stale" — they may be the user's current work
- `git clean` is FORBIDDEN without explicit user request
- When cleaning up a working tree, only revert tracked file changes — leave untracked files alone
- If you're unsure whether a file matters, ask

## Anti-Patterns (NEVER)

- `rm` on untracked files without asking
- Assuming `??` status means "safe to delete"
- Batch-deleting files matching a pattern without reviewing each one
- Claiming cleanup requires removing untracked files

## Origin

Router deleted 4 untracked workflow files (`ptest-skill-*-workflow.md`) assuming they were disposable test artifacts. They were the user's in-progress work. Permanently lost.
