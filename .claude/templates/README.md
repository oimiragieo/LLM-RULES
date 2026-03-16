# Templates Directory

Standardized templates for creating new agents, skills, and workflows in the multi-agent orchestration framework.

## Template Types

### Agent Templates (`agents/`)

Use when creating new specialized agents.

**File:** `agents/agent-template.md`

**Usage:**

1. Copy template to `.claude/agents/<category>/<agent-name>.md`
2. Replace all `{{PLACEHOLDER}}` values
3. Add agent to CLAUDE.md routing table (Section 3)
4. Update learnings.md with integration summary

**Categories:**

- `core/` - Essential agents (planner, developer, architect, qa)
- `specialized/` - Domain-specific experts (security, devops, database)
- `domain/` - Language/framework specialists (python-pro, nextjs-pro)
- `orchestrators/` - Multi-agent coordinators

### Skill Templates (`skills/`)

Use when creating new reusable skills.

**File:** `skills/skill-template.md`

**Usage:**

1. Create directory `.claude/skills/<skill-name>/`
2. Copy template to `SKILL.md` in that directory
3. Replace all `{{PLACEHOLDER}}` values
4. Add to CLAUDE.md Section 8.5 if user-invocable
5. Assign to agents via their `skills:` frontmatter array

**Skill Types:**

- **User-invocable** (`user_invocable: true`): Can be invoked with `Skill({ skill: "name" })`
- **Agent-only** (`user_invocable: false`): Only available to agents with the skill assigned

### Workflow Templates (`workflows/`)

Use when creating multi-agent orchestration patterns.

**File:** `workflows/workflow-template.md`

**Usage:**

1. Copy template to `.claude/workflows/<category>/<workflow-name>.md`
2. Replace all `{{PLACEHOLDER}}` values
3. Add to CLAUDE.md Section 3 "Multi-Agent Workflows"
4. Document trigger conditions

**Categories:**

- `enterprise/` - Complex multi-phase workflows
- `operations/` - Operational workflows (incident response, deployment)
- Root level - Simpler single-purpose workflows

### Spawn Templates (`spawn/`)

Agent spawning templates for router delegation.

**Available:**

- `universal-agent-spawn.md` - Standard agent spawning template (haiku/sonnet/opus)
- `orchestrator-spawn.md` - Orchestrator agent spawning (requires Task tool + opus model)
- `subordinate-once.md` - One-shot subordinate task spawning (respond once, no delegation)
- `agent-identity-integration.md` - Agent spawning with personality frontmatter integration

**Usage:**

Router loads these templates via `.claude/templates/spawn/universal-agent-spawn.md` and substitutes placeholders before spawning agents. See CLAUDE.md Section 2 for spawn protocol.

### Report Templates (`reports/`)

Structured report output templates for agent deliverables.

**Available:**

- `audit-report-template.md` - QA and security audit reports
- `implementation-report-template.md` - Developer implementation summaries and completion reports
- `plan-template.md` - Planner output reports and implementation plans
- `reflection-report-template.md` - Reflection agent analysis and learning extraction
- `research-report-template.md` - Research synthesis reports with citations

**Usage:**

Agents copy these templates to `.claude/context/reports/backend/<category>/` and fill in sections. Reports follow workspace conventions with provenance headers and ISO date suffixes.

### Mission Templates (`mission/`)

Use for structuring mission orchestration and governance.

**Available:**

- `CONTINUATION_PLAN.md` - Schema for handoffs between shifts
- `INVARIANTS.md` - Core invariants required for mission safety
- `ANTI_GOALS.md` - Explicit non-goals for bounding scope

**Usage:**

Used by master orchestrator during the `start-mission` workflow setup.

### Code Style Templates (`code-styles/`)

Language-specific coding style guidelines.

**Available:**

- `python.md` - Python style guidelines
- `typescript.md` - TypeScript style guidelines
- `javascript.md` - JavaScript style guidelines

**Archived:**

Other language styles (dart, csharp, go, html-css, general) archived to `_archive/code-styles/` due to lack of usage in current project.

### Hook Templates (`hooks/`) - Future

Templates for pre/post execution hooks.

**Usage:**

1. Create directory `.claude/templates/hooks/` if not exists
2. Use `template-creator` skill to generate hook templates
3. Copy to `.claude/hooks/` for implementation

### Code Pattern Templates (`code/`) - Future

