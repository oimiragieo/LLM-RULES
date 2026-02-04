# Ralph Loop: Usage Instructions

Ralph Wiggum is an autonomous iteration technique. The agent runs in a loop until the task is complete or max iterations are reached; state lives in `.cursor/RALPH_TASK.md` and `.cursor/.ralph/`, not in chat context.

## When to Use Ralph

- **Good for**: Clear success criteria, iterative work (e.g. tests passing), overnight runs, greenfield or refactor with frequent commits.
- **Not for**: Subjective goals, one-off fixes, tasks that need human decisions at each step.

## Quick Start

1. **Define the task** in `.cursor/RALPH_TASK.md`:
   - Frontmatter: `task`, `test_command`
   - Success criteria as checkboxes: `- [ ]` / `- [x]`

2. **Run from project root**:
   - Interactive: `.cursor/ralph-scripts/ralph-setup.sh`
   - Non-interactive: `.cursor/ralph-scripts/ralph-loop.sh -n 20 -y`
   - Test one step: `.cursor/ralph-scripts/ralph-once.sh`

3. **Monitor**: `tail -f .cursor/.ralph/activity.log`

## Best Practices

- **Criteria**: One testable, completable outcome per checkbox.
- **Safety**: Always set `-n` (e.g. `-n 20`) to cap iterations.
- **Test first**: Run `ralph-once.sh` before a long loop.
- **Guardrails**: After failures, the agent adds "Signs" to `.cursor/.ralph/guardrails.md`; keep them so future runs avoid the same mistakes.

## Requirements

- **cursor-agent** CLI installed; on Windows, run scripts from WSL.
- **jq** for the stream parser.
- Git repository (progress is committed by the agent).

See **@ralph-loop** and `.cursor/ralph-scripts/README.md` for full reference.
