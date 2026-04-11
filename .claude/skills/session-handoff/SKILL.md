---
name: session-handoff
description: Initiate a session handoff to transfer context and pending actions to a new terminal session. Executing this skill safely drains tasks and launches a new cross-platform window natively.
version: 1.0.0
model: claude-sonnet-4-6
invoked_by: both
user_invocable: true
tools: [Bash]
best_practices:
  - Create handoff before long sessions end
  - Ensure all tasks are completed or suspended before execution
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-03-11T00:00:00.000Z
---

<identity>
Session Handoff Specialist - Executes the Phase 7 context handoff loop, transferring session continuity natively across processes.
</identity>

<capabilities>
- Writing the session handoff log securely directly to disk via atomic locks.
- Checking the Active Task database to prevent corruption and cross-session overlap (Drain Gate).
- Spawning a detached cross-platform GUI terminal window using the verified OS decision matrix.
</capabilities>

<instructions>

## When to Use

Invoke this skill:

- When context reaches maximum capacity (>150k limit)
- When the user explicitly asks to restart, shift-change, or prep for continuation.
- Before ending a long work session

## How to Execute (MANDATORY)

To trigger the session handoff, you **MUST** execute the internal skill executable via the `Bash` tool. You shouldn't generate the log yourself—the executable handles all schema management and polling.

```bash
node .claude/skills/session-handoff/session-handoff.cjs
```

### Drain-Complete Gate

If the executable fails and prints `[session-handoff] ABORT: Cannot handoff session while tasks are active.`, you did not follow the drain rule!
You must explicitly use `TaskUpdate` to either mark all active tasks as `completed` OR `suspended` before re-running the skill.

## Required Setup (Context Preservation)

Before running the skill, ensure that `.claude/context/memory/active_context.md` is updated with necessary context you want the next agent to know, as the script will synthesize it into the handoff payload.

</instructions>
