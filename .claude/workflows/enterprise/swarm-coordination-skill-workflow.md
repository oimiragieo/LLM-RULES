---
name: swarm-coordination-workflow
description: Multi-agent swarm orchestration with Queen/Worker topology for parallel task execution
version: 1.0.0
agents: [swarm-coordinator, master-orchestrator, developer, qa, architect]
phases: 4
skills:
  - swarm-coordination
  - consensus-voting
  - dispatching-parallel-agents
  - verification-before-completion
triggers:
  - large-scale refactoring
  - parallel code review
  - multi-file implementation
  - consensus-based decisions
---

# Swarm Coordination Workflow

Orchestrate multi-agent swarms using Queen/Worker topology for massively parallel task execution, consensus-based decisions, and fault-tolerant distributed work.

**Extended Thinking**: This workflow manages complex distributed agent coordination where a single Queen agent (swarm-coordinator) spawns, monitors, and aggregates results from multiple Worker agents executing in parallel. The topology supports hierarchical command, mesh collaboration, and voting-based consensus. Workers are ephemeral, replaceable, and isolated - failures are detected and recovered automatically. This pattern excels at tasks that can be decomposed into independent subtasks: large refactoring, multi-file reviews, parallel testing, or any work requiring consensus from multiple perspectives.

**Related Workflows**: See `code-review-workflow.md` for two-pass code review process that can be parallelized using swarm topology.

## When to Use

| Scenario                        | Why Swarm                   | Example                                      |
| ------------------------------- | --------------------------- | -------------------------------------------- |
| **Large-scale refactoring**     | Parallelize file changes    | Rename across 50+ files                      |
| **Multi-perspective review**    | Consensus from experts      | Security + Performance + Architecture review |
| **Parallel testing**            | Speed through parallelism   | Run test suites across modules               |
| **Distributed code generation** | Independent implementations | Generate CRUD for 10 entities                |
| **Brainstorming/exploration**   | Diverse approaches          | Prototype 3 different solutions              |

## Topology Patterns

### Hierarchical (Default)

```
           [Queen]
          /   |   \
    [Worker] [Worker] [Worker]
```

- Queen spawns workers, collects results
- Workers execute independently, no inter-worker communication
- Best for: Task decomposition, parallel execution

### Mesh (via Shared Memory)

```
    [Worker] --- [Worker]
        \       /
         [Worker]
```

- Workers read/write to shared memory (`.claude/context/sessions/`)
- Queen monitors and synthesizes
- Best for: Collaborative refinement, iterative improvement

### Voting Ring

```
    [Worker] --> [Worker]
        ^           |
        |           v
    [Worker] <-- [Worker]
```

- Each worker proposes, all workers vote
- Queen tallies votes, resolves ties
- Best for: Critical decisions, consensus requirements

## Configuration Options

### Worker Pool Size

- **small**: 2-3 workers (simple tasks)
- **medium**: 4-6 workers (standard parallelism)
- **large**: 7-10 workers (maximum parallelism)

### Failure Tolerance

- **strict**: Any worker failure aborts swarm
- **majority**: Continue if >50% workers succeed
- **best-effort**: Continue with any successful workers

### Consensus Mode

- **first-wins**: Accept first valid result
- **majority-vote**: Accept result with >50% agreement
- **unanimous**: Require all workers to agree
- **weighted**: Weight votes by worker expertise

## Phase 1: Swarm Initialization

### Step 1.1: Task Analysis and Decomposition

**Agent**: Swarm Coordinator (Queen)

**Task Spawn**:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  description: 'Swarm initialization and task decomposition',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Initialize swarm for: $TASK_DESCRIPTION

## Instructions
1. Read your agent definition: .claude/agents/orchestrators/swarm-coordinator.md
2. **Invoke skill**: Skill({ skill: "swarm-coordination" })
3. Analyze the task and decompose into independent subtasks
4. Determine optimal worker count based on subtask parallelism
5. Define worker roles and assign subtask boundaries
6. Create swarm manifest: .claude/context/sessions/swarm-$SWARM_ID-manifest.json

