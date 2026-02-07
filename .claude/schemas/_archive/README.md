# Archived Schemas

**Archived:** 2026-02-07
**Reason:** Zero references found in codebase (per comprehensive audit in Task #87)
**ADR:** ADR-088 (Schemas System Overhaul)

## Archived Files (25 total)

| Original Path | Reason | Restoration Command |
|---------------|--------|---------------------|
| `architecture-validation.schema.json` | Zero references | `git mv .claude/schemas/_archive/architecture-validation.schema.json .claude/schemas/` |
| `backlog.schema.json` | Zero references | `git mv .claude/schemas/_archive/backlog.schema.json .claude/schemas/` |
| `capability-routing.schema.json` | Zero references | `git mv .claude/schemas/_archive/capability-routing.schema.json .claude/schemas/` |
| `context-definition.schema.json` | Zero references | `git mv .claude/schemas/_archive/context-definition.schema.json .claude/schemas/` |
| `database_architecture.schema.json` | Zero references | `git mv .claude/schemas/_archive/database_architecture.schema.json .claude/schemas/` |
| `epic.schema.json` | Zero references | `git mv .claude/schemas/_archive/epic.schema.json .claude/schemas/` |
| `epics-stories.schema.json` | Zero references | `git mv .claude/schemas/_archive/epics-stories.schema.json .claude/schemas/` |
| `error-log-schema.json` | Zero references | `git mv .claude/schemas/_archive/error-log-schema.json .claude/schemas/` |
| `event-schema.json` | Zero references | `git mv .claude/schemas/_archive/event-schema.json .claude/schemas/` |
| `implementation-readiness.schema.json` | Zero references | `git mv .claude/schemas/_archive/implementation-readiness.schema.json .claude/schemas/` |
| `mode-definition.schema.json` | Zero references | `git mv .claude/schemas/_archive/mode-definition.schema.json .claude/schemas/` |
| `package-manager.schema.json` | Zero references | `git mv .claude/schemas/_archive/package-manager.schema.json .claude/schemas/` |
| `retrospective.schema.json` | Zero references | `git mv .claude/schemas/_archive/retrospective.schema.json .claude/schemas/` |
| `route_decision.schema.json` | Zero references | `git mv .claude/schemas/_archive/route_decision.schema.json .claude/schemas/` |
| `skillcatalog-query.schema.json` | Zero references | `git mv .claude/schemas/_archive/skillcatalog-query.schema.json .claude/schemas/` |
| `skillcatalog-response.schema.json` | Zero references | `git mv .claude/schemas/_archive/skillcatalog-response.schema.json .claude/schemas/` |
| `skill-manifest.schema.json` | Zero references | `git mv .claude/schemas/_archive/skill-manifest.schema.json .claude/schemas/` |
| `sprint-plan.schema.json` | Zero references | `git mv .claude/schemas/_archive/sprint-plan.schema.json .claude/schemas/` |
| `story.schema.json` | Zero references | `git mv .claude/schemas/_archive/story.schema.json .claude/schemas/` |
| `task-definition.schema.json` | Zero references | `git mv .claude/schemas/_archive/task-definition.schema.json .claude/schemas/` |
| `ui-audit-report.schema.json` | Zero references | `git mv .claude/schemas/_archive/ui-audit-report.schema.json .claude/schemas/` |
| `user_story.schema.json` | Zero references | `git mv .claude/schemas/_archive/user_story.schema.json .claude/schemas/` |
| `workflow-patterns.schema.json` | Zero references | `git mv .claude/schemas/_archive/workflow-patterns.schema.json .claude/schemas/` |
| `agent-tools.json` | Zero references, non-standard naming | `git mv .claude/schemas/_archive/agent-tools.json .claude/schemas/` |
| `agent-spawn-params.json` | Zero references, non-standard naming | `git mv .claude/schemas/_archive/agent-spawn-params.json .claude/schemas/` |

## Restoration Instructions

To restore a schema:

1. Run the appropriate `git mv` command from the table above
2. Update schema-creator SKILL.md if needed
3. Wire to Ajv validation if the schema should be actively validated
4. Update schema catalog at `.claude/context/artifacts/catalogs/schema-catalog.md`

## Archive Context

These 25 schemas (48% of total) had zero references anywhere in the codebase. Most were bulk-generated during initial scaffolding for Agile artifacts (epics, stories, sprints, backlogs) that were never implemented. Archiving via `git mv` preserves full commit history for potential future restoration.

**Related:** ADR-088, `.claude/context/plans/schemas-overhaul-architecture-2026-02-07.md`
