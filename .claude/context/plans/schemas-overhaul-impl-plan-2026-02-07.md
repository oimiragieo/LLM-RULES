<!-- Agent: planner | Task: #SCHEMAS-PLAN | Session: 2026-02-07 -->

# Schemas System Overhaul -- Implementation Plan

**Date:** 2026-02-07
**Pipeline:** Enterprise Pipeline #6
**Architecture:** `.claude/context/plans/schemas-overhaul-architecture-2026-02-07.md`
**Security Review:** APPROVED LOW RISK (`.claude/context/reports/security/schemas-system-security-review-2026-02-07.md`)
**ADR:** ADR-088 (`.claude/context/memory/decisions.md`)
**Complexity:** MEDIUM
**Estimated Total Effort:** ~9 hours across 4 tasks

---

## Executive Summary

Transform the schemas system from 90% aspirational (2 of 52 schemas validated) to 37% actively validated (10 of 27 schemas). Archive 25 dead schemas, rename 1 for naming compliance, wire 8 schemas to Ajv validation via TDD, create a schema catalog, and fix phantom references in schema-creator SKILL.md and workflow YAML files.

## Task Dependency Graph

```
Task #88 (Cleanup + Rename)
    |
    v
Task #89 (Wire 8 schemas, TDD)  [BLOCKED BY #88]
    |
    v
Task #90 (Docs + SKILL.md + YAML)  [BLOCKED BY #89]
    |
    v
Task #91 (QA Validation)  [BLOCKED BY #88, #89, #90]
```

## Commit Checkpoints (3 commits)

1. After Task #88: `cleanup(schemas): archive 25 dead schemas, rename agent-identity`
2. After Task #89: `feat(schemas): wire 8 schemas to Ajv validation (TDD)`
3. After Task #90: `docs(schemas): create catalog, fix README, fix creator SKILL.md phantom refs`

## Tasks

### Task #88: Phase 1-2 -- Archive 25 Dead Schemas + Rename agent-identity.json

**Agent:** developer (sonnet)
**Estimated Time:** ~1 hour
**Dependencies:** None (first task)
**Risk:** Low (file operations only, no code logic)

**Scope:**
- Create `.claude/schemas/_archive/` with README
- `git mv` 25 dead schemas to archive
- Rename `agent-identity.json` to `agent-identity.schema.json`
- Update 2 consumers: `agent-parser.cjs`, `agent-identity-integration.md`
- Verify no active code references break

**Success Criteria:**
- 27 schemas in active directory, 25 in archive
- `agent-parser.cjs` loads successfully
- Zero active references to archived schema filenames

**Commit Checkpoint:** YES (recovery point before wiring work)

---

### Task #89: Phase 3 -- Wire 8 Schemas to Ajv Validation (TDD)

**Agent:** developer (sonnet)
**Estimated Time:** ~4 hours
**Dependencies:** Task #88 complete
**Risk:** Medium (modifying 8+ consumer files, but repetitive pattern)

**Scope:**
Wire these 8 schemas to Ajv validation in their consumers:

| # | Schema | Consumer | Current State |
|---|--------|----------|---------------|
| 1 | evolution-state.schema.json | self-healing/validator.cjs | Hardcoded enums in comments |
| 2 | agent-definition.schema.json | agent-creator/agent-parser | DOCS ONLY |
| 3 | skill-definition.schema.json | skill-creator/scripts/create.cjs | _SCHEMA_PATH unused |
| 4 | hook-definition.schema.json | hook-creator scripts | DOCS ONLY |
| 5 | workflow-definition.schema.json | workflow-creator scripts | DOCS ONLY |
| 6 | tool-manifest.schema.json | generate-tool-manifest.cjs | JSDoc only |
| 7 | agent-config.schema.json | agent-config-reader.cjs | DOCS ONLY |
| 8 | presets.schema.json | preset loading code | DOCS ONLY |

**TDD Approach:** RED (test schema validation) -> GREEN (wire Ajv) -> REFACTOR for each.

**Key Pattern:**
```javascript
// Graceful degradation (CRITICAL)
let validate = null;
try {
  const Ajv = require('ajv');
  const schema = require('../../schemas/SCHEMA.schema.json');
  validate = new Ajv({ allErrors: true }).compile(schema);
} catch (_err) {
  validate = null; // Skip validation if Ajv unavailable
}
```

