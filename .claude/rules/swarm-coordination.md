# Swarm Coordination Rules

## Core Principles

- Queen/Worker topology: One orchestrator coordinates multiple specialist workers
- Maximum parallelism: Spawn all independent agents in a single message
- Structured handoff: Use consistent formats for agent-to-agent communication
- Failure isolation: One agent's failure shouldn't crash the entire swarm
- Results aggregation: Combine partial outputs into coherent whole

## Queen/Worker Topology

**Queen (Orchestrator)**:

- Spawns worker agents
- Distributes tasks
- Aggregates results
- Handles failures
- Reports to user

**Workers (Specialists)**:

- Execute assigned tasks
- Use structured handoff format
- Report results to Queen
- No cross-worker communication (all through Queen)

**Why this pattern**: Prevents coordination chaos. N workers × (N-1) connections = O(N²) complexity. Hub-and-spoke = O(N).

## Fan-Out/Fan-In Patterns

### Fan-Out (Task Distribution)

Spawn multiple workers in a single message for true parallelism:

```javascript
// CORRECT - Single message, parallel execution
Task({ subagent_type: 'code-reviewer', prompt: 'Review auth.ts', task_id: '1' });
Task({ subagent_type: 'code-reviewer', prompt: 'Review user.ts', task_id: '2' });
Task({ subagent_type: 'code-reviewer', prompt: 'Review api.ts', task_id: '3' });
```

```javascript
// WRONG - Sequential messages, no parallelism
Task({ subagent_type: 'code-reviewer', prompt: 'Review auth.ts', task_id: '1' });
// [Wait for completion]
Task({ subagent_type: 'code-reviewer', prompt: 'Review user.ts', task_id: '2' });
```

**Maximum parallel agents**: 5-7 workers per fan-out (beyond that, coordination overhead dominates).

### Fan-In (Results Aggregation)

Queen waits for all workers to complete, then aggregates:

```markdown
## Swarm Results: Code Review

### Worker 1 (auth.ts)

- Issues: 3 (2 HIGH, 1 MEDIUM)
- Summary: Missing input validation

### Worker 2 (user.ts)

- Issues: 1 (LOW)
- Summary: Minor naming inconsistency

### Worker 3 (api.ts)

- Issues: 5 (1 CRITICAL, 4 HIGH)
- Summary: SQL injection vulnerability

### Aggregated Findings

- **CRITICAL**: 1 (SQL injection in api.ts)
- **HIGH**: 6 (2 in auth.ts, 4 in api.ts)
- **MEDIUM**: 1 (auth.ts)
- **LOW**: 1 (user.ts)

### Recommendations

1. Fix CRITICAL SQL injection immediately (api.ts)
2. Address HIGH priority issues before merge
3. MEDIUM/LOW can be follow-up tasks
```

## Message Passing Format

### Standard Handoff Template

All workers use this format for reporting results:

```markdown
## Worker Report: [Agent Type] - [Task]

**Status**: [COMPLETED | PARTIAL | FAILED]
**Duration**: [Xm Ys]

### Context

- **Task**: [What was done]
- **Files**: [List of files touched]
- **Scope**: [What was included/excluded]

### Findings

- [Key finding 1 with severity]
- [Key finding 2 with severity]

### Recommendations

- [Action item 1 with priority]
- [Action item 2 with priority]

### Artifacts

- [Path to output file 1]
- [Path to output file 2]

### Blockers (if any)

- [Blocker description and what's needed]
```

**Why structured**: Queen can parse and aggregate programmatically. Free-form prose requires LLM summarization (expensive, error-prone).

## Failure Handling

### Failure Types

| Failure Type    | Detection                       | Recovery                           |
| --------------- | ------------------------------- | ---------------------------------- |
| Worker crash    | No TaskUpdate(completed)        | Re-spawn worker for that task      |
| Worker timeout  | Exceeds expected duration       | Kill and re-spawn                  |
| Partial failure | Worker reports PARTIAL          | Aggregate what succeeded           |
| Invalid output  | Schema validation fails         | Request clarification or re-work   |
| Queen crash     | (No recovery, requires restart) | Prevent with robust error handling |

### Graceful Degradation

When some workers fail:

```
IF (completed_workers >= minimum_threshold)
  THEN aggregate_available_results
       flag_missing_coverage
       continue_with_warnings
ELSE
  escalate_to_human
```

**Minimum threshold**: 60-75% worker completion required for valid swarm result.

## Anti-Patterns

| Anti-Pattern                 | Problem                                  | Fix                                      |
| ---------------------------- | ---------------------------------------- | ---------------------------------------- |
| Sequential spawning          | No parallelism, slow execution           | Spawn all workers in single message      |
| Cross-worker communication   | Coordination chaos (O(N²))               | All communication through Queen          |
| No failure handling          | One crash kills entire swarm             | Implement failure detection and recovery |
| Unbounded parallelism        | >10 workers causes coordination overhead | Limit to 5-7 workers per fan-out         |
| Free-form reporting          | Hard to aggregate                        | Use structured handoff template          |
| No timeout limits            | Hung worker blocks forever               | Set timeouts, kill and re-spawn          |
| Equal priority for all tasks | Critical work delayed                    | Prioritize workers for critical tasks    |

## Performance Characteristics

**Speedup from parallelism**:

| Workers | Ideal Speedup | Actual Speedup | Reason for Gap         |
| ------- | ------------- | -------------- | ---------------------- |
| 2       | 2.0x          | 1.8x           | Spawn overhead         |
| 3       | 3.0x          | 2.6x           | Coordination overhead  |
| 5       | 5.0x          | 3.8x           | Aggregation complexity |
| 7       | 7.0x          | 4.5x           | Diminishing returns    |
| 10      | 10.0x         | 4.2x           | Overhead dominates     |

**Sweet spot**: 3-5 workers for most swarm tasks.

## Integration Points

### Master Orchestrator

- Uses swarm coordination for parallel specialist execution
- Fans out to developer, qa, security-architect, code-reviewer
- Aggregates findings into unified report

### Evolution Orchestrator

- Spawns swarm of researchers for parallel source analysis
- Aggregates research findings
- Coordinates batch artifact creation

### Phase-Advance Workflow

- Fans out to multiple agents for phase work
- Aggregates phase completion signals
- Advances to next phase when threshold met

## Related Skills

- `consensus-voting` - Aggregates conflicting worker recommendations
- `task-breakdown` - Identifies parallelizable work units
- `master-orchestrator` - Primary consumer of swarm coordination

## Related References

- `.claude/skills/swarm-coordination/SKILL.md` - Complete implementation patterns
- `.claude/agents/orchestrators/master-orchestrator.md` - Uses swarm for parallel execution
- `.claude/workflows/enterprise/enterprise-workflow.md` - Multi-phase swarm coordination
