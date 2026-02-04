# Ralph Loop Skill

Autonomous iteration loop for development tasks. Keeps the agent working on a task until completion or max iterations, with context rotation and state in `.cursor/.ralph/`.

## When to Use

- Well-defined tasks with clear success criteria (checkboxes in `.cursor/RALPH_TASK.md`)
- Tasks requiring iteration (e.g. get tests passing, implement feature with TDD)
- Overnight or background runs (run in terminal, monitor via logs)
- Greenfield or refactor work where progress can be committed often

## Invocation

```
Use @ralph-loop to run the Ralph autonomous loop
Use @ralph-loop with task in .cursor/RALPH_TASK.md
Start Ralph loop for the current task
Run ralph-once to test one iteration first
```

## Prerequisites

- **cursor-agent CLI** installed (`curl https://cursor.com/install -fsS | bash`). On Windows, run scripts from WSL.
- **Git** repository (state is persisted via commits and `.cursor/.ralph/`).
- **Task file**: `.cursor/RALPH_TASK.md` with frontmatter and success criteria as checkboxes `[ ]` / `[x]`.

## How to Run

From the **project root** (where `.cursor/` lives):

1. **Interactive setup (recommended)**

   ```bash
   .cursor/ralph-scripts/ralph-setup.sh
   ```

   Prompts for model, max iterations, branch, PR, and optional single-iteration test.

2. **CLI (scripting/CI)**

   ```bash
   .cursor/ralph-scripts/ralph-loop.sh -n 30 -m opus-4.5-thinking -y
   ```

   Options: `-n` iterations, `-m` model, `--branch NAME`, `--pr`, `-y` skip confirm.

3. **Single iteration (test before full loop)**

   ```bash
   .cursor/ralph-scripts/ralph-once.sh
   ```

4. **Initialize state and task template**
   ```bash
   .cursor/ralph-scripts/init-ralph.sh
   ```

## Task File Format

Create or edit `.cursor/RALPH_TASK.md`:

```markdown
---
task: Short task description
test_command: 'pnpm test'
---

# Task

What you want to accomplish.

## Success Criteria

1. [ ] First criterion
2. [ ] Second criterion
3. [ ] Third criterion

## Context

Any extra context (stack, constraints, etc.).
```

The agent marks progress by changing `[ ]` to `[x]`. When all are `[x]` or the agent outputs `COMPLETE`, the loop stops.

## State and Logs

| Path                           | Purpose                                  |
| ------------------------------ | ---------------------------------------- |
| `.cursor/RALPH_TASK.md`        | Task and criteria (you and agent edit)   |
| `.cursor/.ralph/progress.md`   | What’s done (agent updates)              |
| `.cursor/.ralph/guardrails.md` | Lessons from failures (agent adds Signs) |
| `.cursor/.ralph/activity.log`  | Tool call log and token usage            |
| `.cursor/.ralph/errors.log`    | Failures and gutter detection            |

Monitor live: `tail -f .cursor/.ralph/activity.log`

## Best Practices

1. **Clear criteria** – Each checkbox should be testable and completable in one or a few steps.
2. **Incremental** – Prefer several small criteria over one huge one.
3. **Safety** – Use `-n` (e.g. `-n 20`) to cap iterations.
4. **Test first** – Run `ralph-once.sh` before a long loop.

## Integration with Other Skills

- **TDD** – Use Ralph to run a TDD loop (write test, implement, repeat) until criteria are met.
- **Debugging** – Add a “Fix X” criterion and let Ralph iterate on repro + fix + regression test.

## References

- Source: [ralph-wiggum-cursor](https://github.com/agrimsingh/ralph-wiggum-cursor)
- Technique: [ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Cursor CLI: [cursor.com/docs/cli/headless](https://cursor.com/docs/cli/headless)
