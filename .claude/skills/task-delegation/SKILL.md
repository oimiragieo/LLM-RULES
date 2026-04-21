---
name: task-delegation
description: Agent task delegation patterns — spawn protocols, handoff metadata, drain gate, parallel limits, and model selection for multi-agent orchestration
version: 1.0.0
category: orchestration
tools:
  - Task
  - TaskList
  - TaskCreate
  - TaskUpdate
  - TaskGet
source: builtin
trust_score: 100
provenance_sha: b185fcd399a7eb4e
---

# Task Delegation Skill

## When to Invoke

```javascript
Skill({ skill: 'task-delegation' });
```

Use when:

- Spawning subagents to perform work
- Decomposing a complex task into parallel or sequential subtasks
- Implementing handoff metadata between agents
- Verifying pipeline completion via drain gate
- Selecting the right model for a spawned agent

---

## Core Protocol: Spawn → Update → Drain

Every delegation sequence follows three phases:

```
1. SPAWN  — Task({ task_id, subagent_type, prompt })
2. UPDATE — TaskUpdate({ taskId, status: 'in_progress', owner: 'router' }) [immediately after spawn]
3. DRAIN  — TaskList() → verify zero in_progress/pending tasks before claiming done
```

Skipping any phase causes invisible work, stuck tasks, or duplicate execution.

---

## Spawn Template

Every `Task()` call MUST include a `task_id` parameter. Missing `task_id` is hard-blocked by spawn hooks.

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'developer',
  prompt: `
## Task ID: task-7
## Agent: developer

### Context
<brief description of what this agent needs to know>

### Objective
<single concrete deliverable>

### Instructions
1. Call TaskUpdate({ taskId: 'task-7', status: 'in_progress' }) IMMEDIATELY.
2. <step-by-step work instructions>
3. Call TaskUpdate({ taskId: 'task-7', status: 'completed', metadata: { summary: '...', filesModified: [...] } }).

### Constraints
- Scope: only files listed above
- Do NOT modify unrelated files
`,
});
```

---

## Immediate Status Rule

After every `Task(...)` spawn, immediately call `TaskUpdate` for that task:

```javascript
// Spawn the agent
Task({ task_id: 'task-7', subagent_type: 'developer', prompt: '...' });

// Immediately record as in_progress (router-owned until agent picks it up)
TaskUpdate({ taskId: 'task-7', status: 'in_progress', owner: 'router' });
```

This guarantees task visibility even before the spawned agent emits its first tool call.

---

## Parallel Delegation — Token Budget Limits

**NEVER spawn more than 2 heavy agents simultaneously.**

Heavy agents: `architect`, `security-architect`, `code-reviewer`, `qa`, `developer`, `devops`
Light agents: `researcher`, `general-assistant`, `technical-writer`

```javascript
// CORRECT: Max 2 heavy agents in parallel
Task({ task_id: 'task-3', subagent_type: 'developer', prompt: '...' });
Task({ task_id: 'task-4', subagent_type: 'qa', prompt: '...' });

// WRONG: 3+ heavy agents causes context overflow
Task({ task_id: 'task-3', subagent_type: 'developer', prompt: '...' });
Task({ task_id: 'task-4', subagent_type: 'qa', prompt: '...' });
Task({ task_id: 'task-5', subagent_type: 'architect', prompt: '...' }); // DO NOT
```

For 3+ parallel workstreams, use `master-orchestrator` to manage sequencing.

---

## Handoff Metadata Protocol

Use structured metadata on `TaskUpdate(completed)` to enable downstream agents to pick up context without re-reading files:

```javascript
TaskUpdate({
  taskId: 'task-5',
  status: 'completed',
  metadata: {
    summary: 'Implemented JWT auth middleware with refresh tokens',
    filesModified: ['src/middleware/auth.ts', 'src/lib/jwt.ts', 'tests/middleware/auth.test.ts'],
    outputArtifacts: ['.claude/context/plans/auth-design.md'],
    keyDecisions: [
      'Used RS256 (asymmetric) over HS256 for key rotation support',
      'Refresh tokens stored in Redis with 7-day TTL',
    ],
    discoveredFiles: ['src/auth/legacy-session.ts'], // existing code to reuse/replace
    worktreePath: process.env.AGENT_WORKTREE_PATH || process.cwd(),
    completedAt: new Date().toISOString(),
  },
});
```

Downstream agents read this via `TaskGet({ taskId: 'task-5' })`:

```javascript
const task = TaskGet({ taskId: 'task-5' });
const { keyDecisions, filesModified, discoveredFiles } = task.metadata;
```

---

## Drain Gate (MANDATORY Before Completion)

Before claiming "pipeline complete", execute all drain-gate checks in order:

```javascript
// Step 1: Task drain
const tasks = TaskList();
const openTasks = tasks.filter(t => ['in_progress', 'pending', 'blocked'].includes(t.status));
if (openTasks.length > 0) {
  // Report open task IDs, continue orchestration
  console.log(
    'Still open:',
    openTasks.map(t => t.id)
  );
}

