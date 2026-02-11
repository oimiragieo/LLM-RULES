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
  task_id: 'task-1',
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

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: <ID>                                                  |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "in_progress" });              |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "completed",                   |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
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
