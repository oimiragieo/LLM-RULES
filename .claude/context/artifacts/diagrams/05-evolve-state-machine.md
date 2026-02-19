# EVOLVE State Machine Diagram

> Generated: 2026-01-27
> Purpose: Visualizes the EVOLVE workflow state machine for self-evolution

## Overview

The EVOLVE workflow is the mandatory process for creating new ecosystem artifacts (agents, skills, workflows, hooks, schemas, templates). This diagram shows the state machine that enforces proper phase transitions.

## EVOLVE State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE: System Start

    IDLE --> EVALUATING: evolution_triggered
    note right of EVALUATING
        Phase E: EVALUATE
        - Confirm evolution needed
        - Check existing artifacts
        - Identify capability gap
    end note

    EVALUATING --> VALIDATING: gap_confirmed
    EVALUATING --> ABORTED: existing_solution_found

    note right of VALIDATING
        Phase V: VALIDATE
        - Check naming conflicts
        - Verify conventions
        - Ensure no overlap
    end note

    VALIDATING --> OBTAINING: no_conflicts
    VALIDATING --> ABORTED: naming_conflict

    note right of OBTAINING
        Phase O: OBTAIN (MANDATORY)
        - Execute 3+ research queries
        - Consult 3+ external sources
        - Create research report
        CANNOT BE SKIPPED!
    end note

    OBTAINING --> LOCKING: research_complete
    OBTAINING --> OBTAINING: more_research_needed

    note right of LOCKING
        Phase L: LOCK
        - Invoke creator skill
        - Create artifact file
        - Validate against schema
    end note

    LOCKING --> VERIFYING: schema_valid
    LOCKING --> LOCKING: validation_failed_retry

    note right of VERIFYING
        Phase V: VERIFY
        - Check for placeholders
        - Validate all sections
        - Verify assigned skills exist
    end note

    VERIFYING --> ENABLING: quality_gate_passed
    VERIFYING --> LOCKING: quality_issues_fix

    note right of ENABLING
        Phase E: ENABLE
        - Update CLAUDE.md routing
        - Update skill catalog
        - Record in memory files
    end note

    ENABLING --> IDLE: deployment_complete

    ABORTED --> [*]: Evolution Cancelled

    BLOCKED --> EVALUATING: blocker_resolved
    BLOCKED --> ABORTED: resolution_failed

    note right of BLOCKED
        Any phase can transition
        to BLOCKED on failure
    end note
```

## Phase Transition Rules

```mermaid
flowchart TB
    subgraph Phases["EVOLVE Phases"]
        direction LR
        E1[E<br/>EVALUATE]
        V1[V<br/>VALIDATE]
        O[O<br/>OBTAIN]
        L[L<br/>LOCK]
        V2[V<br/>VERIFY]
        E2[E<br/>ENABLE]
    end

    E1 -->|"gap_confirmed"| V1
    V1 -->|"no_conflicts"| O
    O -->|"research_complete<br/>(3+ queries)"| L
    L -->|"schema_valid"| V2
    V2 -->|"quality_passed"| E2

    subgraph Gates["Gate Requirements"]
        direction TB
        G1["Gate 1: EVALUATE<br/>- Gap identified<br/>- No existing solution<br/>- Within scope"]
        G2["Gate 2: VALIDATE<br/>- No naming conflicts<br/>- No capability overlap<br/>- Convention compliant"]
        G3["Gate 3: OBTAIN<br/>- 3+ queries executed<br/>- 3+ sources consulted<br/>- Research report saved"]
        G4["Gate 4: LOCK<br/>- Artifact created<br/>- Schema validation passed<br/>- Required fields present"]
        G5["Gate 5: VERIFY<br/>- No placeholders<br/>- All sections complete<br/>- Skills exist"]
        G6["Gate 6: ENABLE<br/>- CLAUDE.md updated<br/>- Catalog updated<br/>- Memory recorded"]
    end

    E1 --- G1
    V1 --- G2
    O --- G3
    L --- G4
    V2 --- G5
    E2 --- G6

    %% Styling
    classDef phase fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef gate fill:#fff3e0,stroke:#e65100,stroke-width:1px
    classDef mandatory fill:#ffebee,stroke:#c62828,stroke-width:3px

    class E1,V1,L,V2,E2 phase
    class O mandatory
    class G1,G2,G3,G4,G5,G6 gate
