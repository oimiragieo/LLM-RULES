---
name: consensus-voting-workflow
description: Byzantine consensus voting with Queen/Worker topology for multi-agent decision making
version: 1.0.0
agents:
  - swarm-coordinator (Queen)
  - developer (Worker)
  - architect (Worker)
  - security-architect (Worker)
  - qa (Worker)
phases: 4
quorum: 2/3 majority
fault_tolerance: byzantine
---

# Consensus Voting Workflow

Byzantine fault-tolerant consensus mechanism using Queen/Worker topology for critical multi-agent decisions.

**Extended Thinking**: This workflow implements a distributed consensus protocol where a Queen (swarm-coordinator) distributes problems to multiple Worker agents, collects independent analyses, aggregates votes, and synthesizes results with conflict resolution. The Byzantine fault tolerance ensures correct outcomes even when some workers produce faulty or conflicting results. Use this for architectural decisions, security reviews, or any task where multiple expert perspectives reduce risk.

## Overview

The consensus voting pattern addresses scenarios where:

- A single agent's perspective may be biased or incomplete
- Critical decisions require multiple expert viewpoints
- Confidence in the result must be quantifiable
- Disagreements must be surfaced and resolved transparently

**Topology**: Queen/Worker (Star)

```
                    +-------------------+
                    | SWARM-COORDINATOR |
                    |      (Queen)      |
                    +--------+----------+
                             |
         +-------------------+-------------------+
         |                   |                   |
    +----v----+        +-----v-----+       +-----v-----+
    | WORKER  |        |  WORKER   |       |  WORKER   |
    |   #1    |        |    #2     |       |    #3     |
    +---------+        +-----------+       +-----------+
    (developer)        (architect)         (security)
```

## When to Use

**Ideal For:**

- Architectural decisions with long-term impact
- Security-sensitive code or design reviews
- Technology selection (frameworks, databases, patterns)
- Risk assessment for critical features
- Breaking deadlocks between conflicting requirements
- Validating complex refactoring strategies

**Not Recommended For:**

- Simple, single-step tasks (overhead not justified)
- Time-critical hotfixes (latency too high)
- Tasks with clear, unambiguous solutions
- Low-risk changes with easy rollback

## Phase 1: Problem Distribution

**Agent**: swarm-coordinator (Queen)

The Queen analyzes the problem, decomposes it into evaluation criteria, and distributes to workers.

### Step 1.1: Problem Analysis and Decomposition

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'developer',
  description: 'Queen analyzing problem for consensus voting',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Prepare problem for distributed consensus voting.

## Problem Statement
$PROBLEM_DESCRIPTION

## Instructions
1. Read your agent definition: .claude/agents/orchestrators/swarm-coordinator.md
2. **Invoke skill**: Skill({ skill: "swarm-coordination" })
3. Analyze the problem and identify:
   - Core decision to be made
   - Evaluation criteria (3-5 key factors)
   - Relevant context files and constraints
   - Worker agent types needed (minimum 3)
4. Create structured problem brief for workers
5. Save problem brief to: .claude/context/sessions/consensus-$SESSION_ID-problem.json

## Output Format (JSON)
{
  "session_id": "$SESSION_ID",
  "problem": "...",
  "criteria": ["criterion_1", "criterion_2", "criterion_3"],
  "context_files": ["path/to/relevant/file.ts"],
  "constraints": ["constraint_1", "constraint_2"],
  "worker_types": ["developer", "architect", "security-architect"],
  "deadline": "ISO-8601 timestamp"
}

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record session initiation to .claude/context/sessions/
`,
});
```

**Expected Output**: Structured problem brief with criteria, constraints, and worker assignments

### Step 1.2: Worker Spawning (Parallel)

The Queen spawns all workers in a single response for parallel execution.

```javascript
// Spawn all workers in parallel (same message)
Task({
  task_id: 'task-2',
  subagent_type: 'developer',
  description: 'Worker #1 (Developer) analyzing problem',
  prompt: `You are WORKER #1 (DEVELOPER agent) in a consensus voting session.

## Session
Session ID: $SESSION_ID
Your Worker ID: worker-1-developer

## Problem Brief
Read: .claude/context/sessions/consensus-$SESSION_ID-problem.json

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. Analyze the problem from a DEVELOPER perspective
3. Provide your recommendation with reasoning
4. Score each evaluation criterion (1-10)
5. Identify risks and tradeoffs from your perspective
6. IMPORTANT: Work INDEPENDENTLY - do not read other workers' outputs
7. Save your vote to: .claude/context/sessions/consensus-$SESSION_ID-vote-worker-1.json

