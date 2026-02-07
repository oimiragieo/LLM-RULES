<!-- Agent: developer | Task: #90 | Session: 2026-02-07 -->

# Schema Catalog

**Last Updated:** 2026-02-07
**Total Active Schemas:** 27
**Archived Schemas:** 25 (see `.claude/schemas/_archive/README.md`)

This catalog documents all active JSON schemas in the agent-studio framework with their wiring status, consumers, and validation categories.

---

## Wiring Status Summary

| Status | Count | Description |
|--------|-------|-------------|
| **WIRED (Ajv)** | 8 | Actively validated via Ajv at runtime |
| **SOFT-WIRED** | 3 | Path referenced in code, validation optional |
| **DOCS ONLY** | 16 | Referenced in documentation or templates only |
| **Total Active** | 27 | All schemas in `.claude/schemas/` |

---

## 1. Agent Schemas (5 schemas)

### agent-capability-card.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/agent-capability-card.schema.json` |
| **Category** | Agent |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/scripts/generate-agent-registry.cjs` |
| **Validation** | Advisory (validates agent capability card structure) |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Validates agent capability card structure used by agent registry generator.

---

### agent-config.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/agent-config.schema.json` |
| **Category** | Agent |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/lib/agents/agent-config.cjs` |
| **Validation** | Advisory via `validateConfig()` |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates agent configuration (tools, thinking defaults, phase assignments).

**Note:** Current schema has `additionalProperties: false` which excludes the `model` field used in actual data. Schema should be updated to include `model` field.

---

### agent-definition.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/agent-definition.schema.json` |
| **Category** | Agent |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/lib/agents/agent-parser.cjs` |
| **Validation** | Advisory via `validateDefinition()` |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates agent definition markdown frontmatter (name, description, capabilities, tools).

---

### agent-identity.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/agent-identity.schema.json` |
| **Category** | Agent |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/lib/agents/agent-parser.cjs` |
| **Validation** | Ajv validated (pre-existing integration) |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Validates agent identity fields (personality, tone, behavior patterns) for agents with identity frontmatter.

**Note:** Renamed from `agent-identity.json` to `agent-identity.schema.json` in Phase 2 for naming consistency.

---

### agent-spawn-params.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/agent-spawn-params.json` |
| **Category** | Agent |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | None (documentation reference only) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Documents agent spawn parameter structure for reference.

**Note:** Missing `.schema` suffix (documented naming inconsistency).

---

## 2. Skill Schemas (4 schemas)

### skill-definition.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/skill-definition.schema.json` |
| **Category** | Skill |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/skills/skill-creator/scripts/create.cjs` |
| **Validation** | Advisory via `validateSkill()` using `_validateData` |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates skill SKILL.md frontmatter structure (name, description, tools, integration).

---

### skill-diagram-generator-output.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/skill-diagram-generator-output.schema.json` |
| **Category** | Skill |
| **Wiring Status** | SOFT-WIRED |
| **Consumer** | `.claude/skills/diagram-generator/scripts/generate.mjs` (path defined) |
| **Validation** | Optional/skipped |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines output structure for skill diagram generator (Mermaid diagrams).

---

### skill-repo-rag-output.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/skill-repo-rag-output.schema.json` |
| **Category** | Skill |
| **Wiring Status** | SOFT-WIRED |
| **Consumer** | `.claude/skills/repo-rag/scripts/search.mjs` (path defined) |
| **Validation** | Optional/skipped |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines RAG search result structure for repository knowledge retrieval.

---

### skill-test-generator-output.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/skill-test-generator-output.schema.json` |
| **Category** | Skill |
| **Wiring Status** | SOFT-WIRED |
| **Consumer** | `.cursor/skills/test-generator/scripts/generate.mjs` (path defined) |
| **Validation** | Optional/skipped |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines test generation output structure.

**Note:** Consumer is in `.cursor/` directory, not `.claude/`.

---

## 3. Workflow & Hook Schemas (2 schemas)

### workflow-definition.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/workflow-definition.schema.json` |
| **Category** | Workflow |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | None (no workflow-creator scripts exist) |
| **Validation** | Not validated at runtime |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Defines workflow markdown structure for workflow-creator (not yet implemented).

**Note:** Attempted wiring in Task #89 but no integration point found (no workflow-creator scripts).

---

### hook-definition.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/hook-definition.schema.json` |
| **Category** | Hook |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | None (no hook-creator scripts exist) |
| **Validation** | Not validated at runtime |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Defines hook script structure for hook-creator (not yet implemented).

**Note:** Attempted wiring in Task #89 but no integration point found (no hook-creator scripts).

---

## 4. Evolution & Project Schemas (2 schemas)

### evolution-state.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/evolution-state.schema.json` |
| **Category** | Evolution |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/lib/self-healing/validator.cjs` |
| **Validation** | Advisory via `validateStateWithSchema()` |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates evolution workflow state machine structure (EVOLVE phases).

---

### track-metadata.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/track-metadata.schema.json` |
| **Category** | Project |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | `.claude/lib/conductor/conductor-gap-analyzer.cjs` (existence check only) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines track metadata structure for conductor workflow (path check only, not validated).

---

## 5. Tool & Template Schemas (3 schemas)

### tool-manifest.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/tool-manifest.schema.json` |
| **Category** | Tool |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/scripts/generate-tool-manifest.cjs` |
| **Validation** | Advisory (pre-existing integration) |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Validates tool manifest structure for framework tool discovery.

**Note:** Already wired before Task #89 (pre-existing integration).

---

### presets.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/presets.schema.json` |
| **Category** | Template |
| **Wiring Status** | WIRED (Ajv) |
| **Consumer** | `.claude/lib/spawn/prompt-assembler.cjs` |
| **Validation** | Advisory via `validatePresets()` |
| **$schema** | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates preset configuration structure for spawn prompt customization.

