---
name: consensus-voting
description: Byzantine consensus voting for multi-agent decision making. Implements voting protocols, conflict resolution, and agreement algorithms for reaching consensus among multiple agents.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
best_practices:
  - Require minimum quorum for decisions
  - Weight votes by agent expertise
  - Document dissenting opinions
  - Escalate unresolved conflicts
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Consensus Voting Skill

<identity>
Consensus Voting Skill - Implements voting protocols and conflict resolution algorithms for reaching consensus among multiple agents with potentially conflicting recommendations.
</identity>

<capabilities>
- Collecting votes from multiple agents
- Weighted voting based on expertise
- Conflict detection and resolution
- Quorum verification
- Decision documentation
</capabilities>

<instructions>
<execution_process>

### Step 1: Define Voting Parameters

Set up the voting session:

```yaml
voting_session:
  topic: 'Which database to use for the new service'
  options:
    - PostgreSQL
    - MongoDB
    - DynamoDB
  quorum: 3 # Minimum votes required
  threshold: 0.6 # 60% agreement needed
  weights:
    database-architect: 2.0 # Expert gets 2x weight
    security-architect: 1.0
    devops: 1.5
```

### Step 2: Collect Votes

Gather agent recommendations:

```markdown
## Vote Collection

### database-architect (weight: 2.0)

- Vote: PostgreSQL
- Rationale: Strong ACID guarantees, mature ecosystem
- Confidence: 0.9

### security-architect (weight: 1.0)

- Vote: PostgreSQL
- Rationale: Better encryption at rest, audit logging
- Confidence: 0.8

### devops (weight: 1.5)

- Vote: DynamoDB
- Rationale: Managed service, auto-scaling
- Confidence: 0.7
```

### Step 3: Calculate Consensus

Apply weighted voting:

```
PostgreSQL: (2.0 * 0.9) + (1.0 * 0.8) = 2.6
DynamoDB:   (1.5 * 0.7) = 1.05
MongoDB:    0

Total weight: 4.5
PostgreSQL: 2.6 / 4.5 = 57.8%
DynamoDB:   1.05 / 4.5 = 23.3%

Threshold: 60% → No clear consensus
```

### Step 4: Resolve Conflicts

When no consensus is reached:

**Strategy 1: Expert Override**

- If domain expert has strong opinion (>0.8 confidence), defer to expert

**Strategy 2: Discussion Round**

- Ask dissenting agents to respond to majority arguments
- Re-vote after discussion

**Strategy 3: Escalation**

- Present options to user with pros/cons from each agent
- Let user make final decision

### Step 5: Document Decision

Record the final decision:

```markdown
## Decision Record

### Topic

Which database to use for the new service

### Decision

PostgreSQL

### Voting Summary

- PostgreSQL: 57.8% (2 votes)
- DynamoDB: 23.3% (1 vote)
- Consensus: NOT REACHED (below 60% threshold)

### Resolution Method

Expert override - database-architect (domain expert)
had 0.9 confidence in PostgreSQL

### Dissenting Opinion

DevOps preferred DynamoDB for operational simplicity.
Mitigation: Will use managed PostgreSQL (RDS) to
reduce operational burden.

### Decision Date

2026-01-23
```

</execution_process>

<best_practices>

1. **Quorum Required**: Don't decide without minimum participation
2. **Weight by Expertise**: Domain experts get more influence
3. **Document Dissent**: Record minority opinions for future reference
4. **Clear Thresholds**: Define what constitutes consensus upfront
5. **Escalation Path**: Have a process for unresolved conflicts

</best_practices>
</instructions>

<examples>
<usage_example>
**Conflict Resolution Request**:

```
The architect wants microservices but the developer prefers monolith.
Resolve this conflict.
```

**Voting Process**:

```markdown
## Voting: Architecture Style

### Votes

- architect: Microservices (weight 1.5, confidence 0.8)
- developer: Monolith (weight 1.0, confidence 0.9)
- devops: Microservices (weight 1.0, confidence 0.6)

### Calculation

Microservices: (1.5 _ 0.8) + (1.0 _ 0.6) = 1.8
Monolith: (1.0 \* 0.9) = 0.9

Microservices: 66.7% → CONSENSUS REACHED

### Decision

Microservices, with modular monolith as migration path

### Dissent Mitigation

Start with modular monolith, extract services incrementally
to address developer's maintainability concerns.
```

</usage_example>
</examples>

## Dual-Completion Gate Protocol

Prevents premature closure of council or multi-agent tasks by requiring 2+ agents to independently confirm task completion before the session closes.

### Problem

A single agent signaling "done" can produce incomplete results -- the agent may have finished its own subtask but the overall task is not complete. The dual-completion gate requires consensus on completion itself.

### Protocol

1. Track completion signals per agent: `{ agent_id, timestamp, signal: "complete" }`
2. Require `min_completions` (default: 2) signals within a `window_seconds` time window (default: 60s)
3. If only 1 agent signals completion, send a "verification nudge" to remaining agents after `nudge_after_seconds` (default: 30s)
4. After `fallback_timeout` (default: 120s) with only 1 completion, accept single-agent completion with a `warning: "single_agent_completion"` flag

