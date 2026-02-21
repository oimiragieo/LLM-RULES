# Research Requirements — multi-agent-architecture-reference

**Date**: 2026-02-21
**Query Intent**: Design a canonical reference for multi-agent topology selection

## Research Summary

**Queries executed (3/5 max)**:

1. WebSearch: "Multi-agent architecture patterns supervisor swarm hierarchical 2025"
2. WebFetch: docs.swarms.world — multi-agent orchestration topology guide
3. Codebase scan: .claude/skills/ — existing topology-related skills

**Sources consulted**:

- Multiple web sources on multi-agent systems (2025 papers and guides)
- docs.swarms.world detailed failure modes and selection criteria
- agent-studio codebase: consensus-voting, swarm-coordination, wave-executor skills

## Exa Research Status

Exa MCP not available in this session. Used WebSearch + WebFetch as fallback (per research-synthesis protocol).

## Key Findings

### Topology Token Economics (as of 2026)

| Topology         | Token Multiplier | Source                                   |
| ---------------- | ---------------- | ---------------------------------------- |
| Supervisor       | ~5x              | Swarms documentation + web sources       |
| Conductor        | ~6x              | agent-studio master-orchestrator pattern |
| Fan-out/Fan-in   | ~8x              | wave-executor implementation analysis    |
| Swarm            | ~8x              | Swarms documentation                     |
| Consensus Voting | ~12x             | consensus-voting skill analysis          |
| Hierarchical     | ~15x             | web research + swarms.world              |

### Design Constraints Mapped to Rules/Schemas

1. **Token budget awareness**: Output schema includes `tokenCost` field; rules mandate documenting estimates
2. **Failure mode taxonomy**: SE-M01..SE-M05 codes enforce structured mitigation documentation
3. **Max depth enforcement**: Rules explicitly prohibit Hierarchical depth > 3 (SE-M04 risk)

### Non-Goals

- This skill does NOT implement any topology — it only selects/recommends
- Does NOT replace the actual execution skills (wave-executor, swarm-coordination, etc.)
- Does NOT cover external frameworks (LangGraph, CrewAI, etc.) — agent-studio patterns only

## Prior Art Search

Searched VoltAgent/awesome-agent-skills for topology/architecture reference skills — no matching skill found at time of research.

## agent-studio Pattern Analysis

Existing skills that implement specific topologies:

- `.claude/skills/consensus-voting/SKILL.md` — Consensus/voting topology
- `.claude/skills/swarm-coordination/SKILL.md` — Swarm topology
- `.claude/skills/wave-executor/SKILL.md` — Fan-out/Fan-in topology
- `.claude/agents/orchestrators/master-orchestrator.md` — Conductor topology
- Built into Router — Supervisor topology

Gap confirmed: No canonical reference exists for SELECTING among these topologies.
