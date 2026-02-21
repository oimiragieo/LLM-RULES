# Multi-Agent Architecture Reference — Implementation Template

Use this template when documenting a topology decision.

## Topology Selection Record

**Task**: {task description}
**Date**: {YYYY-MM-DD}
**Complexity**: {TRIVIAL | LOW | MEDIUM | HIGH | EPIC}

## Decision Matrix Evaluation

| Question                                  | Answer   | Implication                     |
| ----------------------------------------- | -------- | ------------------------------- |
| Tasks independent?                        | {YES/NO} | {Swarm/Fan-out if YES}          |
| Task types known at design time?          | {YES/NO} | {Supervisor if YES}             |
| Multi-stage sub-orchestration needed?     | {YES/NO} | {Hierarchical/Conductor if YES} |
| High-stakes decision requiring agreement? | {YES/NO} | {Consensus Voting if YES}       |

## Selected Topology

**Topology**: {conductor | supervisor | fan-out | swarm | consensus | hierarchical}
**Token Cost Estimate**: {~Nx baseline}
**Rationale**: {Why this topology was chosen}

## Failure Mode Mitigations

| Code     | Failure Mode | Mitigation Applied    |
| -------- | ------------ | --------------------- |
| {SE-M0N} | {Name}       | {How it is addressed} |

## Existing Skill/Pattern

**Skill to use**: `{wave-executor | swarm-coordination | consensus-voting | master-orchestrator}`
**Reference**: `.claude/skills/{skill-name}/SKILL.md`

## Escalation Path

If this topology proves insufficient → upgrade to: {next topology}
Trigger: {condition that would require escalation}

## Implementation Notes

{Any additional notes, constraints, or context for implementing this topology}
