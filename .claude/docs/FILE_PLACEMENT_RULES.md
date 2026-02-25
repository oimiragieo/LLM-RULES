# File Placement Rules

**Version**: 2.0.0
**Last Updated**: 2026-01-31
**Enforced By**: `file-placement-guard.cjs`
**Architecture**: `.claude/context/artifacts/architecture/FILE-PLACEMENT-ARCHITECTURE.md`
**ADR**: ADR-076 (File Placement Architecture Redesign)

This document defines the MANDATORY rules for where agents must place files they create. These rules ensure consistent organization, predictable artifact locations, and maintainable codebase structure.

> **CRITICAL CHANGE (v2.0)**: ALL test files (`*.test.cjs`, `*.test.mjs`) MUST go in the root `tests/` directory, NOT in `.claude/`. This is a breaking change from v1.0 which allowed co-located tests.

---

## QUICK REFERENCE (Agent Checklist)

**Before writing ANY file, check this table:**

| What You're Creating | Where It Goes                                 |
| -------------------- | --------------------------------------------- |
| Hook code            | `.claude/hooks/{category}/`                   |
| Hook test            | `tests/hooks/`                                |
| Utility code         | `.claude/lib/{category}/`                     |
| Utility test         | `tests/unit/{category}/`                      |
| CLI tool code        | `.claude/tools/cli/`                          |
| CLI tool test        | `tests/cli/`                                  |
| Integration test     | `tests/integration/`                          |
| E2E test             | `tests/e2e/`                                  |
| Agent definition     | `.claude/agents/{category}/`                  |
| Skill definition     | `.claude/skills/{name}/SKILL.md`              |
| Workflow definition  | `.claude/workflows/{category}/`               |
| Plan                 | `.claude/context/artifacts/plans/`            |
| Report               | `.claude/context/reports/backend/{domain}/`   |
| Research report      | `.claude/context/artifacts/research-reports/` |
| Architecture doc     | `.claude/context/artifacts/architecture/`     |
| Schema               | `.claude/schemas/`                            |
| Framework doc        | `.claude/docs/`                               |

**TEST FILES RULE**: If the file ends with `.test.cjs`, `.test.mjs`, `.spec.cjs`, or `.spec.mjs`, it MUST go in `tests/` - NEVER in `.claude/`.

---

## Overview

### Purpose

1. **Consistency**: All agents follow the same placement rules
2. **Discoverability**: Files are where developers expect them
3. **Automation**: Hooks can validate and enforce placement
4. **Maintainability**: Clear separation of concerns

### Enforcement

- **Hook**: `unified-pre-write-hook.cjs`
- **Trigger**: PreToolUse on Write and Edit operations
- **Default Mode**: Block (prevents writes to invalid locations)
- **Override**: Set `FILE_PLACEMENT_OVERRIDE=true` environment variable

---

## Directory Purposes

### .claude/agents/

**Purpose**: Agent definition files ONLY

| Attribute     | Value                                                |
| ------------- | ---------------------------------------------------- |
| Allowed files | `*.md` agent definitions                             |
| File naming   | `{agent-name}.md` (kebab-case)                       |
| Structure     | `core/`, `domain/`, `specialized/`, `orchestrators/` |

**Subdirectory Categories**:

- `core/` - Essential agents (router, planner, developer, qa, architect)
- `domain/` - Language/framework specialists (python-pro, typescript-pro)
- `specialized/` - Task-specific agents (security-architect, code-reviewer)
- `orchestrators/` - Multi-agent coordinators (master-orchestrator, swarm-coordinator)

**Example**:

```
.claude/agents/domain/my-new-agent.md
```

---

### .claude/skills/

**Purpose**: Skill definitions and associated files

| Attribute     | Value                                              |
| ------------- | -------------------------------------------------- |
| Allowed files | `SKILL.md`, `metadata.json`, `tests/`, `examples/` |
| Structure     | `{skill-name}/SKILL.md`                            |
| Naming        | `{skill-name}/` directory (kebab-case)             |

**Required Structure**:

