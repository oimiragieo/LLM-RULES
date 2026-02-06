# Skill Invocation Flow Diagram

> Generated: 2026-01-27
> Purpose: Visualizes how agents discover and invoke skills

## Overview

This diagram shows the sequence of how an Agent discovers a skill from the catalog, invokes it using the Skill() tool, and applies the skill's instructions to their task.

## Skill Invocation Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant SkillTool as Skill() Tool
    participant Catalog as Skill Catalog
    participant SKILL as SKILL.md
    participant Context as Agent Context

    rect rgb(240, 248, 255)
        Note over Agent,Context: Phase 1: Skill Discovery
        Agent->>Catalog: Read skill-catalog.md
        Catalog-->>Agent: List of skills by category
        Agent->>Agent: Identify needed skill
    end

    rect rgb(255, 248, 240)
        Note over Agent,Context: Phase 2: Skill Invocation
        Agent->>SkillTool: Skill({ skill: "tdd" })
        SkillTool->>SKILL: Load .claude/skills/tdd/SKILL.md
        SKILL-->>SkillTool: Skill instructions + capabilities
        SkillTool->>Context: Inject skill into agent context
        SkillTool-->>Agent: Skill loaded successfully
    end

    rect rgb(240, 255, 240)
        Note over Agent,Context: Phase 3: Skill Execution
        Agent->>Agent: Read skill instructions
        Agent->>Agent: Follow execution_process
        Agent->>Agent: Apply best_practices
        Agent->>Context: Update memory files
    end

    rect rgb(255, 240, 248)
        Note over Agent,Context: Phase 4: Memory Protocol
        Agent->>Context: Record learnings (if any)
        Agent->>Context: Record decisions (if any)
        Agent->>Context: Record issues (if any)
    end
```

## Skill Structure

```mermaid
flowchart TB
    subgraph SkillFile["SKILL.md Structure"]
        direction TB
        FM[YAML Frontmatter<br/>name, description, version, tools]
        ID["&lt;identity&gt;<br/>Skill description and purpose"]
        CAP["&lt;capabilities&gt;<br/>What the skill can do"]
        INST["&lt;instructions&gt;<br/>Execution process"]
        BP["&lt;best_practices&gt;<br/>Guidelines to follow"]
        EX["&lt;examples&gt;<br/>Usage examples"]
        MEM["Memory Protocol<br/>Before/After instructions"]
    end

    FM --> ID
    ID --> CAP
    CAP --> INST
    INST --> BP
    BP --> EX
    EX --> MEM

    subgraph Execution["Execution Process Steps"]
        direction TB
        S1[Step 1: Understand Context]
        S2[Step 2: Analyze Requirements]
        S3[Step 3: Execute Core Logic]
        S4[Step 4: Validate Results]
        S5[Step 5: Document Findings]
    end

    INST --> Execution

    %% Styling
    classDef header fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef content fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef exec fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px

    class FM header
    class ID,CAP,BP,EX,MEM content
    class INST,S1,S2,S3,S4,S5 exec
```

## Skill Categories

```mermaid
flowchart LR
    subgraph Catalog["Skill Catalog"]
        direction TB

        subgraph Core["Core Development"]
            TDD[tdd]
            DEBUG[debugging]
            CODE[code-analyzer]
        end

        subgraph Planning["Planning & Architecture"]
            PLAN[plan-generator]
            SPEC[spec-gathering]
            ARCH[architecture-review]
        end

        subgraph Security["Security"]
            SECARCH[security-architect]
            AUTH[auth-security-expert]
        end

        subgraph Creator["Creator Tools"]
            AGENT[agent-creator]
            SKILL[skill-creator]
            WORK[workflow-creator]
            HOOK[hook-creator]
        end

        subgraph Workflow["Workflow Enhancement"]
            ONBOARD[project-onboarding]
            THINK[thinking-tools]
            MODES[operational-modes]
            SUMM[summarize-changes]
            HAND[session-handoff]
        end

        subgraph Integration["Integration"]
            GIT[git-expert]
            GITHUB[github-mcp]
            SLACK[slack-notifications]
        end
    end

    %% Styling
    classDef core fill:#e8f5e9,stroke:#1b5e20
    classDef planning fill:#fff3e0,stroke:#e65100
    classDef security fill:#ffebee,stroke:#c62828
    classDef creator fill:#f3e5f5,stroke:#4a148c
    classDef workflow fill:#e3f2fd,stroke:#1565c0
    classDef integration fill:#fce4ec,stroke:#880e4f

    class TDD,DEBUG,CODE core
    class PLAN,SPEC,ARCH planning
    class SECARCH,AUTH security
    class AGENT,SKILL,WORK,HOOK creator
    class ONBOARD,THINK,MODES,SUMM,HAND workflow
    class GIT,GITHUB,SLACK integration
```

## Key Concepts

### Skill Discovery

1. **Catalog Location**: `.claude/context/artifacts/catalogs/skill-catalog.md`
2. **Lookup by Category**: Skills organized into categories
3. **Keyword Search**: Find skills by searching for keywords

### Skill Invocation (CORRECT vs WRONG)

```javascript
// CORRECT: Use Skill() tool to invoke
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });
Skill({ skill: 'security-architect' });

// WRONG: Just reading doesn't apply the skill
Read('.claude/skills/tdd/SKILL.md'); // This only reads, doesn't invoke!
```

### Skill Composition

Agents can invoke multiple skills:

```javascript
// Sequential skill invocation
Skill({ skill: 'project-onboarding' }); // First understand the codebase
Skill({ skill: 'tdd' }); // Then apply TDD workflow
Skill({ skill: 'debugging' }); // Use debugging if tests fail
```

### Creator Skills (Self-Evolution)

When no existing skill meets the need:

```javascript
// Research first (MANDATORY)
Skill({ skill: 'research-synthesis' });

// Then create new skill
Skill({ skill: 'skill-creator' });
```

## Skill File Locations

| Skill Type | Location Pattern                               |
| ---------- | ---------------------------------------------- |
| Standard   | `.claude/skills/<skill-name>/SKILL.md`         |
| Sub-skills | `.claude/skills/<parent>/sub-skills/<name>.md` |

## Integration Points

| Integration   | How Skills Connect                                    |
| ------------- | ----------------------------------------------------- |
| **Agents**    | Define `skills` array in agent frontmatter            |
| **Workflows** | Specify skills used in each phase                     |
| **Hooks**     | `validate-skill-invocation.cjs` validates invocations |
| **Memory**    | Skills follow Memory Protocol for persistence         |

## Memory Protocol (All Skills)

Every skill includes Memory Protocol:

```markdown
## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
```