### Configuration

```yaml
completion_gate:
  min_completions: 2 # minimum agents that must signal done
  window_seconds: 60 # time window for completion consensus
  nudge_after_seconds: 30 # send nudge to remaining agents after first completion
  fallback_timeout: 120 # accept single completion after this timeout (with warning)
```

### Pseudocode

```
completions = []

on_agent_complete(agent_id):
  completions.push({ agent_id, timestamp: now() })

  if completions.length >= min_completions:
    window_start = completions[0].timestamp
    window_end = completions[-1].timestamp
    if (window_end - window_start) <= window_seconds:
      return CLOSE_SESSION(status: "consensus_complete")

  if completions.length == 1:
    schedule_nudge(nudge_after_seconds)
    schedule_fallback(fallback_timeout)

on_nudge_timeout():
  send_to_remaining_agents("A team member has signaled completion. Please confirm if the task is done.")

on_fallback_timeout():
  if completions.length < min_completions:
    return CLOSE_SESSION(status: "single_agent_complete", warning: "single_agent_completion")
```

### Integration with LLM Council

The dual-completion gate is invoked by the llm-council skill before closing a council session:

1. After Stage 3 synthesis, each model is asked: "Is this synthesis complete and accurate?"
2. Models respond with "complete" or "needs_revision"
3. The gate requires `min_completions` "complete" signals before closing
4. If gate fails (insufficient completions), chairman reviews and decides

### Voting Protocols Table Update

| Protocol            | Use Case                        | Threshold            | Quorum   |
| ------------------- | ------------------------------- | -------------------- | -------- |
| Simple Majority     | Routine decisions               | >50%                 | 50%      |
| Supermajority       | Significant changes             | >=66%                | 75%      |
| Unanimous           | Critical/irreversible decisions | 100%                 | 100%     |
| Weighted            | Specialized expertise required  | Variable             | 66%      |
| Ranked Choice       | Multiple alternatives           | Runoff               | 75%      |
| **Dual Completion** | **Council task closure**        | **2 agents confirm** | **100%** |

## Rules

- Always require quorum before deciding
- Weight votes by domain expertise
- Document dissenting opinions for future reference
- Require dual-agent completion consensus before closing council sessions

## Related Workflow

This skill has a corresponding workflow for complex multi-agent scenarios:

- **Workflow**: `.claude/workflows/consensus-voting-skill-workflow.md`
- **When to use workflow**: For critical multi-agent decisions requiring Byzantine fault-tolerant consensus with Queen/Worker topology (architectural decisions, security reviews, technology selection)
- **When to use skill directly**: For simple voting scenarios or when integrating consensus into other workflows

## Workflow Integration

This skill enables decision-making in multi-agent orchestration:

**Router Decision:** `.claude/workflows/core/router-decision.md`

- Router spawns multiple reviewers, then uses consensus to resolve conflicts
- Planning Orchestration Matrix triggers consensus voting for review phases

**Artifact Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

- Consensus voting determines artifact deprecation decisions
- Multiple maintainers vote on breaking changes

**Related Workflows:**

- `swarm-coordination` skill for parallel agent spawning before voting
- Enterprise workflows use consensus for design reviews
- Security reviews in `.claude/workflows/enterprise/` require security-architect consensus

---

## Iron Laws

1. **NEVER accept a decision without meeting minimum quorum** — decisions made without quorum are illegitimate; if quorum is not met, postpone the decision or escalate to human intervention.
2. **ALWAYS weight votes by domain expertise** — equal weights give a generalist developer the same influence as a domain expert; weight by expertise relevance to the decision domain.
3. **NEVER discard dissenting opinions** — minority perspectives contain the most important signal about edge cases and risks; document all rationales, including the losing side.
4. **ALWAYS require re-vote with deliberation before escalating** — a split vote without deliberation wastes the consensus mechanism; agents must share reasoning and vote again before escalating to human.
5. **NEVER allow abstentions in critical decisions** — abstentions on high-stakes decisions mean agents are avoiding responsibility; all participants must vote on CRITICAL/UNANIMOUS-threshold decisions.

## Anti-Patterns

| Anti-Pattern                               | Why It Fails                                       | Correct Approach                                                     |
| ------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| No quorum requirement                      | Tiny group decides for all; illegitimate consensus | Set minimum participation threshold per decision type                |
| Equal weights for all agents               | Ignores domain expertise; reduces signal quality   | Weight by domain expertise relevance (1.0–2.0 range)                 |
| Discarding dissenting rationales           | Loses edge case awareness and risk signals         | Document all votes and rationales, majority and minority             |
| Immediate escalation on split vote         | Skips deliberation that could resolve disagreement | Require deliberation + re-vote before human escalation               |
| Allowing abstentions on critical decisions | Agents avoid accountability on hard decisions      | Require participation from all eligible voters on CRITICAL decisions |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
