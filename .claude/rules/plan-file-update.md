# Plan File Update Protocol (IRON LAW)

Executing agents are responsible for updating plan file task markers during execution. The router does NOT update plan files — it only sees completed tasks.

## When a Plan File Path Is Provided

Every spawned agent that receives a `planFile` path in its task prompt MUST:

### On Task Start

Find the task's line in the plan file and change `- [ ]` to `- [~]`:

```bash
# Find the line number (use keywords from task subject)
grep -n "task subject keywords" .claude/context/plans/my-plan.md
```

Then use `Edit` on that specific line:

```
old: - [ ] Implement feature X
new: - [~] Implement feature X
```

### On Task Complete

Change `- [~]` to `- [x]` and append a brief result note:

```
old: - [~] Implement feature X
new: - [x] Implement feature X — done: added Y, modified Z
```

## Tool and Timing Rules

- **Tool**: Always use `Edit` — target the specific line only. Never rewrite the whole plan file.
- **Timing**: Update the plan file BEFORE calling `TaskUpdate(completed)`.
- **Silence**: If the plan file path does not exist, skip silently — never error or fail.
- **Granularity**: Update only the line that corresponds to your specific task. Do not touch other task lines.

## Marker Reference

| Marker  | Meaning     |
| ------- | ----------- |
| `- [ ]` | Pending     |
| `- [~]` | In progress |
| `- [x]` | Done        |

## Anti-Patterns (NEVER)

- Never leave plan file updates to the router — the router updates plan files only as a fallback, not as the primary mechanism.
- Never rewrite the entire plan file to update one line.
- Never skip the start marker (`[ ]` → `[~]`) even if the task is fast.
- Never mark `[x]` before the task is actually complete.

## Enforcement

The reflection-agent rubric includes a "Plan File Staleness" dimension. Tasks that complete but leave their plan file markers un-updated will have their Completeness score penalized. Recurring violations are logged as systemic issues in `issues.md`.

## Related References

- `.claude/skills/task-management-protocol/SKILL.md` — Full task protocol with plan file section
- `.claude/templates/spawn/universal-agent-spawn.md` — Spawn template warning box
- `.claude/agents/core/reflection-agent.md` — Rubric scoring for plan file staleness