Language-specific code scaffolding patterns.

**Usage:**

1. Create directory `.claude/templates/code/` if not exists
2. Use `template-creator` skill to generate code patterns
3. Copy patterns when scaffolding new code

### Schema Templates (`schemas/`) - Future

JSON/YAML schema templates for validation.

**Usage:**

1. Create directory `.claude/templates/schemas/` if not exists
2. Use `template-creator` skill to generate schema templates
3. Copy to `.claude/schemas/` for validation

### Plan Template

Use when creating implementation plans that bridge specifications to tasks.

**File:** `plan-template.md`

**Usage:**

1. Copy template to `.claude/context/plans/<plan-name>.md`
2. Replace all `{{PLACEHOLDER}}` values following the Token Replacement Guide
3. Ensure Phase 0 (Research & Planning) is completed with constitution checkpoint
4. Update learnings.md with plan summary

**Template Features:**

- **Phase 0 (Research)**: Mandatory research phase with constitution checkpoint (BLOCKING)
- **Phase Structure**: Foundation → Core Features → Integration → Reflection
- **Task Breakdown**: Organized by feature/capability with time estimates
- **Dependency Graph**: ASCII visualization of task dependencies and critical path
- **Verification Gates**: Blocking checkpoints between phases (cannot proceed if fail)
- **Risk Assessment**: Technical, compatibility, UX, and security risks with mitigations
- **Agent Assignments**: Clear ownership matrix for each task
- **Success Criteria**: Measurable acceptance criteria per phase and overall
- **Timeline Summary**: Realistic and aggressive timeline options with parallel tracks
- **Security Review**: Integrated security assessment section
- **Quick Wins**: Fast progress items (< 1 hour each) for immediate momentum
- **Error Handling**: Rollback procedures for failed tasks

**Constitution Checkpoint (Phase 0 - CRITICAL):**

Before proceeding to Phase 1, ALL must pass:

1. **Research completeness** - Minimum 3 external sources with citations
2. **Technical feasibility** - Approach validated, dependencies identified
3. **Security implications** - Assessed with threat model if applicable
4. **Specification quality** - Measurable criteria, clear success metrics

**If ANY item fails, MUST return to research phase. DO NOT proceed to implementation.**

**Token Replacement:**

See "Token Replacement Guide" section in template for complete list of 30+ required and optional tokens including:

- Plan metadata (title, date, version, status)
- Phase details (name, purpose, duration, dependencies)
- Task details (ID, title, hours, files, verification)
- Success criteria and metrics
- Risk assessments
- Agent assignments

**Critical Sections:**

- **Phase 0**: Research & Planning (FOUNDATION) - Cannot be skipped per ADR-045
- **Verification Gates**: Blocking checkpoints with bash commands for validation
- **Error Handling**: Rollback commands and failure documentation procedures
- **Phase FINAL**: Reflection and learning extraction (MANDATORY)

**Integration with Framework:**

- Works with `plan-generator` skill (generate plans from specs)
- Works with `planner` agent (break down features into phases)
- Works with `task-breakdown` skill (organize tasks by user stories)
- Works with `reflection-agent` (Phase FINAL learning extraction)

**Storage Location:**

- Active plans: `.claude/context/plans/`

### Specification Template

Use when creating software requirements specifications following IEEE 830 standards.

**File:** `specification-template.md`

**Usage:**

1. Copy template to project specifications directory or `.claude/context/artifacts/specifications/`
2. Replace all `{{PLACEHOLDER}}` tokens with actual values
3. Complete all sections marked [REQUIRED]
4. Validate against schema: `.claude/schemas/specification-template.schema.json`
5. Get stakeholder sign-off

**Features:**

- **YAML Frontmatter**: Machine-readable metadata (title, version, author, status, date, acceptance criteria)
- **Markdown Body**: Human-readable IEEE 830 structure (11 main sections)
- **Token Replacement**: `{{PROJECT_NAME}}`, `{{AUTHOR}}`, `{{DATE}}`, `{{VERSION}}`, `{{FEATURE_NAME}}`
- **Schema Validation**: Validates against JSON Schema for consistency
- **Acceptance Criteria**: Measurable checkboxes for implementation tracking
- **ADR-044 Compliance**: YAML+MD hybrid format for tooling integration

**IEEE 830 Sections:**

