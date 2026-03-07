<!-- Agent: developer | Task: #44 | Session: 2026-02-06 -->

# Workflow-Agent Mapping Reference

> **BACK TO MAIN:** CLAUDE.md Section 8.6
> **Last Updated:** 2026-02-06
> **Source of Truth:** Agent frontmatter `workflows:` array + agent file `## Related Workflows` sections

This document provides a comprehensive mapping between workflows and agent archetypes, showing which workflows guide which agents at execution time.

---

## Section 1: Workflow-Agent Matrix

This table shows which workflows are referenced by which agent archetypes. Workflows provide execution guidance, decision matrices, and coordination patterns.

| Workflow                           | Router | Implementer | Reviewer | Documenter | Orchestrator | Researcher | Domain |
| ---------------------------------- | ------ | ----------- | -------- | ---------- | ------------ | ---------- | ------ |
| **Core Workflows (8)**             |
| router-decision                    | x      |             |          |            |              |            |        |
| enterprise-workflow                | x      | x           | x        | x          | x            | x          | x      |
| evolution-workflow                 | x      |             |          |            | x            |            |        |
| reflection-workflow                | x      | x           | x        | x          | x            | x          | x      |
| feature-development-workflow       | x      | x           | x        | x          |              |            | x      |
| skill-lifecycle                    |        |             |          |            | x            |            |        |
| post-creation-validation           |        |             |          |            | x            |            |        |
| external-integration               |        | x           |          |            |              |            | x      |
| **Enterprise Workflows (3)**       |
| c4-architecture-workflow           |        | x           |          | x          |              |            |        |
| qa-bounded-loop                    |        |             | x        |            |              |            |        |
| **Operations Workflows (3)**       |
| incident-response                  |        | x           |          |            |              |            |        |
| hook-consolidation                 |        | x           |          |            |              |            |        |
| context-compressor-skill-workflow  | x      | x           | x        | x          | x            | x          | x      |
| **Domain Workflows (1)**           |
| domain-development-workflow        |        |             |          |            |              |            | x      |
| **Skill-Specific Workflows (11)**  |
| architecture-review-skill-workflow |        | x           |          |            |              |            |        |
| security-architect-skill-workflow  |        | x           |          |            |              |            |        |
| database-architect-skill-workflow  |        | x           |          |            |              |            |        |
| consensus-voting-skill-workflow    |        |             |          |            | x            |            |        |
| chrome-browser-skill-workflow      |        | x           | x        |            |              |            |        |
| conductor-setup-workflow           |        | x           |          |            |              |            |        |
| template-renderer-skill-workflow   |        | x           |          | x          |              |            |        |
| code-review-workflow               |        |             | x        |            |              |            |        |
| product-management-workflow        | x      |             |          |            |              |            |        |
| documentation-workflow             |        |             |          | x          |              |            |        |

**Agent Archetype Definitions:**

- **Router**: CLAUDE.md (1 definition) - Master routing and orchestration
- **Implementer**: developer, planner, qa, security-architect, architect, database-architect, devops, devops-troubleshooter, incident-responder, code-simplifier, conductor-validator (11 agents) - Build and implement
- **Reviewer**: code-reviewer (1 agent) - Review code quality and correctness
- **Documenter**: technical-writer, c4-code, c4-component, c4-container, c4-context (5 agents) - Create documentation
- **Orchestrator**: master-orchestrator, evolution-orchestrator, party-orchestrator, swarm-coordinator (4 agents) - Coordinate multi-agent work
- **Researcher**: researcher, reverse-engineer (2 agents) - Research and analysis
- **Domain**: All 22 domain specialist agents (python-pro, rust-pro, typescript-pro, frontend-pro, nextjs-pro, nodejs-pro, golang-pro, java-pro, php-pro, fastapi-pro, sveltekit-expert, graphql-pro, ai-ml-specialist, data-engineer, scientific-research-expert, web3-blockchain-expert, ios-pro, android-pro, expo-mobile-developer, tauri-desktop-developer, mobile-ux-reviewer, gamedev-pro) - Language/framework-specific implementation

---

## Section 2: Agent Archetype Workflow Sets

Different agent archetypes reference different workflow sets based on their role:

### Router/Orchestrator Workflow Set (7 workflows)

**Agents**: router, master-orchestrator, evolution-orchestrator, swarm-coordinator, party-orchestrator

**Workflows**:

1. router-decision (Router only)
2. enterprise-workflow
3. evolution-workflow (Router, evolution-orchestrator)
4. feature-development-workflow
5. consensus-voting-skill-workflow (Orchestrators only)
6. context-compressor-skill-workflow

**Purpose**: Routing, coordination, multi-agent spawning, and lifecycle management.

### Implementer Workflow Set (11 workflows)

**Agents**: developer, planner, qa, security-architect, architect, database-architect, devops, devops-troubleshooter, incident-responder, code-simplifier, conductor-validator