```
.claude/skills/{skill-name}/
├── SKILL.md           # Main skill definition (REQUIRED)
├── metadata.json      # Skill metadata (optional)
├── tests/             # Skill tests (optional)
└── examples/          # Usage examples (optional)
```

**Example**:

```
.claude/skills/my-new-skill/SKILL.md
```

---

### .claude/hooks/

**Purpose**: Pre/post tool execution hooks (CODE ONLY - NO TESTS)

| Attribute     | Value                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Allowed files | `*.cjs` (hook code ONLY)                                                                           |
| NOT allowed   | `*.test.cjs`, `*.test.mjs` (tests go in `tests/hooks/`)                                            |
| Structure     | `routing/`, `safety/`, `memory/`, `evolution/`, `session/`, `validation/`, `reflection/`, `audit/` |
| Naming        | `{hook-name}.cjs` (kebab-case)                                                                     |

**Subdirectory Categories**:

- `routing/` - Router enforcement hooks
- `safety/` - Safety guardrails (write guards, TDD checks)
- `memory/` - Memory management hooks
- `evolution/` - Self-evolution enforcement
- `session/` - Session management
- `validation/` - Input/output validation
- `reflection/` - Self-reflection triggers
- `audit/` - Audit trail management

**Example**:

```
.claude/hooks/safety/my-guard.cjs       # Hook code
tests/hooks/my-guard.test.cjs           # Hook test (in tests/ directory!)
```

> **IMPORTANT**: Tests for hooks MUST be placed in `tests/hooks/`, NOT in `.claude/hooks/`. This ensures consistent CI/CD test discovery.

---

### .claude/workflows/

**Purpose**: Multi-step workflow definitions

| Attribute     | Value                                           |
| ------------- | ----------------------------------------------- |
| Allowed files | `*.md`, `*.yaml`                                |
| Structure     | `core/`, `enterprise/`, `operations/`, `rapid/` |
| Naming        | `{workflow-name}.md` or `{workflow-name}.yaml`  |

**Subdirectory Categories**:

- `core/` - Fundamental workflows (router-decision, skill-lifecycle)
- `enterprise/` - Complex orchestration patterns
- `operations/` - Operational workflows (incident-response)
- `rapid/` - Quick one-shot workflows

**Example**:

```
.claude/workflows/core/my-workflow.md
```

---

### .claude/context/

**Purpose**: Runtime context, artifacts, and memory

| Subdirectory                  | Purpose                        | Allowed Files                                                             |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `artifacts/`                  | Generated outputs              | `*.md`, `*.json`                                                          |
| `artifacts/analysis/`         | Deep-dive analysis documents   | `*.md`                                                                    |
| `artifacts/catalogs/`         | Catalog and registry files     | `*.md`, `*.json`                                                          |
| `artifacts/database/`         | Database design artifacts      | `*.md`, `*.json`                                                          |
| `artifacts/diagrams/`         | Architecture diagrams          | `*.md`, `*.svg`, `*.png`                                                  |
| `artifacts/error-reports/`    | Error tracking reports         | `*.md`, `*.json`                                                          |
| `artifacts/error-summaries/`  | Error summary aggregations     | `*.md`, `*.json`                                                          |
| `artifacts/research-reports/` | Research synthesis outputs     | `*-research.md`                                                           |
| `artifacts/specs/`            | Technical specifications       | `*.md`                                                                    |
| `artifacts/summaries/`        | Phase summaries, checkpoints   | `*.md`                                                                    |
| `plans/`                      | Planner outputs (canonical)    | `*-plan-YYYY-MM-DD.md`                                                    |
| `reports/`                    | Agent reports (canonical)      | `*-report-YYYY-MM-DD.md`                                                  |
| `reports/security/`           | Security domain reports        | `*.md`                                                                    |
| `reports/qa/`                 | QA domain reports              | `*.md`                                                                    |
| `reports/architecture/`       | Architecture domain reports    | `*.md`                                                                    |
| `reports/database/`           | Database domain reports        | `*.md`                                                                    |
| `reports/reflections/`        | Reflection agent reports       | `*.md` (Read requires a file; use Glob/ListDir then Read a specific file) |
| `memory/`                     | Persistent memory files        | `learnings.md`, `decisions.md`, `issues.md`                               |
| `memory/archive/`             | Archived memory snapshots      | `*.md`                                                                    |
| `memory/metrics/`             | Memory system metrics          | `*.json`, `*.jsonl`                                                       |
| `memory/stm/`                 | Short-term memory (session)    | `*.json`                                                                  |
| `memory/mtm/`                 | Medium-term memory (recent)    | `*.json`                                                                  |
| `memory/ltm/`                 | Long-term memory (summary)     | `*.md`, `*.json`                                                          |
| `memory/named/`               | Named memory API storage       | `*.md`, `*.json`                                                          |
| `metrics/`                    | Metrics and audit logs         | `*.jsonl`, `*.json`                                                       |
| `config/`                     | Configuration files            | `*.json`, `*.yaml`                                                        |
| `runtime/`                    | Temporary runtime state        | `*.json`, `*.jsonl`                                                       |
| `runtime/checkpoints/`        | Workflow checkpoints           | `*.json`                                                                  |
| `data/`                       | Code index data files          | `*.db`, `*.sqlite`, `*.json`, `*.lance`                                   |
| `code-index/`                 | Code indexing metadata         | `*.json`, `*.jsonl`                                                       |
| `sessions/`                   | Session data                   | `*.json`                                                                  |
| `teams/`                      | Party mode team definitions    | `*.json`                                                                  |
| `tmp/`                        | Temporary files (auto-cleaned) | Any                                                                       |
| `backups/`                    | System backups                 | Any                                                                       |

