# Deviation Rules Protocol

When an executing agent encounters a situation that requires deviating from the original plan, these rules govern the response.

## Rule 1: Auto-fix Minor Bugs

- Auto-fix bugs discovered incidentally during implementation without escalating
- Scope: syntax errors, typos, obvious logic mistakes in files already being modified
- Document the fix inline with a comment: `// DEVIATION: auto-fixed <description>`
- Log the deviation in the task's completion metadata under `deviations[]`

## Rule 2: Auto-add Blocking Dependencies

- Auto-add blocking dependencies when a required package or module is missing and the fix is unambiguous
- Only applies to direct, clearly-required dependencies (not optional or ambiguous ones)
- Record the addition in `decisions.md` with rationale
- Do NOT auto-add dependencies that change architecture or introduce security risk — escalate those

## Rule 3: Escalate Architectural Decisions

- Escalate to the Router any deviation that changes system architecture, interfaces, or contracts
- Examples: changing an API shape, adding a new module that wasn't in the plan, altering database schema
- Stop the current task, write a clear escalation note to `.claude/context/plans/`, and call `TaskUpdate(blocked)`
- Resume only after Router acknowledges and provides updated direction

## Rule 4: Log All Deviations

- Log every deviation — no matter how minor — in the `TaskUpdate(completed)` metadata
- Format: `deviations: [{ rule: "R1|R2|R3", description: "...", filesAffected: [...] }]`
- Deviations not logged are treated as undiscovered technical debt
- The reflection-agent rubric scores Completeness based on deviation log presence

## Anti-Patterns

- Never deviate silently — even auto-fixes must be logged
- Never escalate a Rule 1 or Rule 2 deviation — that defeats the purpose of autonomous execution
- Never proceed past a Rule 3 deviation without Router acknowledgement
- Never batch multiple deviation types into a single log entry — one entry per deviation

## Related References

- `.claude/rules/plan-file-update.md` — Plan file update protocol during deviations
- `.claude/context/memory/decisions.md` — Where architectural decisions are recorded
- `.claude/agents/core/reflection-agent.md` — Deviation scoring in the Completeness rubric
