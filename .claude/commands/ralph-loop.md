---
description: Autonomous audit loop — router-managed iteration or standalone via Stop hook
disable-model-invocation: true
---
Run the ralph-loop audit. There are two modes:

## Mode 1: Router-managed iteration (multi-agent, default)

The router manages the iteration loop by spawning and re-spawning subagents:

1. Read `.claude/ralph/PROMPT.md` (in the parent project `C:\dev\projects`) for the audit instructions
2. Create a task for the audit
3. Spawn a QA agent to execute the audit pass
4. When the agent completes, read the audit state file (`agent-studio/.claude/context/runtime/ralph-audit-state.md`)
5. If open findings remain (agent output contains `RALPH_ITERATION_COMPLETE`), spawn another QA agent iteration
6. Repeat until all findings are resolved (`RALPH_AUDIT_COMPLETE_NO_FINDINGS`) or max iterations (25) reached
7. Report final results

The router remains free and never gets trapped. No stop hook is involved.

## Mode 2: Standalone Stop hook loop (single-session)

For standalone use outside the multi-agent framework, launch via the shell scripts:

```bash
# Unix/macOS
.claude/ralph/ralph-audit.sh

# Windows
.claude\ralph\ralph-audit.bat
```

These scripts set `RALPH_ACTIVE=1` which activates the Stop hook (`ralph-stop-hook.cjs`). The hook keeps the single Claude session iterating until completion.

DO NOT run mode 2 from within the multi-agent router. Always use mode 1 when inside agent-studio.