## Output Format (JSON)
{
  "worker_id": "worker-1-developer",
  "recommendation": "OPTION_A | OPTION_B | ABSTAIN",
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "criteria_scores": {
    "criterion_1": 8,
    "criterion_2": 6,
    "criterion_3": 9
  },
  "risks": ["risk_1", "risk_2"],
  "tradeoffs": ["tradeoff_1"],
  "dissenting_notes": "Optional: concerns even if voting for majority"
}
`,
});

Task({
  task_id: 'task-3',
  subagent_type: 'developer',
  description: 'Worker #2 (Architect) analyzing problem',
  prompt: `You are WORKER #2 (ARCHITECT agent) in a consensus voting session.

## Session
Session ID: $SESSION_ID
Your Worker ID: worker-2-architect

## Problem Brief
Read: .claude/context/sessions/consensus-$SESSION_ID-problem.json

## Instructions
1. Read your agent definition: .claude/agents/core/architect.md
2. Analyze the problem from an ARCHITECT perspective
3. Focus on: scalability, maintainability, system design implications
4. Provide your recommendation with reasoning
5. Score each evaluation criterion (1-10)
6. IMPORTANT: Work INDEPENDENTLY - do not read other workers' outputs
7. Save your vote to: .claude/context/sessions/consensus-$SESSION_ID-vote-worker-2.json

## Output Format (JSON)
{
  "worker_id": "worker-2-architect",
  "recommendation": "OPTION_A | OPTION_B | ABSTAIN",
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "criteria_scores": {...},
  "risks": [...],
  "tradeoffs": [...],
  "dissenting_notes": "..."
}
`,
});

Task({
  task_id: 'task-4',
  subagent_type: 'developer',
  description: 'Worker #3 (Security Architect) analyzing problem',
  prompt: `You are WORKER #3 (SECURITY-ARCHITECT agent) in a consensus voting session.

## Session
Session ID: $SESSION_ID
Your Worker ID: worker-3-security

## Problem Brief
Read: .claude/context/sessions/consensus-$SESSION_ID-problem.json

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. **Invoke skill**: Skill({ skill: "security-architect" })
3. Analyze the problem from a SECURITY perspective
4. Focus on: attack vectors, data protection, compliance, vulnerabilities
5. Provide your recommendation with reasoning
6. Score each evaluation criterion (1-10)
7. IMPORTANT: Work INDEPENDENTLY - do not read other workers' outputs
8. Save your vote to: .claude/context/sessions/consensus-$SESSION_ID-vote-worker-3.json

## Output Format (JSON)
{
  "worker_id": "worker-3-security",
  "recommendation": "OPTION_A | OPTION_B | ABSTAIN",
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "criteria_scores": {...},
  "risks": [...],
  "tradeoffs": [...],
  "dissenting_notes": "..."
}
`,
});
```

**Expected Output**: Three independent vote files in `.claude/context/sessions/`

## Phase 2: Independent Analysis

Workers execute in parallel (Phase 1.2 spawns them simultaneously). Each worker:

1. Reads the problem brief
2. Analyzes from their domain expertise
3. Forms an independent recommendation
4. Scores evaluation criteria
5. Documents risks and tradeoffs
6. Writes vote file (no cross-reading allowed)

**Isolation Guarantee**: Workers must NOT read other workers' vote files. This ensures true independence and prevents groupthink or vote-following.

**Timeout Handling**: If a worker fails to produce output within the deadline:

- Mark as ABSTAIN with confidence 0
- Log failure to `.claude/context/memory/issues.md`
- Proceed with available votes (quorum permitting)

## Phase 3: Vote Collection

**Agent**: swarm-coordinator (Queen)

### Step 3.1: Gather and Tally Votes

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'developer',
  description: 'Queen collecting votes and calculating consensus',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Collect worker votes and calculate consensus for session: $SESSION_ID

## Instructions
1. Read your agent definition: .claude/agents/orchestrators/swarm-coordinator.md
2. **Invoke skill**: Skill({ skill: "consensus-voting" })
3. Read all vote files:
   - .claude/context/sessions/consensus-$SESSION_ID-vote-worker-1.json
   - .claude/context/sessions/consensus-$SESSION_ID-vote-worker-2.json
   - .claude/context/sessions/consensus-$SESSION_ID-vote-worker-3.json
