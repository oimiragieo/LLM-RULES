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
  task_id: '<ID>',
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
  prompt: `Task ID: <ID>
You are master-orchestrator. Read .claude/agents/orchestrators/master-orchestrator.md.
FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" }).
Objective: <coordination goal>.
Spawn plan:
1) <agent + task>
2) <agent + task>
Consolidation criteria: <acceptance checks>.
LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } }).
Then call TaskList().`,
});
```

## Orchestrator Guardrails

- **TOOLS ARE NOT AGENTS**: Creator/updater tools (ending in `-creator` or `-updater`) are **SKILLS**, not agents. Use `Skill({ skill: 'name' })` directly or tell a child agent to use it. NEVER use `Task({ subagent_type: 'name' })` for these.
- Spawn in parallel only when workstreams are independent.
- Prefer 2-3 focused subagents over large swarms.
- Keep each child spawn prompt short and outcome-driven.
- Pass only the minimum tools each child needs.

## Memory Coordination Protocol

- Require each spawned child to report memory-safe evidence in completion output:
  - concrete file paths touched
  - verification commands executed
- If children generate report files, verify artifact existence before coordinator completion.
- Prefer centralized memory/finding flows (post-task ingestion + open-findings carryover) over custom per-agent memory files.

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
