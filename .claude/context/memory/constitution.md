# Project Constitution

## Core Principles

### I. Router-First Multi-Agent

- All user requests are routed by the Router agent; no direct execution of implementation tasks by the Router.
- Subagents are spawned via the Task tool with explicit task IDs and model resolution from config.

### II. Artifact Lifecycle

- Framework artifacts (skills, agents, hooks, workflows, templates, schemas) are created only via creator skills, never by direct Write/Edit to artifact paths.
- Post-creation: update CLAUDE.md, catalogs, and agent assignments.

### III. Security and Validation

- Security-sensitive changes require security-architect review.
- Hooks enforce planner-first for high/epic complexity and creator workflow for artifact writes.

### IV. Memory and Continuity

- Learnings, decisions, and issues are written to `.claude/context/memory/` (learnings.md, decisions.md, issues.md).
- Assume interruption: if it is not in memory, it did not happen.

## Planning Gates (Constitution Checkpoint)

Before Phase 1 implementation planning:

1. Research completeness (minimum sources, NEEDS CLARIFICATION resolved).
2. Technical feasibility (approach validated, dependencies identified).
3. Security review (implications assessed, mitigations identified).
4. Specification alignment (acceptance criteria testable, scope bounded).

**Version**: 1.0.0
