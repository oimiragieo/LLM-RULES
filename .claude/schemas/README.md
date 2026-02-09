# JSON Schema Directory

This directory contains JSON Schema definitions for validating framework artifacts, agent configurations, and workflow structures.

**Total Active Schemas:** 27
**Archived Schemas:** 25 (see `_archive/README.md`)

---

## Overview

JSON schemas in this directory serve three purposes:

1. **Runtime Validation (Ajv):** 8 schemas actively validated at runtime via Ajv
2. **Documentation Reference:** 16 schemas serve as structural templates for agents
3. **Optional Validation:** 3 schemas have paths defined but validation is optional

For a complete catalog with wiring status and consumers, see:
**`.claude/context/artifacts/catalogs/schema-catalog.md`**

---

## Actively Validated Schemas (WIRED)

These 8 schemas have Ajv validation integrated into their consumers:

| Schema                              | Consumer                    | Validation Method           | Purpose                               |
| ----------------------------------- | --------------------------- | --------------------------- | ------------------------------------- |
| `agent-capability-card.schema.json` | generate-agent-registry.cjs | Ajv (pre-existing)          | Agent capability card structure       |
| `agent-identity.schema.json`        | agent-parser.cjs            | Ajv (pre-existing)          | Agent identity/personality fields     |
| `evolution-state.schema.json`       | self-healing/validator.cjs  | `validateStateWithSchema()` | Evolution workflow state machine      |
| `agent-definition.schema.json`      | agent-parser.cjs            | `validateDefinition()`      | Agent markdown frontmatter            |
| `skill-definition.schema.json`      | skill-creator/create.cjs    | `validateSkill()`           | Skill SKILL.md frontmatter            |
| `agent-config.schema.json`          | agent-config.cjs            | `validateConfig()`          | Agent config (tools, thinking, phase) |
| `presets.schema.json`               | spawn/prompt-assembler.cjs  | `validatePresets()`         | Spawn prompt presets                  |
| `tool-manifest.schema.json`         | generate-tool-manifest.cjs  | Ajv (pre-existing)          | Tool manifest structure               |

All validation is **advisory only** - failures generate warnings but never block operations.

**Validation Utility:** `.claude/lib/utils/schema-validator.cjs` (shared Ajv wrapper with caching)

---

## Schema Categories

### Agent Schemas (5)

- `agent-capability-card.schema.json` (WIRED)
- `agent-config.schema.json` (WIRED)
- `agent-definition.schema.json` (WIRED)
- `agent-identity.schema.json` (WIRED)
- `agent-spawn-params.json` (DOCS ONLY)

### Skill Schemas (4)

- `skill-definition.schema.json` (WIRED)
- `skill-diagram-generator-output.schema.json` (SOFT-WIRED)
- `skill-repo-rag-output.schema.json` (SOFT-WIRED)
- `skill-test-generator-output.schema.json` (SOFT-WIRED)

### Workflow & Hook Schemas (2)

- `workflow-definition.schema.json` (DOCS ONLY - no workflow-creator scripts)
- `hook-definition.schema.json` (DOCS ONLY - no hook-creator scripts)

### Evolution & Project Schemas (2)

- `evolution-state.schema.json` (WIRED)
- `track-metadata.schema.json` (DOCS ONLY)

### Tool & Template Schemas (3)

- `tool-manifest.schema.json` (WIRED)
- `presets.schema.json` (WIRED)
- `adr-template.schema.json` (DOCS ONLY)

### Planning Schemas (4)

- `plan.schema.json` (DOCS ONLY)
- `implementation-plan.schema.json` (DOCS ONLY)
- `phase-models.schema.json` (DOCS ONLY)
- `product-requirements.schema.json` (DOCS ONLY)
- `project-brief.schema.json` (DOCS ONLY)

### Testing Schemas (2)

- `test-plan.schema.json` (DOCS ONLY)
- `test-results.schema.json` (DOCS ONLY)

### Architecture Schemas (4)

- `specification-template.schema.json` (DOCS ONLY)
- `system-architecture.schema.json` (DOCS ONLY)
- `ux-spec.schema.json` (DOCS ONLY)

