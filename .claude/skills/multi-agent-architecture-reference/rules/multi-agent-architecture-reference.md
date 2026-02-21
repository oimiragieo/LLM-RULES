---
paths:
  - .claude/skills/multi-agent-architecture-reference/**
---

# Multi-Agent Architecture Reference Rules

## Core Principles

- Always start with Conductor (master-orchestrator) as default topology
- Never use Hierarchical beyond max_depth=3 (token runaway risk SE-M04)
- Assign task IDs in Swarm topology to prevent orphaned tasks (SE-M05)
- Use Fan-out (wave-executor) when tasks have a clear aggregation boundary
- Add Consensus Voting gate only for genuinely high-stakes decisions

## Topology Selection Rules

| Rule | Condition                                           | Action                                           |
| ---- | --------------------------------------------------- | ------------------------------------------------ |
| R-01 | Task complexity is TRIVIAL                          | Use single agent, no multi-agent needed          |
| R-02 | Tasks are independent and parallelizable            | Use Fan-out (wave-executor) or Swarm             |
| R-03 | Sequential phases with known ordering               | Use Conductor (master-orchestrator)              |
| R-04 | High-stakes decision requiring agreement            | Use Consensus Voting                             |
| R-05 | Multiple distinct sub-phases with sub-orchestration | Use Hierarchical (max_depth=3)                   |
| R-06 | Token budget is tight                               | Prefer Supervisor (~5x) over Hierarchical (~15x) |

## Anti-Patterns

| Anti-Pattern                        | Problem                             | Fix                                        |
| ----------------------------------- | ----------------------------------- | ------------------------------------------ |
| Hierarchical depth > 3              | Token runaway (SE-M04)              | Flatten to Conductor + Fan-out             |
| Swarm without task IDs              | Orphaned tasks (SE-M05)             | Assign unique TaskUpdate IDs               |
| Consensus for every decision        | 12x token cost on routine decisions | Reserve for high-stakes only               |
| Single coordinator under heavy load | Coordinator overload (SE-M01)       | Distribute coordination, use wave-executor |
| Parallel swarm on ordered tasks     | Wrong results                       | Switch to Conductor for ordering           |

## Integration Points

### Agents Using This Skill

- **architect** (primary): Selects topology during system design phase
- **planner** (primary): Selects topology when decomposing complex tasks
- **master-orchestrator** (supporting): References for runtime topology decisions

### Related Skills

- `wave-executor` — Fan-out/Fan-in implementation for parallel batch pipelines
- `swarm-coordination` — Swarm topology execution patterns
- `consensus-voting` — Byzantine consensus for high-stakes decisions
- `architecture-review` — Validate topology choices against non-functional requirements
- `complexity-assessment` — Determine complexity level before topology selection

### Workflows

- `enterprise-workflow.md` — Multi-phase execution uses Conductor pattern
- `router-decision.md` — Router uses Supervisor pattern implicitly
- `ecosystem-creation-workflow.md` — Batch artifact creation uses Swarm/Fan-out

## Output Requirements

When using this skill, always document:

- [ ] Selected topology with rationale
- [ ] Token cost estimate
- [ ] Applicable failure modes (SE-M01 through SE-M05) and mitigations
- [ ] Existing agent-studio skill/pattern to leverage
- [ ] Escalation path if topology proves insufficient