## Decomposition Criteria
- Subtasks must be independently executable
- No circular dependencies between subtasks
- Each subtask completable by single worker
- Clear success criteria for each subtask

## Output Format
{
  "swarmId": "$SWARM_ID",
  "topology": "hierarchical|mesh|voting",
  "workerCount": N,
  "subtasks": [
    { "id": "W1", "description": "...", "files": [...], "dependencies": [] }
  ],
  "consensusMode": "first-wins|majority-vote|unanimous",
  "failureTolerance": "strict|majority|best-effort"
}

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record swarm patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Swarm manifest with subtask decomposition, worker assignments, topology configuration

### Step 1.2: Worker Pool Spawning

**Agent**: Swarm Coordinator spawns Worker agents

**Task Spawn** (parallel - all workers in single message):

```javascript
// Worker 1
Task({
  task_id: 'task-2',
  subagent_type: 'general-purpose',
  run_in_background: true,
  description: 'Swarm Worker W1 for subtask 1',
  prompt: `You are WORKER W1 in swarm $SWARM_ID.

## Your Subtask
$SUBTASK_1_DESCRIPTION

## Instructions
1. Read swarm manifest: .claude/context/sessions/swarm-$SWARM_ID-manifest.json
2. Execute ONLY your assigned subtask
3. Do NOT modify files outside your boundary: $SUBTASK_1_FILES
4. Report progress to: .claude/context/sessions/swarm-$SWARM_ID-W1-status.json
5. On completion, write results to: .claude/context/sessions/swarm-$SWARM_ID-W1-result.json

## Isolation Rules
- Work only on assigned files
- Do not communicate with other workers directly
- Report failures immediately via status file
- Follow TDD if implementing code changes

## Status Format
{ "workerId": "W1", "status": "pending|running|completed|failed", "progress": 0-100, "lastUpdate": "ISO8601" }
`,
});

// Worker 2
Task({
  task_id: 'task-3',
  subagent_type: 'general-purpose',
  run_in_background: true,
  description: 'Swarm Worker W2 for subtask 2',
  prompt: `You are WORKER W2 in swarm $SWARM_ID.
  // ... similar structure for subtask 2 ...
`,
});

// Worker N (spawn all workers in parallel)
```

**Expected Output**: All workers spawned and executing in background

## Phase 2: Task Distribution

### Step 2.1: Load Balancing and Assignment

**Agent**: Swarm Coordinator (Queen)

The Queen ensures even distribution of work across workers:

```javascript
Task({
  task_id: 'task-4',
  subagent_type: 'general-purpose',
  description: 'Load balancing check for swarm',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Verify load distribution for swarm: $SWARM_ID

## Instructions
1. Read swarm manifest: .claude/context/sessions/swarm-$SWARM_ID-manifest.json
2. Check estimated complexity of each subtask
3. Rebalance if any worker has >2x average load
4. Update manifest with rebalanced assignments if needed

## Load Metrics
- Lines of code to modify
- Number of files in scope
- Estimated complexity (simple/medium/complex)
- Dependencies requiring coordination

## Rebalancing Rules
- Split large subtasks into smaller chunks
- Merge tiny subtasks to reduce overhead
- Maintain clear file boundaries
- Preserve dependency ordering
`,
});
```

### Step 2.2: Dependency Graph Resolution

For subtasks with dependencies, the Queen establishes execution order:

```javascript
// Example dependency resolution
{
  "executionOrder": [
    { "phase": 1, "workers": ["W1", "W3"] },  // Independent, run parallel
    { "phase": 2, "workers": ["W2"] },         // Depends on W1
    { "phase": 3, "workers": ["W4", "W5"] }    // Depend on W2
  ],
  "criticalPath": ["W1", "W2", "W4"]
}
```

## Phase 3: Parallel Execution

### Step 3.1: Worker Execution Monitoring

**Agent**: Swarm Coordinator (Queen)

**Task Spawn** (polling loop):

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'general-purpose',
  description: 'Monitor swarm worker execution',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Monitor worker execution for swarm: $SWARM_ID

## Instructions
1. Read all worker status files: .claude/context/sessions/swarm-$SWARM_ID-W*-status.json
2. Check for worker health every monitoring cycle
3. Detect stalled workers (no progress for >5 minutes)
4. Detect failed workers (status: "failed")
5. Update swarm status: .claude/context/sessions/swarm-$SWARM_ID-status.json

## Health Indicators
| Status | Meaning | Action |
|--------|---------|--------|
| pending | Not started | Wait |
| running | In progress | Monitor |
| completed | Finished successfully | Collect result |
| failed | Error occurred | Trigger recovery |
| stalled | No progress | Check/replace worker |

## Monitoring Output
{
  "swarmId": "$SWARM_ID",
  "status": "running|completed|failed",
  "workers": {
    "W1": { "status": "completed", "progress": 100 },
    "W2": { "status": "running", "progress": 45 }
  },
  "completedCount": N,
  "failedCount": M,
  "estimatedCompletion": "ISO8601"
}
`,
});
```

### Step 3.2: Progress Aggregation

Workers report progress to shared session files:

```javascript
// Worker status file format (.claude/context/sessions/swarm-$SWARM_ID-W1-status.json)
{
  "workerId": "W1",
  "swarmId": "$SWARM_ID",
  "status": "running",
  "progress": 67,
  "currentStep": "Implementing function validateUser()",
  "filesModified": ["src/auth/validate.ts"],
  "testsAdded": 3,
  "testsPass": true,
  "lastUpdate": "2026-01-25T10:30:00Z",
  "errors": [],
  "warnings": ["Consider adding edge case for empty input"]
}
```

## Phase 4: Result Aggregation

### Step 4.1: Collect Worker Results

**Agent**: Swarm Coordinator (Queen)

**Task Spawn**:

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'general-purpose',
  description: 'Aggregate swarm worker results',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Aggregate results from swarm: $SWARM_ID

## Instructions
1. Read all worker result files: .claude/context/sessions/swarm-$SWARM_ID-W*-result.json
2. Verify all required workers completed successfully
3. Check for conflicts (multiple workers modified same code)
4. Merge non-conflicting results
5. Flag conflicts for manual resolution
6. Generate aggregated result: .claude/context/sessions/swarm-$SWARM_ID-final.json

## Conflict Detection
- Same file modified by multiple workers
- Incompatible code changes
- Test failures after merge
- API contract violations

## Aggregation Output
{
  "swarmId": "$SWARM_ID",
  "status": "success|partial|failed",
  "completedWorkers": ["W1", "W2", "W3"],
  "failedWorkers": [],
  "conflicts": [],
  "mergedChanges": {
    "filesModified": [...],
    "testsAdded": N,
    "linesChanged": M
  },
  "summary": "..."
}
`,
});
```

### Step 4.2: Consensus Resolution (for Voting Topology)

When using voting consensus:

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'general-purpose',
  description: 'Resolve consensus for swarm decision',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Resolve consensus for swarm: $SWARM_ID

## Instructions
1. **Invoke skill**: Skill({ skill: "consensus-voting" })
2. Read all worker proposals: .claude/context/sessions/swarm-$SWARM_ID-W*-proposal.json
3. Tally votes according to consensus mode: $CONSENSUS_MODE
4. Resolve ties using Queen judgment
5. Document decision rationale

## Consensus Modes
- **first-wins**: Accept first valid proposal
- **majority-vote**: Proposal with >50% support wins
- **unanimous**: All workers must agree (or deadlock)
- **weighted**: Weight by worker expertise/confidence

## Voting Output
{
  "decision": "...",
  "voteCount": { "optionA": 3, "optionB": 2 },
  "consensus": "majority",
  "dissenting": ["W4", "W5"],
  "rationale": "..."
}
`,
});
```

### Step 4.3: Final Verification

**Agent**: QA (spawned by Queen)

```javascript
Task({
  task_id: 'task-8',
  subagent_type: 'general-purpose',
  description: 'Verify merged swarm results',
  prompt: `You are the QA agent.

## Task
Verify swarm output for: $SWARM_ID

## Instructions
1. Read your agent definition: .claude/agents/core/qa.md
2. **Invoke skill**: Skill({ skill: "verification-before-completion" })
3. Read merged results: .claude/context/sessions/swarm-$SWARM_ID-final.json
4. Run all tests affected by swarm changes
5. Verify no regressions introduced
6. Check code quality and consistency across worker outputs
7. Report verification status

## Verification Checklist
- [ ] All tests pass
- [ ] No merge conflicts remain
- [ ] Code style consistent across all changes
- [ ] No duplicate implementations
- [ ] API contracts preserved
- [ ] Documentation updated
`,
});
```

## Worker Health Monitoring

### Heartbeat Protocol

Workers emit heartbeats to indicate liveness:

```javascript
// Worker heartbeat (every 60 seconds)
{
  "workerId": "W1",
  "swarmId": "$SWARM_ID",
  "timestamp": "2026-01-25T10:30:00Z",
  "status": "alive",
  "memoryUsage": "45%",
  "currentTask": "Implementing validateUser()"
}
```

### Health Check Thresholds

| Metric       | Warning   | Critical   |
| ------------ | --------- | ---------- |
| No heartbeat | 2 minutes | 5 minutes  |
| No progress  | 5 minutes | 10 minutes |
| Error rate   | >10%      | >50%       |
| Memory usage | >80%      | >95%       |

### Stall Detection

```javascript
// Queen stall detection logic
function detectStall(worker) {
  const lastUpdate = parseISO(worker.lastUpdate);
  const now = new Date();
  const minutesSinceUpdate = (now - lastUpdate) / 60000;

  if (minutesSinceUpdate > 10 && worker.progress < 100) {
    return { stalled: true, action: 'replace' };
  }
  if (minutesSinceUpdate > 5 && worker.progress < 100) {
    return { stalled: true, action: 'warn' };
  }
  return { stalled: false };
}
```

## Failure Handling

### Worker Failure Recovery

**Step 1: Detect Failure**

```javascript
// Failure indicators
- Worker status file shows "failed"
- No heartbeat for >5 minutes
- Error thrown in worker output
- Tests failing in worker scope
```

**Step 2: Assess Impact**

```javascript
// Impact assessment
{
  "failedWorker": "W3",
  "subtaskDescription": "Implement user validation",
  "filesAffected": ["src/validate.ts", "src/validate.test.ts"],
  "dependentWorkers": ["W5", "W6"],
  "impactLevel": "medium"
}
```

**Step 3: Recovery Action**

```javascript
Task({
  task_id: 'task-9',
  subagent_type: 'general-purpose',
  description: 'Replace failed worker W3',
  prompt: `You are WORKER W3-REPLACEMENT in swarm $SWARM_ID.

## Context
Original worker W3 failed. You are the replacement.

## Your Subtask
$SUBTASK_3_DESCRIPTION

## Recovery Instructions
1. Check partial work: .claude/context/sessions/swarm-$SWARM_ID-W3-partial.json
2. Resume from last checkpoint if available
3. If no checkpoint, start fresh
4. Complete the subtask and report results
5. Flag any issues that may have caused original failure

## Failure Context
Original failure reason: $FAILURE_REASON
`,
});
```

### Graceful Degradation

When strict failure tolerance is not required:

```javascript
// Majority success mode
if (successfulWorkers / totalWorkers >= 0.5) {
  // Continue with partial results
  proceedWithPartialResults();
} else {
  // Abort swarm
  abortSwarm('Too many worker failures');
}
```

### Retry Logic

```javascript
// Exponential backoff for retries
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