### Project Schemas (1)

- `project-analysis.schema.json` (DOCS ONLY)
- `artifact-manifest.schema.json` (DOCS ONLY)

---

## Naming Conventions

**Standard Pattern:** `{name}.schema.json`

**All schemas now follow the standard pattern** (`{name}.schema.json`)

---

## Usage Guidelines

### For Developers

**Adding a New Schema:**

1. **Use the creator workflow** (MANDATORY):

   ```javascript
   Skill({ skill: 'schema-creator' });
   ```

   Do NOT write schema files directly - the creator guard blocks this.

2. **Naming:** Use `.schema.json` suffix (e.g., `my-feature.schema.json`)

3. **Schema Version:** Include `$schema` field:
   - `http://json-schema.org/draft-07/schema#` (recommended for compatibility)
   - `https://json-schema.org/draft/2020-12/schema` (for advanced features)

4. **Documentation:** Add description and examples in schema

5. **Catalog:** Update `.claude/context/artifacts/catalogs/schema-catalog.md`

**Wiring a Schema for Validation:**

1. Import shared validator:

   ```javascript
   const { validateWithSchema } = require('./.claude/lib/utils/schema-validator.cjs');
   ```

2. Validate data:

   ```javascript
   const result = validateWithSchema('path/to/schema.schema.json', data);
   if (!result.valid && !result.skipped) {
     console.warn('Validation failed:', result.errors);
   }
   ```

3. **Never block operations** - validation is advisory only

4. **Graceful degradation** - `result.skipped === true` if Ajv is missing

**Validation Utility Features:**

- Lazy-loads Ajv (graceful if missing)
- Caches compiled validators (Map by schema path)
- Returns `{ valid, errors, skipped }` - never throws
- Handles both Draft 7 and Draft 2020-12 schemas

### For Agents

**Finding Schemas:**

- Consult the catalog: `.claude/context/artifacts/catalogs/schema-catalog.md`
- Search by category (Agent, Skill, Workflow, Planning, Testing, etc.)
- Check wiring status before assuming validation is active

**Using Schemas:**

- **WIRED schemas:** Data is validated at runtime (warnings only)
- **DOCS ONLY schemas:** Reference templates for structure guidance
- **SOFT-WIRED schemas:** Path defined but validation may be skipped

---

## Archive

**25 schemas were archived** in Phase 1 of the schemas overhaul (2026-02-07) via `git mv` to preserve commit history.

**Archive location:** `.claude/schemas/_archive/`

**Archived categories:**

- Agile artifacts (12): epics, stories, backlogs, sprints, retrospectives
- Dead infrastructure (13): capability routing, event schema, skill manifest, etc.

See `.claude/schemas/_archive/README.md` for complete list and restoration instructions.

---

## Related Documentation

- **Schema Catalog:** `.claude/context/artifacts/catalogs/schema-catalog.md` (complete schema inventory with wiring status)
- **Schema Creator Skill:** `.claude/skills/schema-creator/SKILL.md` (schema creation workflow)
- **Schema Validator:** `.claude/lib/utils/schema-validator.cjs` (shared validation utility)
- **Archive README:** `.claude/schemas/_archive/README.md` (archived schemas list)
- **ADR-088:** `.claude/context/memory/decisions.md` (Schemas System Overhaul architectural decision)
- **Architecture Plan:** `.claude/context/plans/schemas-overhaul-architecture-2026-02-07.md`

---

## History

**2026-02-07 - Schemas System Overhaul (ADR-088):**

- Archived 25 dead schemas (48% of original total)
- Wired 8 schemas to Ajv validation (5x increase from 2 to 8)
- Created shared validation utility (schema-validator.cjs)
- Created comprehensive schema catalog
- Renamed agent-identity.json to agent-identity.schema.json

**Pre-2026 - Auto-Claude Integration:**

- Initial 52 schemas created during framework scaffolding
- Many schemas defined for artifacts never implemented (Agile tools, event bus, etc.)
- Only 2 schemas actively validated (agent-capability-card, agent-identity)
