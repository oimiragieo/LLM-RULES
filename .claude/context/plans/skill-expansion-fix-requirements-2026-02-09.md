# Requirements: Skill Expansion Quality Fixes

**Date:** 2026-02-09
**Author:** PM Agent (Task #3)
**Context:** Fix 4 critical quality issues from skill expansion QA and Code reviews
**Reviews Referenced:**
- `.claude/context/reports/qa/skill-expansion-qa-review-2026-02-09.md`
- `.claude/context/reports/architecture/code-review-skill-expansion-artifacts-2026-02-09.md`

---

## Executive Summary

The skill expansion successfully created ~299 files (87 schemas, 97 rules, 92 commands, 92 SKILL.md) with correct naming and catalog registration. However, QA and code review identified 4 critical quality issues reducing the expansion's value:

1. **55/87 schemas are hollow stubs** (63%) - only {status, output} with zero validation
2. **Two incompatible schema envelopes** - pre-existing (skillName/version/timestamp/output) vs new (status/output)
3. **15/97 rules files are minimal stubs** (15%) - 18-line templates with zero actionable guidance
4. **70/87 schemas missing additionalProperties:false** (80%) - accept arbitrary extra properties

This document defines requirements for fixing these issues in a batch-friendly, backward-compatible manner within session constraints.

---

## Problem Statement

**Evidence:**
- QA-001: 55/87 schemas (63%) are byte-for-byte identical hollow stubs
- QA-002: Two incompatible schema archetypes create consumer confusion
- QA-007: 14/97 rules (14%) provide zero value, consuming ~2,100 tokens
- QA-003: 72/87 schemas (83%) lack additionalProperties:false, undermining validation

**Why this matters:**
- Hollow stubs exist to satisfy completeness checks without delivering validation value
- Two schema patterns mean consumers can't write generic validation logic
- Stub rules waste context budget (97 rules x 200-1500 tokens = 30-80K tokens)
- Missing additionalProperties allows typos and schema bypass

**Impact:**
- 55 files consuming disk/catalog with zero validation value
- Technical debt compounds as more skills use inconsistent patterns
- Context overload from minimal-value artifacts
- False sense of completion

---

## Key Hypothesis

**Hypothesis:** Consolidating hollow stubs into shared templates, standardizing schema envelopes, and enhancing/removing stub rules will improve artifact quality without breaking existing consumers.

**Measurable Outcome:**
- Schema validation coverage increases from 37% to 90%+
- Context load from stub rules decreases by 2,100+ tokens
- All schemas use single envelope structure
- Zero backward compatibility breaks

---

## User Stories

### US-1: Schema Consumer Developer

**As a** developer writing code that validates skill output
**I want** schemas to have consistent structure and meaningful validation
**So that** I can rely on schema validation to catch errors

**Acceptance Criteria:**
- [ ] All schemas use the same root envelope structure (pick one: status/output OR skillName/version/timestamp/output)
- [ ] Skills without domain-specific output use an explicitly-generic base schema
- [ ] Domain-specific schemas define actual properties with type constraints
- [ ] All schemas include `additionalProperties: false` at root and output levels
- [ ] Schemas use consistent $id domain (agent-studio.dev)

---

### US-2: Agent Loading Rules

**As an** agent loading rules into context
**I want** rules files to provide actionable guidance
**So that** I don't waste context budget on minimal stubs

**Acceptance Criteria:**
- [ ] Rules files under 30 lines are flagged for review
- [ ] Rules lacking Core Principles, Anti-Patterns, or Integration Points are enhanced or removed
- [ ] Stub rules for truly generic skills are deleted (SKILL.md already documents)
- [ ] Domain-specific skills (consensus-voting, diagram-generator) have comprehensive rules
- [ ] Deleted stubs are documented in decisions.md with rationale

---

### US-3: Schema Author

**As a** skill creator authoring a new schema
**I want** a clear template and examples
**So that** I don't create another hollow stub

**Acceptance Criteria:**
- [ ] Schema-creator rules specify single canonical envelope (with examples)
- [ ] Template includes additionalProperties:false by default
- [ ] Examples show domain-specific properties for well-structured schemas
- [ ] CI gate rejects schemas without additionalProperties:false
- [ ] ADR documents schema standards and migration path

---

### US-4: Framework Maintainer

**As a** framework maintainer
**I want** batch-friendly tools to fix existing issues
**So that** I can address ~300 files efficiently

**Acceptance Criteria:**
- [ ] Script to add additionalProperties:false to all schemas
- [ ] Script to standardize $id domain across schemas
- [ ] Tool to detect rules files under N lines
- [ ] Automated test for schema completeness
- [ ] Documentation of fix process for future batches

---

## MoSCoW Prioritization

### Must Have (P0 - Blocking)

**M-1: Consolidate Hollow Stub Schemas**
- **Rationale:** 55 identical files provide zero value
- **Scope:** Create `skill-default-output.schema.json`, delete 55 stubs, update catalog references
- **Impact:** HIGH - removes useless files, clarifies intent
- **Effort:** LOW - 1-2 hours
- **Acceptance:** 55 hollow stubs replaced with 1 base schema reference

**M-2: Add additionalProperties:false to ALL Schemas**
- **Rationale:** 70/87 schemas accept arbitrary extra properties (security + quality issue)
- **Scope:** Add constraint to all schemas at root and output levels
- **Impact:** HIGH - improves validation quality
- **Effort:** LOW - batch script (30 minutes)
- **Acceptance:** 100% of schemas have additionalProperties:false

**M-3: Standardize Schema Envelope**
- **Rationale:** Two incompatible patterns confuse consumers
- **Scope:** Pick canonical envelope (recommend status/output), document in ADR, migrate pre-existing schemas
- **Impact:** MEDIUM - consistency enables generic consumers
- **Effort:** MEDIUM - requires migration script + testing
- **Acceptance:** All schemas use same root structure

**M-4: Delete or Enhance Stub Rules**
- **Rationale:** 15 stub rules waste 2,100 tokens with zero guidance
- **Scope:** Delete 8 truly-generic stubs, enhance 7 domain-specific ones
- **Impact:** MEDIUM - reduces context load, improves guidance
- **Effort:** MEDIUM - per-skill review
- **Acceptance:** Zero rules files under 30 lines without documented rationale

### Should Have (P1 - High Priority)

**S-1: Standardize $id Domain**
- **Rationale:** Mixed domains (claude-code.anthropic.com vs agent-studio.dev) cause resolution failures
- **Scope:** Change all to agent-studio.dev, consistent path suffixes
- **Impact:** MEDIUM - prevents future resolution bugs
- **Effort:** LOW - regex replace
- **Acceptance:** All $id use agent-studio.dev domain

**S-2: Enhance Security Skill Schemas**
- **Rationale:** 5 Trail of Bits skills have excellent rules but minimal schemas
- **Scope:** Add domain-specific properties for differential-review, insecure-defaults, static-analysis, variant-analysis, semgrep-rule-creator
- **Impact:** MEDIUM - matches schema quality to rules quality
- **Effort:** MEDIUM - per-skill work
- **Acceptance:** 5 security schemas match tdd/plan-generator quality

**S-3: Update Orphaned Catalog Entries**
- **Rationale:** 11 commands and 11 rules not in catalogs (invisible to catalog-based discovery)
- **Scope:** Add 22 entries to catalogs
- **Impact:** LOW-MEDIUM - restores discoverability
- **Effort:** LOW - 30 minutes
- **Acceptance:** Catalog counts match on-disk files

### Could Have (P2 - Nice to Have)

**C-1: CI Gate for Schema Quality**
- **Rationale:** Prevent future hollow stubs
- **Scope:** Pre-commit hook rejecting schemas without additionalProperties:false
- **Impact:** MEDIUM - prevents regression
- **Effort:** LOW - simple script
- **Acceptance:** CI blocks hollow stubs

**C-2: Provenance Headers**
- **Rationale:** Cannot trace which batch created which artifacts
- **Scope:** Add headers to all stub schemas and rules
- **Impact:** LOW - audit trail
- **Effort:** LOW - batch script
- **Acceptance:** All files have provenance

### Won't Have (Out of Scope)

**W-1: Migrate to JSON Schema Draft 2020-12**
- **Rationale:** All 116 schemas use Draft-07; migration is large effort
- **Why not:** Draft-07 works; migration can be separate initiative
- **Alternative:** Document Draft-07 as project standard in ADR

**W-2: Selective Rules Loading**
- **Rationale:** Claude Code auto-loads all rules; selective loading requires framework changes
- **Why not:** Outside skill expansion scope, requires architecture changes
- **Alternative:** Focus on removing low-value stub rules

**W-3: Auto-Generate Domain Schemas**
- **Rationale:** LLM could infer output properties from SKILL.md
- **Why not:** Low confidence in quality, manual review still needed
- **Alternative:** Manual enhancement for high-value skills

---

## Implementation Phases

### Phase 1: Consolidation (Must-Have M-1, M-2)
**Duration:** 2-3 hours
**Dependencies:** None
**Deliverables:**
1. `skill-default-output.schema.json` created
2. 55 hollow stubs deleted
3. Catalog references updated
4. Script to add additionalProperties:false
5. All 87 schemas updated

### Phase 2: Standardization (Must-Have M-3, Should-Have S-1)
**Duration:** 3-4 hours
**Dependencies:** Phase 1 complete (avoids touching deleted stubs)
**Deliverables:**
1. ADR documenting canonical schema envelope
2. Migration script for pre-existing schemas
3. All schemas use status/output envelope
4. All $id use agent-studio.dev domain

### Phase 3: Rules Cleanup (Must-Have M-4, Should-Have S-3)
**Duration:** 2-3 hours
**Dependencies:** None (can run parallel with Phase 1-2)
**Deliverables:**
1. 8 truly-generic stub rules deleted
2. 7 domain-specific stubs enhanced
3. Deletion rationale in decisions.md
4. 22 orphaned catalog entries added

### Phase 4: Enhancement (Should-Have S-2, Could-Have C-1, C-2)
**Duration:** 3-4 hours
**Dependencies:** Phase 2 complete (uses standardized envelope)
**Deliverables:**
1. 5 security skill schemas enhanced
2. CI gate implemented
3. Provenance headers added

**Total Estimated Time:** 10-14 hours (within session constraints if parallelized)

---

## Success Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Hollow stub schemas | 55/87 (63%) | 0/87 (0%) | Count schemas with only status/output |
| Schema validation coverage | 32/87 (37%) | 78+/87 (90%) | Schemas with additionalProperties:false + domain properties |
| Stub rules files | 15/97 (15%) | 0/97 (0%) | Rules under 30 lines without documented rationale |
| Schema envelope consistency | 2 archetypes | 1 archetype | All use same root structure |
| Context load from stubs | ~2,100 tokens | 0 tokens | Estimate from deleted rules |
| $id domain consistency | 2 domains | 1 domain | All use agent-studio.dev |

---

## Scope Boundaries

### In Scope
- Schema consolidation, standardization, enhancement
- Rules deletion/enhancement for 15 identified stubs
- Catalog updates for 22 orphaned entries
- CI gate for schema quality
- Documentation (ADR, decisions.md)

### Out of Scope
- Draft 2020-12 migration (separate initiative)
- Selective rules loading (requires framework changes)
- Auto-generation of domain schemas (low confidence)
- Retroactive enhancement of all Tier-2 schemas (only security skills)
- Command file changes (already 97% compliant)

### Constraints
- **Backward Compatibility:** Must not break existing schema consumers
- **Session Time:** 10-14 hours total (parallelizable to 8-10 hours wall-clock)
- **Batch-Friendly:** Must handle ~300 files efficiently with scripts
- **Quality Bar:** Enhanced schemas must match tdd/plan-generator examples

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation | Rollback |
|------|--------|-------------|------------|----------|
| Breaking schema consumers | HIGH | LOW | Test schema validation before/after, gradual rollout | Git revert schemas |
| Deleting useful rules | MEDIUM | MEDIUM | Review each stub individually, document deletions | Restore from git |
| Envelope migration bugs | HIGH | MEDIUM | Automated tests, manual spot-check of 10+ schemas | Keep old envelope in parallel (deprecated) |
| Time overrun | MEDIUM | MEDIUM | Prioritize P0 (Must-Have), defer P2 (Could-Have) | Stop at Phase 3 |
| Orphaned references | MEDIUM | LOW | Cross-reference scan after deletion | Add back if broken links found |

---

## Dependencies

**Prerequisites:**
- Git working directory clean (able to create feature branch)
- No concurrent schema/rules changes
- Access to run batch scripts

**External:**
- None (all fixes within skill expansion artifacts)

**Blocking:**
- None (can proceed immediately)

---

## Acceptance Criteria (Overall)

- [ ] Zero hollow stub schemas exist (55 deleted, base schema created)
- [ ] All 87 schemas have additionalProperties:false at root and output
- [ ] All schemas use consistent envelope structure (status/output)
- [ ] All $id use agent-studio.dev domain with consistent path
- [ ] Zero rules files under 30 lines without documented rationale (8 deleted, 7 enhanced)
- [ ] 22 orphaned catalog entries added (11 commands, 11 rules)
- [ ] 5 security skill schemas enhanced with domain properties
- [ ] CI gate rejects schemas without additionalProperties:false
- [ ] ADR documents schema standards and migration path
- [ ] All changes verified with test suite passing
- [ ] Backward compatibility verified (no consumer breaks)

---

## Next Steps

1. **Planner Review:** Planner agent to create detailed implementation plan with executable commands
2. **Developer Execution:** Batch scripts for schema fixes (Phases 1-2)
3. **Manual Review:** Per-skill enhancement for 7 rules + 5 schemas (Phases 3-4)
4. **QA Validation:** Verify all acceptance criteria met
5. **Documentation:** Update ADRs, learnings.md, decisions.md

---

*Requirements defined by PM agent, 2026-02-09*
