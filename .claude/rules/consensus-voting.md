# Consensus Voting Rules

## Core Principles

- Byzantine fault tolerance: System functions correctly even with some dishonest or faulty agents
- Quorum requirements: Minimum participation threshold ensures legitimacy
- Weighted voting: Expert opinions carry more weight than generalist views
- Transparent dissent: Document all perspectives, including minority opinions
- Conflict escalation: Unresolved disagreements trigger human intervention

## Voting Protocols

### Protocol Types

| Protocol       | Use Case                           | Threshold | Quorum |
| -------------- | ---------------------------------- | --------- | ------ |
| Simple Majority| Routine decisions                  | >50%      | 50%    |
| Supermajority  | Significant changes                | ≥66%      | 75%    |
| Unanimous      | Critical/irreversible decisions    | 100%      | 100%   |
| Weighted       | Specialized expertise required     | Variable  | 66%    |
| Ranked Choice  | Multiple alternatives              | Runoff    | 75%    |

### Weighted Voting Standards

Assign weights based on domain expertise:

```yaml
weights:
  database-architect: 2.0  # Domain expert
  security-architect: 1.5  # Secondary expertise
  developer: 1.0           # General expertise
  qa: 0.8                  # Peripheral expertise
```

**Weight justification required**: Document why each agent receives their weight.

## Quorum Requirements

**Minimum participation thresholds** prevent decisions from small, non-representative groups:

- **Simple decisions**: 50% of eligible voters
- **Important decisions**: 75% of eligible voters
- **Critical decisions**: 100% of eligible voters (all must participate)

**Quorum failure**: If quorum not met, decision is postponed or escalated to human.

## Conflict Resolution Strategies

### Strategy 1: Expert Override

When threshold not met but domain expert has strong opinion:

```
IF (expert_vote_weight > 1.5 AND expert_confidence > 0.85)
  THEN expert_recommendation_prevails
  WITH dissenting_opinions_documented
```

### Strategy 2: Re-vote with Deliberation

Agents discuss rationales, then vote again:

1. Share detailed reasoning
2. Debate alternatives
3. Second vote with informed context
4. If still no consensus → Strategy 3

### Strategy 3: Human Escalation

When automated consensus fails:

- Present all voting results with rationales
- Highlight key disagreement points
- Provide pros/cons from each perspective
- Human makes final decision

## Anti-Patterns

| Anti-Pattern                     | Problem                              | Fix                                          |
| -------------------------------- | ------------------------------------ | -------------------------------------------- |
| No quorum requirement            | Small group decides for all          | Set minimum participation threshold          |
| Equal weights for all            | Ignores domain expertise             | Weight votes by expertise                    |
| Discarding dissent               | Loses valuable perspectives          | Document all rationales (majority + minority)|
| No confidence scoring            | Binary votes lose nuance             | Include confidence (0.0-1.0) with each vote  |
| Immediate decision on split vote | Rushed decisions on ambiguity        | Re-vote with deliberation or escalate        |
| No audit trail                   | Can't trace why decision was made    | Log all votes, weights, rationales           |
| Allowing abstentions             | Agents avoid difficult decisions     | Require votes from all participants          |

## Byzantine Fault Tolerance

**Assumption**: Some agents may provide unreliable or malicious recommendations.

**Mitigation**:

- **Outlier detection**: Flag votes significantly different from cluster
- **Historical accuracy**: Track agent decision quality over time
- **Cross-validation**: Independent agents review same issue
- **Confidence weighting**: Low-confidence votes contribute less

**3f+1 rule**: System tolerates up to `f` faulty agents if total agents ≥ 3f+1.

## Integration Points

### Master Orchestrator

- Uses consensus voting for critical multi-agent decisions
- Aggregates specialist recommendations
- Escalates unresolved conflicts

### Evolution Orchestrator

- Votes on whether new agents/skills are needed
- Consensus on framework changes
- Prioritization of evolution tasks

### Security Architect + Other Specialists

- Weighted voting on security vs. performance trade-offs
- Multi-domain decisions (security, performance, maintainability)
- Architecture review consensus

## Decision Documentation Format

```markdown
## Consensus Decision: [Topic]

**Date**: YYYY-MM-DD
**Quorum**: [N/M participants] ([percentage]%)
**Threshold**: [percentage]% required
**Result**: [CONSENSUS | NO CONSENSUS | ESCALATED]

### Votes

- **Agent**: [name] (weight: [X.X], confidence: [0.X])
  - **Vote**: [option]
  - **Rationale**: [reasoning]

### Weighted Results

| Option     | Weighted Score | Percentage |
| ---------- | -------------- | ---------- |
| Option A   | X.XX           | XX.X%      |
| Option B   | Y.YY           | YY.Y%      |

### Decision

[Final decision with justification]

### Dissenting Opinions

[Document minority perspectives and concerns]
```

## Related Skills

- `swarm-coordination` - Parallel agent execution for vote collection
- `master-orchestrator` - Orchestrates consensus voting sessions
- `response-rater` - Evaluates agent response quality for weighting

## Related References

- `.claude/skills/consensus-voting/SKILL.md` - Complete voting protocol implementation
- `.claude/agents/orchestrators/master-orchestrator.md` - Uses consensus for decisions
