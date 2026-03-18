# Ralph Loop Rules

## Core Principles

- Every ralph loop must have a clear, binary completion condition
- Max iterations must always be set (default 25, max 100)
- State must be persisted to survive context resets
- Guardrails must be read at the start of each iteration
- Completion signal must be backed by passing validation commands

## Verification-First Exit

Never output the completion signal unless:

1. All validation commands have been run
2. All validation commands passed with zero errors
3. The findings log has zero OPEN findings
4. You have command output evidence proving it

## Anti-Patterns

- Claiming completion without running validations
- Ignoring guardrails.md learned lessons
- Running without max iterations safety cap
- Not reading previous iteration state before starting work
- Using vague or subjective completion criteria

## Integration Points

### Related Agents

- `developer` — Primary executor for code-level ralph loops
- `qa` — Verification-focused ralph loops (test passing, lint clean)
- `master-orchestrator` — Multi-agent ralph loop coordination

### Related Skills

- `verification-before-completion` — Verification gate pattern
- `task-management-protocol` — Task state synchronization
- `context-compressor` — Context management for long loops

### Related Files

- `.claude/hooks/ralph-stop-hook.cjs` — Stop hook controller
- `.claude/ralph/PROMPT.md` — Audit prompt template
- `.claude/ralph/guardrails.md` — Accumulated failure lessons
- `.claude/context/runtime/ralph-state.json` — Loop state
