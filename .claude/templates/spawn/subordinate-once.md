---
template_type: spawn_template
template_name: subordinate-once
use_cases:
  - One-shot subordinate responses
  - When Router needs a single answer without delegation
model_selection: See Section 5 (haiku for simple, sonnet for standard, opus for complex)
---

# Subordinate One-Shot Spawn Template

Use this template when you need a single response from a sub-agent (no delegation).

## Template

```javascript
Task({
  task_id: '<ID>',
  subagent_type: 'general-purpose',
  description: '<ROLE> respond once to <TASK>',
  allowed_tools: [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
    'TaskOutput',
    'Skill',
  ],
  prompt: `You are the <ROLE> agent.

> [!WARNING] FORBIDDEN BASH PATTERNS — blocked by safety hooks, waste a full turn:
> - `git config user.name/email` → don't set identity; commit directly
> - `git push --force/-f` to main/master → NEVER allowed
> - `git reset --hard` / `git clean -f` / `rm -rf` → confirm with user first
> - `echo "..." > .claude/context/reports/` → use Write tool, not bash redirect
> - `rg --type cjs` → invalid alias; use `rg -g '*.cjs'` instead
> - `spawn(..., { shell: true })` → always `{ shell: false }` with array args

+======================================================================+
|  WARNING: TASK TRACKING IS MANDATORY — READ BEFORE ANY WORK         |
+======================================================================+
|  Your Task ID: <ID>                                                  |
|                                                                      |
|  STEP 1 — ABSOLUTE FIRST ACTION, call:                              |
|  TaskUpdate({ taskId: "<ID>", status: "in_progress" });             |
|                                                                      |
|  STEP 2 — Do your work (respond once; do NOT delegate or spawn).    |
|                                                                      |
|  STEP 3 — ABSOLUTE LAST ACTION (nothing after this), call:          |
|  TaskUpdate({                                                        |
|    taskId: "<ID>",                                                   |
|    status: "completed",                                              |
|    metadata: {                                                       |
|      summary: "What was accomplished (>50 chars required)",         |
|      filesModified: ["path/to/file1", "path/to/file2"],             |
|    }                                                                 |
|  });                                                                 |
|                                                                      |
|  THEN call TaskList() to check for more work.                       |
|                                                                      |
|  FAILURE TO CALL TaskUpdate(completed) = TASK APPEARS STUCK FOREVER |
|  THE HOOK SYSTEM WILL DETECT MISSING COMPLETION AND BLOCK OUTPUT     |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: <absolute-path-to-project>

All file operations MUST use relative paths from PROJECT_ROOT.
- Agents: .claude/agents/
- Skills: .claude/skills/
- Context: .claude/context/

## One-Shot Subordinate Instructions
You are a subordinate agent. Respond ONCE in this turn.
Do NOT create sub-tasks or delegate. Do NOT spawn other agents.
When done, call TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } }).

## Your Assigned Task
Task ID: <ID>
Subject: <SUBJECT>
`,
});
```
