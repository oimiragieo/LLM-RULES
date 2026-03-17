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

If completing the current task requires a small, clearly-scoped prerequisite that does not exist:

- **Auto-add it** if:
  - It is under 30 lines of code.
  - It has zero architectural impact (utility function, type definition, small helper).
  - You are certain of the intended interface.
- **Escalate (DR-3)** if any of those conditions are false.
- Document: `// Deviation DR-2: added missing prerequisite <description>`
- Log to session gap log (see DR-4).

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
4. Report the blocker to the Router or user.

---

### DR-4 (Deviation Logging): Log All Deviations

**Every deviation (DR-1, DR-2, DR-3)** must be logged to the session gap log:

```bash
echo '{"timestamp":"<ISO>","type":"deviation","agent":"<agent-type>","taskId":"<id>","rule":"DR-1|DR-2|DR-3","description":"<what was found and what was done>","context":"<file:line>"}' >> .claude/context/runtime/session-gap-log.jsonl
```

Logging is mandatory even for auto-fixed deviations. This provides an audit trail and feeds the reflection-agent rubric.

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

## When to Invoke

These rules are auto-injected into all agent contexts via `.claude/rules/`. No explicit invocation needed.
Reference this file when documenting deviations in task metadata.

## Related References

- `.claude/context/runtime/session-gap-log.jsonl` — Gap log destination
- `.claude/rules/cleanup-always.md` — End-of-task cleanup
- `.claude/agents/core/developer.md` — Developer agent (primary consumer of this protocol)