**Example Paths**:

```
.claude/context/artifacts/plans/auth-feature-plan-2026-02-07.md
.claude/context/reports/security/security-audit-2026-02-06.md
.claude/context/reports/architecture/agent-utilization-audit-2026-02-06.md
.claude/context/artifacts/research-reports/oauth-research.md
.claude/context/memory/learnings.md
.claude/context/config/reflection-rubrics.json
```

---

### .claude/templates/

**Purpose**: Artifact templates

| Attribute     | Value                                          |
| ------------- | ---------------------------------------------- |
| Allowed files | `*.md`, `*.yaml` template files                |
| Structure     | `agents/`, `skills/`, `reports/`, `workflows/` |
| Naming        | `{template-name}-template.md`                  |

**Example**:

```
.claude/templates/reports/plan-template.md
```

---

### .claude/schemas/

**Purpose**: JSON Schema validation files

| Attribute     | Value                  |
| ------------- | ---------------------- |
| Allowed files | `*.schema.json`        |
| Naming        | `{entity}.schema.json` |

**Example**:

```
.claude/schemas/agent.schema.json
```

---

### .claude/docs/

**Purpose**: Framework documentation

| Attribute     | Value                                   |
| ------------- | --------------------------------------- |
| Allowed files | `*.md` documentation files              |
| Naming        | `{TOPIC}.md` (UPPERCASE for major docs) |

**Example**:

```
.claude/docs/FILE_PLACEMENT_RULES.md
```

---

### .claude/lib/

**Purpose**: Shared library code (INTERNAL framework only - CODE ONLY, NO TESTS)

| Attribute     | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Allowed files | `*.cjs`, `*.mjs` (code ONLY)                                      |
| NOT allowed   | `*.test.cjs`, `*.test.mjs` (tests go in `tests/unit/{category}/`) |
| Structure     | `workflow/`, `memory/`, `integration/`, `utils/`                  |
| Access        | Framework internals ONLY - agents should NOT write here           |

**Example**:

```
.claude/lib/utils/hook-input.cjs          # Library code
tests/unit/utils/hook-input.test.cjs      # Library test (in tests/ directory!)
```

**Note**: This directory is for framework internals. Agent outputs should go to `context/artifacts/` instead.

---

### .claude/tools/

**Purpose**: CLI utilities and integrations (CODE ONLY, NO TESTS)

