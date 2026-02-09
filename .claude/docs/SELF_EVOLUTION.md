<!-- Agent: technical-writer | Task: #9 | Session: 2026-02-09 -->

# Self-Evolution Guide

**Last Updated:** 2026-02-09

## Overview

The agent-studio framework can evolve itself by creating new agents, skills, hooks, and workflows on demand. This capability enables the framework to adapt to new technologies, domains, and requirements without manual coding.

## EVOLVE Workflow

The framework uses a structured EVOLVE process (Explore-Validate-Orchestrate-Launch-Verify-Evolve) for creating new artifacts:

**E** - Explore: Research the domain and gather requirements
**V** - Validate: Verify the need and check for existing solutions
**O** - Orchestrate: Design the artifact structure and dependencies
**L** - Launch: Create the artifact files and supporting documentation
**V** - Verify: Test the artifact and ensure integration
**E** - Evolve: Update catalogs, registries, and routing tables

## What Can Be Created

The framework supports self-evolution of:

- **Agents** - New specialized agent personas with unique capabilities
- **Skills** - Reusable techniques, patterns, and tool documentation
- **Hooks** - Runtime guardrails and lifecycle event handlers
- **Workflows** - Multi-step processes for complex operations
- **Templates** - Standardized formats for reports, plans, and artifacts
- **Schemas** - JSON validation rules for data structures

## Creator Skills

Each artifact type has a dedicated creator skill:

| Artifact Type | Creator Skill      | Purpose                                 |
| ------------- | ------------------ | --------------------------------------- |
| Agents        | `agent-creator`    | Create specialized agent definitions    |
| Skills        | `skill-creator`    | Create reusable skills and convert MCPs |
| Hooks         | `hook-creator`     | Create runtime enforcement hooks        |
| Workflows     | `workflow-creator` | Create multi-step process definitions   |
| Templates     | `template-creator` | Create standardized document templates  |
| Schemas       | `schema-creator`   | Create JSON validation schemas          |

**Important:** Always invoke `research-synthesis` skill BEFORE any creator skill to gather domain knowledge and verify the need.

## Artifact Integration

Creating an artifact is only the first step. Proper integration ensures discoverability:

**Must-Have Integration (Blocking):**

- Catalog/registry entry (makes artifact discoverable)
- At least one consumer (agent, workflow, or command)
- Routing keywords (enables auto-discovery by router)

**Should-Have Integration (Warning):**

- Documentation reference in @files
- Test coverage for executable artifacts

Use the `artifact-integrator` skill after creation to verify integration completeness.

## Complete Documentation

For the complete EVOLVE workflow specification, see:

**[@EVOLUTION_WORKFLOW.md](./@EVOLUTION_WORKFLOW.md)** - Complete EVOLVE process, research requirements, post-creation integration

## Related Documentation

- [Creator Skills Table](./@CREATOR_SKILLS_TABLE.md) - All creator skills and their invocation patterns
- [Artifact Integration Rules](../rules/artifact-integration.md) - Integration requirements and validation
- [Workspace Conventions](../rules/workspace-conventions.md) - File placement and naming standards
