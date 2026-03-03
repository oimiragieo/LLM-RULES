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
4. **TOOLS ARE NOT AGENTS**: Creator/updater tools (ending in `-creator` or `-updater`) are **SKILLS**, not agents. Use `Skill({ skill: 'name' })`, NEVER `Task({ subagent_type: 'name' })` for these.
5. Subagent does `TaskUpdate(in_progress)` first and `TaskUpdate(completed)` last.

## Memory Tooling Protocol (Required)

- Read/write memory via framework tooling, not ad-hoc file edits.
- **MemoryRecord Usage** (when available in your tool list):
  - Record a **pattern** when you discover a reusable coding technique or best practice
  - Record a **gotcha** when you hit an unexpected behavior, edge case, or platform quirk
  - Record a **discovery** when you find important codebase facts (file purposes, config relationships, API contracts)
  - Keep entries under 200 chars, include the `area` field (e.g., "memory", "hooks", "routing")
  - Do NOT record trivial observations; only record insights that would save another agent >5 minutes
- Before final `TaskUpdate(completed)`, include memory evidence in completion text:
  - files changed (for `resolutionEvidence.files`)
  - validation commands run (for `resolutionEvidence.commands`)
- When task output produces report artifacts, ensure files actually exist at declared paths before completion.
- Keep memory sections compact and focused; rely on observational/hybrid injection from hooks.

## Minimal Spawn (Default)

```javascript
Task({
  task_id: '<ID>',
  subagent_type: 'developer',
  model: 'sonnet',
  max_turns: 18,
  description: 'Implement X in Y and return verification evidence',
  allowed_tools: [
    'Read',
    'TaskUpdate',
    'TaskList',
    'TaskGet',
    'TaskOutput',
    'Skill',
    'MemoryRecord',
  ],
  prompt: `Task ID: <ID>
You are developer. Read .claude/agents/core/developer.md.
FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" }).
Do only: <exact task scope>.
Constraints: <limits>.
Deliverables: <files + checks>.
LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } }).
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

## Memory Recording (MANDATORY for HIGH complexity tasks)

Use MemoryRecord to persist discoveries during your work:

- type: 'pattern' — reusable solution patterns found
- type: 'gotcha' — sharp edges and pitfalls discovered
- type: 'discovery' — new findings about the codebase

Example: `MemoryRecord({ type: 'gotcha', content: 'Windows paths need normalization in glob patterns', area: 'platform' })`

## TaskUpdate Completion Contract

When calling `TaskUpdate({ status: 'completed' })`, metadata MUST include:

- `summary`: string (>50 chars) describing what was accomplished
- `filesModified`: string[] of changed file paths
- `discoveries`: string[] of key findings (REQUIRED for HIGH complexity tasks)

These fields trigger the memory extraction pipeline. Without them, your work is invisible to the learning system.

## Related

- Orchestrator template: `.claude/templates/spawn/orchestrator-spawn.md`
- Router policy: `.claude/agents/core/router.md`
