# Deviation Rules Protocol

When agents encounter unexpected codebase states during task execution, follow these rules precisely.
A **deviation** is any unexpected finding that would require going beyond the approved task scope.

## Rules

### DR-1 (Bug Auto-Fix): Fix Bugs Encountered During Execution

If you encounter a **clear, obvious bug** in code you are reading or modifying as part of the current task:

- **Auto-fix it** without asking.
- Fix must be minimal and contained (do not expand scope).
- Document the fix with a comment: `// Deviation DR-1: fixed bug <description>`
- Log to session gap log (see DR-4).

**Criteria for "obvious bug":** The code would throw, produce incorrect output, or fail existing tests with no ambiguity about the intended behavior.

---

### DR-2 (Missing Functionality): Add Blocking-Missing Prerequisites

If completing the current task requires a small, clearly-scoped **blocking** prerequisite that does not exist:

- **Auto-add it** if:
  - It is under 30 lines of code.
  - It has zero architectural impact (utility function, type definition, small helper).
  - You are certain of the intended interface.
- **Escalate (DR-3)** if any of those conditions are false.
- Document: `// Deviation DR-2: added missing prerequisite <description>`
- Record the addition in `decisions.md` with rationale.
- Log to session gap log (see DR-4).

**Note:** Do NOT auto-add dependencies that change architecture or introduce security risk — escalate those.

---

### DR-3 (Architectural Escalation): STOP and Escalate

If the deviation requires an **architectural decision**, call **STOP**.

Architectural decisions include:

- Changing a module's public interface or contract
- Adding a new dependency (npm package, service, database)
- Changing data ownership or flow between components
- Modifying hook registration, routing logic, or creator-guarded paths
- Any change that affects more than one agent or system boundary

**Action when DR-3 triggers:**

1. **STOP** — do not proceed.
2. Write a concise explanation of the decision needed.
3. Call `TaskUpdate({ status: 'blocked', metadata: { blocker: '<decision>', blockerType: 'architectural', needsFrom: 'user' } })`.
4. Report the blocker to the Router or user. Resume only after Router acknowledges and provides updated direction.

---

### DR-4 (Deviation Logging): Log All Deviations

**Every deviation (DR-1, DR-2, DR-3)** must be logged to the session gap log:

```bash
echo '{"timestamp":"<ISO>","type":"deviation","agent":"<agent-type>","taskId":"<id>","rule":"DR-1|DR-2|DR-3","description":"<what was found and what was done>","context":"<file:line>"}' >> .claude/context/runtime/session-gap-log.jsonl
```

Also record in `TaskUpdate(completed)` metadata:

```
deviations: [{ rule: "DR-1|DR-2|DR-3", description: "...", filesAffected: [...] }]
```

Logging is mandatory even for auto-fixed deviations. Deviations not logged are treated as undiscovered technical debt. This provides an audit trail and feeds the reflection-agent rubric.

---

## Decision Tree

```
Unexpected finding during task
│
├─ Clear bug in code being modified?
│   └─ YES → DR-1: auto-fix, log
│
├─ Missing prerequisite < 30 lines, zero architectural impact?
│   └─ YES → DR-2: auto-add, log
│
└─ Requires architectural decision?
    └─ YES → DR-3: STOP, escalate, block task
```

## Anti-Patterns

- Never deviate silently — even auto-fixes must be logged
- Never escalate a DR-1 or DR-2 deviation — that defeats the purpose of autonomous execution
- Never proceed past a DR-3 deviation without Router acknowledgement
- Never batch multiple deviation types into a single log entry — one entry per deviation

## When to Invoke

These rules are auto-injected into all agent contexts via `.claude/rules/`. No explicit invocation needed.
Reference this file when documenting deviations in task metadata.

## Related References

- `.claude/context/runtime/session-gap-log.jsonl` — Gap log destination
- `.claude/rules/cleanup-always.md` — End-of-task cleanup
- `.claude/rules/plan-file-update.md` — Plan file update protocol during deviations
- `.claude/context/memory/decisions.md` — Where architectural decisions are recorded
- `.claude/agents/core/reflection-agent.md` — Deviation scoring in the Completeness rubric