**Workflows**:

1. enterprise-workflow
2. feature-development-workflow
3. reflection-workflow
4. external-integration
5. incident-response (devops, incident-responder)
6. hook-consolidation (developer, devops)
7. architecture-review-skill-workflow (architect)
8. security-architect-skill-workflow (security-architect)
9. database-architect-skill-workflow (database-architect)
10. conductor-setup-workflow (developer)
11. context-compressor-skill-workflow

**Purpose**: Implementation, testing, security, architecture, and operations.

### Reviewer Workflow Set (5 workflows)

**Agents**: code-reviewer

**Workflows**:

1. enterprise-workflow
2. feature-development-workflow
3. reflection-workflow
4. code-review-workflow
5. context-compressor-skill-workflow

**Purpose**: Code review, quality validation, and compliance checking.

### Documenter Workflow Set (6 workflows)

**Agents**: technical-writer, c4-code, c4-component, c4-container, c4-context

**Workflows**:

1. enterprise-workflow
2. feature-development-workflow
3. reflection-workflow
4. c4-architecture-workflow (c4-\* agents only)
5. documentation-workflow (technical-writer)
6. context-compressor-skill-workflow

**Purpose**: Documentation creation, C4 architecture diagrams, and technical writing.

### Researcher Workflow Set (4 workflows)

**Agents**: researcher, reverse-engineer

**Workflows**:

1. enterprise-workflow
2. reflection-workflow
3. context-compressor-skill-workflow

**Purpose**: Research, investigation, and knowledge gathering.

### Domain Specialist Workflow Set (5 workflows)

**Agents**: All 22 domain specialists (python-pro, rust-pro, typescript-pro, etc.)

**Workflows**:

1. enterprise-workflow
2. feature-development-workflow
3. reflection-workflow
4. domain-development-workflow (UNIVERSAL for all domain agents)
5. external-integration (optional: data-engineer, scientific-research-expert, web3-blockchain-expert)

**Purpose**: Language/framework-specific implementation with TDD (Red-Green-Refactor Cycle).

---

## Section 3: Workflow Categories

Workflows are organized into 5 categories based on their scope and purpose:

### Core Workflows (8)

- `router-decision.md` - Master routing logic for multi-agent system
- `enterprise-workflow.md` - Phased execution (Triage → Design → Implement → Review → Deploy → Document → Reflect)
- `evolution-workflow.md` - EVOLVE process (E→V→O→L→V→E) for creating artifacts
- `reflection-workflow.md` - Quality reflection and learning capture
- `enterprise/feature-development-workflow.md` - End-to-end feature implementation
- `skill-lifecycle.md` - Artifact creation, updates, deprecation
- `post-creation-validation.md` - Artifact integration validation
- `external-integration.md` - Safe integration of external codebases

**Used By**: All agents (enterprise-workflow, reflection-workflow) + specialized agent types

### Enterprise Workflows (3)

- `c4-architecture-workflow.md` - C4 model documentation (System Context, Containers, Components, Code)
- `qa-bounded-loop.md` - QA validation with bounded fix loops

**Used By**: Documenters (C4), Orchestrators (swarm), All agents (workspace-conventions), Reviewers (QA)

### Operations Workflows (3)

- `incident-response.md` - Production incident handling
- `hook-consolidation.md` - Hook management and consolidation
- `context-compressor-skill-workflow.md` - Requirements gathering

**Used By**: Devops/incident teams (incident-response), Developers (hook consolidation), Router/Researchers (progressive disclosure)

### Domain Workflows (1)

- `domain-development-workflow.md` - TDD workflow for all 22 domain specialists

**Used By**: All 22 domain specialist agents (UNIVERSAL for domain archetype)

### Skill-Specific Workflows (12)

- `architecture-review-skill-workflow.md` - Architecture review process
- `security-architect-skill-workflow.md` - Security audit and review
- `database-architect-skill-workflow.md` - Database design and schema workflows
- `context-compressor-skill-workflow.md` - Context compression and summarization
- `consensus-voting-skill-workflow.md` - Multi-agent consensus patterns
- `chrome-browser-skill-workflow.md` - Browser automation workflow
- `conductor-setup-workflow.md` - Context-Driven Development (CDD) setup
- `template-renderer-skill-workflow.md` - Template rendering workflow
- `code-review-workflow.md` - Two-pass code review process
- `product-management-workflow.md` - INVEST sprint management
- `documentation-workflow.md` - Diataxis documentation framework

**Used By**: Specific agent types (architect, security-architect, database-architect, technical-writer, etc.)

---

## Section 4: New Workflows Created in Task #44

These 4 workflows were created in Task #44 Phase 1 to fill gaps in workflow-agent alignment:

### 1. domain-development-workflow.md