**Success Criteria:**
- 8 new test files, all passing
- RED-GREEN cycle verified for each
- Graceful degradation works (no crashes if Ajv missing)
- Existing tests pass (zero regressions)

**Commit Checkpoint:** YES (20+ files changed)

---

### Task #90: Phases 4-6 -- Documentation + Schema-Creator Fixes + Workflow YAML

**Agent:** developer (sonnet)
**Estimated Time:** ~2.5 hours
**Dependencies:** Task #89 complete (catalog needs accurate wiring status)
**Risk:** Low (documentation + config changes, minimal code)

**Scope:**

**Phase 4 (Documentation):**
- Create `.claude/context/artifacts/catalogs/schema-catalog.md` (27 schemas)
- Rewrite `.claude/schemas/README.md` (complete inventory)
- Update `@DIRECTORY_STRUCTURE.md` schemas section
- Add schemas reference to CLAUDE.md Section 9 (brief)

**Phase 5 (Schema-Creator SKILL.md):**
- Remove phantom references: schema-registry.json, SCHEMA_CATALOG.md (old path), schemas/index.json
- Add research-synthesis mandate, WARNING BOX, Architecture Compliance section
- Update Existing Schemas Reference table (7 -> 27)
- Add consumer/agent assignment step, integration verification step
- NOTE: Writing to SKILL.md requires `CREATOR_GUARD=warn` or invoking schema-creator pre-execute hook

**Phase 6 (Workflow YAML):**
- Fix `schema-updater-workflow.yaml` `schemas/index.json` references (lines 24, 293, 347)
- Review `schema-creator-workflow.yaml` for accuracy

**Success Criteria:**
- Schema catalog exists with 27 entries and accurate wiring statuses
- README lists all 27 active schemas
- Zero phantom references remaining (schema-registry.json, schemas/index.json, SCHEMA_CATALOG.md at old path)
- Schema-creator SKILL.md has WARNING BOX and research-synthesis mandate

---

### Task #91: Phase 7 -- QA Validation

**Agent:** qa (opus)
**Estimated Time:** ~1.5 hours
**Dependencies:** Tasks #88, #89, #90 ALL complete
**Risk:** None (read-only verification)

**Scope:**
9-point validation checklist:
1. File inventory (27 active + 25 archived = 52)
2. Naming convention compliance (kebab-case, .schema.json suffix)
3. Wiring verification (10 schemas Ajv-validated)
4. Test suite verification (all new + existing tests pass)
5. Catalog completeness (27 entries with accurate statuses)
6. Dead reference scan (zero references to archived schemas/phantoms)
7. Documentation verification (README, catalog, SKILL.md, @DIRECTORY_STRUCTURE.md)
8. Regression check (all consumer modules load without errors)
9. ADR-088 status update (Proposed -> Accepted)

**Output:** QA report at `.claude/context/reports/qa/schemas-system-qa-report-2026-02-07.md`

**Success Criteria:**
- All 9 validation sections pass
- QA report generated
- ADR-088 status updated to Accepted

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wiring breaks existing tests | Medium | Medium | TDD approach (RED/GREEN/REFACTOR) |
| agent-identity rename breaks imports | Low | High | Only 2 consumers; update both + verify |
| Ajv not installed at runtime | Low | Medium | Graceful degradation (try/catch) |
| Creator guard blocks SKILL.md edit | Medium | Low | Use CREATOR_GUARD=warn for Phase 5 edit |
| Consumer code has no clean integration point | Medium | Medium | Developer investigates each consumer before wiring |

## Rollback Strategy

Each task is independently reversible:
- Task #88: `git mv _archive/* .` + rename back
- Task #89: Remove Ajv validation calls
- Task #90: Revert documentation changes
- Task #91: Read-only (nothing to revert)

Each commit checkpoint provides a clean rollback target.

## Post-Overhaul Metrics

| Metric | Before | After |
|--------|--------|-------|
| Total schema files | 52 | 27 active + 25 archived |
| Ajv-validated schemas | 2 (3.8%) | 10 (37%) |
| Dead schemas | 25 (48%) | 0 (archived) |
| Schema catalog | None | 27-entry catalog |
| Phantom references | 3 (schema-registry, CATALOG, index.json) | 0 |
| Naming compliance | ~75% | 100% |

---

## Phase FINAL: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction after all implementation work.

**Tasks:**

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

**Plan Status:** READY FOR EXECUTION
**Next Step:** Developer claims Task #88 (no dependencies, immediately available)
