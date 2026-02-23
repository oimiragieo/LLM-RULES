---
name: artifact-lifecycle
description: Unified lifecycle management for all framework artifacts (skills, agents, hooks, workflows, templates, schemas)
version: 1.1.0
author: Claude Code Enterprise Framework
agents: [architect, planner, developer]
triggers:
  - 'create skill'
  - 'create agent'
  - 'update skill'
  - 'deprecate'
  - 'artifact lifecycle'
metadata:
  skill-author: Claude Code Enterprise Framework
  category: orchestration
  complexity: medium
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Artifact Lifecycle Skill

Convenience wrapper for the unified artifact lifecycle workflow.

## Overview

This skill provides a simplified interface to the comprehensive artifact lifecycle management workflow at `.claude/workflows/core/skill-lifecycle.md`.

## When to Use

Use this skill when you need to:

- Create a new artifact (skill, agent, hook, workflow, template, schema)
- Update an existing artifact
- Deprecate an artifact with migration guidance
- Check if an artifact already exists

## Quick Start

```javascript
// Invoke this skill
Skill({ skill: 'artifact-lifecycle' });
```

## Workflow Reference

**Full Workflow:** `.claude/workflows/core/skill-lifecycle.md`

## Phases

### Phase 1: Discovery

Check if artifact exists, compare versions.

**Agent:** architect
**Output:** Discovery report with recommendations

### Phase 2: Decision

Determine action: CREATE, UPDATE, or DEPRECATE.

**Agent:** planner
**Output:** Action plan with tasks

### Phase 3: Action

Execute the determined action.

**Agent:** developer + appropriate creator skill
**Tools:**

- `Skill({ skill: "skill-creator" })` for skills
- `Skill({ skill: "agent-creator" })` for agents
- `Skill({ skill: "hook-creator" })` for hooks
- `Skill({ skill: "workflow-creator" })` for workflows

### Phase 4: Integration

Update registries, catalogs, and CLAUDE.md.

**Agent:** developer
**Updates:**

- creator-registry.json
- skill-catalog.md (for skills)
- CLAUDE.md Section 3 (for agents) or Section 8.5/8.6 (for skills/workflows)

### Phase 5: Validation

Test integration and verify references.

**Agent:** qa
**Checks:**

- Artifact invocable
- References valid
- No broken cross-references

## Usage Examples

### Create New Skill

```
User: "Create a skill for Kubernetes deployment"

Router spawns with:
Skill({ skill: "artifact-lifecycle" })

Workflow determines: CREATE mode
Invokes: skill-creator
Updates: registry, catalog, CLAUDE.md
Validates: skill invocable
```

### Update Existing Agent

```
User: "Update the devops agent to support Terraform Cloud"

Router spawns with:
Skill({ skill: "artifact-lifecycle" })

Workflow determines: UPDATE mode
Version: 1.0.0 → 1.1.0
Updates: agent file, CHANGELOG
Validates: agent referenced correctly
```

### Deprecate Workflow

```
User: "Deprecate the old deployment workflow"

Router spawns with:
Skill({ skill: "artifact-lifecycle" })

Workflow determines: DEPRECATE mode
Adds: deprecation notice, migration guide
Updates: CLAUDE.md with replacement reference
Validates: no broken references
```

## Configuration

| Parameter     | Values                                         | Default     |
| ------------- | ---------------------------------------------- | ----------- |
| artifact_type | skill, agent, hook, workflow, template, schema | auto-detect |
| operation     | create, update, deprecate, integrate           | auto-detect |
| version_bump  | major, minor, patch                            | minor       |

## Iron Laws

1. **ALWAYS use type-specific creator skills** — never treat artifact-lifecycle as a shortcut that bypasses research-synthesis, companion-check, or validation; each phase exists for a reason.
2. **ALWAYS determine operation mode before starting action** (CREATE/UPDATE/DEPRECATE) — never begin Phase 3 without a confirmed Phase 2 decision; wrong operation = wasted or dangerous work.
3. **NEVER skip Phase 5 validation** — artifacts must be verified as invocable before the lifecycle task is marked complete; broken artifacts delivered as complete are worse than none.
4. **ALWAYS update catalog and CLAUDE.md in Phase 4** — artifacts without catalog/routing entries are invisible to agents and the router; integration without registration is incomplete.
5. **NEVER use artifact-lifecycle for simple single-artifact updates** — use type-specific updaters (skill-updater, agent-updater, workflow-updater); lifecycle is for multi-phase orchestration only.

## Anti-Patterns

| Anti-Pattern                                      | Why It Fails                                       | Correct Approach                                  |
| ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Skipping research-synthesis before CREATE         | Risk of creating a duplicate or outdated artifact  | Always run research-synthesis first               |
| Starting action before Phase 2 decision           | Wrong operation applied; CREATE when UPDATE needed | Complete Phase 2 before Phase 3                   |
| Skipping Phase 5 validation                       | Broken artifacts delivered as complete             | Always run invocability check                     |
| No catalog/registry update in Phase 4             | Artifact is invisible to agents and router         | Always update catalog, registry, and CLAUDE.md    |
| Using artifact-lifecycle for simple version bumps | Heavyweight process for lightweight work           | Use skill-updater/agent-updater for UPDATE mode   |
| Not specifying artifact_type                      | Wrong creator skill invoked silently               | Always specify or verify artifact_type in Phase 1 |

## Memory Protocol

1. Read `.claude/context/memory/learnings.md` before starting
2. Record decisions to `.claude/context/memory/decisions.md`
3. Record issues to `.claude/context/memory/issues.md`

## Related Skills

- `skill-creator` - Direct skill creation
- `agent-creator` - Direct agent creation
- `workflow-creator` - Direct workflow creation
- `codebase-integration` - External artifact integration

## Related Workflows

- `.claude/workflows/core/skill-lifecycle.md` - Full lifecycle workflow
- `.claude/workflows/core/external-integration.md` - External artifact integration
- `.claude/workflows/core/router-decision.md` - Router decision flow