1. Introduction (Purpose, Scope, Definitions)
2. Functional Requirements (FR-XXX)
3. Non-Functional Requirements (NFR-XXX)
4. System Features (Workflows)
5. External Interface Requirements (APIs, Database, Dependencies)
6. Quality Attributes (Testability, Maintainability, Monitoring)
7. Constraints (Technical, Schedule, Resource)
8. Assumptions and Dependencies
9. Future Enhancements
10. Acceptance Criteria (Summary)
11. Glossary

**Integration with Framework:**

- Works with `spec-gathering` skill (collect requirements)
- Works with `spec-writing` skill (generate initial draft)
- Works with `spec-critique` skill (review and validate)
- Works with `planner` agent (break down into implementation tasks)

**Storage Locations:**

- Active specs: `.claude/context/artifacts/specifications/active/`
- Approved specs: `.claude/context/artifacts/specifications/approved/`
- Deprecated specs: `.claude/context/artifacts/specifications/deprecated/`

### Task Breakdown Template

Use when breaking down features into implementable tasks with user story organization.

**File:** `tasks-template.md`

**Usage:**

1. Copy template to `.claude/context/artifacts/plans/tasks-<feature-name>.md`
2. Replace all `{{PLACEHOLDER}}` values with concrete values
3. Follow Epic → User Story → Task hierarchy
4. Organize by priority: Enablers (foundational), P1 (MVP), P2 (Nice-to-Have), P3 (Polish)
5. Define acceptance criteria for each user story
6. Track dependencies between tasks
7. Create TaskCreate calls for tracking

**Key Features:**

- **Enabler Support**: Foundational tasks that block all user stories (SAFe pattern)
- **User Story Organization**: P1/P2/P3 prioritization (MoSCoW method: Must/Should/Could have)
- **Task ID Convention**: `ENABLER-X.Y`, `P1-X.Y.Z`, `P2-X.Y.Z`, `P3-X.Y.Z`
- **SAFe/Azure DevOps Alignment**: Industry-standard Epic → Story → Task hierarchy
- **Acceptance Criteria**: Testable criteria for each user story (Agile best practice)
- **Dependency Tracking**: Clear blockedBy relationships
- **Token Replacement**: 20+ tokens for easy instantiation
- **Quality Checklist**: Built-in quality gates for each story
- **Risk Assessment**: Structured risk tracking table

**Priority Levels (ADR-045):**

- **Enablers**: Shared infrastructure (completes before user stories)
- **P1 (MVP)**: Must-have features 🎯 - minimum viable product
- **P2 (Nice-to-Have)**: Should-have features - important but not blocking
- **P3 (Polish)**: Could-have features - refinement and optimization

**Integration with Agent-Studio:**

After creating task breakdown:

1. Use `TaskCreate` to create trackable tasks from the breakdown
2. Set up dependencies with `TaskUpdate({ addBlockedBy: [...] })`
3. Track progress with `TaskUpdate({ status: "in_progress|completed" })`
4. Link to specification with `related_specs` frontmatter field

**Storage Location:**

- Task breakdowns: `.claude/context/artifacts/plans/`

### Execution Flow Sections

The spec, plan, and tasks templates include an **Execution Flow** block that defines
the ordered steps and error/warn conditions for each artifact.

- `spec-template.md` → **Execution Flow (main)**
- `plan-template.md` → **Execution Flow (/plan command scope)**
- `tasks-template.md` → **Execution Flow (main)**

## Template Creator Skill

Use the `template-creator` skill to create new templates:

```javascript
Skill({ skill: 'template-creator' });
```

The skill ensures:

- Consistent placeholder format (`{{UPPER_CASE}}`)
- Required sections (POST-CREATION CHECKLIST, Memory Protocol)
- Documentation for all placeholders
- README updates

## Critical Reminders

### ROUTER UPDATE REQUIRED

After creating ANY agent, skill, or workflow:

1. **Update CLAUDE.md** - Add to routing table, skills section, or workflows section
2. **Update learnings.md** - Record the integration
3. **Verify with grep** - Ensure your new artifact is discoverable

```bash
# Verify agent is in routing table
grep "<agent-name>" .claude/CLAUDE.md

# Verify skill is documented
grep "<skill-name>" .claude/CLAUDE.md

# Verify workflow is documented
grep "<workflow-file>" .claude/CLAUDE.md
```

**WHY:** Artifacts not in CLAUDE.md are invisible to the Router and will never be used.