---

### adr-template.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/adr-template.schema.json` |
| **Category** | Template |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | `.claude/templates/adr-template.md` (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines ADR (Architecture Decision Record) template structure.

---

## 6. Planning & Testing Schemas (7 schemas)

### plan.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/plan.schema.json` |
| **Category** | Planning |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Planner agent (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines plan document structure for planner agents.

---

### implementation-plan.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/implementation-plan.schema.json` |
| **Category** | Planning |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Planner/developer agents (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines implementation plan structure with phases, tasks, and deliverables.

---

### phase-models.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/phase-models.schema.json` |
| **Category** | Planning |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Workflow state machine (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines phase model structure for enterprise orchestration workflow.

---

### test_plan.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/test_plan.schema.json` |
| **Category** | Testing |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | QA agent (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines test plan structure for QA workflows.

**Note:** Uses underscore instead of hyphen (documented naming inconsistency).

---

### test-results.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/test-results.schema.json` |
| **Category** | Testing |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | QA agent (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines test execution results structure.

---

### product_requirements.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/product_requirements.schema.json` |
| **Category** | Planning |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Product manager agents (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines product requirements document (PRD) structure.

**Note:** Uses underscore instead of hyphen (documented naming inconsistency).

---

### artifact_manifest.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/artifact_manifest.schema.json` |
| **Category** | Project |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Artifact lifecycle management (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines artifact manifest structure for lifecycle tracking.

**Note:** Uses underscore instead of hyphen (documented naming inconsistency).

---

## 7. Architecture & Requirements Schemas (4 schemas)

### specification-template.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/specification-template.schema.json` |
| **Category** | Architecture |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Architect/technical-writer agents (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines specification document template structure.

---

### system_architecture.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/system_architecture.schema.json` |
| **Category** | Architecture |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Architect agent (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines system architecture document structure.

**Note:** Uses underscore instead of hyphen (documented naming inconsistency).

---

### project_brief.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/project_brief.schema.json` |
| **Category** | Planning |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Planner/architect agents (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines project brief document structure.

**Note:** Uses underscore instead of hyphen (documented naming inconsistency).

---

### project-analysis.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/project-analysis.schema.json` |
| **Category** | Project |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | Analyst agents (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines project analysis report structure.

---

### ux_spec.schema.json

| Field | Value |
|-------|-------|
| **Path** | `.claude/schemas/ux_spec.schema.json` |
| **Category** | Architecture |
| **Wiring Status** | DOCS ONLY |
| **Consumer** | UX/design agents (documentation reference) |
| **Validation** | Not validated at runtime |
| **$schema** | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines UX specification document structure.

**Note:** Uses underscore instead of hyphen (documented naming inconsistency).

---

## 8. Archived Schemas

**Total Archived:** 25 schemas
**Archive Location:** `.claude/schemas/_archive/`
**Archive Method:** `git mv` (preserves full commit history)

See `.claude/schemas/_archive/README.md` for complete list and restoration instructions.

**Archive Categories:**
- Agile artifacts (12): epics, stories, backlogs, sprints, retrospectives (never implemented)
- Dead infrastructure (13): capability routing, event schema, skill manifest, context definition, etc.

---

## Usage Guidelines

### For Developers

**Adding a New Schema:**
1. Follow the creator workflow: invoke `Skill({ skill: "schema-creator" })` - **DO NOT** write schemas directly
2. Use `.schema.json` suffix (e.g., `my-schema.schema.json`)
3. Include `$schema` field (draft-07 or draft-2020-12)
4. Document purpose and consumer in schema description
5. Update this catalog after creation
6. Wire to Ajv validation if runtime validation is needed

**Wiring a Schema to Ajv:**
1. Use shared utility: `.claude/lib/utils/schema-validator.cjs`
2. Call `validateWithSchema(schemaPath, data)` for validation
3. Returns `{ valid, errors, skipped }` - never throws
4. Validation is advisory only (warnings, not blockers)

**Validation Best Practices:**
- Always gracefully degrade if schema is missing
- Never block operations on validation failures
- Log validation errors as warnings
- Advisory validation pattern: `if (!valid) { console.warn(...) }`

### For Agents

**Finding Schemas:**
- Search this catalog by category or purpose
- Check wiring status before assuming validation is active
- DOCS ONLY schemas are reference templates only
- WIRED schemas have actual runtime validation

**Schema Categories:**
- **Agent**: Agent definitions, configurations, capabilities
- **Skill**: Skill definitions and outputs
- **Workflow**: Workflow and hook definitions
- **Tool**: Tool manifests and configurations
- **Template**: Templates and presets
- **Planning**: Plans, requirements, briefs
- **Testing**: Test plans and results
- **Architecture**: System architecture, specifications
- **Evolution**: Evolution workflow state
- **Project**: Project metadata and analysis

---

## Related Documentation

- **Schema Creator Skill:** `.claude/skills/schema-creator/SKILL.md`
- **Schema Validator Utility:** `.claude/lib/utils/schema-validator.cjs`
- **Schema README:** `.claude/schemas/README.md`
- **Archive README:** `.claude/schemas/_archive/README.md`
- **Architecture Plan:** `.claude/context/plans/schemas-overhaul-architecture-2026-02-07.md`
- **ADR-088:** `.claude/context/memory/decisions.md` (Schemas System Overhaul decision)