| Attribute     | Value                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Allowed files | `*.cjs`, `*.mjs`, `*.js` (code ONLY)                                                                                 |
| NOT allowed   | `*.test.cjs`, `*.test.mjs` (tests go in `tests/cli/`)                                                                |
| Structure     | `cli/`, `integrations/`, `analysis/`, `visualization/`, `optimization/`, `runtime/`, `utils/`, `mcp/`, `validation/` |
| Note          | For standalone utilities, not agent outputs                                                                          |

**Example**:

```
.claude/tools/cli/doctor.js               # CLI tool code
tests/cli/doctor.test.cjs                 # CLI tool test (in tests/ directory!)
```

---

### tests/ (ROOT DIRECTORY)

**Purpose**: ALL tests go here - SINGLE SOURCE OF TRUTH for tests

| Attribute     | Value                                                      |
| ------------- | ---------------------------------------------------------- |
| Allowed files | `*.test.cjs`, `*.test.mjs`, `*.spec.cjs`, `*.spec.mjs`     |
| Structure     | `unit/`, `integration/`, `e2e/`, `hooks/`, `cli/`, etc.    |
| Naming        | `{component-name}.test.cjs` or `{component-name}.test.mjs` |

**Subdirectory Categories**:

- `unit/` - Unit tests for isolated components
  - `unit/memory/` - Memory system unit tests
  - `unit/events/` - Event bus unit tests
  - `unit/hooks/` - Hook unit tests
  - `unit/utils/` - Utility unit tests
- `integration/` - Integration tests across components
  - `integration/hooks/` - Hook integration tests
  - `integration/memory/` - Memory integration tests
  - `integration/events/` - Event integration tests
- `e2e/` - End-to-end workflow tests
- `hooks/` - Hook-specific tests (shorthand for `unit/hooks/`)
- `cli/` - CLI tool tests
- `workflows/` - Workflow tests
- `code-indexing/` - Code indexing system tests
- `performance/` - Performance benchmarks
- `fixtures/` - Test data and fixtures

**Examples**:

```
tests/hooks/routing-guard.test.cjs        # Test for .claude/hooks/routing/routing-guard.cjs
tests/unit/utils/hook-input.test.cjs      # Test for .claude/lib/utils/hook-input.cjs
tests/cli/doctor.test.cjs                 # Test for .claude/tools/cli/doctor.js
tests/integration/memory/sync.test.mjs    # Memory sync integration test
tests/e2e/full-workflow.test.mjs          # End-to-end test
tests/fixtures/sample-agent.md            # Test fixture data
```

> **CRITICAL**: Tests MUST NOT be placed in `.claude/` directory. All tests go in the root `tests/` directory.

---

## File Type Rules

| File Type                    | Allowed Locations                             | Naming Convention                           |
| ---------------------------- | --------------------------------------------- | ------------------------------------------- |
| Agent definitions (`*.md`)   | `.claude/agents/{category}/`                  | `{agent-name}.md`                           |
| Skill definitions            | `.claude/skills/{name}/`                      | `SKILL.md`                                  |
| Hooks (`*.cjs`)              | `.claude/hooks/{category}/`                   | `{hook-name}.cjs`                           |
| Hook tests                   | `tests/hooks/`                                | `{hook-name}.test.cjs`                      |
| Utility tests                | `tests/unit/{category}/`                      | `{util-name}.test.cjs`                      |
| CLI tool tests               | `tests/cli/`                                  | `{tool-name}.test.cjs`                      |
| Integration tests            | `tests/integration/{category}/`               | `{feature}.test.mjs`                        |
| E2E tests                    | `tests/e2e/`                                  | `{workflow}.test.mjs`                       |
| Test fixtures                | `tests/fixtures/`                             | Any                                         |
| Workflows (`*.md`, `*.yaml`) | `.claude/workflows/{category}/`               | `{workflow-name}.md`                        |
| Plans                        | `.claude/context/artifacts/plans/`            | `{feature}-plan-YYYY-MM-DD.md`              |
| Reports                      | `.claude/context/reports/backend/{domain}/`   | `{task}-report-YYYY-MM-DD.md`               |
| Research                     | `.claude/context/artifacts/research-reports/` | `{topic}-research.md`                       |
| Architecture docs            | `.claude/context/artifacts/architecture/`     | `{topic}-ARCHITECTURE.md`                   |
| Memory                       | `.claude/context/memory/`                     | `learnings.md`, `decisions.md`, `issues.md` |
| Config                       | `.claude/context/config/`                     | `{config-name}.json`                        |
| Schemas                      | `.claude/schemas/`                            | `{entity}.schema.json`                      |
| Documentation                | `.claude/docs/`                               | `{TOPIC}.md`                                |
| Templates                    | `.claude/templates/{category}/`               | `{name}-template.md`                        |

