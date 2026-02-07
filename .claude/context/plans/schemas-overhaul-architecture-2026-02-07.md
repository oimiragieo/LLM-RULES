<!-- Agent: architect | Task: #87 | Session: 2026-02-07 -->

# Schemas System Overhaul -- Architecture Plan

**Date:** 2026-02-07
**Agent:** Architect (Opus)
**Pipeline:** Enterprise Pipeline #6 -- Schemas Deep Dive
**Status:** Architecture Complete -- Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phase 1: Full Inventory](#2-phase-1-full-inventory)
3. [Phase 2: Wiring Audit](#3-phase-2-wiring-audit)
4. [Phase 3: Gap Analysis](#4-phase-3-gap-analysis)
5. [Phase 4: Schema-Creator Skill Audit](#5-phase-4-schema-creator-skill-audit)
6. [Phase 5: Disposition Matrix](#6-phase-5-disposition-matrix)
7. [ADR-088 Proposal](#7-adr-088-proposal)
8. [Implementation Sequence](#8-implementation-sequence)
9. [Risk Assessment](#9-risk-assessment)

---

## 1. Executive Summary

The `.claude/schemas/` directory contains **52 JSON schema files + 1 README.md** (53 total files). These schemas were designed to validate data structures across the agent-studio framework: agent definitions, skill frontmatter, hook configurations, workflow structures, tool manifests, and various project artifacts.

### Key Findings

| Metric | Count | Percentage |
|--------|-------|------------|
| Total schema files | 52 | 100% |
| Actually loaded in code (WIRED) | 5 | 9.6% |
| Referenced in docs only (DOCS ONLY) | 19 | 36.5% |
| No references at all (DEAD) | 28 | 53.8% |
| Missing infrastructure (ghost) | 3 | -- |
| Schema catalog exists | No | -- |
| Schema registry exists | No | -- |
| schemas/index.json exists | No | -- |
| schemas/components/ dir exists | No | -- |

**Verdict:** The schema system is 90% aspirational. Only 5 of 52 schemas are actually loaded and validated against in active code. The remaining 47 are either documentation-referenced or completely dead. The schema-creator skill itself is at v2.1 standard (the most recently updated creator) but references infrastructure that does not exist (schema-registry.json, SCHEMA_CATALOG.md, schemas/index.json).

---

## 2. Phase 1: Full Inventory

### 2.1 Schema Files (52 files + README)

| # | File Name | Size (bytes) | Format | Purpose | Naming Convention |
|---|-----------|-------------|--------|---------|-------------------|
| 1 | `adr-template.schema.json` | 3,772 | JSON Schema draft-07 | ADR template validation | OK (.schema.json) |
| 2 | `agent-capability-card.schema.json` | 9,172 | JSON Schema draft-07 | Agent registry card validation | OK |
| 3 | `agent-config.schema.json` | 860 | JSON Schema draft-07 | Agent config.json validation | OK |
| 4 | `agent-definition.schema.json` | 3,608 | JSON Schema draft-07 | Agent YAML frontmatter | OK |
| 5 | `agent-identity.json` | 6,827 | JSON Schema draft-07 | Agent personality frontmatter | WRONG (missing .schema) |
| 6 | `agent-spawn-params.json` | 4,456 | JSON Schema draft-07 | Spawn parameter validation | WRONG (missing .schema) |
| 7 | `agent-tools.json` | 5,372 | JSON Schema draft-07 | Approved tools list per agent | WRONG (missing .schema) |
| 8 | `architecture-validation.schema.json` | 755 | JSON Schema draft-07 | Architecture review output | OK |
| 9 | `artifact_manifest.schema.json` | 5,864 | JSON Schema draft-07 | Developer artifact manifest | OK (but underscore) |
| 10 | `backlog.schema.json` | 860 | JSON Schema draft-07 | Backlog structure | OK |
| 11 | `capability-routing.schema.json` | 1,474 | JSON Schema draft-07 | Routing capability matrix | OK |
| 12 | `context-definition.schema.json` | 673 | JSON Schema draft-07 | Context definition structure | OK |
| 13 | `database_architecture.schema.json` | 7,646 | JSON Schema draft-07 | Database architecture output | OK (but underscore) |
| 14 | `epic.schema.json` | 714 | JSON Schema draft-07 | Epic structure | OK |
| 15 | `epics-stories.schema.json` | 583 | JSON Schema draft-07 | Epics-stories combo | OK |
| 16 | `error-log-schema.json` | 4,569 | JSON Schema | Error log structure | WRONG (non-standard suffix) |
| 17 | `event-schema.json` | 9,914 | JSON Schema | Event bus event structure | WRONG (non-standard suffix) |
| 18 | `evolution-state.schema.json` | 9,842 | JSON Schema draft-07 | Evolution state machine | OK |
| 19 | `hook-definition.schema.json` | 3,107 | JSON Schema draft-07 | Hook YAML/config definition | OK |
| 20 | `implementation-plan.schema.json` | 747 | JSON Schema draft-07 | Implementation plan output | OK |
| 21 | `implementation-readiness.schema.json` | 526 | JSON Schema draft-07 | Implementation readiness check | OK |
| 22 | `mode-definition.schema.json` | 504 | JSON Schema draft-07 | Mode (preset) definition | OK |
| 23 | `package-manager.schema.json` | 503 | JSON Schema draft-07 | Package manager config | OK |
| 24 | `phase-models.schema.json` | 501 | JSON Schema draft-07 | Phase models config | OK |
| 25 | `plan.schema.json` | 3,004 | JSON Schema draft-07 | Plan artifact structure | OK |
| 26 | `presets.schema.json` | 652 | JSON Schema draft-07 | Presets.json validation | OK |
| 27 | `product_requirements.schema.json` | 5,558 | JSON Schema draft-07 | PRD output structure | OK (but underscore) |
| 28 | `project_brief.schema.json` | 3,363 | JSON Schema draft-07 | Project brief output | OK (but underscore) |
| 29 | `project-analysis.schema.json` | 12,797 | JSON Schema draft-07 | Project analyzer output | OK |
| 30 | `retrospective.schema.json` | 555 | JSON Schema draft-07 | Retrospective output | OK |
| 31 | `route_decision.schema.json` | 447 | JSON Schema draft-07 | Routing decision record | OK (but underscore) |
| 32 | `skillcatalog-query.schema.json` | 2,743 | JSON Schema draft-07 | Skill catalog query input | OK |
| 33 | `skillcatalog-response.schema.json` | 6,151 | JSON Schema draft-07 | Skill catalog query output | OK |
| 34 | `skill-definition.schema.json` | 2,780 | JSON Schema draft-07 | Skill YAML frontmatter | OK |
| 35 | `skill-diagram-generator-output.schema.json` | 4,484 | JSON Schema draft-07 | Diagram generator output | OK |
| 36 | `skill-manifest.schema.json` | 2,305 | JSON Schema draft-07 | Skill manifest structure | OK |
| 37 | `skill-repo-rag-output.schema.json` | 5,970 | JSON Schema draft-07 | Repo RAG search output | OK |
| 38 | `skill-test-generator-output.schema.json` | 4,547 | JSON Schema draft-07 | Test generator output | OK |
| 39 | `specification-template.schema.json` | 7,325 | JSON Schema draft-07 | Specification template valid. | OK |
| 40 | `sprint-plan.schema.json` | 504 | JSON Schema draft-07 | Sprint plan structure | OK |
| 41 | `story.schema.json` | 631 | JSON Schema draft-07 | User story structure | OK |
| 42 | `system_architecture.schema.json` | 6,162 | JSON Schema draft-07 | System architecture output | OK (but underscore) |
| 43 | `task-definition.schema.json` | 1,936 | JSON Schema draft-07 | Task definition structure | OK |
| 44 | `test_plan.schema.json` | 4,669 | JSON Schema draft-07 | Test plan structure | OK (but underscore) |
| 45 | `test-results.schema.json` | 7,225 | JSON Schema draft-07 | Test results structure | OK |
| 46 | `tool-manifest.schema.json` | 3,793 | JSON Schema draft-07 | Tool manifest validation | OK |
| 47 | `track-metadata.schema.json` | 10,036 | JSON Schema draft-07 | Track metadata structure | OK |
| 48 | `ui-audit-report.schema.json` | 747 | JSON Schema draft-07 | UI audit report output | OK |
| 49 | `user_story.schema.json` | 596 | JSON Schema draft-07 | User story structure | OK (but underscore) |
| 50 | `ux_spec.schema.json` | 6,558 | JSON Schema draft-07 | UX specification output | OK (but underscore) |
| 51 | `workflow-definition.schema.json` | 4,841 | JSON Schema draft-07 | Workflow YAML structure | OK |
| 52 | `workflow-patterns.schema.json` | 2,855 | JSON Schema draft-07 | Workflow patterns library | OK |
| -- | `README.md` | 324 | Markdown | Minimal README (3 schemas) | -- |

### 2.2 Naming Convention Issues

**4 files missing `.schema` suffix (non-standard):**
- `agent-identity.json` -- should be `agent-identity.schema.json`
- `agent-spawn-params.json` -- should be `agent-spawn-params.schema.json`
- `agent-tools.json` -- should be `agent-tools.schema.json`

**2 files with non-standard suffix:**
- `error-log-schema.json` -- should be `error-log.schema.json`
- `event-schema.json` -- should be `event.schema.json`

**8 files with underscores instead of hyphens:**
- `artifact_manifest.schema.json` -- should be `artifact-manifest.schema.json`
- `database_architecture.schema.json` -- should be `database-architecture.schema.json`
- `product_requirements.schema.json` -- should be `product-requirements.schema.json`
- `project_brief.schema.json` -- should be `project-brief.schema.json`
- `route_decision.schema.json` -- should be `route-decision.schema.json`
- `system_architecture.schema.json` -- should be `system-architecture.schema.json`
- `test_plan.schema.json` -- should be `test-plan.schema.json`
- `user_story.schema.json` -- should be `user-story.schema.json`
- `ux_spec.schema.json` -- should be `ux-spec.schema.json`

These violate the workspace-conventions rule of **lowercase kebab-case** naming.

### 2.3 Total Size

Sum: ~195 KB across 52 JSON files. Not significant for storage but represents substantial schema definition surface area.

---

## 3. Phase 2: Wiring Audit

### 3.1 Wiring Classification

Each schema is classified into one of four categories:

- **WIRED**: Actually `require()`d or `readFileSync()`d in active (non-archived) code and validated against
- **SOFT-WIRED**: Referenced as a path string in active code (e.g., existence check, comment, JSDoc) but NOT used for Ajv/validation
- **DOCS ONLY**: Referenced in documentation (markdown, YAML workflows, README) but never in executable code
- **DEAD**: No references found anywhere outside of merkle-tree.json (code index)

### 3.2 Wiring Matrix

| # | Schema File | Wiring Status | Consumers (Active Code) | Doc References |
|---|-------------|---------------|------------------------|----------------|
| 1 | `agent-capability-card.schema.json` | **WIRED** | `agent-registry-generator.cjs` (Ajv validate) | agent-creator SKILL.md |
| 2 | `agent-identity.json` | **WIRED** | `agent-parser.cjs` (Ajv compile+validate) | agent-identity-integration.md template |
| 3 | `skill-definition.schema.json` | **SOFT-WIRED** | `skill-creator/scripts/create.cjs` (_SCHEMA_PATH defined but prefixed with `_`, implying unused) | schema-creator SKILL.md |
| 4 | `skill-diagram-generator-output.schema.json` | **SOFT-WIRED** | `diagram-generator/scripts/generate.mjs` (path defined, validation optional) | -- |
| 5 | `skill-repo-rag-output.schema.json` | **SOFT-WIRED** | `repo-rag/scripts/search.mjs` (path defined, validation optional) | -- |
| 6 | `skill-test-generator-output.schema.json` | **SOFT-WIRED** | `.cursor/skills/test-generator/scripts/generate.mjs` (path defined) | -- |
| 7 | `tool-manifest.schema.json` | **SOFT-WIRED** | `generate-tool-manifest.cjs` (JSDoc comment reference only) | -- |
| 8 | `track-metadata.schema.json` | **SOFT-WIRED** | `conductor-gap-analyzer.cjs` (existence check only) | @DIRECTORY_STRUCTURE.md |
| 9 | `evolution-state.schema.json` | **SOFT-WIRED** | `self-healing/validator.cjs` (comment reference, enum values hardcoded) | -- |
| 10 | `agent-tools.json` | **ARCHIVED** | `_archive/validation/agent-tools-validator.cjs` (archived hook, not active) | -- |
| 11 | `agent-config.schema.json` | **DOCS ONLY** | -- | README.md in schemas/, lib/agents/README.md |
| 12 | `plan.schema.json` | **DOCS ONLY** | -- | GETTING_STARTED.md |
| 13 | `project_brief.schema.json` | **DOCS ONLY** | -- | GETTING_STARTED.md, .cursor/subagents/analyst.mdc |
| 14 | `product_requirements.schema.json` | **DOCS ONLY** | -- | GETTING_STARTED.md, .cursor/subagents/pm.mdc |
| 15 | `presets.schema.json` | **DOCS ONLY** | -- | docs/GETTING_STARTED.md |
| 16 | `specification-template.schema.json` | **DOCS ONLY** | -- | templates/specification-template.md, template-renderer SKILL.md |
| 17 | `adr-template.schema.json` | **DOCS ONLY** | -- | CHANGELOG.md, templates/adr-template.md |
| 18 | `test_plan.schema.json` | **DOCS ONLY** | -- | .cursor/subagents/qa.mdc |
| 19 | `ux_spec.schema.json` | **DOCS ONLY** | -- | .cursor/subagents/ux-expert.mdc |
| 20 | `artifact_manifest.schema.json` | **DOCS ONLY** | -- | .cursor/subagents/developer.mdc |
| 21 | `system_architecture.schema.json` | **DOCS ONLY** | -- | .cursor/subagents/architect.mdc |
| 22 | `project-analysis.schema.json` | **DOCS ONLY** | -- | project-analyzer SKILL.md, tools/project-analyzer/README.md |
| 23 | `hook-definition.schema.json` | **DOCS ONLY** | -- | schema-creator SKILL.md, hook-creator SKILL.md |
| 24 | `workflow-definition.schema.json` | **DOCS ONLY** | -- | schema-creator SKILL.md, workflow-creator SKILL.md |
| 25 | `agent-definition.schema.json` | **DOCS ONLY** | -- | schema-creator SKILL.md (canonical reference) |
| 26 | `phase-models.schema.json` | **DOCS ONLY** | -- | README.md in schemas/, lib/config/README.md |
| 27 | `implementation-plan.schema.json` | **DOCS ONLY** | -- | README.md in schemas/ |
| 28 | `agent-spawn-params.json` | **DOCS ONLY** | -- | -- (only in merkle-tree, no meaningful references) |
| 29 | `test-results.schema.json` | **DOCS ONLY** | -- | schema-creator SKILL.md |
| 30 | `capability-routing.schema.json` | **DEAD** | -- | -- |
| 31 | `context-definition.schema.json` | **DEAD** | -- | -- |
| 32 | `database_architecture.schema.json` | **DEAD** | -- | -- |
| 33 | `epic.schema.json` | **DEAD** | -- | -- |
| 34 | `epics-stories.schema.json` | **DEAD** | -- | -- |
| 35 | `error-log-schema.json` | **DEAD** | -- | -- |
| 36 | `event-schema.json` | **DEAD** | -- | -- |
| 37 | `architecture-validation.schema.json` | **DEAD** | -- | -- |
| 38 | `backlog.schema.json` | **DEAD** | -- | -- |
| 39 | `implementation-readiness.schema.json` | **DEAD** | -- | -- |
| 40 | `mode-definition.schema.json` | **DEAD** | -- | -- |
| 41 | `package-manager.schema.json` | **DEAD** | -- | -- |
| 42 | `retrospective.schema.json` | **DEAD** | -- | -- |
| 43 | `route_decision.schema.json` | **DEAD** | -- | -- |
| 44 | `skillcatalog-query.schema.json` | **DEAD** | -- | -- |
| 45 | `skillcatalog-response.schema.json` | **DEAD** | -- | -- |
| 46 | `skill-manifest.schema.json` | **DEAD** | -- | -- |
| 47 | `sprint-plan.schema.json` | **DEAD** | -- | -- |
| 48 | `story.schema.json` | **DEAD** | -- | -- |
| 49 | `task-definition.schema.json` | **DEAD** | -- | -- |
| 50 | `ui-audit-report.schema.json` | **DEAD** | -- | -- |
| 51 | `user_story.schema.json` | **DEAD** | -- | -- |
| 52 | `workflow-patterns.schema.json` | **DEAD** | -- | -- |

### 3.3 Wiring Summary

| Category | Count | Files |
|----------|-------|-------|
| **WIRED** (Ajv validate) | 2 | agent-capability-card, agent-identity |
| **SOFT-WIRED** (path ref, optional/comment) | 7 | skill-definition, skill-diagram-generator-output, skill-repo-rag-output, skill-test-generator-output, tool-manifest, track-metadata, evolution-state |
| **ARCHIVED** (consumed by archived hooks only) | 1 | agent-tools |
| **DOCS ONLY** (markdown/YAML references) | 19 | adr-template, agent-config, agent-definition, agent-spawn-params, artifact-manifest, hook-definition, implementation-plan, phase-models, plan, presets, product-requirements, project-analysis, project-brief, specification-template, system-architecture, test-plan, test-results, ux-spec, workflow-definition |
| **DEAD** (no references) | 23 | architecture-validation, backlog, capability-routing, context-definition, database-architecture, epic, epics-stories, error-log-schema, event-schema, implementation-readiness, mode-definition, package-manager, retrospective, route-decision, skillcatalog-query, skillcatalog-response, skill-manifest, sprint-plan, story, task-definition, ui-audit-report, user-story, workflow-patterns |

---

## 4. Phase 3: Gap Analysis

### 4.1 Dead Schemas (23 files, ~53.8%)

These 23 schemas have zero references in any active code, documentation, or workflow:

```
architecture-validation.schema.json    backlog.schema.json
capability-routing.schema.json         context-definition.schema.json
database_architecture.schema.json      epic.schema.json
epics-stories.schema.json              error-log-schema.json
event-schema.json                      implementation-readiness.schema.json
mode-definition.schema.json            package-manager.schema.json
retrospective.schema.json              route_decision.schema.json
skillcatalog-query.schema.json         skillcatalog-response.schema.json
skill-manifest.schema.json             sprint-plan.schema.json
story.schema.json                      task-definition.schema.json
ui-audit-report.schema.json            user_story.schema.json
workflow-patterns.schema.json
```

**Root cause:** These were bulk-generated during initial project scaffolding (Auto-Claude deep-dive integration per README.md). They define validation for artifacts that were never implemented (sprint plans, backlogs, epics, stories, retrospectives) or for systems that evolved away from their original design (capability-routing, skillcatalog query/response).

### 4.2 Missing Infrastructure (Ghost References)

The schema-creator SKILL.md and workflow YAML files reference infrastructure that does not exist:

| Missing Item | Referenced By | Impact |
|-------------|---------------|--------|
| `.claude/context/artifacts/schema-registry.json` | schema-creator SKILL.md Step 7 | Schema discovery system non-functional |
| `.claude/docs/SCHEMA_CATALOG.md` | schema-creator SKILL.md Step 7 | No schema catalog for agent discovery |
| `.claude/schemas/index.json` | schema-updater-workflow.yaml (lines 24, 293, 347) | Schema index non-functional |
| `.claude/schemas/components/` directory | schema-creator SKILL.md Step 2 | Reusable schema components not supported |
| Schema catalog (like skill-catalog.md) | -- | No equivalent exists for schemas |

### 4.3 Ghost Schemas (Referenced in CHANGELOG but Missing)

The CHANGELOG references schemas that were planned but never created or were deleted:

| Schema Name | CHANGELOG Line | Status |
|------------|----------------|--------|
| `feature-flags.schema.json` | 1100 | Never created |
| `memory-state.schema.json` | 1200 | Never created |
| `session-state.schema.json` | 1201 | Never created |
| `memory-entry.schema.json` | 1202 | Never created |
| `handoff-message.schema.json` | 1203 | Never created |
| `entity-registry.schema.json` | 1204 | Never created |
| `scoring-result.schema.json` | 1205 | Never created |
| `agent-outputs/` subdirectory | 782 | Never created (10 planned schemas) |
| `workflow-schema.json` | lib/workflow/README.md | Never created |
| `hook-schema.json` | hook-creator SKILL.md | Never created |

### 4.4 Partial Wiring (Schemas Referenced but NOT Enforced)

These schemas are defined as paths in code but validation is either optional or commented out:

| Schema | Code Location | Issue |
|--------|---------------|-------|
| `skill-definition.schema.json` | `skill-creator/scripts/create.cjs:91` | Variable prefixed with `_` (unused convention) -- schema defined but never passed to Ajv |
| `evolution-state.schema.json` | `self-healing/validator.cjs:28` | Enum values from schema are hardcoded in code comment; schema file NOT loaded |
| `tool-manifest.schema.json` | `generate-tool-manifest.cjs:225` | JSDoc comment only -- no runtime validation |
| `track-metadata.schema.json` | `conductor-gap-analyzer.cjs:325` | Existence check only (`_fileExists`) -- never loaded or validated against |
| `skill-diagram-generator-output.schema.json` | `diagram-generator/scripts/generate.mjs:851` | Path defined, validation likely optional/skipped |
| `skill-repo-rag-output.schema.json` | `repo-rag/scripts/search.mjs:748` | Path defined, validation likely optional/skipped |
| `skill-test-generator-output.schema.json` | `.cursor/skills/test-generator/scripts/generate.mjs:740` | Path defined, in .cursor (not .claude) |

### 4.5 Documentation Gaps

| Gap | Description | Impact |
|-----|-------------|--------|
| No schema catalog | Unlike skills (skill-catalog.md), templates (template-catalog.md), and commands (command-catalog.md), schemas have no catalog | Agents cannot discover available schemas |
| README is minimal | Only lists 3 schemas; 52 exist | Misleading |
| CLAUDE.md has no schemas section | Section 9 (Directory Structure) mentions schemas path but no schema listing | Router cannot guide agents to use schemas |
| No schema validation hook | No active PreToolUse hook validates data against schemas | Schemas exist but are never enforced at runtime |
| FILE_PLACEMENT_RULES mentions `.schema.json` convention | But 5 files violate it | Naming inconsistency |

### 4.6 Missing Schemas (Validation That Should Exist)

Based on the framework architecture, the following schemas are conspicuously absent:

| Should Exist | Purpose | Why Missing |
|-------------|---------|-------------|
| `command-definition.schema.json` | Validate command frontmatter (description, disable-model-invocation) | Commands are simple but inconsistently formatted |
| `spawn-prompt.schema.json` | Validate spawn prompt structure (required TaskUpdate box, task ID, etc.) | Spawn prompts are validated by hook but no schema |
| `memory-entry.schema.json` | Validate learnings.md/decisions.md/issues.md entries | Memory protocol has no structural validation |
| `config-yaml.schema.json` | Validate .claude/config.yaml structure | config.yaml has no schema; validated ad-hoc in code |

---

## 5. Phase 4: Schema-Creator Skill Audit

### 5.1 Version Assessment

The schema-creator SKILL.md is at **v2.1.0** (per frontmatter `version: 2.1.0`). This is the correct version for the v2.1 creator standard.

### 5.2 Comparison to v2.1 Standard

| Dimension | v2.1 Standard | Schema-Creator | Status |
|-----------|---------------|----------------|--------|
| Frontmatter version | 2.1.0 | 2.1.0 | PASS |
| WARNING BOX (no direct writes) | Required | Present (System Impact Analysis) | PARTIAL -- no explicit WARNING BOX like skill-creator |
| Research-synthesis mandate | Step 0 | Missing | FAIL |
| Existence check / updater delegation | Step 0 | Present (Step 0) | PASS |
| Blocking post-creation steps | Required | Present (Step 7 + Step 8) | PASS |
| Catalog update (blocking) | Required | References SCHEMA_CATALOG.md (does not exist) | FAIL (phantom) |
| Registry update | Required | References schema-registry.json (does not exist) | FAIL (phantom) |
| CLAUDE.md update | Required | Present (conditional) | PASS |
| Consumer/agent assignment | Required | Not present | FAIL |
| Architecture Compliance section | Required | Not present | FAIL |
| Integration verification | Required | Not present | FAIL |
| Iron Laws | 8-11 items | 8 items | PARTIAL |
| Completion Checklist | 10-15 items | 10 items | PARTIAL |
| Memory Protocol | Required | Present | PASS |
| Cross-reference Creator Ecosystem | Required | Present | PASS |
| Existing Schemas Reference table | Required | Present (7 schemas listed, 52 exist) | FAIL (incomplete) |

### 5.3 Creator Guard Integration

The `unified-creator-guard.cjs` (line 107-111) correctly protects `.claude/schemas/` paths:

```javascript
{
  creator: 'schema-creator',
  patterns: [/\.claude[/\\]schemas[/\\][^/\\]+\.(?:schema\.)?json$/i],
  artifactType: 'schema',
  primaryFile: '*.schema.json',
}
```

The regex `\.(?:schema\.)?json$` correctly matches both `.schema.json` AND `.json` files, covering the naming-inconsistent files (agent-identity.json, agent-tools.json, etc.).

The pre-execute hook (`schema-creator/hooks/pre-execute.cjs`) correctly marks the creator as active in `active-creators.json`, matching the pattern used by all other creators.

### 5.4 Schema-Creator Gaps Summary

1. **GAP-SC-1**: No research-synthesis mandate (Step 0 missing)
2. **GAP-SC-2**: References schema-registry.json that does not exist
3. **GAP-SC-3**: References SCHEMA_CATALOG.md that does not exist
4. **GAP-SC-4**: References schemas/index.json that does not exist
5. **GAP-SC-5**: No consumer/agent assignment step
6. **GAP-SC-6**: No Architecture Compliance section
7. **GAP-SC-7**: No integration verification step
8. **GAP-SC-8**: Existing Schemas Reference table lists 7 of 52 schemas
9. **GAP-SC-9**: No explicit WARNING BOX matching other creators

---

## 6. Phase 5: Disposition Matrix

### 6.1 Schema Disposition

| # | Schema | Size | Disposition | Reason |
|---|--------|------|-------------|--------|
| 1 | `agent-capability-card.schema.json` | 9,172 | **KEEP AS-IS** | WIRED -- actively used by agent-registry-generator.cjs with Ajv |
| 2 | `agent-identity.json` | 6,827 | **FIX NAMING** | WIRED -- actively used by agent-parser.cjs. Rename to `agent-identity.schema.json` |
| 3 | `agent-definition.schema.json` | 3,608 | **FIX WIRING** | DOCS ONLY -- designated as canonical reference schema but never loaded. Wire to agent-creator validation |
| 4 | `skill-definition.schema.json` | 2,780 | **FIX WIRING** | SOFT-WIRED -- `_SCHEMA_PATH` defined but unused. Wire to skill-creator validation |
| 5 | `hook-definition.schema.json` | 3,107 | **FIX WIRING** | DOCS ONLY -- Wire to hook-creator validation |
| 6 | `workflow-definition.schema.json` | 4,841 | **FIX WIRING** | DOCS ONLY -- Wire to workflow-creator validation |
| 7 | `evolution-state.schema.json` | 9,842 | **FIX WIRING** | SOFT-WIRED -- enum values hardcoded in validator.cjs comment. Wire to actual Ajv validation |
| 8 | `tool-manifest.schema.json` | 3,793 | **FIX WIRING** | SOFT-WIRED -- JSDoc only. Wire to generate-tool-manifest.cjs validation |
| 9 | `presets.schema.json` | 652 | **FIX WIRING** | DOCS ONLY -- Referenced in GETTING_STARTED.md. Wire to presets loading code |
| 10 | `agent-config.schema.json` | 860 | **FIX WIRING** | DOCS ONLY -- Referenced in README. Wire to agent-config-reader.cjs |
| 11 | `plan.schema.json` | 3,004 | **KEEP (DOCS)** | Referenced in GETTING_STARTED.md for user guidance |
| 12 | `project_brief.schema.json` | 3,363 | **KEEP (DOCS)** | Referenced in GETTING_STARTED.md + .cursor/analyst.mdc |
| 13 | `product_requirements.schema.json` | 5,558 | **KEEP (DOCS)** | Referenced in GETTING_STARTED.md + .cursor/pm.mdc |
| 14 | `specification-template.schema.json` | 7,325 | **KEEP (DOCS)** | Referenced in template and template-renderer SKILL.md |
| 15 | `test_plan.schema.json` | 4,669 | **KEEP (DOCS)** | Referenced in .cursor/qa.mdc |
| 16 | `ux_spec.schema.json` | 6,558 | **KEEP (DOCS)** | Referenced in .cursor/ux-expert.mdc |
| 17 | `artifact_manifest.schema.json` | 5,864 | **KEEP (DOCS)** | Referenced in .cursor/developer.mdc |
| 18 | `system_architecture.schema.json` | 6,162 | **KEEP (DOCS)** | Referenced in .cursor/architect.mdc |
| 19 | `project-analysis.schema.json` | 12,797 | **KEEP (DOCS)** | Referenced in project-analyzer SKILL.md |
| 20 | `adr-template.schema.json` | 3,772 | **KEEP (DOCS)** | Referenced in CHANGELOG, adr-template.md |
| 21 | `track-metadata.schema.json` | 10,036 | **KEEP (DOCS)** | Referenced in @DIRECTORY_STRUCTURE.md, conductor-gap-analyzer |
| 22 | `test-results.schema.json` | 7,225 | **KEEP (DOCS)** | Referenced in schema-creator SKILL.md |
| 23 | `phase-models.schema.json` | 501 | **KEEP (DOCS)** | Referenced in schemas/README.md, lib/config/README.md |
| 24 | `implementation-plan.schema.json` | 747 | **KEEP (DOCS)** | Referenced in schemas/README.md |
| 25 | `skill-diagram-generator-output.schema.json` | 4,484 | **KEEP (SOFT)** | Path defined in generate.mjs |
| 26 | `skill-repo-rag-output.schema.json` | 5,970 | **KEEP (SOFT)** | Path defined in search.mjs |
| 27 | `skill-test-generator-output.schema.json` | 4,547 | **KEEP (SOFT)** | Path defined in generate.mjs |
| 28 | `skillcatalog-query.schema.json` | 2,743 | **DELETE** | Dead -- no references |
| 29 | `skillcatalog-response.schema.json` | 6,151 | **DELETE** | Dead -- no references |
| 30 | `skill-manifest.schema.json` | 2,305 | **DELETE** | Dead -- no references |
| 31 | `agent-tools.json` | 5,372 | **DELETE** | Only consumer is archived hook |
| 32 | `agent-spawn-params.json` | 4,456 | **DELETE** | Dead -- no active references |
| 33 | `architecture-validation.schema.json` | 755 | **DELETE** | Dead -- no references |
| 34 | `backlog.schema.json` | 860 | **DELETE** | Dead -- Agile artifact never implemented |
| 35 | `capability-routing.schema.json` | 1,474 | **DELETE** | Dead -- routing evolved away from this |
| 36 | `context-definition.schema.json` | 673 | **DELETE** | Dead -- no references |
| 37 | `database_architecture.schema.json` | 7,646 | **DELETE** | Dead -- no references |
| 38 | `epic.schema.json` | 714 | **DELETE** | Dead -- Agile artifact never implemented |
| 39 | `epics-stories.schema.json` | 583 | **DELETE** | Dead -- Agile artifact never implemented |
| 40 | `error-log-schema.json` | 4,569 | **DELETE** | Dead -- no references |
| 41 | `event-schema.json` | 9,914 | **DELETE** | Dead -- event bus evolved differently |
| 42 | `implementation-readiness.schema.json` | 526 | **DELETE** | Dead -- no references |
| 43 | `mode-definition.schema.json` | 504 | **DELETE** | Dead -- presets schema covers this |
| 44 | `package-manager.schema.json` | 503 | **DELETE** | Dead -- no references |
| 45 | `retrospective.schema.json` | 555 | **DELETE** | Dead -- Agile artifact never implemented |
| 46 | `route_decision.schema.json` | 447 | **DELETE** | Dead -- routing decisions not schema-validated |
| 47 | `sprint-plan.schema.json` | 504 | **DELETE** | Dead -- Agile artifact never implemented |
| 48 | `story.schema.json` | 631 | **DELETE** | Dead -- Agile artifact never implemented |
| 49 | `task-definition.schema.json` | 1,936 | **DELETE** | Dead -- tasks use host-provided tools |
| 50 | `ui-audit-report.schema.json` | 747 | **DELETE** | Dead -- no references |
| 51 | `user_story.schema.json` | 596 | **DELETE** | Dead -- Agile artifact never implemented |
| 52 | `workflow-patterns.schema.json` | 2,855 | **DELETE** | Dead -- no references |

### 6.2 Disposition Summary

| Disposition | Count | Action |
|-------------|-------|--------|
| **KEEP AS-IS** | 1 | No changes needed |
| **FIX NAMING** | 1 | Rename file + update consumers |
| **FIX WIRING** | 8 | Connect to actual Ajv validation |
| **KEEP (DOCS)** | 14 | Already referenced in docs/subagents -- leave but document properly |
| **KEEP (SOFT)** | 3 | Path defined in tools -- leave |
| **DELETE** | 25 | Archive via `git mv` to `.claude/schemas/_archive/` |

### 6.3 Post-Overhaul State

After implementation:
- **Active schemas:** 27 (from 52)
- **Actively validated (Ajv):** 10 (from 2) -- 5x increase
- **Dead schemas removed:** 25

### 6.4 Documentation Actions

| Document | Action |
|----------|--------|
| `.claude/schemas/README.md` | Rewrite -- complete inventory of all 27 remaining schemas |
| Create `schema-catalog.md` | New file at `.claude/context/artifacts/catalogs/schema-catalog.md` |
| `@DIRECTORY_STRUCTURE.md` | Update schemas section |
| `CLAUDE.md` | Add schemas reference (Section 9 or new subsection) |
| `FILE_PLACEMENT_RULES.md` | Already correct -- no changes |
| Schema-creator SKILL.md | Fix phantom references (GAP-SC-2 through GAP-SC-9) |
| Schema-updater-workflow.yaml | Fix schemas/index.json reference |
| Schema-creator-workflow.yaml | Review for accuracy |

---

## 7. ADR-088 Proposal

### ADR-088: Schemas System Overhaul -- Dead Schema Cleanup + Wiring Activation

**Date:** 2026-02-07

**Status:** Proposed

**Context:**

Audit of `.claude/schemas/` found 52 schema files with only 2 (3.8%) actively loaded and validated against via Ajv in runtime code. 25 schemas (48%) have zero references anywhere in the codebase. The remaining schemas are referenced only in documentation or have path strings defined in code without actual validation. The schema-creator skill references three infrastructure pieces that do not exist (schema-registry.json, SCHEMA_CATALOG.md, schemas/index.json). No schema catalog exists, unlike the parallel catalogs for skills, templates, and commands.

**Decision:**

1. **Archive 25 dead schemas** to `.claude/schemas/_archive/` via `git mv` (preserves history).
2. **Fix naming** for `agent-identity.json` (rename to `agent-identity.schema.json`, update 2 consumers).
3. **Wire 8 schemas** to actual Ajv validation in their natural consumers:
   - `agent-definition.schema.json` in agent-creator validation
   - `skill-definition.schema.json` in skill-creator validation
   - `hook-definition.schema.json` in hook-creator validation
   - `workflow-definition.schema.json` in workflow-creator validation
   - `evolution-state.schema.json` in self-healing validator
   - `tool-manifest.schema.json` in generate-tool-manifest
   - `presets.schema.json` in preset loading
   - `agent-config.schema.json` in agent-config-reader
4. **Create schema catalog** at `.claude/context/artifacts/catalogs/schema-catalog.md`.
5. **Rewrite schemas README** with complete inventory.
6. **Fix schema-creator SKILL.md** phantom references.
7. **Fix schema-updater-workflow.yaml** `schemas/index.json` reference.
8. **Do NOT create** schema-registry.json or schemas/index.json (catalog + README sufficient).

**Alternatives Considered:**

1. **Delete all dead schemas permanently:** Rejected -- some may have reference value for future features. Archive preserves git history.
2. **Wire all 52 schemas:** Rejected -- many schemas validate artifacts that don't exist in the current system (backlogs, epics, sprints).
3. **Create full schema registry infrastructure:** Rejected -- adding schema-registry.json, index.json, and components/ adds complexity without proportional value. The markdown catalog approach used by skills/templates/commands is proven.
4. **Leave as-is:** Rejected -- 90% unused schemas inflate the directory, mislead agents, and waste context.

**Rationale:**

- Archive via `git mv` is the proven pattern (used for templates in Pipeline #3, hooks in Phase 2)
- Wiring 8 schemas to Ajv activates actual validation, moving from 3.8% to ~37% active utilization
- Catalog provides discoverability consistent with skill-catalog, template-catalog, command-catalog
- Fixing phantom references prevents agents from trying to update infrastructure that doesn't exist

**Consequences:**

- Schema directory goes from 52 to 27 files (48% reduction)
- Active validation increases from 2 to 10 schemas (5x improvement)
- Schema-creator skill accurately reflects available infrastructure
- Agents can discover schemas via catalog
- 25 archived schemas preserved in `_archive/` with `git mv` history

---

## 8. Implementation Sequence

### Phase 1: Dead Schema Cleanup (Developer task, ~2 hours)

1. Create `.claude/schemas/_archive/` directory
2. Create comprehensive `_archive/README.md` (rationale, restoration instructions)
3. `git mv` 25 dead schemas to `_archive/`
4. Verify no active code references break

### Phase 2: Naming Fixes (Developer task, ~30 minutes)

1. Rename `agent-identity.json` to `agent-identity.schema.json`
2. Update `agent-parser.cjs` import path
3. Update `agent-identity-integration.md` template reference
4. Verify Ajv validation still works

### Phase 3: Wiring Activation (Developer task, ~4 hours, TDD)

For each of the 8 schemas to wire:
1. Write RED test (schema loaded, data validated against it)
2. Wire schema into consumer code (GREEN)
3. Refactor if needed
4. Priority order:
   - `evolution-state.schema.json` (self-healing validator -- highest impact)
   - `agent-definition.schema.json` (agent-creator -- framework integrity)
   - `skill-definition.schema.json` (skill-creator -- framework integrity)
   - `hook-definition.schema.json` (hook-creator)
   - `workflow-definition.schema.json` (workflow-creator)
   - `tool-manifest.schema.json` (tool manifest generator)
   - `agent-config.schema.json` (agent config reader)
   - `presets.schema.json` (preset loading)

### Phase 4: Documentation (Developer/Technical-Writer task, ~2 hours)

1. Create `.claude/context/artifacts/catalogs/schema-catalog.md` (27 schemas)
2. Rewrite `.claude/schemas/README.md`
3. Update `@DIRECTORY_STRUCTURE.md` schemas section
4. Add schemas catalog reference to `CLAUDE.md`

### Phase 5: Schema-Creator Skill Fixes (Developer task, ~1 hour)

1. Remove phantom schema-registry.json references
2. Remove phantom SCHEMA_CATALOG.md references (replace with actual catalog path)
3. Remove phantom schemas/index.json references
4. Update Existing Schemas Reference table (7 -> 27 entries)
5. Add research-synthesis mandate
6. Add WARNING BOX
7. Add Architecture Compliance section
8. Add consumer/agent assignment step

### Phase 6: Workflow YAML Fixes (Developer task, ~30 minutes)

1. Fix schema-updater-workflow.yaml `schemas/index.json` reference
2. Review schema-creator-workflow.yaml for accuracy

### Phase 7: QA Validation (QA task, ~1 hour)

1. File inventory (27 active + 25 archived = 52)
2. Naming convention compliance (all kebab-case with .schema.json)
3. Wiring verification (10 schemas loaded via Ajv)
4. Catalog completeness (27 entries)
5. Dead reference scan (zero references to archived schemas from active code)
6. Test suite regression check

### Estimated Total Effort: ~11 hours across 7 phases

### Task Dependency Graph

```
Phase 1 (Cleanup) -> Phase 2 (Naming) -> Phase 3 (Wiring)
Phase 1 (Cleanup) -> Phase 4 (Docs)
Phase 3 (Wiring) -> Phase 5 (Creator Fixes) -> Phase 6 (Workflow YAML)
Phase 4 (Docs) + Phase 6 (Workflow YAML) -> Phase 7 (QA)
```

---

## 9. Risk Assessment

### 9.1 Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wiring breaks existing tests | Medium | Medium | TDD approach -- RED/GREEN/REFACTOR |
| agent-identity.json rename breaks imports | Low | High | Only 2 consumers; update both + verify |
| Archived schema needed later | Low | Low | `git mv` preserves history; trivial restore |
| Ajv not installed (runtime) | Low | Medium | All Ajv consumers already use graceful degradation (try/catch) |
| Schema-creator phantom removal breaks skill | Low | Low | Phantom references point to files that never existed |
| Naming convention changes break CHANGELOG refs | Low | None | CHANGELOG is historical; no active code depends on it |

### 9.2 Rollback Strategy

Each phase is independently reversible:
- Phase 1: `git mv _archive/* .` (restore archived schemas)
- Phase 2: Rename file back
- Phase 3: Remove Ajv validation calls
- Phase 4: Revert documentation
- Phase 5: Revert SKILL.md
- Phase 6: Revert YAML

### 9.3 Non-Risks

| Concern | Why Not a Risk |
|---------|----------------|
| Breaking `.cursor` subagents | `.cursor` subagents reference schemas in DOCS ONLY (validation commands are suggestions, not enforced) |
| Breaking GETTING_STARTED.md | It references schemas as guidance; schemas are being KEPT not deleted |
| unified-creator-guard regex change | No regex change needed; guard already handles `.json` and `.schema.json` |

---

## Appendix A: Schema-Creator Ecosystem Map

```
                    +-----------------+
                    |  schema-creator |
                    |   (SKILL.md)    |
                    +--------+--------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v--+   +------v-----+  +-----v------+
     | pre-exec  |   | main.cjs   |  | post-exec  |
     | hook      |   | (CLI tool) |  | hook       |
     +--------+--+   +------+-----+  +-----+------+
              |              |              |
              v              v              v
     active-creators.json   .claude/schemas/   cleanup
              |
              v
     unified-creator-guard.cjs
     (blocks writes unless active)
```

## Appendix B: Wiring Activation Architecture

```
BEFORE (current state):
  52 schemas -> 2 validated (3.8%)

AFTER (post-overhaul):
  27 schemas -> 10 validated (37%)

Consumer Map:
  agent-registry-generator.cjs  -- validates --> agent-capability-card.schema.json  [existing]
  agent-parser.cjs              -- validates --> agent-identity.schema.json         [existing]
  self-healing/validator.cjs    -- validates --> evolution-state.schema.json        [NEW]
  agent-creator (validation)    -- validates --> agent-definition.schema.json       [NEW]
  skill-creator (validation)    -- validates --> skill-definition.schema.json       [NEW]
  hook-creator (validation)     -- validates --> hook-definition.schema.json        [NEW]
  workflow-creator (validation) -- validates --> workflow-definition.schema.json    [NEW]
  generate-tool-manifest.cjs    -- validates --> tool-manifest.schema.json          [NEW]
  agent-config-reader.cjs       -- validates --> agent-config.schema.json           [NEW]
  preset-loader (if exists)     -- validates --> presets.schema.json                [NEW]
```

---

**End of Architecture Plan**
