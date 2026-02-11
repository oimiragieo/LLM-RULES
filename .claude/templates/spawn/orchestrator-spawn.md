---
template_type: spawn_template
template_name: orchestrator-spawn
use_cases:
  - master-orchestrator
  - swarm-coordinator
  - evolution-orchestrator
requires:
  - Task tool in allowed_tools
model_selection: sonnet (default), opus (complex orchestration only)
---

# Orchestrator Spawn Template (Lean)

Use this template for orchestrators that spawn and coordinate other agents.

## Key differences from universal

- Must include `Task` in `allowed_tools`.
- Needs a larger turn budget than leaf agents.
- Should spawn specialist agents with small, task-scoped prompts.

## Minimal Orchestrator Spawn

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'master-orchestrator',
  model: 'sonnet',
  max_turns: 28,
  description: 'Coordinate multi-agent plan/review cycle for <scope>',
  allowed_tools: [
    'Read',
    'Task',
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
    'TaskOutput',
    'Skill',
  ],
  prompt: `Task ID: task-1
You are master-orchestrator. Read .claude/agents/orchestrators/master-orchestrator.md.
FIRST: TaskUpdate({ taskId: "task-1", status: "in_progress" }).
Objective: <coordination goal>.
Spawn plan:
1) <agent + task>
2) <agent + task>
Consolidation criteria: <acceptance checks>.
LAST: TaskUpdate({ taskId: "task-1", status: "completed", metadata: { summary: "...", filesModified: [...] } }).
Then call TaskList().`,
});
```

## Orchestrator Guardrails

- Spawn in parallel only when workstreams are independent.
- Prefer 2-3 focused subagents over large swarms.
- Keep each child spawn prompt short and outcome-driven.
- Pass only the minimum tools each child needs.

## MCP and Research

- Add MCP tools only for tasks that require them.
- Do not include broad MCP lists by default.
- Project MCP config lives in `.claude/.mcp.json`.

## Example research-enabled orchestrator

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'evolution-orchestrator',
  model: 'opus',
  max_turns: 32,
  allowed_tools: [
    'Read',
    'Task',
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
    'TaskOutput',
    'Skill',
    'mcp__Exa__web_search_exa',
  ],
  prompt: 'Task ID: task-2 ...',
});
```

## Related

- Universal template: `.claude/templates/spawn/universal-agent-spawn.md`
- Bash safety template: `.claude/templates/spawn/bash-safe-background.md`