function calculateDelay(attempt) {
  const delay = retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt);
  return Math.min(delay, retryConfig.maxDelay);
}
```

## Execution Parameters

### Required Parameters

- **--task**: Task description to decompose into subtasks
- **--topology**: Swarm topology (hierarchical|mesh|voting)
- **--worker-count**: Number of workers to spawn

### Optional Parameters

- **--consensus-mode**: How to resolve conflicts (first-wins|majority-vote|unanimous|weighted) [default: majority-vote]
- **--failure-tolerance**: How to handle worker failures (strict|majority|best-effort) [default: majority]
- **--timeout**: Maximum swarm execution time in minutes [default: 60]
- **--heartbeat-interval**: Worker heartbeat frequency in seconds [default: 60]
- **--stall-threshold**: Minutes without progress before stall detection [default: 5]

## Success Criteria

- All subtasks completed (or majority in best-effort mode)
- No unresolved merge conflicts
- All tests pass after aggregation
- Consensus reached (for voting topology)
- Results properly aggregated and documented
- Swarm session files cleaned up

## Usage Example

```javascript
// Router spawning swarm workflow for large refactoring
Task({
  task_id: 'task-10',
  subagent_type: 'general-purpose',
  description: 'Orchestrating swarm for API migration',
  prompt: `Execute swarm coordination workflow.

## Parameters
- Task: Migrate all REST endpoints from v1 to v2 API format
- Topology: hierarchical
- Worker Count: 5
- Consensus Mode: majority-vote
- Failure Tolerance: majority

## Instructions
Follow the phased workflow in: .claude/workflows/enterprise/swarm-coordination-skill-workflow.md

1. Decompose API migration into per-endpoint subtasks
2. Spawn 5 workers for parallel endpoint migration
3. Monitor worker progress and handle failures
4. Aggregate and verify all migrations
5. Report final migration status
`,
});
```

## Session Cleanup

After swarm completion, clean up session files:

```javascript
// Files to archive or delete
.claude/context/sessions/swarm-$SWARM_ID-manifest.json
.claude/context/sessions/swarm-$SWARM_ID-status.json
.claude/context/sessions/swarm-$SWARM_ID-W*-status.json
.claude/context/sessions/swarm-$SWARM_ID-W*-result.json
.claude/context/sessions/swarm-$SWARM_ID-final.json
```

## Related Skill

This workflow implements the structured process for the corresponding skill:

- **Skill**: `.claude/skills/swarm-coordination/SKILL.md`
- **Invoke skill**: `Skill({ skill: "swarm-coordination" })`
- **Relationship**: Workflow provides multi-agent orchestration; skill provides core capabilities

## Memory Protocol

All agents in swarm MUST follow Memory Protocol:

1. **Read**: `.claude/context/memory/learnings.md` before starting
2. **Write**: Record swarm patterns to `.claude/context/memory/learnings.md`
3. **Issues**: Record failures to `.claude/context/memory/issues.md`
4. **Decisions**: Record consensus decisions to `.claude/context/memory/decisions.md`

> **ASSUME INTERRUPTION**: Your context may reset. If it's not in memory, it didn't happen.

## Related Workflows

- **Feature Development**: `.claude/workflows/enterprise/feature-development-workflow.md`
- **Code Review**: `.claude/workflows/code-review-workflow.md`
- **Incident Response**: `.claude/workflows/operations/incident-response.md`

## Related Agents

- **Swarm Coordinator**: `.claude/agents/orchestrators/swarm-coordinator.md`
- **Master Orchestrator**: `.claude/agents/orchestrators/master-orchestrator.md`

## Related Skills

- `swarm-coordination` - Core swarm management
- `consensus-voting` - Voting and consensus resolution
- `dispatching-parallel-agents` - Parallel agent spawning
- `verification-before-completion` - Result verification
