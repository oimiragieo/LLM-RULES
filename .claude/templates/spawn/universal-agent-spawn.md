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

+======================================================================+
| WARNING: TASK TRACKING IS MANDATORY — READ BEFORE ANY WORK |
+======================================================================+
| Your Task ID: <REPLACE_WITH_ACTUAL_TASK_ID> |
| |
| STEP 1 — ABSOLUTE FIRST ACTION, call: |
| TaskUpdate({ taskId: "<ID>", status: "in_progress" }); |
| |
| STEP 2 — Do your work. |
| |
| STEP 3 — ABSOLUTE LAST ACTION (after lint, format, tests), call: |
| TaskUpdate({ |
| taskId: "<ID>", |
| status: "completed", |
| metadata: { |
| summary: "What was accomplished (>50 chars required)", |
| filesModified: ["path/to/file1", "path/to/file2"], |
| } |
| }); |
| |
| THEN call TaskList() to find the next task. |
| |
| FAILURE TO CALL TaskUpdate(completed) = TASK APPEARS STUCK FOREVER |
| THE HOOK SYSTEM WILL DETECT MISSING COMPLETION AND BLOCK OUTPUT |
+======================================================================+

### Completion Criteria

Every task has explicit success/failure metrics:

- **SUCCESS**: All acceptance criteria met, tests pass, lint clean
- **FAILURE**: Any acceptance criterion unmet — document which ones and why
- Report metrics in TaskUpdate metadata: `{ success: true/false, criteria_met: [...], criteria_failed: [...] }`

## Required sequence

1. `TaskList()` first.
2. `TaskCreate(...)` to allocate IDs.
3. `Task(...)` with matching `task_id`.
4. **TOOLS ARE NOT AGENTS**: Creator/updater tools (ending in `-creator` or `-updater`) are **SKILLS**, not agents. Use `Skill({ skill: 'name' })`, NEVER `Task({ subagent_type: 'name' })` for these.
5. Subagent does `TaskUpdate(in_progress)` first and `TaskUpdate(completed)` last.

## Memory Tooling Protocol (MANDATORY for all tasks)

**REQUIRED before TaskUpdate(completed):** Call MemoryRecord at least once per task that
produces new findings. Zero MemoryRecord calls = invisible work to the learning system.

Record EXACTLY one of these types per discovery:

- `type: 'pattern'` — reusable solution, code technique, or best practice found
- `type: 'gotcha'` — unexpected behavior, edge case, or platform quirk that cost time
- `type: 'discovery'` — codebase facts: what a file does, config relationships, API contracts

**Format:** `MemoryRecord({ type: 'gotcha', content: 'Windows paths need normalization in glob patterns', area: 'platform' })`

- `content`: under 200 chars, specific enough to be actionable
- `area`: one of 'memory', 'hooks', 'routing', 'testing', 'platform', 'security', 'performance', 'tooling', 'agents'

**Threshold:** Only record if the insight would save another agent >5 minutes. If you learned
nothing new, call `MemoryRecord({ type: 'discovery', content: 'No new discoveries in this task.', area: 'tooling' })`.
This confirms you evaluated the threshold consciously, not that you forgot.

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
  - `Read`, `Skill` (prefer search skills over `Grep`/`Glob`), `TaskUpdate`, `TaskList`
- Code changes:
  - Read-only profile plus `Write`, `Edit`
- Verification/testing:
  - Code-changes profile plus `Bash`

Do not include optional tools unless the task needs them.

## Search-First Protocol (MANDATORY)

Before using `Grep` or `Glob` for code discovery, you MUST prefer framework search tools in this order:

1. `pnpm search:code "query"` — hybrid BM25 + semantic search (fastest, recommended default)
2. `Skill({ skill: 'ripgrep' })` — fast text/regex search in agent flows
3. `Skill({ skill: 'code-semantic-search' })` — conceptual/intent-based search
4. `Skill({ skill: 'code-structural-search' })` — AST-based pattern matching

Use `Grep` ONLY for: single-file targeted checks, advanced PCRE2 regex, or when search skills are unavailable.
Use `Read` for files ONLY after search identifies relevant paths — never use it as a discovery mechanism.

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

> [!WARNING] FORBIDDEN BASH PATTERNS — blocked by safety hooks, waste a full turn:
>
> - `git config user.name/email` → don't set identity; commit directly
> - `git push --force/-f` to main/master → NEVER allowed
> - `git reset --hard` / `git clean -f` / `rm -rf` → confirm with user first
> - `echo "..." > .claude/context/reports/` → use Write tool, not bash redirect
> - `rg --type cjs` → invalid alias; use `rg -g '*.cjs'` instead
> - `spawn(..., { shell: true })` → always `{ shell: false }` with array args

## TaskUpdate Completion Contract

When calling `TaskUpdate({ status: 'completed' })`, metadata MUST include:

