# Ralph Wiggum Scripts

Autonomous iteration loop for Cursor: run an agent on a task until completion or max iterations, with context rotation and state under `.cursor/`.

## Layout

- **Task file**: `.cursor/RALPH_TASK.md` (frontmatter + success criteria as checkboxes)
- **State**: `.cursor/.ralph/` (progress.md, guardrails.md, activity.log, errors.log)

## Requirements

- **cursor-agent** CLI: `curl https://cursor.com/install -fsS | bash`
- **Git** repository
- **jq** (for stream-parser): `brew install jq` / `apt install jq`
- **Windows**: run scripts from WSL; `cursor-agent` is used via WSL when not in PATH

## Scripts

| Script | Purpose |
|--------|--------|
| `ralph-setup.sh` | Interactive: model, iterations, branch, PR, single-iteration test |
| `ralph-loop.sh` | CLI loop with flags (`-n`, `-m`, `--branch`, `--pr`, `-y`) |
| `ralph-once.sh` | Single iteration then stop (test before full loop) |
| `init-ralph.sh` | Create `.cursor/.ralph/` and `.cursor/RALPH_TASK.md` template |

Run from **project root** (parent of `.cursor/`):

```bash
.cursor/ralph-scripts/ralph-setup.sh
.cursor/ralph-scripts/ralph-loop.sh -n 20 -y
.cursor/ralph-scripts/ralph-once.sh
.cursor/ralph-scripts/init-ralph.sh
```

## Model Selection

- Default: `opus-4.5-thinking`
- Override: `-m MODEL` or `RALPH_MODEL=sonnet-4.5-thinking ./ralph-loop.sh -y`
- Optional: scripts can be extended to read from `.claude/config.yaml` (e.g. `agents.developer.model`)

## Signals

The stream parser emits:

- **WARN** – token usage approaching limit (~70k); agent should wrap up
- **ROTATE** – limit reached (~80k); start new iteration with fresh context
- **COMPLETE** – agent output ` COMPLETE ` and/or all checkboxes `[x]`
- **GUTTER** – stuck (same command failed 3×, or file thrashing)
- **DEFER** – rate limit/transient error; back off and retry

## Troubleshooting

- **cursor-agent not found**  
  Install CLI; on Windows use WSL and run scripts from there.

- **jq: command not found**  
  Install jq; required for `stream-parser.sh`.

- **FIFO / mkfifo errors**  
  Named pipes may not work on some Windows setups; run from WSL.

- **Task file not found**  
  Ensure `.cursor/RALPH_TASK.md` exists; run `init-ralph.sh` to create a template.

## References

- [ralph-wiggum-cursor](https://github.com/agrimsingh/ralph-wiggum-cursor)
- [ghuntley.com/ralph](https://ghuntley.com/ralph/)
- [Cursor CLI](https://cursor.com/docs/cli/headless)
