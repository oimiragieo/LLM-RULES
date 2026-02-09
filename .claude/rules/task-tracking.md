# Task Tracking

- Call TaskUpdate(in_progress) immediately when starting a task.
- Call TaskUpdate(completed) only after verifying work is done.
- Never mark a task completed if tests fail or implementation is partial.
- Call TaskList() after completing a task to find the next one.
- Include task IDs in spawn prompts for traceability.
- Use TaskCreate for multi-step work; prefer sequential dependencies over parallel.

## Agent-to-Agent Coordination (Structured Metadata)

**Pattern**: Use task metadata for structured handoff between agents.

**Handoff Metadata Schema**:

```typescript
interface TaskHandoffMetadata {
  // Progress tracking
  status?: 'not_started' | 'in_progress' | 'blocked' | 'completed';
  progress?: string; // "60%", "3/5 steps"

  // Discovery context
  discoveredFiles?: string[];
  discoveries?: string[];
  keyDecisions?: string[];

  // Blocker information
  blocker?: string;
  blockerType?: 'dependency' | 'permission' | 'information';
  needsFrom?: string; // "user" | "other-agent" | "external-system"

  // Completion context
  summary?: string;
  filesModified?: string[];
  outputArtifacts?: string[];
}
```

**Example**:

```javascript
// Planner completes design, hands off to developer
TaskUpdate({
  taskId: '5',
  status: 'completed',
  metadata: {
    summary: 'Auth design complete - JWT with refresh tokens',
    outputArtifacts: ['.claude/context/plans/auth-design.md'],
    keyDecisions: ['JWT over sessions', 'Redis for token store'],
    discoveredFiles: ['src/auth/jwt.ts'], // Existing code to reuse
  },
});

// Developer picks up, reads metadata
const task = TaskGet({ taskId: '5' });
// Access: task.metadata.keyDecisions, task.metadata.discoveredFiles
```

## Conductor Pattern for Multi-Agent Workflows

**Pattern**: One orchestrator coordinates multiple specialists.

**Implementation**:

1. **Orchestrator** (master-orchestrator) creates tasks with dependencies
2. **Specialists** (developer, qa, reviewer) execute in sequence
3. **Orchestrator** monitors progress and advances workflow

**Example**:

```javascript
// Orchestrator creates dependent tasks
TaskCreate({ subject: 'Design auth', ... });
TaskCreate({ subject: 'Implement auth', ... });
TaskCreate({ subject: 'Test auth', ... });

TaskUpdate({ taskId: '2', addBlockedBy: ['1'] }); // Implement blocked by design
TaskUpdate({ taskId: '3', addBlockedBy: ['2'] }); // Test blocked by implement

// As each completes, next unblocks automatically
```

**Benefits**: Clear dependencies, no duplicate work, traceable execution

## Related References

- `@TASK_TRACKING_GUIDE.md` - Complete TaskUpdate protocol
- `task-management-protocol` skill - Session handoff patterns
- `.claude/agents/orchestrators/master-orchestrator.md` - Conductor pattern
