# Workflow Directory Organization

This directory contains workflow documentation for multi-agent orchestration, complex task execution, and system processes.

## Directory Structure

### `/core/`

Core workflows that define fundamental system behavior and patterns:

- **router-decision.md** - Master routing logic for the multi-agent system. Defines when to spawn agents, complexity classification, and decision matrices.
- **evolution-workflow.md** - Self-evolution process (EVOLVE: Evaluate → Validate → Obtain → Lock → Verify → Enable). Used when creating new agents, skills, hooks, workflows, templates, or schemas.
- **reflection-workflow.md** - Quality reflection and learnings extraction. Defines how to capture insights, decisions, and patterns after task completion.
- **skill-lifecycle.md** - Artifact lifecycle management. Covers creation, testing, deployment, and deprecation of skills.
- **external-integration.md** - Safe integration of external codebases and libraries into projects.

**When to Reference**: Use core workflows to understand system-level decision patterns and architectural constraints.

### `/enterprise/`

Enterprise-scale workflows for coordinated multi-agent work:

- **feature-development-workflow.md** - End-to-end feature implementation. Phases: Design → Plan → Review → Implementation → Testing → Documentation.
- **c4-architecture-workflow.md** - Architecture documentation using C4 model (System Context, Containers, Components, Code).
- **swarm-coordination-skill-workflow.md** - Swarm coordination patterns for concurrent agent teams working on related tasks.

**When to Reference**: Use enterprise workflows for large feature work, architecture design, and coordinated multi-agent initiatives.

### `/operations/`

Operational workflows for production support and maintenance:

- **incident-response.md** - Production incident handling. Defines severity levels, escalation paths, and resolution workflows.
- **hook-consolidation.md** - Hook consolidation patterns for reducing duplication and improving maintainability.

**When to Reference**: Use operational workflows for incident management and system maintenance tasks.

### Root Level Workflows

Skill-specific workflows tied to individual creator skills or domain agents:

- **security-architect-skill-workflow.md** - Security audit and review process (security-architect agent)
- **database-architect-skill-workflow.md** - Database design and schema workflows (database-architect agent)
- **consensus-voting-skill-workflow.md** - Multi-agent consensus patterns for making architectural decisions
- **architecture-review-skill-workflow.md** - Architecture review process
- **context-compressor-skill-workflow.md** - Context compression and summarization workflows
- **conductor-setup-workflow.md** - Context-Driven Development (CDD) setup and validation
- **domain-development-workflow.md** - TDD workflow (Red-Green-Refactor Cycle) for all 22 domain specialist agents
- **code-review-workflow.md** - Two-pass code review process (Pass 1: blocking, Pass 2: non-blocking)
- **product-management-workflow.md** - INVEST user stories and sprint management for pm agent
- **documentation-workflow.md** - Diataxis framework (Tutorial/How-to/Reference/Explanation) for technical-writer agent

**When to Reference**: Use skill-specific workflows when invoking or working with particular domain agents or creator skills.

## Workflow Organization Pattern

**Rule of Thumb**: Place a workflow in the most specific category that matches its scope:

1. **Core** - System-level patterns that apply across all work
2. **Enterprise** - Large-scale, multi-team coordination
3. **Operations** - Production support and maintenance
4. **Root level** - Single skill or single-domain workflows

**Naming Convention**:

- `/core/` workflows: Foundational, hyphenated (e.g., `router-decision.md`)
- `/enterprise/` workflows: Domain-specific, clear focus (e.g., `feature-development-workflow.md`)
- `/operations/` workflows: Operational, incident/maintenance focused
- Root level: Skill-name + suffix (e.g., `security-architect-skill-workflow.md`)

## Using Workflows

### From Router

When the router detects a complex request, it references workflows to determine:

```
Intent → Complexity Assessment → Router Decision Workflow → Agent Spawn
```

See `core/router-decision.md` for the complete routing matrix.

### From Agents

Agents reference workflows to understand:

- What process to follow (execution phases)
- When to spawn subagents (coordination)
- What decisions to make (decision matrices)

### From Users

Users can reference workflows to understand:

- How multi-agent work is coordinated
- What to expect during complex feature implementation
- How incidents are handled in production

## Key Workflows by Scenario

### Implementing a New Feature

→ `enterprise/feature-development-workflow.md`

### Creating a New Agent

→ `core/evolution-workflow.md` + `core/router-decision.md`

### Architecture Discussion

→ `enterprise/c4-architecture-workflow.md`

### Production Incident

→ `operations/incident-response.md`

### Security Review

→ `security-architect-skill-workflow.md`

### Database Design

→ `database-architect-skill-workflow.md`

## Maintenance Guidelines

When adding new workflows:

1. **Determine scope**: Is this core system logic, enterprise-scale work, or operational?
2. **Choose location**: Place in appropriate subdirectory or root level
3. **Follow naming**: Use consistent naming pattern (hyphenated for core, clear descriptors for others)
4. **Document purpose**: Include "When to use this workflow" section
5. **Cross-reference**: Link to related workflows (especially from core workflows)
6. **Update CLAUDE.md**: If adding enterprise or core workflow, ensure it's referenced in `.claude/CLAUDE.md` Section 8.6

## Structure Template

All workflows should include:

1. **Overview** - Purpose and when to use
2. **Phase/Stage Breakdown** - Sequential steps or decision points
3. **Decision Matrices** - When to choose path A vs B
4. **Spawning Patterns** - How to spawn agents (if applicable)
5. **Handoff Information** - Metadata to pass between agents
6. **Success Criteria** - How to know the workflow completed successfully
7. **Related Workflows** - Links to complementary workflows

---

_Last updated: 2026-01-28_