// Step 2: Reflection queue check
// Read .claude/context/runtime/reflection-spawn-request.json
// If any entries exist with status: 'pending', spawn reflection-agent first

// Step 3: Only after steps 1 and 2 pass — write completion summary
```

**Never claim completion with open tasks or unprocessed reflections.**

---

## Model Selection

| Task Type                               | Model  | Rationale                           |
| --------------------------------------- | ------ | ----------------------------------- |
| Simple Q&A, research, summarization     | haiku  | Cost-effective, fast                |
| Implementation, bug fixes, tests        | sonnet | Balanced capability/cost (default)  |
| Architecture, security review, planning | opus   | Highest reasoning for complex tasks |
| Orchestrators (master, evolution)       | opus   | Must coordinate many subtasks       |
| Context compression                     | haiku  | Token-efficient, low complexity     |

```javascript
Task({
  task_id: 'task-8',
  subagent_type: 'security-architect',
  model: 'claude-opus-4-5', // explicit override
  prompt: '...',
});
```

Model precedence (highest to lowest):

1. Explicit `model:` in `Task()` call
2. Agent frontmatter `model:` field
3. `config.yaml agents.{type}.model`
4. Complexity-based default
5. Fallback: sonnet

---

## Sequential Dependencies

For tasks that must run in order, use `addBlockedBy`:

```javascript
TaskCreate({ subject: 'Design auth', taskId: 'task-1' });
TaskCreate({ subject: 'Implement auth', taskId: 'task-2' });
TaskCreate({ subject: 'Test auth', taskId: 'task-3' });

TaskUpdate({ taskId: 'task-2', addBlockedBy: ['task-1'] });
TaskUpdate({ taskId: 'task-3', addBlockedBy: ['task-2'] });
```

Poll with `TaskList()` to detect when blocked tasks become unblocked, then spawn the next agent.

---

## Specialist-First Routing (IRON LAW)

Before spawning `developer`, check if a specialist matches. Developer is the LAST RESORT.

| Request Type            | Correct Agent           |
| ----------------------- | ----------------------- |
| Update documentation    | `technical-writer`      |
| Refactor/clean up code  | `code-simplifier`       |
| Review code             | `code-reviewer`         |
| Run tests / QA          | `qa`                    |
| Deploy / CI / Docker    | `devops`                |
| Database design         | `database-architect`    |
| Research / investigate  | `researcher`            |
| Security-sensitive work | `security-architect`    |
| Debug production        | `devops-troubleshooter` |

---

## Anti-Patterns

- **Never skip `task_id`** — spawn hooks hard-block missing IDs
- **Never claim completion before `TaskList()` drain** — open tasks = invisible work
- **Never spawn 3+ heavy agents in parallel** — causes context overflow
- **Never use developer for git commit/push/deploy** — always use `devops`
- **Never spawn reflection-agent with `run_in_background: true`** — breaks atomic handshake
- **Never write multi-fix prompts (4+ fixes per agent)** — causes silent failures
- **Never use haiku for security or hooks tasks** — use sonnet minimum

---

## INLINE SUMMARY Before TaskUpdate(completed)

Before calling `TaskUpdate({ status: 'completed' })`, output this block:

```
IMPLEMENTATION_RESULT:
  summary: <one-line description>
  filesModified:
    - path/to/file1
    - path/to/file2
  testsRun: <command>
  testResult: <PASS/FAIL + counts>
  worktreePath: <AGENT_WORKTREE_PATH or cwd>
```

The `pre-completion-validation.cjs` hook reads this block to validate completion.