### Agent Template Defaults

The agent template is optimized for current subagent behavior:

1. `maxTurns` and `permissionMode` are explicitly set
2. Tool list is minimal by default (expand per role only as needed)
3. Skills are optional (do not preload large skill sets by default)
4. Memory usage is demand-driven (read/write only relevant memory)

## Quick Reference

| **Quick Reference** | | | | |

| Creating      | Template                         | CLAUDE.md Section         | Output Path                                   | Count |
| ------------- | -------------------------------- | ------------------------- | --------------------------------------------- | ----- |
| Agent         | `agents/agent-template.md`       | Section 3 (Routing Table) | `.claude/agents/<category>/`                  | 1     |
| Skill         | `skills/skill-template.md`       | Section 8.5 (Skills)      | `.claude/skills/<name>/SKILL.md`              | 1     |
| Workflow      | `workflows/workflow-template.md` | Section 3 (Workflows)     | `.claude/workflows/<category>/`               | 1     |
| Spawn         | `spawn/<spawn-type>.md`          | Section 2 (Spawning)      | Used by router (not copied)                   | 4     |
| Report        | `reports/<report-type>.md`       | N/A                       | `.claude/context/reports/backend/<category>/` | 5     |
| Mission       | `mission/<mission-type>.md`      | N/A                       | Project root or mission folder                | 3     |
| Specification | `specification-template.md`      | N/A                       | `.claude/context/artifacts/specifications/`   | 1     |
| Plan          | `plan-template.md`               | N/A                       | `.claude/context/plans/`                      | 1     |
| Tasks         | `tasks-template.md`              | N/A                       | `.claude/context/artifacts/plans/`            | 1     |
| Code Style    | `code-styles/<language>.md`      | N/A                       | Used as reference (not copied)                | 3     |
| Hook          | `hooks/<hook-type>.md`           | N/A                       | `.claude/hooks/<category>/`                   | 0     |
| Code Pattern  | `code/<language>-<pattern>.md`   | N/A                       | Project source                                | 0     |
| Schema        | `schemas/<schema-type>.md`       | N/A                       | `.claude/schemas/`                            | 0     |

## Template Catalog

For the complete template catalog with agent assignments and cross-references, see:

**Catalog:** `.claude/context/artifacts/catalogs/template-catalog.md`

This catalog provides:

- Full template inventory with descriptions
- Agent assignment matrix (which agents use which templates)
- Template dependencies and relationships
- Usage statistics and recommendations

## Archived Templates

Templates no longer actively used are preserved in `.claude/templates/_archive/`.

**Archival Date:** 2026-02-07
**Reason:** Template system overhaul (Task #66) - removing dead templates per architecture audit

See `_archive/README.md` for the complete archive index with archival reasons and restoration instructions.

### Restoration

To restore an archived template:

```bash
# Restore specific template to original location
git mv .claude/templates/_archive/spawn/bash-safe-background.md .claude/templates/spawn/

# Restore all templates in a category
git mv .claude/templates/_archive/planning/*.md .claude/templates/planning/
```

**Important:** Restoring via `git mv` preserves full git history, just like the original archival.

### Archived Content Summary

- **Spawn templates** (2): bash-safe-background.md, router-task-template.md (superseded by universal-agent-spawn.md)
- **Planning templates** (3): findings.md, progress.md, task_plan.md (unused)
- **Code styles** (3): dart.md, csharp.md, go.md (no corresponding code in project)
- **Examples** (2): example-adr-050.md, example-specification.md (unused)
- **Other** (4): claude-md-template.md, project-brief.md, prd.md, ui-spec.md (unused)

**Deleted (not archived):** html-css.md, general.md (overlapped with `.claude/rules/code-standards.md`)

## Creator Skills

| Need         | Skill              | Invocation                             |
| ------------ | ------------------ | -------------------------------------- |
| New agent    | `agent-creator`    | `Skill({ skill: 'agent-creator' })`    |
| New skill    | `skill-creator`    | `Skill({ skill: 'skill-creator' })`    |
| New workflow | `workflow-creator` | `Skill({ skill: 'workflow-creator' })` |
| New hook     | `hook-creator`     | `Skill({ skill: 'hook-creator' })`     |
| New template | `template-creator` | `Skill({ skill: 'template-creator' })` |
| New schema   | `schema-creator`   | `Skill({ skill: 'schema-creator' })`   |