```

## Enforcement Hooks

```mermaid
flowchart LR
    subgraph Triggers["Evolution Triggers"]
        T1[User: create new agent]
        T2[Router: no matching agent]
        T3[Analyzer: capability gap]
    end

    subgraph Hooks["Enforcement Hooks"]
        direction TB
        H1[user-prompt-unified.core.cjs<br/>Detects evolution keywords]
        H2[conflict-detector.cjs<br/>Checks naming conflicts]
        H3[research-enforcement.cjs<br/>BLOCKS without research]
        H4[evolution-state-guard.cjs<br/>Enforces state machine]
        H5[quality-gate-validator.cjs<br/>Validates completeness]
        H6[unified-reflection-handler.cjs<br/>Ingests stale artifacts into evolution queue]
    end

    subgraph States["State File"]
        SF[evolution-state.json]
    end

    T1 --> H1
    T2 --> H1
    T3 --> H1
    H1 --> SF

    H2 --> SF
    H3 --> SF
    H4 --> SF
    H5 --> SF
    H6 --> SF

    %% Styling
    classDef trigger fill:#e3f2fd,stroke:#1565c0
    classDef hook fill:#f3e5f5,stroke:#7b1fa2
    classDef state fill:#fff8e1,stroke:#ff6f00

    class T1,T2,T3 trigger
    class H1,H2,H3,H4,H5,H6 hook
    class SF state
```

## Evolution State Schema

```json
{
  "state": "idle|evaluating|validating|obtaining|locking|verifying|enabling|blocked",
  "lastUpdated": "2026-01-27T10:00:00.000Z",
  "currentEvolution": {
    "type": "agent|skill|workflow|hook|schema|template",
    "name": "artifact-name",
    "phase": "evaluate|validate|obtain|lock|verify|enable",
    "startedAt": "ISO-timestamp",
    "gatePassed": false,
    "gateResults": {
      "gate1": { "passed": true, "checks": {} },
      "gate2": { "passed": true, "checks": {} },
      "gate3": { "passed": false, "checks": { "queriesExecuted": 2 } }
    },
    "researchReport": "path/to/report.md",
    "artifactPath": "path/to/artifact"
  },
  "evolutions": [
    {
      "type": "agent",
      "name": "graphql-pro",
      "path": ".claude/agents/domain/graphql-pro.md",
      "completedAt": "2026-01-26T15:30:00.000Z",
      "researchReport": ".claude/context/artifacts/research-reports/graphql-pro-research.md"
    }
  ]
}
```

## Iron Laws of Evolution

| #   | Law                                    | Enforcement                       |
| --- | -------------------------------------- | --------------------------------- |
| 1   | **NO ARTIFACT WITHOUT RESEARCH**       | `research-enforcement.cjs` blocks |
| 2   | **NO DEPLOYMENT WITHOUT VALIDATION**   | All 6 gates required              |
| 3   | **NO STATE TRANSITION WITHOUT UPDATE** | `evolution-state-guard.cjs`       |
| 4   | **NO DEVIATION FROM EVOLVE**           | Workflow is locked-in             |
| 5   | **NO BYPASSING SCHEMA VALIDATION**     | JSON schema required              |
| 6   | **NO ARTIFACT WITHOUT ROUTING**        | Must be discoverable              |

## Artifact Output Locations

| Artifact Type | Location Pattern                         |
| ------------- | ---------------------------------------- |
| Agent         | `.claude/agents/<category>/<name>.md`    |
| Skill         | `.claude/skills/<name>/SKILL.md`         |
| Workflow      | `.claude/workflows/<category>/<name>.md` |
| Hook          | `.claude/hooks/<category>/<name>.cjs`    |
| Schema        | `.claude/schemas/<name>.json`            |
| Template      | `.claude/templates/<name>.md`            |

## Recovery Protocol

If evolution is interrupted:

1. Read `evolution-state.json` to determine current phase
2. Check if `gatePassed: true` for current phase
3. If passed: Advance to next phase
4. If not passed: Re-execute current phase
5. Use `researchReport` path to verify research exists

```mermaid
flowchart TB
    START[Session Start] --> CHECK{Read<br/>evolution-state.json}
    CHECK -->|state = idle| DONE[Normal Operation]
    CHECK -->|state != idle| RESUME{Current Phase<br/>Gate Passed?}
    RESUME -->|Yes| NEXT[Advance to<br/>Next Phase]
    RESUME -->|No| RETRY[Re-execute<br/>Current Phase]
    NEXT --> CONTINUE[Continue Evolution]
    RETRY --> CONTINUE

    %% Styling
    classDef start fill:#e8f5e9,stroke:#1b5e20
    classDef decision fill:#fff3e0,stroke:#e65100
    classDef action fill:#e3f2fd,stroke:#1565c0

    class START,DONE start
    class CHECK,RESUME decision
    class NEXT,RETRY,CONTINUE action
```