- **Purpose**: Common TDD workflow for all 22 domain agents
- **Key Features**:
  - Red-Green-Refactor Cycle (RGRC) with universal steps
  - Language Conventions Table: Test commands, package managers, linters for 18 languages/frameworks
  - Output Standards referencing workspace-conventions.md
  - Integration with feature-development-workflow (PHASE_2_IMPLEMENT)
  - Handoff to PHASE_3_REVIEW with TaskUpdate metadata
- **Used By**: All 22 domain specialist agents (python-pro, rust-pro, typescript-pro, etc.)

### 2. code-review-workflow.md

- **Purpose**: Two-pass review process for code-reviewer agent
- **Key Features**:
  - Pass 1 (blocking): Spec compliance, logic correctness, edge cases, security (OWASP Top 10)
  - Pass 2 (non-blocking): Code quality, style, DRY, naming, documentation
  - Output format with severity levels (CRITICAL/HIGH/MEDIUM/LOW)
  - Integration with architecture-review workflow for escalation
  - Finding templates and summary templates
- **Used By**: code-reviewer agent

### 3. product-management-workflow.md

- **Purpose**: INVEST criteria for user stories and sprint management
- **Key Features**:
  - INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
  - Sprint planning: Capacity planning, story selection, sprint commitment
  - Backlog refinement: Planning poker, T-shirt sizing
  - Prioritization: RICE scoring, MoSCoW method, value vs effort matrix
  - Stakeholder communication templates (sprint review, roadmap update, weekly status)
  - Metrics tracking: Velocity, burndown, cycle time, cumulative flow diagram (CFD)
- **Used By**: pm (product manager) agent, Router (for sprint planning requests)

### 4. documentation-workflow.md

- **Purpose**: Diataxis framework for technical writing
- **Key Features**:
  - Diataxis framework: 4 documentation types (Tutorial, How-to, Reference, Explanation)
  - Type detection guide with decision tree
  - Templates for each type with structure and examples
  - Tutorial: Learning-oriented, hands-on, beginner-friendly
  - How-to: Goal-oriented, practical, assumes knowledge
  - Reference: Information-oriented, comprehensive, structured
  - Explanation: Understanding-oriented, conceptual, design decisions
  - Integration with post-creation-validation workflow
- **Used By**: technical-writer agent

**Impact**: These 4 workflows eliminate "no workflow guidance" gaps for domain specialists, code reviewers, product managers, and technical writers.

---

## Section 5: Workflow Execution Order

Workflows can be invoked sequentially as part of multi-phase execution:

### Enterprise Workflow Phases (for MEDIUM+ complexity)

1. **PHASE_0_TRIAGE**: Router uses `router-decision.md` → Classifies complexity, spawns agents
2. **PHASE_1_DESIGN**: Planner uses `feature-development-workflow.md` → Creates plan
3. **PHASE_2_IMPLEMENT**: Domain agent uses `domain-development-workflow.md` → TDD implementation
4. **PHASE_3_REVIEW**: Code-reviewer uses `code-review-workflow.md` → Two-pass review
5. **PHASE_4_DEPLOY**: Devops uses `incident-response.md` (if prod) or `feature-development-workflow.md`
6. **PHASE_5_DOCUMENT**: Technical-writer uses `documentation-workflow.md` → Diataxis docs
7. **PHASE_6_REFLECT**: Reflection-agent uses `reflection-workflow.md` → Extract learnings

**Workflow Handoff**: Each phase writes artifacts to workspace-convention-compliant paths (plans, reports, artifacts), next phase reads from these paths.

### Artifact Creation Workflow

1. **Research**: Researcher uses `context-compressor-skill-workflow.md` → Gathers requirements
2. **Synthesis**: Uses `research-synthesis` skill → Consolidates findings into research report
3. **Creation**: Creator (agent-creator, skill-creator, workflow-creator, etc.) invokes relevant skill → Creates artifact
4. **Validation**: Evolution-orchestrator uses `post-creation-validation.md` → Validates integration
5. **Deployment**: Updates CLAUDE.md, catalogs, registries

---

## Section 6: Cross-References

**Related Documentation:**

- **@ENTERPRISE_WORKFLOWS.md** - Complete workflow catalog (Section 8.6)
- **@AGENT_ROUTING_TABLE.md** - Agent routing matrix
- **@HOOK_AGENT_MAP.md** - Hook-agent mapping matrix
- **CLAUDE.md Section 8.6** - Enterprise workflows overview

**Related Files:**

- `.claude/workflows/README.md` - Workflow directory organization
- `.claude/workflows/core/router-decision.md` - Master routing logic
- `.claude/workflows/core/enterprise-workflow.md` - Multi-phase execution workflow
- `.claude/agents/**/*.md` - Agent files with `## Related Workflows` sections

---

**Provenance:** Created by developer agent for Task #44 (Workflow-Agent Alignment - Cross-Reference Documentation)
