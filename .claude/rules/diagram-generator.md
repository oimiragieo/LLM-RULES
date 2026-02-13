---
paths:
  - .claude/skills/diagram-generator/**
---

# Diagram Generator Rules

## Core Principles

- Mermaid syntax only: Portable, version-controllable, renders everywhere
- Node count limits: ~100-200 nodes maximum for human readability
- Hierarchical abstraction: High-level overview → detailed subsystems
- Output location: `.claude/context/artifacts/diagrams/` for all generated diagrams
- Chunk large systems: >1000 files requires multiple focused diagrams

## Mermaid Syntax Standards

### Graph Direction

```mermaid
graph TB  # Top-to-bottom (default for architecture)
graph LR  # Left-to-right (for sequences, pipelines)
graph RL  # Right-to-left (rare)
graph BT  # Bottom-to-top (rare)
```

**When to use**:

- TB: System architecture, component hierarchies
- LR: Data flows, pipelines, sequences
- RL/BT: Special cases only

### Node Shapes

```mermaid
A[Rectangle]           # Components, services
B(Rounded)             # Processes, operations
C([Stadium])           # Entry/exit points
D[[Subroutine]]        # Sub-processes
E[(Database)]          # Data stores
F((Circle))            # Events, states
G>Asymmetric]          # Special markers
H{Diamond}             # Decisions
I{{Hexagon}}           # Preparation
J[/Parallelogram/]     # Input/output
```

### Connection Types

```mermaid
A --> B   # Solid arrow (primary flow)
A -.-> B  # Dotted arrow (optional/async)
A ==> B   # Thick arrow (emphasized)
A -- Text --> B  # Labeled connection
A -->|Label| B   # Alternative label syntax
```

## Diagram Type Selection Matrix

| Need to Show      | Diagram Type | Syntax            | Max Nodes  | Best For               |
| ----------------- | ------------ | ----------------- | ---------- | ---------------------- |
| System components | Graph        | `graph TB`        | 150        | Architecture overview  |
| API interactions  | Sequence     | `sequenceDiagram` | 20 calls   | Request/response flows |
| Database schema   | ER           | `erDiagram`       | 30 tables  | Entity relationships   |
| Object model      | Class        | `classDiagram`    | 40 classes | OOP structure          |
| State machine     | State        | `stateDiagram-v2` | 25 states  | Lifecycle management   |
| Decision flow     | Flowchart    | `flowchart TB`    | 50 nodes   | Business logic         |
| Project timeline  | Gantt        | `gantt`           | 30 tasks   | Scheduling             |

## Node Count Limits

**Human readability constraints**:

- **Optimal**: 20-50 nodes (glanceable understanding)
- **Acceptable**: 50-100 nodes (requires study)
- **Maximum**: 150-200 nodes (approaching incomprehensible)
- **Beyond 200**: Split into multiple diagrams by subsystem

**File analysis limits**:

- **1000 files/diagram**: Hard limit (see SKILL.md memory safeguards)
- **Recommended**: 500-800 files for comfortable generation
- **Large codebases**: Create multiple focused diagrams

### Chunking Strategy for Large Systems

```
Option 1: Split by subsystem
- auth-module.mmd (authentication components)
- api-module.mmd (API layer)
- data-module.mmd (data models)

Option 2: Split by layer
- presentation-layer.mmd (UI components)
- business-logic-layer.mmd (services)
- data-layer.mmd (database, ORM)

Option 3: Overview + Details
- system-overview.mmd (10-20 high-level components)
- auth-details.mmd (100+ nodes within auth subsystem)
- api-details.mmd (100+ nodes within API subsystem)
```

## Output Location Rules

**Standard location**: `.claude/context/artifacts/diagrams/`

**Naming convention**: `{subject}-{type}-{YYYY-MM-DD}.mmd`

Examples:

- `authentication-architecture-2026-02-09.mmd`
- `user-database-schema-2026-02-09.mmd`
- `api-request-sequence-2026-02-09.mmd`

**File organization**:

```
.claude/context/artifacts/diagrams/
  architecture/
    system-overview-2026-02-09.mmd
    auth-module-2026-02-09.mmd
  database/
    schema-v1-2026-02-09.mmd
  sequences/
    login-flow-2026-02-09.mmd
```

## Anti-Patterns

| Anti-Pattern                      | Problem                              | Fix                                     |
| --------------------------------- | ------------------------------------ | --------------------------------------- |
| >200 nodes in single diagram      | Unreadable, cognitive overload       | Split into multiple focused diagrams    |
| No diagram type specified         | Defaults to flowchart (may be wrong) | Explicitly choose type based on content |
| Inconsistent node shapes          | Confusing semantics                  | Use shape conventions consistently      |
| No labels on connections          | Unclear relationships                | Label all non-obvious connections       |
| Analyzing 5000+ files at once     | Memory exhaustion, context explosion | Chunk into <1000 file batches           |
| Free-form text instead of Mermaid | Not renderable, not portable         | Use Mermaid syntax exclusively          |
| No legend for symbols             | Ambiguous meaning                    | Add legend for custom shapes/colors     |

## Integration Points

### Architect

- Generates system architecture diagrams
- Documents component relationships
- Creates deployment topology diagrams

### Database Architect

- Generates ER diagrams from schema
- Documents entity relationships
- Shows data flow diagrams

### Technical Writer

- Embeds diagrams in documentation
- Maintains diagram consistency
- Updates diagrams when architecture changes

## Related References

- `.claude/skills/diagram-generator/SKILL.md` - Complete implementation guide
- `.claude/schemas/skill-diagram-generator-output.schema.json` - Output schema
