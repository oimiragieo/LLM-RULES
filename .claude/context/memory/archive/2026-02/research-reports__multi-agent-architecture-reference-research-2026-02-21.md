<!-- Agent: developer | Task: #2b | Session: 2026-02-21 -->

# Research Report: multi-agent-architecture-reference Skill

**Date**: 2026-02-21
**Query Intent**: Design a canonical reference for multi-agent topology selection

## Executive Summary

Multi-agent systems in 2025 center on three primary topologies: Supervisor (single coordinator routes work), Swarm (peer-to-peer concurrent agents), and Hierarchical (tree of delegating coordinators). Token economics scale roughly 5x/8x/15x over baseline respectively. No canonical skill exists in agent-studio for topology selection guidance; architects and planners currently make ad-hoc decisions.

## Research Methodology

| Query                                                                | Source                              | Key Finding                                            |
| -------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| Multi-agent architecture patterns supervisor swarm hierarchical 2025 | WebSearch                           | Confirmed 3 primary topologies + hybrid patterns       |
| Swarm architectures documentation                                    | docs.swarms.world                   | Detailed failure modes and selection guide             |
| Existing codebase pattern                                            | .claude/skills/architecture-review/ | Confirm tabular format with severity levels works well |

## Detailed Findings

### Topology Decision Matrix

| Topology         | Token Cost (vs baseline) | Failure Mode                                                 | Best For                                                           |
| ---------------- | ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Supervisor       | ~5x                      | Single point of failure; router miscalibration               | Dynamic task allocation; known task types; heterogeneous agents    |
| Swarm            | ~8x                      | Coordination overhead; consensus deadlock; unclear ownership | Parallel processing; load balancing; consensus decisions           |
| Hierarchical     | ~15x                     | Bottleneck at top; cascading failures; inflexible routing    | Complex decision-making; multi-stage workflows; structured domains |
| Conductor        | ~6x                      | Orchestrator overload                                        | Ordered sequential agent phases                                    |
| Fan-out/Fan-in   | ~8x                      | Result aggregation complexity                                | Parallel search; map-reduce patterns                               |
| Consensus Voting | ~12x                     | Deadlock on split votes                                      | High-stakes decisions requiring agreement                          |

### Failure Mode Taxonomy

**SE-M01: Coordinator Overload** — Supervisor or Hierarchical root receives more traffic than it can route. Fix: distribute coordination or add routing replicas.

**SE-M02: Swarm Deadlock** — Agents wait for each other's consensus. Fix: timeout + majority-vote with tie-breaker.

**SE-M03: Cascade Failure** — In hierarchical, a mid-level agent failure halts all downstream. Fix: circuit breakers at each tier.

**SE-M04: Token Runaway** — Hierarchical spawning too many levels burns tokens exponentially. Fix: set max_depth=3 and monitor token budget per level.

**SE-M05: Orphaned Tasks** — Swarm agents drop tasks when no ownership is clear. Fix: assign task IDs and use TaskUpdate tracking.

### When-To-Use Guidance

- **Supervisor**: Use when task types are known and stable, agents are specialists, and routing logic is deterministic.
- **Swarm**: Use when tasks are independent, results can be merged, and fault tolerance > sequential ordering.
- **Hierarchical**: Use for EPIC-complexity tasks with multiple distinct phases requiring sub-orchestration.
- **Conductor**: agent-studio's preferred pattern — one orchestrator drives sequential phases with TaskUpdate coordination.
- **Fan-out/Fan-in**: Use for parallel review/analysis (e.g., wave-executor skill).
- **Consensus Voting**: Use for high-stakes artifact decisions requiring multi-reviewer agreement.

### Existing Codebase Patterns

- `.claude/skills/consensus-voting/SKILL.md` — Agent voting pattern already exists
- `.claude/skills/swarm-coordination/SKILL.md` — Swarm coordination already exists
- `.claude/skills/wave-executor/SKILL.md` — Fan-out/fan-in pattern implemented
- `.claude/agents/orchestrators/master-orchestrator.md` — Conductor pattern in use
- `.claude/skills/architecture-review/SKILL.md` — Tabular decision format with severity levels

## Design Decisions

| Decision                                   | Rationale                                                                     | Source                              |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------- |
| Token economics as 5x/8x/15x ratios        | Relative to single-agent baseline; helps architects make cost-aware decisions | Task research context + swarms docs |
| Include Conductor and Fan-out patterns     | Already used in agent-studio; reference must match actual practice            | Codebase scan                       |
| 7-entry failure taxonomy (SE-M01..SE-M05+) | Structured like SE-01..SE-07 sharp-edges for consistency                      | Task research context               |
| Decision matrix as the primary artifact    | Architects need "given my situation → use this topology" answers, not prose   | Architecture-review skill pattern   |

## Practical Recommendations

**P0 (Critical):**

- Include the 6-topology decision matrix with token costs and failure modes
- Reference agent-studio's existing Conductor pattern as the default recommendation

**P1 (Important):**

- Add "escalation path" — when to upgrade topology (TRIVIAL → Supervisor → Hierarchical)
- Include reference to existing skills (wave-executor, consensus-voting, swarm-coordination)

**P2 (Nice-to-have):**

- Add Mermaid diagram showing topology shapes

## Risk Assessment

| Risk                              | Impact | Probability | Mitigation                                   |
| --------------------------------- | ------ | ----------- | -------------------------------------------- |
| Token cost ratios become outdated | Medium | Medium      | Mark as approximate; add "as of 2026" caveat |
| New topologies not covered        | Low    | Low         | Add "See also" section for emerging patterns |

## Implementation Roadmap

1. Create `.claude/skills/multi-agent-architecture-reference/SKILL.md` using skill-creator
2. Assign to: architect, planner, master-orchestrator
3. Category: Planning & Architecture
4. Tags: [multi-agent, architecture, topology, orchestration, decision-matrix]