- `summary`: string (>50 chars) describing what was accomplished
- `filesModified`: string[] of changed file paths
- `discoveries`: string[] of key findings (REQUIRED for HIGH complexity tasks)
- `memoriesRecorded`: string[] of MemoryRecord type+area pairs called during this task (e.g. `['gotcha:platform', 'pattern:hooks']`). Empty array is allowed only if you consciously evaluated and found nothing worth recording.
- **For git commit/push tasks**: `commitHash` string — the verified post-commit HEAD hash (e.g. `"commitHash": "abc1234"`). NEVER include this field if HEAD did not change from pre-commit (that means the commit failed).

These fields trigger the memory extraction pipeline. Without them, your work is invisible to the learning system.

### Mission Handoff Fields (Factory Droid Alignment)

When working on a mission feature (task spawned with `featureId` in prompt), ALSO include these fields in metadata to enable automated grading and evidence collection:

- `commandsRun`: array of `{ command, exitCode, observation }` — every verification step executed
- `discoveredIssues`: array of `{ severity, description, suggestedFix }` — issues found during work
  - severity: `"blocking"` (stops progress), `"non_blocking"` (can continue), `"info"` (informational)
- `skillFeedback`: object with:
  - `followedProcedure`: boolean — did you follow the expected workflow?
  - `deviations`: array of `{ step, whatIDidInstead, why }` — any departures from standard process
  - `suggestedChanges`: string[] — improvements to the skill/procedure
- `testsAdded`: string[] — test files created or modified
- `testsCoverage`: string — brief coverage description

**Example mission-aware completion:**

```javascript
TaskUpdate({
  taskId: '<ID>',
  status: 'completed',
  metadata: {
    summary: 'Fixed broken require paths in evidence-collector and mission-grader',
    filesModified: ['.claude/lib/mission/evidence-collector.cjs'],
    commandsRun: [
      {
        command: 'node --test tests/lib/mission/evidence-collector.test.cjs',
        exitCode: 0,
        observation: 'All 8 tests passed',
      },
      { command: 'pnpm lint:fix', exitCode: 0, observation: 'No lint errors' },
    ],
    discoveredIssues: [
      {
        severity: 'non_blocking',
        description: 'Windows path separator in evidence filenames',
        suggestedFix: 'Normalize with .replace(/\\\\/g, "/")',
      },
    ],
    skillFeedback: {
      followedProcedure: true,
      deviations: [],
      suggestedChanges: [],
    },
    testsAdded: ['tests/lib/mission/evidence-collector.test.cjs'],
    testsCoverage:
      'Covers evidence file naming, verification step execution, and assertion binding',
    memoriesRecorded: ['gotcha:platform'],
  },
});
```

Schema reference: `.claude/schemas/mission/mission-handoff.schema.json`

> [!WARNING] PLAN FILE: If spawned with a plan file path, update `[ ]` → `[~]` on start and `[~]` → `[x]` on complete. Use `Edit` on the specific line. Do this BEFORE `TaskUpdate(completed)`. Skip silently if the plan file does not exist.

## Named Memory API (for topic-specific persistence)

For topic-specific persistent notes that survive session boundaries, use the named memory API via `memory-manager.cjs`. This is **separate** from `MemoryRecord` (which records gotchas/patterns/discoveries):

```javascript
const manager = require('.claude/lib/memory/memory-manager.cjs');

// Write: persist a topic-specific note
await manager.writeMemory('auth-design-decisions', '## JWT vs Sessions\nChose JWT because...');

// Read: retrieve a previous note in a future session
const notes = await manager.readMemory('auth-design-decisions');

// List: see all named memories
const names = await manager.listMemories(); // ['auth-design-decisions', ...]
```

**When to use named memory** (vs MemoryRecord):

- MemoryRecord → structured patterns/gotchas/discoveries (auto-indexed by memory system)
- Named memory → free-form notes, design docs, ongoing work context that spans sessions

**STM/MTM/LTM tiers** are managed automatically by `spawn-prompt-assembler`. You do not need to interact with them directly. They inject prior session context into your spawn prompt automatically.

## Related

- Orchestrator template: `.claude/templates/spawn/orchestrator-spawn.md`
- Router policy: `.claude/CLAUDE.md`
- Named memory API: `.claude/lib/memory/memory-manager.cjs`


### Environment: CLAUDE_AGENT_ID (MANDATORY)

Every spawn prompt MUST instruct the sub-agent that it runs with `CLAUDE_AGENT_ID=<subagent_type>` set in the environment. This variable is the primary signal used by PreToolUse hooks (e.g. `routing-guard-core.impl.cjs`) to detect sub-agent context and bypass router-only restrictions. Without it, hooks cannot distinguish sub-agents from the router and will deny Edit/Write calls.

Set this in every `Task()` invocation:

```json
{ "env": { "CLAUDE_AGENT_ID": "<subagent_type>" } }
```

Example: `CLAUDE_AGENT_ID=developer`, `CLAUDE_AGENT_ID=qa`, `CLAUDE_AGENT_ID=technical-writer`.