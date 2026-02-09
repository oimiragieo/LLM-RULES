<!-- Agent: architect | Task: #4 | Session: 2026-02-09 -->

# Schema Standardization Architecture

**Date:** 2026-02-09
**Author:** Architect Agent (Task #4)
**Status:** Proposed
**Complexity:** HIGH (87 schemas, 97 rules, cross-cutting changes)
**Prerequisites:** Task #2 (Research), Task #3 (PM Requirements)

---

## Executive Summary

This document defines the architecture for standardizing 87 skill output schemas and cleaning up 15 stub rules files. The core decisions are: adopt Structure B (`{status, output}`) as the canonical envelope, create a generic base schema for 12 hollow stubs, add `additionalProperties:false` to all schemas, standardize `$id` to `agent-studio.dev`, and triage 15 stub rules for deletion or enhancement.

The design produces 5 deliverables: an ADR, a base schema, batch migration scripts, stub rules triage, and updated creator rules. Total estimated effort: 8-12 hours across 4 phases.

---

## 1. Canonical Schema Envelope (ADR-095)

### Decision

**Structure B** is the canonical skill output envelope:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://agent-studio.dev/schemas/skill-{name}-output.schema.json",
  "title": "{Skill Name} Output",
  "description": "Output schema for {skill-name} skill",
  "type": "object",
  "required": ["status", "output"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "partial", "failed"],
      "description": "Execution status of the skill"
    },
    "output": {
      "type": "object",
      "description": "{Skill-specific description}",
      "required": ["{domain-specific-required-fields}"],
      "properties": {
        "{domain-specific-properties}": {}
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

### Rationale

| Criterion | Structure A (skillName/version/timestamp/output) | Structure B (status/output) |
|-----------|--------------------------------------------------|----------------------------|
| Current adoption | 19 schemas (22%) | 68 schemas (78%) |
| Simplicity | 4 required root fields | 2 required root fields |
| Consumer complexity | Must handle skillName validation per-schema | Generic status check works for all |
| Migration cost | Migrate 68 schemas (HIGH) | Migrate 19 schemas (LOW) |
| Information loss | None | skillName, version, timestamp move to output or are dropped |

**Structure B wins on adoption (78%), simplicity, and migration cost.** The 19 Structure A schemas will be migrated.

### Migration Path for Structure A Schemas

The 19 Structure A schemas fall into 3 sub-categories:

**Category A1: Rich envelope with `skillName/version/timestamp/output` (14 schemas)**

Files: `skill-tdd-output`, `skill-debugging-output`, `skill-plan-generator-output`, `skill-code-analyzer-output`, `skill-best-practices-guidelines-output`, `skill-code-quality-expert-output`, `skill-code-style-validator-output`, `skill-dry-principle-output`, `skill-ripgrep-output`, `skill-code-semantic-search-output`, `skill-code-structural-search-output`, `skill-verification-before-completion-output`, `skill-agent-creator-output`, `skill-skill-creator-output`

Migration:
1. Remove `skillName`, `version`, `timestamp` from root `required` and `properties`
2. Add `status` enum to root `required` and `properties`
3. Keep `output` object unchanged (domain properties preserved)
4. Root `additionalProperties: false` already present on most; add where missing

**Category A2: Variant envelope with `skillName/timestamp/result` (5 schemas)**

Files: `skill-frontend-expert-output`, `skill-react-expert-output`, `skill-nextjs-expert-output`, `skill-android-expert-output`, `skill-ios-expert-output`

Migration:
1. Remove `skillName`, `version`, `timestamp` from root
2. Rename `result` key to `output` in both `required` and `properties`
3. Add `status` enum to root
4. Add `additionalProperties: false` at root and output levels

**Category A3: Unique flat structure (5 schemas)**

Files: `skill-differential-review-output`, `skill-insecure-defaults-output`, `skill-static-analysis-output`, `skill-variant-analysis-output`, `skill-semgrep-rule-creator-output`

These 5 Trail of Bits security schemas have unique flat structures (e.g., `skill_name/diff_reference/files_reviewed/verdict/findings/timestamp` for differential-review). They do NOT follow either Structure A or B.

Migration approach -- **wrap existing properties inside `output`**:
1. Move all current domain properties into a new `output` object
2. Add `status` enum at root
3. Set root `required: ["status", "output"]`
4. Move all current `required` fields into `output.required`
5. Preserve all domain-specific validation (these are Tier-1 quality schemas)
6. Add `additionalProperties: false` at root (already present on nested objects)

**Impact**: The `skill_name` field in these schemas maps to the old `skillName` concept. Dropping it from the root loses the ability to verify which skill produced the output. However, since consumers already know which skill they invoked, this field provides no runtime value. If needed, `skillName` can be added as an optional field inside `output`.

### Backward Compatibility

**Risk assessment**: LOW. No runtime code currently validates skill output against these schemas. The schemas are aspirational validation targets, not enforced contracts. The migration is purely structural cleanup.

**If consumers exist in the future**: The migration script will be idempotent and logged. Any consumer written against Structure A can be updated by searching for `skillName` property access and replacing with `status` checks.

**Deprecation period**: None needed (no known consumers). Document the change in ADR-095 for future reference.

---

## 2. Generic Base Schema Design

### Base Schema: `generic-skill-output-base.schema.json`

This schema serves as the explicit fallback for skills that genuinely have no domain-specific output structure. It replaces 12 identical hollow stubs with a single referenced base, making intentional genericity visible rather than appearing as incomplete work.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://agent-studio.dev/schemas/generic-skill-output-base.schema.json",
  "title": "Generic Skill Output Base",
  "description": "Base schema for skills without domain-specific output validation. Skills using this schema intentionally accept any structured output. When a skill develops domain-specific output needs, replace the $ref with a full schema.",
  "type": "object",
  "required": ["status", "output"],
  "properties": {
    "status": {
      "type": "string",
      "enum": ["success", "partial", "failed"],
      "description": "Execution status of the skill"
    },
    "output": {
      "type": "object",
      "description": "Skill-specific output data. This base schema accepts any properties. Override with domain-specific schema when output structure is known.",
      "minProperties": 0
    }
  },
  "additionalProperties": false
}
```

**Key design decisions:**

1. **`additionalProperties: false` at root only** -- The root level is locked (no extra properties beyond `status` and `output`). The `output` object deliberately does NOT have `additionalProperties: false` because these skills have no defined output shape.

2. **`minProperties: 0`** on output -- Explicitly allows empty output objects (a skill that fails might have no output data).

3. **No `$ref` pattern for stubs** -- The 12 stub schemas will be **deleted** and replaced by a single catalog entry pointing to this base schema. This avoids the complexity of `$ref`/`allOf` resolution in Draft-07 and keeps the schema directory clean.

### Stub Schemas to Delete (12 files)

These 12 schemas are byte-for-byte identical (25 lines each, only `status` + generic `output`):

| # | Schema File | Skill |
|---|------------|-------|
| 1 | `skill-swarm-coordination-output.schema.json` | swarm-coordination |
| 2 | `skill-consensus-voting-output.schema.json` | consensus-voting |
| 3 | `skill-binary-analysis-patterns-output.schema.json` | binary-analysis-patterns |
| 4 | `skill-memory-forensics-output.schema.json` | memory-forensics |
| 5 | `skill-protocol-reverse-engineering-output.schema.json` | protocol-reverse-engineering |
| 6 | `skill-ai-ml-expert-output.schema.json` | ai-ml-expert |
| 7 | `skill-scientific-skills-output.schema.json` | scientific-skills |
| 8 | `skill-writing-skills-output.schema.json` | writing-skills |
| 9 | `skill-git-expert-output.schema.json` | git-expert |
| 10 | `skill-doc-generator-output.schema.json` | doc-generator |
| 11 | `skill-readme-output.schema.json` | readme |
| 12 | `skill-summarize-changes-output.schema.json` | summarize-changes |

**Post-deletion**: Update `schema-catalog.md` to list these 12 skills as using `generic-skill-output-base.schema.json` instead of individual files.

### Alternative Considered: $ref Pattern

Using `$ref` to have each stub reference the base was considered:

```json
{
  "$ref": "https://agent-studio.dev/schemas/generic-skill-output-base.schema.json"
}
```

**Rejected because:**
- Draft-07 `$ref` replaces the entire object (no composition with sibling keywords)
- No runtime `$ref` resolver exists in the project
- 12 one-line files add no value over a catalog reference
- Deletion is simpler, reversible (git restore), and eliminates 12 files of noise

---

## 3. additionalProperties:false Migration Strategy

### Current State Analysis

From grep analysis of 87 skill output schemas:

| Category | Count | Description |
|----------|-------|-------------|
| **Already has** (root + output) | ~17 | tdd, debugging, differential-review, insecure-defaults, static-analysis, variant-analysis, semgrep-rule-creator, code-analyzer, best-practices, code-quality, code-style-validator, dry-principle, ripgrep, code-semantic-search, code-structural-search, verification-before-completion, test-generator |
| **Has at root only** | ~3 | diagram-generator, repo-rag, interactive-requirements-gathering |
| **Needs adding** (Tier-2) | ~55 | All schemas with domain properties but missing the constraint |
| **Stubs** (via base) | 12 | Handled by base schema (root-only additionalProperties:false) |

### Migration Approach

**Script pattern**: Node.js script that reads each JSON schema file, adds `additionalProperties: false` at the correct levels, and writes back.

```
For each schema file:
  1. Parse JSON
  2. If root.additionalProperties !== false:
     → Set root.additionalProperties = false
  3. If root.properties.output exists AND root.properties.output.type === "object":
     If root.properties.output.additionalProperties !== false:
       AND root.properties.output.properties exists (has domain properties):
         → Set root.properties.output.additionalProperties = false
  4. If root.properties.result exists (variant A2):
     Same logic as output
  5. Write JSON with 2-space indent
```

**The script does NOT add `additionalProperties: false` to `output` when `output` has no `properties` defined** (i.e., hollow stubs). This is by design -- a generic output object cannot restrict properties it has not defined. The 12 hollow stubs will be deleted anyway.

**Nested objects**: The script targets root and `output`/`result` levels only. Nested objects within `output.properties` that already have `additionalProperties: false` (like `diff_reference` in differential-review) are left untouched. Nested objects that lack it are also left alone -- forcing `additionalProperties: false` on deeply nested objects could break valid payloads if the nested schema is incomplete. This is a future enhancement.

### Risk Analysis

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Breaks consumers that pass extra properties | HIGH | LOW (no known runtime validation) | No runtime validation exists; purely structural |
| Locks out future properties without schema update | MEDIUM | MEDIUM | Document: "add new properties to schema before using them" |
| Incorrectly restricts a schema that needs flexibility | LOW | LOW | Review each schema change in git diff before committing |

### Verification

After running the script:
```bash
# Count schemas WITH additionalProperties:false at root
grep -l '"additionalProperties": false' .claude/schemas/skill-*-output.schema.json | wc -l
# Expected: 75 (87 total minus 12 deleted stubs)

# Validate all schemas are valid JSON
node -e "const fs=require('fs'); const files=fs.readdirSync('.claude/schemas').filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')); files.forEach(f=>{try{JSON.parse(fs.readFileSync('.claude/schemas/'+f,'utf8'));console.log('OK:',f)}catch(e){console.error('FAIL:',f,e.message)}})"
```

---

## 4. $id Domain Standardization

### Current State

| Domain | Count | Examples |
|--------|-------|---------|
| `https://claude-code.anthropic.com/schemas/` | ~19 | tdd, debugging, plan-generator, differential-review, insecure-defaults |
| `https://agent-studio.dev/schemas/` | ~56 | All new batch schemas |
| Missing `$id` entirely | ~12 | checklist-generator, react-expert, some Tier-2 schemas |

### Target State

All schemas: `https://agent-studio.dev/schemas/skill-{name}-output.schema.json`

### Migration Script

```
For each schema file:
  1. Parse JSON
  2. If $id exists and contains "claude-code.anthropic.com":
     → Replace with "agent-studio.dev" (same path suffix)
  3. If $id is missing:
     → Add $id based on filename: "https://agent-studio.dev/schemas/{filename}"
  4. Ensure $id ends with ".schema.json" (some have ".json" only)
  5. Write JSON
```

**Regex for batch update** (conceptual):
```
old: "https://claude-code.anthropic.com/schemas/"
new: "https://agent-studio.dev/schemas/"
```

### Impact on $ref Resolution

No schemas currently use `$ref` to reference other schemas via `$id`. The `$id` field is informational only (used for schema identification, not runtime resolution). Standardizing the domain has zero functional impact and prevents future resolution issues if `$ref` is adopted.

### Verification

```bash
# All $id values should use agent-studio.dev
grep '"$id"' .claude/schemas/skill-*-output.schema.json | grep -v "agent-studio.dev"
# Expected: 0 results

# All schemas should have $id
node -e "const fs=require('fs'); fs.readdirSync('.claude/schemas').filter(f=>f.startsWith('skill-')&&f.endsWith('.schema.json')).forEach(f=>{const s=JSON.parse(fs.readFileSync('.claude/schemas/'+f,'utf8'));if(!s['\\$id'])console.log('MISSING $id:',f)})"
```

---

## 5. Stub Rules Strategy

### Identification

15 rules files are minimal stubs (~18 lines each): name, one-line description, usage snippet, and reference link. They provide zero actionable guidance.

### Triage: Delete vs. Enhance

**Category: DELETE (8 files)** -- These skills are either truly generic (any output is valid) or the SKILL.md already provides complete guidance. A rules file adds no value.

| # | Rules File | Rationale for Deletion |
|---|-----------|----------------------|
| 1 | `scientific-skills.md` | Meta-skill (139 sub-skills); no single set of rules applies |
| 2 | `git-expert.md` | Thin wrapper around git CLI; SKILL.md has full guidance |
| 3 | `doc-generator.md` | Output is documentation; no domain rules beyond SKILL.md |
| 4 | `readme.md` | README generation; SKILL.md covers format and content |
| 5 | `summarize-changes.md` | Simple text summarization; no domain-specific rules |
| 6 | `writing-skills.md` | Prose writing style; SKILL.md covers writing patterns |
| 7 | `binary-analysis-patterns.md` | Forensics domain; SKILL.md has technique catalog |
| 8 | `memory-forensics.md` | Forensics domain; SKILL.md has technique catalog |

**Category: ENHANCE (7 files)** -- These skills have genuine domain rules that should be documented to guide agents.

| # | Rules File | Enhancement Outline |
|---|-----------|-------------------|
| 1 | `consensus-voting.md` | Add: voting protocols (majority/supermajority/unanimous), conflict resolution patterns, quorum requirements, Byzantine fault tolerance thresholds, integration with master-orchestrator |
| 2 | `swarm-coordination.md` | Add: Queen/Worker topology rules, fan-out/fan-in patterns, failure handling (partial results vs retry), message passing format, maximum parallel agents |
| 3 | `diagram-generator.md` | Add: Mermaid syntax rules, diagram type selection matrix, file size limits (1000 files), node count limits (~200 for readability), output location rules |
| 4 | `sequential-thinking.md` | Add: thought numbering rules, revision protocol, branching rules, optimal stopping criteria, integration with planner agent |
| 5 | `protocol-reverse-engineering.md` | Add: packet capture rules, protocol state machine patterns, documentation format, tool integration (Wireshark, tcpdump) |
| 6 | `test-generator.md` | Add: test type selection matrix, fixture generation rules, naming conventions, edge case enumeration, framework-specific patterns |
| 7 | `insight-extraction.md` | Add: extraction triggers, insight format template, deduplication rules, domain tagging, memory protocol integration |

**Note**: `response-rater.md` was listed as a stub in some reviews but actually contains 60+ lines with rubric dimensions, scoring guidelines, and workflow -- it is NOT a stub and needs no changes.

### Post-Deletion Actions

For each deleted rules file:
1. Remove from `.claude/rules/` directory
2. Check if any agent references the rules file directly (grep for filename)
3. Update `rules-catalog.md` if the catalog tracks these
4. Document deletion in `.claude/context/memory/decisions.md` with rationale

For each enhanced rules file:
1. Follow the structure of existing high-quality rules (minimum sections: Core Principles, Standards, Anti-Patterns, Integration Points)
2. Target 80-150 lines per file
3. Include concrete examples where applicable

---

## 6. Implementation Order

### Phase Dependency Graph

```
Phase 1: Base Schema + Stub Deletion
    |
    v
Phase 2: additionalProperties:false + $id Standardization
    |
    v
Phase 3: Structure A Migration (19 schemas)
    |
    v
Phase 4: Rules Cleanup + ADR + Creator Rules Update

Phase R: Rules Enhancement (parallel with Phases 2-3)
```

### Phase 1: Foundation (2-3 hours)

**Dependencies**: None
**Parallelizable**: No (must complete before Phase 2)

| Step | Action | Effort | Verification |
|------|--------|--------|--------------|
| 1.1 | Create `generic-skill-output-base.schema.json` | 15 min | JSON valid, has additionalProperties:false |
| 1.2 | Delete 12 hollow stub schemas | 15 min | `ls .claude/schemas/skill-*-output.schema.json | wc -l` shows 75 |
| 1.3 | Update schema-catalog.md (12 entries point to base) | 30 min | Catalog entries match on-disk files |
| 1.4 | Verify no broken references | 15 min | Grep for deleted filenames returns 0 hits |

**Why first**: Deleting 12 files before running batch scripts on the remaining 75 prevents processing files that would be deleted anyway.

### Phase 2: Batch Standardization (2-3 hours)

**Dependencies**: Phase 1 complete
**Parallelizable**: Steps 2.1 and 2.2 can run in parallel

| Step | Action | Effort | Verification |
|------|--------|--------|--------------|
| 2.1 | Run additionalProperties:false script on 75 schemas | 1 hour | Grep count matches expected |
| 2.2 | Run $id standardization script on 75 schemas | 30 min | Zero non-agent-studio.dev $id values |
| 2.3 | Add missing $id to ~12 schemas that lack it | 30 min | All schemas have $id |
| 2.4 | Validate all 75 schemas are valid JSON | 15 min | Zero parse errors |
| 2.5 | Review git diff for unexpected changes | 30 min | Manual spot-check of 10 schemas |

### Phase 3: Structure A Migration (2-3 hours)

**Dependencies**: Phase 2 complete (so additionalProperties:false is already present)
**Parallelizable**: No (transforms are sequential per-file)

| Step | Action | Effort | Verification |
|------|--------|--------|--------------|
| 3.1 | Migrate 14 Category A1 schemas (skillName/version/timestamp/output -> status/output) | 1.5 hours | All 14 have `status` enum, no `skillName` at root |
| 3.2 | Migrate 5 Category A2 schemas (result -> output rename) | 45 min | All 5 use `output` not `result` |
| 3.3 | Migrate 5 Category A3 security schemas (wrap in output) | 1 hour | All 5 have `status/output` at root, domain properties inside `output` |
| 3.4 | Validate all 75 schemas pass JSON parse | 15 min | Zero errors |
| 3.5 | Spot-check 5 migrated schemas manually | 15 min | Domain properties preserved |

**Risk mitigation for A3**: The Trail of Bits security schemas are the highest-quality schemas in the project. The migration wraps their existing flat structure inside `output` without losing any validation. Create a backup before migration:
```bash
cp .claude/schemas/skill-differential-review-output.schema.json .claude/schemas/_backup/
```

### Phase R: Rules Cleanup (2-3 hours, parallel with Phases 2-3)

**Dependencies**: None (rules are independent of schemas)
**Parallelizable**: YES -- can run in parallel with Phases 2-3

| Step | Action | Effort | Verification |
|------|--------|--------|--------------|
| R.1 | Delete 8 stub rules files | 15 min | Files removed |
| R.2 | Document 8 deletions in decisions.md | 30 min | ADR entry for each |
| R.3 | Enhance 7 rules files with domain content | 2 hours | Each file > 60 lines with Core Principles + Anti-Patterns |
| R.4 | Update rules-catalog.md (if exists) | 15 min | Catalog matches on-disk |

### Phase 4: Documentation and Prevention (1-2 hours)

**Dependencies**: Phases 1-3 and R complete
**Parallelizable**: No

| Step | Action | Effort | Verification |
|------|--------|--------|--------------|
| 4.1 | Write ADR-095 in decisions.md | 30 min | ADR follows template |
| 4.2 | Update schema-creator rules to specify Structure B + additionalProperties:false + Draft-07 | 30 min | Rules match new standards |
| 4.3 | Update skill-creator post-creation checklist | 15 min | Checklist includes new schema standards |
| 4.4 | Record learnings in learnings.md | 15 min | Batch migration pattern documented |
| 4.5 | Update orphaned catalog entries (22 missing) | 30 min | Catalogs match on-disk counts |

### Total Effort Summary

| Phase | Description | Effort | Parallelizable |
|-------|-------------|--------|----------------|
| Phase 1 | Foundation (base schema, stub deletion) | 2-3 hours | No |
| Phase 2 | Batch standardization (additionalProperties, $id) | 2-3 hours | Partially |
| Phase 3 | Structure A migration (19 schemas) | 2-3 hours | No |
| Phase R | Rules cleanup (delete 8, enhance 7) | 2-3 hours | YES (parallel with 2-3) |
| Phase 4 | Documentation and prevention | 1-2 hours | No |
| **Total** | | **8-12 hours** | **~6-8 hours wall-clock with parallelism** |

### Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking schema consumers | No runtime validation exists; git revert available |
| Time overrun | Stop after Phase 2 if needed; Phases 3-4 can be deferred |
| Incorrect migration | Review git diff before committing each phase |
| Lost security schema quality | Backup A3 schemas before migration; preserve all domain properties |
| Orphaned references after deletion | Grep project for deleted filenames after each phase |

---

## 7. ADR-095: Schema Standards (Draft)

### ADR-095: Canonical Skill Output Schema Standard

**Date:** 2026-02-09
**Status:** Proposed

**Context:**
Skill expansion created 87 output schemas with two incompatible envelope structures (Structure A: skillName/version/timestamp/output used by 19 pre-existing schemas; Structure B: status/output used by 68 new schemas). Additionally, 70/87 schemas lacked `additionalProperties:false`, 12 were hollow stubs, and `$id` domains were inconsistent.

**Decision:**

1. **Canonical envelope**: Structure B (`{status: enum, output: object}`) with `additionalProperties: false` at root and output levels.
2. **JSON Schema version**: Draft-07 (`http://json-schema.org/draft-07/schema#`). Migration to 2020-12 deferred (zero features from 2020-12 are used; migration cost: 464 breaking edits).
3. **$id domain**: `https://agent-studio.dev/schemas/skill-{name}-output.schema.json`
4. **Generic base**: `generic-skill-output-base.schema.json` for skills without domain-specific output.
5. **Mandatory constraints**: All schemas must have `additionalProperties: false` at root. Schemas with defined output properties must also have `additionalProperties: false` on the output object.

**Alternatives Considered:**

1. **Structure A as canonical**: Rejected. Only 22% adoption; more complex; migration cost 3.5x higher.
2. **Draft 2020-12 migration**: Rejected. 464 breaking edits for zero feature benefit. All schemas use only Draft-07 keywords.
3. **$ref pattern for stubs**: Rejected. Draft-07 `$ref` replaces entire object; no runtime resolver exists; file deletion is simpler.
4. **Keep both structures**: Rejected. Bifurcation prevents generic validation logic; maintenance burden doubles.

**Consequences:**

- All 75 active schemas use identical envelope structure
- Generic base makes intentional genericity explicit
- `additionalProperties: false` prevents typo-based schema bypass
- Consistent `$id` prevents future `$ref` resolution issues
- Creator rules updated to enforce standard on new schemas

---

## 8. Schema Creator Rules Updates

The following changes must be made to `.claude/rules/schema-creator.md`:

1. **Draft version**: Change `2020-12` to `draft-07` in the template
2. **$id domain**: Change `https://agent-studio.dev/schemas/{schema-name}.json` to `https://agent-studio.dev/schemas/skill-{name}-output.schema.json`
3. **Mandatory properties**: Add `additionalProperties: false` to the template at both root and output levels
4. **Required fields**: Document that `status` (enum) and `output` (object) are the only root-level properties
5. **Generic base reference**: Document that skills without domain output should reference `generic-skill-output-base.schema.json` rather than creating a hollow stub

---

## 9. Success Criteria

| Metric | Before | After | Measurement |
|--------|--------|-------|-------------|
| Hollow stub schemas | 12 | 0 | Count schemas matching hollow pattern |
| Schemas with additionalProperties:false (root) | ~17 | 75 (100%) | Grep count |
| Schema envelope archetypes | 3+ (A, A2, A3, B) | 1 (B) | Manual verification |
| $id domain consistency | 2 domains + 12 missing | 1 domain, 0 missing | Grep count |
| Stub rules files | 15 | 0 (8 deleted + 7 enhanced) | Count files under 30 lines |
| Schema files on disk | 87 | 76 (75 active + 1 base) | ls count |

---

## Appendix A: Complete Schema Inventory by Migration Category

### Will NOT change (already Structure B with additionalProperties:false): ~17 schemas

These are Tier-1 schemas that already meet all standards (after $id domain fix).

### Will add additionalProperties:false only: ~38 schemas

Tier-2 schemas with domain properties in Structure B format but missing the constraint.

### Will migrate from Structure A1 to B: 14 schemas

Remove skillName/version/timestamp; add status enum.

### Will migrate from Structure A2 to B: 5 schemas

Rename result to output; remove skillName/timestamp; add status enum.

### Will migrate from Structure A3 to B: 5 schemas

Wrap flat properties in output object; add status enum at root.

### Will be deleted (hollow stubs): 12 schemas

Replaced by generic-skill-output-base.schema.json catalog reference.

### New schema: 1

`generic-skill-output-base.schema.json`

**Total after migration: 76 schema files (75 active + 1 base)**

---

## Appendix B: Stub Rules Deletion Rationale

| File | Lines | Why Delete |
|------|-------|-----------|
| scientific-skills.md | 18 | Meta-skill aggregating 139 sub-skills; no unified rules possible |
| git-expert.md | 18 | Thin CLI wrapper; SKILL.md has complete guidance |
| doc-generator.md | 18 | Documentation output; style is in SKILL.md |
| readme.md | 18 | README format covered by SKILL.md |
| summarize-changes.md | 18 | Text summarization; no domain-specific constraints |
| writing-skills.md | 18 | Writing style rules are in SKILL.md |
| binary-analysis-patterns.md | 18 | Forensics techniques documented in SKILL.md |
| memory-forensics.md | 18 | Forensics techniques documented in SKILL.md |

**Common deletion rationale**: Each of these 8 skills has a SKILL.md that provides complete guidance. The stub rules file adds only a name, one-line description, usage snippet, and reference link -- all of which are already present in the SKILL.md. The rules file consumes context budget (~200 tokens each, 1,600 total) while providing zero incremental value.
