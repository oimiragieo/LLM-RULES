# Deviation Rules Protocol

A **deviation** is any unexpected finding requiring scope expansion during task execution.

## Rules

### DR-1 (Bug Auto-Fix)

If you find a **clear, obvious bug** in code you're reading/modifying: auto-fix it (minimal/contained), document with `// Deviation DR-1: fixed bug <description>`, log to session gap log.

**Criteria**: Code would throw, produce wrong output, or fail existing tests with no ambiguity.

### DR-2 (Missing Prerequisites)

If completing the task requires a small blocking prerequisite that doesn't exist: auto-add it if <30 lines, zero architectural impact, certain of interface. Otherwise escalate to DR-3. Document `// Deviation DR-2: added missing prerequisite <description>`, record in `decisions.md`, log.

### DR-3 (Architectural Escalation): STOP

If the deviation requires an architectural decision (changing public interfaces, adding dependencies, changing data ownership, modifying routing/hook registration): **STOP**, call `TaskUpdate({ status: 'blocked', metadata: { blocker, blockerType: 'architectural', needsFrom: 'user' } })`, report to Router. Resume only after acknowledgement.

### DR-4 (Deviation Logging): Log ALL Deviations

Every deviation must be logged to `.claude/context/runtime/session-gap-log.jsonl` with `type:"deviation"`, `rule`, `description`, `context`. Also record in `TaskUpdate(completed)` metadata. Unlogged deviations = undiscovered technical debt.

## Decision Tree

```
Unexpected finding
├─ Clear bug in code being modified? → DR-1: auto-fix, log
├─ Missing prerequisite <30 lines, no architectural impact? → DR-2: auto-add, log
└─ Requires architectural decision? → DR-3: STOP, escalate
```

## Anti-Patterns

- Never deviate silently — even auto-fixes must be logged
- Never escalate a DR-1/DR-2 deviation
- Never proceed past a DR-3 without Router acknowledgement

## Related References

- `.claude/context/runtime/session-gap-log.jsonl` — Gap log destination
- `.claude/rules/cleanup-always.md` — End-of-task cleanup
- `.claude/rules/plan-file-update.md` — Plan file updates during deviations
- `.claude/context/memory/decisions.md` — Architectural decisions
- `.claude/agents/core/reflection-agent.md` — Deviation scoring
