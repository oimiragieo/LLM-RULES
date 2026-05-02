# Cursor-first coding workflow

Use this when you want **Cursor Agent** through WSL to apply edits from a written task prompt, while **Codex / reviewer agents** own planning, audit, and final verification.

## Intended process

1. **Plan (Codex or lead agent)** - Break work into a small, reviewable scope with explicit acceptance criteria.
2. **Implement (Cursor)** - Run the worker with a prompt file that describes only what Cursor should change.
3. **Audit (mini subagents)** - Run focused reviews (security, style, tests) on the resulting diff.
4. **Verify (Codex)** - Re-run tests, confirm acceptance criteria, and sign off before merge.

## Run the Cursor worker

From a **Windows** shell (Node on Windows), with the repo on a WSL-accessible drive (for example `C:\dev\projects\agent-studio`):

```powershell
node scripts/agents/run-cursor-worker.mjs --prompt docs/templates/cursor-worker-task.md --model auto --workspace "C:\dev\projects\agent-studio" --trust --force
```

Dry-run (prints the `wsl` / `bash <run-cursor-worker.sh>` argv without running `cursor-agent`):

```bash
node scripts/agents/run-cursor-worker.mjs --dry-run --prompt path\to\task.md --model auto
```

Structured JSON (includes resolved paths and the `wsl` argv):

```bash
node scripts/agents/run-cursor-worker.mjs --json --dry-run --prompt path\to\task.md
```

The script spawns `wsl` with `shell: false` and `windowsHide: true`, then runs `cursor-agent` with `--print`, `--model`, `--workspace`, and the prompt body read from the WSL prompt path. Add `--trust --force` only for deliberate headless coding runs. Do not run raw `wsl bash -lc "$(cat ...)"` commands from PowerShell; let this Node wrapper build the argument vector.

## Prompt requirements

- **One file** - The `--prompt` path must be a normal file under `--workspace` (no directories, no `..` escape outside the workspace after `realpath`).
- **Explicit scope** - List allowed paths, forbidden edits, and acceptance criteria (see `docs/templates/cursor-worker-task.md`).
- **TDD / verification** - State which tests or commands must pass after the change.

## Review and verification responsibilities

| Role             | Responsibility                                                          |
| ---------------- | ----------------------------------------------------------------------- |
| Planner          | Scope, risks, and acceptance criteria in the prompt file.               |
| Cursor worker    | Apply edits per prompt only; no scope creep.                            |
| Auditors         | Diff-only review for correctness, safety, and test gaps.                |
| Verifier (Codex) | Run the listed verification commands and confirm criteria before merge. |

## Safety notes

- **Dirty worktrees** - Cursor sees the whole workspace. Narrow the prompt ("touch only these files") and use dry-run to inspect the command before execution.
- **WSL quoting** - Prompt content is not interpolated into the Windows `wsl` argv. The wrapper resolves host paths, maps them to WSL paths, and spawns `wsl` with discrete argv entries (`bash`, the runner script path, flags, workspace, prompt file).
- **Model names** - Only `a-zA-Z0-9._:/-` are allowed in `--model` so shell metacharacters cannot reach the WSL `bash` invocation.
- **Privilege flags** - `--trust` and `--force` are opt-in. Keep them off for planning or smoke checks; add them when Cursor is expected to edit files without interactive approval.

For a fill-in task template, use `docs/templates/cursor-worker-task.md`.
