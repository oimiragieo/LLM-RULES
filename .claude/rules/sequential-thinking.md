# Sequential Thinking Rules

## Core Principles

- Dynamic thought allocation: Adjust total thoughts as complexity becomes clear
- Non-linear exploration: Branch, revise, backtrack when assumptions proven wrong
- Explicit uncertainty: Mark thoughts as tentative vs confident
- Hypothesis verification: Generate and test solution hypotheses before committing
- Optimal stopping: Continue until confidence threshold met, not arbitrary thought count

## Thought Numbering Rules

### Numbering System

**Linear thoughts**: 1, 2, 3, 4, 5...

**Branches**: Use branch ID + thought number

- Main: 1, 2, 3
- Branch A from thought 2: 2.A.1, 2.A.2, 2.A.3
- Branch B from thought 2: 2.B.1, 2.B.2
- Branch from branch: 2.A.2.C.1, 2.A.2.C.2

### Revision Protocol

**Revising a thought**: Mark `isRevision: true` and `revisesThought: N`

```javascript
mcp__sequential -
  thinking__sequentialthinking({
    thought:
      'Actually, my assumption in thought 3 was wrong. The bug is not in the auth module but in the API layer.',
    thoughtNumber: 6,
    totalThoughts: 10,
    isRevision: true,
    revisesThought: 3,
    nextThoughtNeeded: true,
  });
```

**Effect**: Thought 6 updates understanding from thought 3. Downstream thoughts (4, 5) may be invalidated.

### Branching Rules

**When to branch**:

- Exploring multiple hypotheses
- Uncertain which approach is correct
- Want to compare alternatives before choosing

**Branch syntax**:

```javascript
// Branch from thought 5 to explore alternative
mcp__sequential -
  thinking__sequentialthinking({
    thought: 'Let me explore the caching approach instead of database optimization.',
    thoughtNumber: 1, // First thought in branch
    totalThoughts: 5,
    branchFromThought: 5,
    branchId: 'caching-approach',
    nextThoughtNeeded: true,
  });
```

**Merging branches**: Return to main line with synthesis thought:

```javascript
// After exploring branches, synthesize
mcp__sequential -
  thinking__sequentialthinking({
    thought:
      'Comparing both approaches: caching wins for read-heavy, database optimization for write-heavy. Recommend caching based on usage pattern.',
    thoughtNumber: 12,
    totalThoughts: 12,
    nextThoughtNeeded: false, // Done
  });
```

## Optimal Stopping Criteria

**When to set `nextThoughtNeeded: false`**:

| Criterion             | Threshold                        |
| --------------------- | -------------------------------- |
| Hypothesis verified   | Solution tested and confirmed    |
| Confidence            | ≥85% confident in recommendation |
| Alternatives explored | Considered ≥2 approaches         |
| Blockers identified   | Clear path forward OR escalation |
| Completeness          | All requirements addressed       |

**Don't stop prematurely**:

- Just because reached estimated `totalThoughts`
- Before testing hypothesis
- Without considering alternatives

**Adjust `totalThoughts` upward** if:

- Problem more complex than initially assessed
- New information revealed during exploration
- Hypothesis failed, need to explore alternatives

## Integration with Planner

**When planner uses sequential-thinking**:

1. **Initial estimate**: Planner sets `totalThoughts` based on complexity
2. **Exploration**: Planner adjusts estimate as details emerge
3. **Branch**: Planner explores multiple architectural approaches
4. **Verify**: Planner tests solution hypothesis against requirements
5. **Complete**: Planner sets `nextThoughtNeeded: false` with confident recommendation

**Output**: Planner creates implementation plan based on verified hypothesis from sequential thinking.

## Anti-Patterns

| Anti-Pattern               | Problem                                | Fix                                   |
| -------------------------- | -------------------------------------- | ------------------------------------- |
| Fixed thought count        | Stops at estimate even if unclear      | Adjust `totalThoughts` dynamically    |
| No branching               | Commits to first approach              | Explore alternatives via branches     |
| No revision                | Doesn't update when wrong              | Mark revisions explicitly             |
| Premature stopping         | Stops before hypothesis verified       | Continue until verification complete  |
| No uncertainty markers     | Overconfident recommendations          | Mark tentative vs confident thoughts  |
| Linear only                | Forces sequential when parallel better | Use branches for parallel exploration |
| Ignoring failed hypotheses | Doesn't learn from wrong paths         | Document why hypotheses failed        |

## Thought Quality Standards

**Each thought should**:

- State one clear idea or step
- Build on OR revise previous thoughts
- Identify assumptions being made
- Mark confidence level if uncertain
- Lead toward testable hypothesis

**Example of good thought**:

```
Thought 5: Based on the profiler data (thought 3), the bottleneck is the N+1 query pattern in the user fetching loop. Hypothesis: Adding eager loading will reduce query count from 1000+ to <10. Confidence: 80% (need to verify with test query).
```

**Example of bad thought**:

```
Thought 5: Make it faster.
```

## Related Skills

- `plan-generator` - Uses sequential thinking for plan creation
- `debugging` - Uses sequential thinking for root cause analysis
- `complexity-assessment` - Uses sequential thinking to determine task complexity

## Related References

- `.claude/skills/sequential-thinking/SKILL.md` - Complete MCP tool specification
- `.claude/tools/optimization/sequential-thinking/executor.py` - Standalone executor
