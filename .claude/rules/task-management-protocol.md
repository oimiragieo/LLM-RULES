# Task Management Protocol Rules

## Core Principles

- Tasks are the single source of truth for work state and progress
- Task metadata enables structured context handoff between agents and sessions
- Never mark complete without summary metadata
- Always check TaskList() at session start and after completion
- Update task descriptions with discoveries as they happen

## Standards

### Session Start Protocol (MANDATORY)

Before doing ANY work:

```javascript
// Step 1: Check existing tasks
TaskList();

// Step 2: If assigned task exists, read full details
TaskGet({ taskId: '<assigned-id>' });

// Step 3: Claim the task
TaskUpdate({
  taskId: '<assigned-id>',
  status: 'in_progress',
  activeForm: 'Working on <task-subject>',
});
```

### Progress Update Standards

Update tasks when you:

- Discover important information
- Find blockers
- Identify subtasks
- Make significant progress (>25% increment)

### Completion Standards (MANDATORY)

Never mark complete without structured metadata:

```javascript
TaskUpdate({
  taskId: 'X',
  status: 'completed',
  description: `<original-description>

## Completed (${new Date().toISOString().split('T')[0]})
- Summary: <one-line summary>
- Files modified: <list>
- Tests: <status>`,
  metadata: {
    summary: 'Concise summary of completed work',
    filesModified: ['path/to/file1.ts'],
    filesCreated: ['path/to/new.ts'],
    testsAdded: true,
    testsPassing: true,
    outputArtifacts: ['.claude/context/reports/my-report.md'],
    completedAt: new Date().toISOString(),
  },
});

// Check for newly unblocked tasks
TaskList();
```

## Task Metadata Schema

Use this consistent structure for context handoff:

```typescript
interface TaskHandoffMetadata {
  // Progress tracking
  status?: 'not_started' | 'in_progress' | 'blocked' | 'completed';
  progress?: string; // e.g., "60%", "3/5 steps"

  // Discovery context
  discoveredFiles?: string[];
  discoveries?: string[];
  patterns?: string[];

  // Blocker information
  blocker?: string;
  blockerType?: 'dependency' | 'permission' | 'information' | 'external';
  needsFrom?: string;

  // Completion context
  summary?: string;
  filesModified?: string[];
  filesCreated?: string[];
  outputArtifacts?: string[];

  // Continuation context
  currentState?: string;
  immediateNextStep?: string;
  keyFiles?: string[];
  keyDecisions?: string[];

  // Timestamps
  lastUpdated?: string;
  completedAt?: string;
  pausedAt?: string;
}
```

## Anti-Patterns

- Completing tasks without summary metadata
- Forgetting TaskList() after completion
- Using prose in description for structured data (use metadata instead)
- Not updating tasks with discoveries
- Claiming tasks without reading full details first
- Missing TaskUpdate(in_progress) at session start
- Session ending without handoff metadata for incomplete work

## Integration Points

### Related Skills

- `session-handoff` - Creates full session handoff documents
- `operational-modes` - Self-regulates tool usage during task execution
- `thinking-tools` - Checkpoints for task completion quality

### Related Agents

- All agents use this protocol (enforced via spawn templates)
- Orchestrators coordinate multiple tasks
- Router checks TaskList() before routing

### Related Workflows

- `.claude/workflows/core/router-decision.md` - Router always starts with TaskList()
- `.claude/workflows/enterprise/feature-development-workflow.md` - Task tracking through phases

## Iron Laws

### 1. Never Complete Without Summary

```javascript
// WRONG - No context for future reference
TaskUpdate({ taskId: 'X', status: 'completed' });

// CORRECT - Full context preserved
TaskUpdate({
  taskId: 'X',
  status: 'completed',
  metadata: {
    summary: 'Added auth middleware with JWT validation',
    filesModified: ['src/middleware/auth.ts'],
    completedAt: new Date().toISOString(),
  },
});
```

### 2. Always Update on Discovery

Discoveries lost = context lost = wasted work.

```javascript
// CORRECT - Discoveries preserved
TaskUpdate({
  taskId: 'X',
  metadata: {
    discoveries: ['Found circular dependency in module X', 'Requires refactor of Y'],
  },
});
```

### 3. Always TaskList After Completion

Completing a task may unblock other tasks. Always check.

```javascript
TaskUpdate({ taskId: 'X', status: 'completed', metadata: {...} });
TaskList(); // Find newly unblocked tasks
```

### 4. Use Metadata for Structure, Description for Prose

Structured data goes in metadata. Human-readable narrative goes in description.

```javascript
// WRONG - Structured data in prose
TaskUpdate({
  taskId: 'X',
  description: 'Files: a.ts, b.ts. Blocked by: auth issue. Progress: 50%',
});

// CORRECT - Structured metadata + prose description
TaskUpdate({
  taskId: 'X',
  description: 'Implementing auth flow. Hit a blocker with token refresh.',
  metadata: {
    filesModified: ['a.ts', 'b.ts'],
    blocker: 'auth issue',
    progress: '50%',
  },
});
```

## Cross-Session Coordination

### Environment Variable: CLAUDE_CODE_TASK_LIST_ID

Share task lists across sessions:

```bash
# Set shared task list for all sessions
export CLAUDE_CODE_TASK_LIST_ID="my-project-tasks"

# Start claude code - will use shared task list
claude
```

**When to use:**

- Multiple terminals working on same project
- Background agents sharing task state
- Team collaboration on task lists

## Integration with Memory Protocol

Task metadata complements but does not replace Memory Protocol:

| Information Type          | Task Metadata  | Memory Files       |
| ------------------------- | -------------- | ------------------ |
| Task-specific discoveries | Yes            | No                 |
| Project-wide patterns     | Reference only | Yes (learnings.md) |
| Architecture decisions    | Reference only | Yes (decisions.md) |
| Blocking issues           | Yes            | Yes (issues.md)    |
| Progress state            | Yes            | No                 |
| Completion summary        | Yes            | Yes (learnings.md) |

**Pattern:** Record task-specific context in task metadata, project-wide learnings in memory files, and cross-reference between them.

## Related References

- `.claude/skills/task-management-protocol/SKILL.md` - Complete protocol documentation
- `@TASK_TRACKING_GUIDE.md` - TaskUpdate best practices
- `.claude/rules/session-handoff.md` - Session handoff protocol
- `.claude/workflows/core/router-decision.md` - Router TaskList() protocol
