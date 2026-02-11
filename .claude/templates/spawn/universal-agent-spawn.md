---
template_type: spawn_template
template_name: universal-agent-spawn
use_cases:
  - Standard non-orchestrator spawns (developer, qa, planner, architect, writer)
  - Single-purpose tasks
  - Parallel specialist review waves
model_selection: haiku (simple), sonnet (default), opus (high complexity only)
---

# Universal Agent Spawn Template (Lean)

Use this template for all non-orchestrator agents.

## Why this version

- Keeps spawn prompts compact to reduce token burn.
- Uses task-scoped tool lists instead of broad default tool sets.
- Adds explicit turn budgets to prevent runaway subagent loops.

## Required sequence

1. `TaskList()` first.
2. `TaskCreate(...)` to allocate IDs.
3. `Task(...)` with matching `task_id`.
4. Subagent does `TaskUpdate(in_progress)` first and `TaskUpdate(completed)` last.

## Minimal Spawn (Default)

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'developer',
  model: 'sonnet',
  max_turns: 18,
  description: 'Implement X in Y and return verification evidence',
  allowed_tools: ['Read', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'Skill'],
  prompt: `Task ID: task-1
You are developer. Read .claude/agents/core/developer.md.
FIRST: TaskUpdate({ taskId: "task-1", status: "in_progress" }).
Do only: <exact task scope>.
Constraints: <limits>.
Deliverables: <files + checks>.
LAST: TaskUpdate({ taskId: "task-1", status: "completed", metadata: { summary: "...", filesModified: [...] } }).
Then call TaskList().`,
});
```

## Tool Profiles (Choose the smallest that works)

- Read-only analysis:
  - `Read`, `Grep`/`Glob` (or project search skill), `TaskUpdate`, `TaskList`, `Skill`
- Code changes:
  - Read-only profile plus `Write`, `Edit`
- Verification/testing:
  - Code-changes profile plus `Bash`

Do not include optional tools unless the task needs them.

## Prompt Budget Rules

- Keep spawn prompt under ~1.5k chars before hook enrichment.
- Put long policy/protocol content in referenced files, not inline.
- Include only task-specific instructions and concrete deliverables.

## Skills and MCP

- Do not preload broad skill instructions in prompt text.
- Invoke only required skills at runtime (for example `tdd`, `debugging`).
- MCP tools are optional; include only when task-critical.
- MCP config source is `.claude/.mcp.json` (project-level). Tool search is enabled via settings env.

## Example Parallel Wave

```javascript
Task({ task_id: 'task-2', subagent_type: 'architect', model: 'sonnet', max_turns: 16, ... });
Task({ task_id: 'task-3', subagent_type: 'security-architect', model: 'sonnet', max_turns: 16, ... });
```

## Related

- Orchestrator template: `.claude/templates/spawn/orchestrator-spawn.md`
- Router policy: `.claude/agents/core/router.md`