---

## Forbidden Locations

Agents must **NEVER** create files in:

| Location                     | Reason                                       | Where to Put Instead                 |
| ---------------------------- | -------------------------------------------- | ------------------------------------ |
| Root of `.claude/`           | Only CLAUDE.md and settings files allowed    | Use appropriate subdirectory         |
| `.claude/lib/` (for tests)   | Tests not allowed in framework internal code | `tests/unit/{category}/`             |
| `.claude/hooks/` (for tests) | Tests not allowed in hooks directory         | `tests/hooks/`                       |
| `.claude/tools/` (for tests) | Tests not allowed in tools directory         | `tests/cli/`                         |
| Outside `.claude/` directory | Project isolation (except tests/)            | `.claude/` or `tests/`               |
| Directly in `context/`       | Must use subdirectories                      | `context/artifacts/` or subdir       |
| Directly in `artifacts/`     | Must use category subdirectories             | `artifacts/plans/`, `reports/`, etc. |

### Test Files - Explicitly Forbidden in .claude/

| Forbidden Location      | Correct Location                |
| ----------------------- | ------------------------------- |
| `.claude/**/*.test.cjs` | `tests/hooks/` or `tests/unit/` |
| `.claude/**/*.test.mjs` | `tests/hooks/` or `tests/unit/` |
| `.claude/**/*.spec.cjs` | `tests/hooks/` or `tests/unit/` |
| `.claude/**/*.spec.mjs` | `tests/hooks/` or `tests/unit/` |

---

## Override Mechanism

If a file MUST be placed outside normal rules:

### Method 1: Environment Variable

```bash
FILE_PLACEMENT_OVERRIDE=true claude
```

### Method 2: Task Metadata

```javascript
TaskUpdate({
  taskId: 'X',
  metadata: { filePlacementOverride: true, justification: '...' },
});
```

### Requirements for Override

1. Document justification in commit message
2. If location becomes standard, update this document
3. Log override in `.claude/context/runtime/placement-overrides.log`

---

## Examples

### Creating a New Agent

```
Correct:   .claude/agents/domain/my-agent.md
Incorrect: .claude/my-agent.md
Incorrect: .claude/agents/my-agent.md (missing category)
```

### Creating a Plan

```
Correct:   .claude/context/artifacts/plans/feature-x-plan-2026-02-07.md
Incorrect: .claude/context/artifacts/plans/feature-x-plan.md (old path before ADR-078)
Incorrect: .claude/context/artifacts/feature-x-plan.md (missing plans/)
```

### Creating a Research Report

```
Correct:   .claude/context/artifacts/research-reports/oauth-research.md
Incorrect: .claude/context/research/oauth-research.md (wrong path)
```

### Creating a Hook

```
Correct:   .claude/hooks/safety/my-hook.cjs
Incorrect: .claude/hooks/safety/my-hook.test.cjs (tests go in tests/hooks/)
Incorrect: .claude/hooks/my-hook.cjs (missing category)
```

### Creating a Hook Test

```
Correct:   tests/hooks/my-hook.test.cjs
Incorrect: .claude/hooks/safety/my-hook.test.cjs (DO NOT co-locate tests!)
```

### Creating a Utility Test

```
Correct:   tests/unit/utils/my-util.test.cjs
Incorrect: .claude/lib/utils/my-util.test.cjs (tests not allowed in .claude/lib/)
```

