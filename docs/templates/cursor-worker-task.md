# Cursor worker task

## Goal

<!-- One sentence: what outcome is required? -->

## Scope

<!-- What is in scope for this run? What is explicitly out of scope? -->

## Files allowed

<!-- List paths or globs the worker may edit. Empty section means "ask planner first". -->

## TDD steps

<!-- e.g. RED: add failing test -> GREEN: minimal implementation -> REFACTOR if needed -->

1.
2.
3.

## Acceptance criteria

- [ ] <!-- criterion -->
- [ ] <!-- criterion -->

## Verification commands

```bash
node --test <path-to-test>.cjs
node --check scripts/agents/run-cursor-worker.mjs
```

## Required final response

<!-- What the implementing agent must report back (files changed, commands run, exit codes, risks). -->

## Forbidden actions

- Do not revert unrelated work or reformat files outside the allowed list.
- Do not add secrets, disable tests, or weaken validation to “go green”.
- Do not skip documenting commands run and their results.
