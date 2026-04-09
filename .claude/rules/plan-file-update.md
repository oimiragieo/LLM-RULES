# Plan File Update Protocol (IRON LAW)

Executing agents update plan file task markers. The router does NOT update plan files.

## When a Plan File Path Is Provided

**On task start**: Find the task line, change `- [ ]` to `- [~]` using `Edit` (target specific line only).

**On task complete**: Change `- [~]` to `- [x]` and append a brief result note.

## Tool and Timing Rules

- **Tool**: Always use `Edit` on the specific line — never rewrite the whole file.
- **Timing**: Update BEFORE calling `TaskUpdate(completed)`.
- **Silence**: If the plan file doesn't exist, skip silently.
- **Granularity**: Only update your task's line — do not touch other lines.

## Markers

| Marker  | Meaning     |
| ------- | ----------- |
| `- [ ]` | Pending     |
| `- [~]` | In progress |
| `- [x]` | Done        |

## Execution Context Snapshot

On multi-step workflow completion, write a companion `.snapshot.json` with `steps_completed`, `last_task_metadata`, `key_findings`. Schema: `.claude/schemas/workflow-snapshot.schema.json`. Enables workflow resumption after context loss.

## Anti-Patterns (NEVER)

- Never skip the start marker (`[ ]` → `[~]`) even if the task is fast
- Never mark `[x]` before the task is complete
- Never rewrite the entire plan file for one line
