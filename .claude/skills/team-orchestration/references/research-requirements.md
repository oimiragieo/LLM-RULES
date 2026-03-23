# Team Orchestration — Research Requirements

## Research Date: 2026-03-22

## Search: VoltAgent/awesome-agent-skills

Searched `https://github.com/VoltAgent/awesome-agent-skills` for skills matching keywords:
`team-orchestration`, `multi-agent pipeline`, `phase gate`, `approval gate`.

**Result:** No matching skill found for structured 6-phase multi-agent pipelines with entry/exit criteria and human approval gates at this specificity. Closest matches were general orchestration utilities, not structured pipeline skills.

## Exa Research

Searched for: `multi-agent orchestration pipeline phases approval gates 2025`

### Finding 1: Phase-Gate Model (Software Project Management)

Traditional software development uses phase-gate models (also called stage-gate processes) where each phase must meet defined exit criteria before progressing. This pattern is well-established in enterprise project management and translates naturally to AI agent pipelines.

Source: Stage-Gate International methodology documentation.

**Design constraint 1:** Exit criteria must be declarative (checkboxes), not narrative. This prevents agents from claiming completion without measurable verification.

### Finding 2: Multi-Agent Orchestration Patterns (2025)

Research from AI agent framework literature shows that multi-agent pipelines benefit from:
- Single point of truth for pipeline state (snapshot pattern)
- Explicit handoff protocols between agents
- Isolated phase execution (one agent per phase)
- Audit trail for all phase transitions

Source: LangGraph, CrewAI, and AutoGen documentation on orchestration patterns.

**Design constraint 2:** Each phase should have a dedicated agent type. Shared agents across phases create coupling and make phase isolation impossible to enforce.

### Finding 3: Human-in-the-Loop Approval Patterns

From the HITL (Human-in-the-Loop) literature, approval gates are most effective when:
- They occur at well-defined checkpoints (not ad hoc)
- Skip conditions require written justification
- Gate type (human/automated/consensus) is declared in the pipeline spec

**Design constraint 3:** `skipApprovalGate` must require `approvalJustification`. This prevents silent bypasses and creates an audit trail for post-mortem analysis.

## Non-Goals

- **Real-time agent coordination**: This skill does not provide live agent-to-agent messaging. It uses async snapshot files for state handoff.
- **Parallel phase execution**: This skill implements a strictly sequential pipeline. Parallel tasks within a phase are the responsibility of the phase agent.
- **External CI/CD integration**: The `deploy` phase is a placeholder for any deployment strategy; this skill does not wire to specific CI systems.
- **Dynamic phase addition**: The 6-phase structure is fixed. Custom phase additions require a separate skill extension.

## Actionable Design Constraints Applied

| Constraint | Applied In |
|---|---|
| Exit criteria as declarative checkboxes | SKILL.md phase definitions, output.schema.json |
| Dedicated agent per phase | scripts/main.cjs agentAssignments, SKILL.md |
| skipApprovalGate requires justification | input.schema.json conditional, pre-execute.cjs |
