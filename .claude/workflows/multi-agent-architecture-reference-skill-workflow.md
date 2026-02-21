# Multi-Agent Architecture Reference — Skill Workflow

This workflow guides architects, planners, and orchestrators through topology selection using the `multi-agent-architecture-reference` skill.

## When to Use This Workflow

- Before decomposing a MEDIUM+ complexity task into multi-agent work
- When designing a new orchestration pipeline
- When an existing topology is failing (to select a replacement)
- During architecture review of multi-agent systems

## Phase 1: Complexity Classification

```javascript
// Invoke complexity-assessment first
Skill({ skill: 'complexity-assessment' });
// Result: TRIVIAL | LOW | MEDIUM | HIGH | EPIC
```

If TRIVIAL or LOW → stop here. Use single agent or simple Supervisor pattern.

## Phase 2: Topology Selection

```javascript
// Load the reference
Skill({ skill: 'multi-agent-architecture-reference' });

// Work through the 4 questions:
// 1. Task independence? → YES (Swarm/Fan-out) | NO (Conductor/Hierarchical)
// 2. Task types known? → YES (Supervisor) | NO (Swarm/Hierarchical)
// 3. Multi-stage phases? → YES (Conductor/Hierarchical) | NO (Swarm)
// 4. High-stakes decision? → YES (Consensus) | NO (other)
```

## Phase 3: Failure Mode Review

Before finalizing topology, check applicable failure modes from the reference:

| Selected Topology | Must Check               |
| ----------------- | ------------------------ |
| Conductor         | SE-M01                   |
| Supervisor        | SE-M01                   |
| Fan-out           | (aggregation complexity) |
| Swarm             | SE-M02, SE-M05           |
| Consensus         | SE-M02                   |
| Hierarchical      | SE-M03, SE-M04           |

## Phase 4: Map to Existing Skill

```javascript
// Fan-out/Fan-in selected:
Skill({ skill: 'wave-executor' });

// Swarm selected:
Skill({ skill: 'swarm-coordination' });

// Consensus selected:
Skill({ skill: 'consensus-voting' });

// Conductor (default):
// Use master-orchestrator pattern directly
```

## Phase 5: Document Decision

Use `.claude/skills/multi-agent-architecture-reference/templates/implementation-template.md` to record:

- Selected topology and rationale
- Token cost estimate
- Failure mode mitigations
- Escalation path

## Output

The topology selection decision MUST be recorded in `.claude/context/memory/decisions.md` before proceeding to implementation.

## Related Skills

- `complexity-assessment` — Step 1 complexity classification
- `architecture-review` — Post-selection architecture validation
- `wave-executor` — Fan-out/Fan-in execution
- `swarm-coordination` — Swarm execution
- `consensus-voting` — Consensus execution
