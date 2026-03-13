---
name: multi-agent-architecture-reference
description: 'Decision matrix for multi-agent topologies with token economics, failure modes, escalation paths, and external framework equivalents'
version: 1.2.0
verified: true
lastVerifiedAt: '2026-03-13'
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, WebSearch, WebFetch]
agents: [architect, planner, master-orchestrator]
category: 'Planning & Architecture'
tags: [multi-agent, architecture, topology, orchestration, decision-matrix]
---

# Multi-Agent Architecture Reference

<instructions>

## Topology Decision Matrix

| Topology         | Token | Best For                                       | Failure   | Skill               |
| ---------------- | ----- | ---------------------------------------------- | --------- | ------------------- |
| Conductor        | ~6x   | Sequential phases, ordered steps (DEFAULT)     | SE-M01    | master-orchestrator |
| Supervisor       | ~5x   | Known task types, deterministic routing        | SE-M01    | Built into Router   |
| Fan-out/Fan-in   | ~8x   | Parallel review, map-reduce                    | Aggregate | wave-executor       |
| Swarm            | ~8x   | Independent tasks, fault-tolerant              | SE-M02,05 | swarm-coordination  |
| Consensus Voting | ~12x  | High-stakes multi-reviewer decisions           | SE-M02    | consensus-voting    |
| Hierarchical     | ~15x  | EPIC complexity, multi-phase sub-orchestration | SE-M03,04 | Custom              |

## Failure Modes

- **SE-M01**: Coordinator overload → use wave-executor for fan-out
- **SE-M02**: Deadlock (Swarm/Consensus) → timeout + majority-vote tie-breaker
- **SE-M03**: Cascade failure (Hierarchical) → circuit breakers + retry
- **SE-M04**: Token runaway (Hierarchical) → enforce max_depth=3
- **SE-M05**: Orphaned tasks (Swarm) → TaskUpdate(in_progress) on pickup

## Escalation Path

TRIVIAL→Single | LOW→Supervisor | MEDIUM→Conductor+Fan-out | HIGH→Hierarchical | EPIC→Hierarchical+Consensus

## External Framework Patterns

### AutoGen Studio (Microsoft)

Conversation-centric GroupChat: `AssistantAgent`+`UserProxyAgent` take turns; manager routes messages. **Use case**: iterative code-gen + review loops, human-in-the-loop. **Equivalent**: Conductor + consensus-voting.

### CrewAI (Role-Based)

Role/goal/backstory agents in sequential or hierarchical `Crew`. `Task.expected_output` defines handoff contracts. **Use case**: researcher→analyst→writer pipelines. **Equivalent**: Supervisor → specialist agents.

### Agency Swarm (OpenAI Swarms-Inspired)

`agency_chart` declares explicit communication topology; agents expose custom `BaseTool` subclasses. **Use case**: strict inter-agent communication boundaries. **Equivalent**: swarm-coordination + routing-guard.

### BabyAGI (Task Management Pattern)

Three-agent queue loop: execution→task_creation→prioritization. Vector memory for context. **Use case**: open-ended goal pursuit where task set can't be fully specified upfront. **Equivalent**: wave-executor + TaskCreate loop + planner.

</instructions>

## Iron Laws

1. Default to Conductor — only escalate to Hierarchical when sub-orchestration is explicit.
2. Never exceed depth=3 in Hierarchical (SE-M04 token runaway).
3. Always call TaskUpdate(in_progress) in Swarm (prevents SE-M05).
4. Never use Consensus Voting for low-stakes decisions (12x token cost).
5. Always check failure modes before finalizing topology.

## Anti-Patterns

| Anti-Pattern                        | Fix                                                  |
| ----------------------------------- | ---------------------------------------------------- |
| Hierarchical for every complex task | Use Conductor first; escalate only when needed       |
| Swarm for ordered/dependent tasks   | Use Conductor or Fan-out when ordering matters       |
| Skip TaskUpdate(in_progress)        | Every swarm agent calls it as first action           |
| Speculative Consensus Voting        | Reserve for irreversible, high-stakes decisions only |
| Mixed topology concerns in one flow | One primary topology per orchestration scope         |

## Memory Protocol (MANDATORY)

Before: read `.claude/context/memory/learnings.md` for prior decisions.
After: topology decision→decisions.md | failure→issues.md | new pattern→learnings.md

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

## Related Skills

`wave-executor` | `swarm-coordination` | `consensus-voting` | `architecture-review` | `complexity-assessment`