4. Calculate consensus using weighted voting:
   - Weight = worker confidence score
   - Aggregate criteria scores (weighted average)
5. Apply quorum rules (see below)
6. Identify agreements and conflicts
7. Save tally to: .claude/context/sessions/consensus-$SESSION_ID-tally.json

## Quorum Rules
- STRONG_CONSENSUS: 3/3 workers agree (unanimous)
- MAJORITY_CONSENSUS: 2/3 workers agree
- SPLIT_DECISION: No majority, escalate to conflict resolution
- ABSTAIN_HEAVY: >1 abstain, insufficient data for decision

## Weighted Vote Calculation
weighted_score = sum(vote * confidence) / sum(confidence)
If all confidences are 0, treat as ABSTAIN_HEAVY

## Output Format (JSON)
{
  "session_id": "$SESSION_ID",
  "total_workers": 3,
  "votes_received": 3,
  "abstentions": 0,
  "recommendation_tally": {
    "OPTION_A": { "count": 2, "weighted_score": 0.85 },
    "OPTION_B": { "count": 1, "weighted_score": 0.70 }
  },
  "consensus_type": "MAJORITY_CONSENSUS",
  "winning_option": "OPTION_A",
  "aggregate_criteria_scores": {...},
  "all_risks": [...],
  "conflicts": [
    {
      "criterion": "performance",
      "worker_1_score": 9,
      "worker_2_score": 4,
      "delta": 5,
      "requires_resolution": true
    }
  ]
}

## Memory Protocol
1. Record voting pattern to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Vote tally with consensus type and identified conflicts

## Phase 4: Result Synthesis

**Agent**: swarm-coordinator (Queen)

### Step 4.1: Conflict Resolution

If conflicts exist (score delta > 3 on any criterion), resolve them:

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'developer',
  description: 'Queen resolving conflicts and synthesizing result',
  prompt: `You are the SWARM-COORDINATOR agent (Queen).

## Task
Resolve conflicts and synthesize final decision for session: $SESSION_ID

## Instructions
1. Read tally: .claude/context/sessions/consensus-$SESSION_ID-tally.json
2. For each conflict (delta > 3):
   a. Identify the disagreeing workers
   b. Analyze their reasoning
   c. Apply tie-breaking rules (see below)
   d. Document resolution rationale
3. Synthesize final recommendation incorporating:
   - Majority vote
   - Weighted criteria scores
   - Risk mitigation from all perspectives
   - Dissenting notes as caveats
4. Calculate final confidence (product of consensus strength and avg worker confidence)
5. Save final result to: .claude/context/sessions/consensus-$SESSION_ID-result.json

## Tie-Breaking Rules (in order)
1. SECURITY_PRIORITY: If security-architect flags critical risk, defer to security
2. CONFIDENCE_WEIGHTED: Higher confidence worker wins on tied votes
3. CRITERIA_SUM: Option with higher total criteria score wins
4. QUEEN_DECIDES: If still tied, Queen makes judgment call with explicit rationale

## Conflict Resolution Patterns
- Clarifying Conflict: Workers interpreted problem differently (document both)
- Value Conflict: Tradeoff between criteria (document tradeoff decision)
- Risk Conflict: Different risk assessments (take conservative path or document risk acceptance)

## Output Format (JSON)
{
  "session_id": "$SESSION_ID",
  "final_recommendation": "OPTION_A",
  "confidence": 0.82,
  "consensus_type": "MAJORITY_CONSENSUS",
  "supporting_workers": ["worker-1-developer", "worker-3-security"],
  "dissenting_workers": ["worker-2-architect"],
  "conflict_resolutions": [
    {
      "criterion": "performance",
      "resolution": "Accepted lower performance for better security",
      "rule_applied": "SECURITY_PRIORITY"
    }
  ],
  "final_criteria_scores": {...},
  "combined_risks": [...],
  "mitigations": [...],
  "caveats": ["Architect notes: May need refactoring in 6 months"],
  "decision_rationale": "..."
}

## Memory Protocol
1. Record decision to .claude/context/memory/decisions.md
2. Record conflict resolution patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Final synthesized decision with conflict resolutions and caveats

### Step 4.2: Implementation Handoff (Optional)

If the consensus leads to implementation:

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'developer',
  description: 'Developer implementing consensus decision',
  prompt: `You are the DEVELOPER agent.

## Task
Implement the consensus decision from session: $SESSION_ID