### Creating a CLI Tool Test

```
Correct:   tests/cli/doctor.test.cjs
Incorrect: .claude/tools/cli/doctor.test.cjs (tests not allowed in .claude/tools/)
```

### Creating a Skill

```
Correct:   .claude/skills/my-skill/SKILL.md
Incorrect: .claude/skills/my-skill.md (not in directory)
Incorrect: .claude/skills/my-skill/skill.md (wrong filename)
```

### Creating a Workflow

```
Correct:   .claude/workflows/core/my-workflow.md
Incorrect: .claude/workflows/my-workflow.md (missing category)
```

### Creating a Schema

```
Correct:   .claude/schemas/my-entity.schema.json
Incorrect: .claude/schemas/my-entity.json (missing .schema suffix)
```

---

## Validation Rules (Hook Logic)

The `file-placement-guard.cjs` hook validates paths against these patterns:

```javascript
const PLACEMENT_RULES = {
  // Agent definitions
  'agents/core/': /\.md$/,
  'agents/domain/': /\.md$/,
  'agents/specialized/': /\.md$/,
  'agents/orchestrators/': /\.md$/,

  // Skills
  'skills/': /\/SKILL\.md$/,

  // Hooks
  'hooks/routing/': /\.cjs$/,
  'hooks/safety/': /\.cjs$/,
  'hooks/memory/': /\.cjs$/,
  'hooks/evolution/': /\.cjs$/,
  'hooks/session/': /\.cjs$/,
  'hooks/validation/': /\.cjs$/,
  'hooks/reflection/': /\.cjs$/,

  // Workflows
  'workflows/core/': /\.(md|yaml)$/,
  'workflows/enterprise/': /\.(md|yaml)$/,
  'workflows/operations/': /\.(md|yaml)$/,
  'workflows/rapid/': /\.(md|yaml)$/,

  // Context artifacts
  'context/plans/': /\.md$/,
  'context/reports/': /\.md$/,
  'context/artifacts/research-reports/': /\.md$/,
  'context/memory/': /\.md$/,
  'context/config/': /\.(json|yaml)$/,
  'context/runtime/': /\.json$/,
  'context/checkpoints/': /\.json$/,

  // Other
  'schemas/': /\.schema\.json$/,
  'templates/': /\.(md|yaml)$/,
  'docs/': /\.md$/,
};
```

---

## Integration with Creator Skills

All creator skills (`agent-creator`, `skill-creator`, `hook-creator`, etc.) MUST:

1. **Check Placement**: Verify output location before creating
2. **Use Correct Path**: Follow rules in this document
3. **Validate Extension**: Ensure correct file extension
4. **Register Output**: Update relevant indexes (CLAUDE.md routing table, skill-catalog.md)

See each skill's "File Placement Rules" section for skill-specific guidance.

---

## Enforcement

This document is enforced by:

| Mechanism                  | Location                | Trigger                 |
| -------------------------- | ----------------------- | ----------------------- |
| `file-placement-guard.cjs` | `.claude/hooks/safety/` | PreToolUse(Write, Edit) |
| Creator skill validation   | Each creator skill      | Before file creation    |
| CI/CD validation           | `.github/workflows/`    | On pull request         |

### Hook Behavior

- **Block Mode** (default): Prevents write and returns error
- **Warn Mode**: Allows write but prints warning
- **Off Mode**: Disabled (for debugging only)

```bash
# Override for debugging
FILE_PLACEMENT_GUARD=warn claude
FILE_PLACEMENT_GUARD=off claude  # Dangerous
```

---

## Related Documentation

- `.claude/rules/workspace-conventions.md` - Workspace naming, provenance, temp file rules
- `.claude/docs/ARTIFACT_NAMING.md` - Naming conventions for artifacts
- `.claude/docs/DEVELOPER_WORKFLOW.md` - Developer workflow guidelines
- `.claude/workflows/core/skill-lifecycle.md` - Artifact lifecycle management
- `.claude/CLAUDE.md` - Main framework documentation

---

_This document is part of the Framework Refactoring initiative (Phase 2)._