## Decision
Read: .claude/context/sessions/consensus-$SESSION_ID-result.json

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skill**: Skill({ skill: "tdd" })
3. Implement the winning option: $WINNING_OPTION
4. Address all identified risks with mitigations
5. Document caveats in code comments
6. Follow TDD cycle: RED -> GREEN -> REFACTOR

## Memory Protocol
1. Record implementation decisions to .claude/context/memory/decisions.md
`,
});
```

## Quorum Rules

| Quorum Type          | Definition              | Action                                        |
| -------------------- | ----------------------- | --------------------------------------------- |
| `STRONG_CONSENSUS`   | 3/3 unanimous agreement | Proceed with high confidence                  |
| `MAJORITY_CONSENSUS` | 2/3 agreement           | Proceed with documented dissent               |
| `SPLIT_DECISION`     | No majority (1/1/1)     | Escalate to human or spawn additional workers |
| `ABSTAIN_HEAVY`      | >1 abstention           | Gather more information before deciding       |
| `QUORUM_NOT_MET`     | <2 valid votes          | Retry with new workers or escalate            |

## Tie-Breaking Hierarchy

When votes are tied or conflicts require resolution:

1. **SECURITY_PRIORITY**: Security-architect's concerns override when flagged as critical
2. **CONFIDENCE_WEIGHTED**: Higher confidence worker's vote carries more weight
3. **CRITERIA_SUM**: Option with higher aggregate criteria score wins
4. **RISK_AVERSE**: If risk levels differ significantly, take conservative path
5. **QUEEN_DECIDES**: Queen makes final call with explicit documented rationale

## Error Recovery

### Worker Failure

```javascript
// If worker fails to produce output
if (worker_timeout || worker_error) {
  log_to('.claude/context/memory/issues.md', {
    session: SESSION_ID,
    worker: WORKER_ID,
    error: ERROR_MESSAGE,
    timestamp: ISO_8601,
  });

  // Check if quorum still possible
  if (remaining_workers >= QUORUM_MINIMUM) {
    proceed_with_remaining();
  } else {
    spawn_replacement_worker();
  }
}
```

### Consensus Failure

If no consensus can be reached after conflict resolution:

1. Document the deadlock in `.claude/context/memory/issues.md`
2. Escalate to human with full context (all votes, conflicts, reasoning)
3. Request additional workers with different domain expertise
4. Consider splitting the problem into smaller decisions

## Session Cleanup

After workflow completion:

```bash
# Archive session files
mv .claude/context/sessions/consensus-$SESSION_ID-*.json \
   .claude/context/sessions/archive/

# Retain only final result for reference
cp .claude/context/sessions/archive/consensus-$SESSION_ID-result.json \
   .claude/context/decisions/consensus-$SESSION_ID.json
```

## Usage Example

```javascript
// Router spawning consensus workflow for technology decision
Task({
  task_id: 'task-8',
  subagent_type: 'developer',
  description: 'Initiating consensus voting for database selection',
  prompt: `Execute consensus voting workflow.

## Problem
Select database technology for new microservice:
- Options: PostgreSQL vs MongoDB vs DynamoDB
- Requirements: High throughput, ACID for some tables, flexible schema for logs

## Parameters
- Session ID: db-selection-2026-01-25
- Workers: developer, architect, security-architect
- Quorum: 2/3 majority

## Instructions
Follow the phased workflow in: .claude/workflows/consensus-voting-skill-workflow.md
`,
});
```

## Related Skill

This workflow implements the structured process for the corresponding skill:

- **Skill**: `.claude/skills/consensus-voting/SKILL.md`
- **Invoke skill**: `Skill({ skill: "consensus-voting" })`
- **Relationship**: Workflow provides multi-agent orchestration; skill provides core capabilities

## Agent-Skill Mapping

| Worker Role      | Agent              | Required Skills                      |
| ---------------- | ------------------ | ------------------------------------ |
| Queen            | swarm-coordinator  | swarm-coordination, consensus-voting |
| Developer Worker | developer          | tdd, debugging                       |
| Architect Worker | architect          | -                                    |
| Security Worker  | security-architect | security-architect                   |
| QA Worker        | qa                 | tdd                                  |
| DevOps Worker    | devops             | observability-expert                 |

## Notes

- All session files use JSON format for machine-readability
- Workers are isolated to prevent vote contamination
- Queen maintains session state and coordinates all phases
- Confidence scores enable nuanced weighted voting
- Dissenting notes are preserved as caveats, never discarded
- This workflow integrates with the Task tracking system for audit trails
