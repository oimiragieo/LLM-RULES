<!-- Agent: reflection | Task: #1 | Session: 2026-02-09 -->

# Skill Expansion Fix Priorities

**Date**: 2026-02-09
**Source**: Consolidated synthesis of 4 review reports (QA, Architecture/Code Review, DevOps, Reflection)
**Overall Grade**: C+ to B- range (coverage excellent, depth poor)

---

## Problem Summary

The skill expansion batch created ~299 artifacts (87 schemas, 97 rules, 92 commands, 5 skill dirs). While coverage is 100% (every skill has a triad), quality is uneven:

- **63% of schemas are hollow stubs** that validate nothing (55/87)
- **83% of schemas lack `additionalProperties:false`** (72/87)
- **Two incompatible schema envelopes** coexist (Draft-07 vs documented 2020-12)
- **15 rules files are minimal stubs** (~18 lines, zero guidance)
- **22 artifacts missing from catalogs** (11 commands + 11 rules)
- **30-80K tokens consumed** by auto-loaded rules before any task work begins

---

## Consolidated Action List (Prioritized)

### TIER 1: IMMEDIATE (Before next commit) -- ~4 hours

| # | Action | Effort | Impact | Finding IDs |
|---|--------|--------|--------|-------------|
| 1 | **Create `skill-default-output.schema.json`** as shared fallback. Replace 55 identical hollow stubs with references to this single base schema. Makes intentional genericity explicit. | 1-2h | HIGH | QA-001, QA-012, I-1, Reflection-P1 |
| 2 | **Add `additionalProperties:false`** to all ~72 schemas missing it (both root and output levels). Script: iterate `.claude/schemas/skill-*-output.schema.json`, add property if absent. | 2-3h | HIGH (Security) | QA-003, I-2, Reflection-P0, SEC-FND-001 |
| 3 | **Update catalogs** with 22 orphaned entries: add 11 commands to command-catalog.md and 11 rules to rules-catalog.md. Mechanical markdown table updates. | 30min | MEDIUM | QA-005, QA-006 |
| 4 | **Add `**/.indexing.lock` to `.gitignore`**. Lock file from code indexing test should not be tracked. | 5min | LOW | DevOps-High-1 |

**Verification**: After Tier 1, all schemas should have `additionalProperties:false`, catalog counts should match on-disk file counts, and hollow stubs should be consolidated.

### TIER 2: SHORT-TERM (Next sprint) -- ~6 hours

| # | Action | Effort | Impact | Finding IDs |
|---|--------|--------|--------|-------------|
| 5 | **Create ADR for canonical schema envelope**. Document decision: Structure B (`{status, output}`) with mandatory `additionalProperties:false`. Plan migration path for Structure A schemas. | 1h | HIGH | QA-002, I-4, Code-Review-P1-1 |
| 6 | **Delete or enhance 15 stub rules files**. For skills with genuinely no domain rules (e.g., summarize-changes), delete the stub. For skills that should have rules (e.g., consensus-voting, diagram-generator), add real content. Reduces context noise by ~2,100 tokens. | 2-3h | MEDIUM | QA-007, I-5 |
| 7 | **Standardize `$id` domain** to `agent-studio.dev` across all schemas. Remove `claude-code.anthropic.com` references. Ensure consistent `.schema.json` suffix. | 1h | MEDIUM | QA-010, I-3 |
| 8 | **Resolve schema draft version**. All schemas use Draft-07 in practice but schema-creator rules specify Draft 2020-12. Update creator rules to document Draft-07 as project standard (or migrate). | 30min | LOW | M-1 |

**Verification**: ADR created in decisions.md, stub rules count reduced, all `$id` domains consistent.

### TIER 3: MEDIUM-TERM (Next 2 sprints) -- ~8 hours

| # | Action | Effort | Impact | Finding IDs |
|---|--------|--------|--------|-------------|
| 9 | **Enhance 5 Trail of Bits security skill schemas** to Tier 1 quality. Extract domain-specific properties from their SKILL.md structure. These are the highest-value skills and deserve matching schema quality. | 3-4h | MEDIUM | M-4 |
| 10 | **Complete companion artifacts** for 8+ skills missing them (on-call-handoff-patterns, database-architect, accessibility, context-compressor, artifact-updater, command-creator, rule-creator, tool-creator). | 4h | LOW-MEDIUM | QA-008 |
| 11 | **Add provenance headers** to all stub files missing them (~85% of schemas, ~70% of rules). Scriptable batch update. | 1h | LOW | M-3 |

### TIER 4: PROCESS IMPROVEMENTS (Ongoing)

| # | Action | Effort | Impact | Finding IDs |
|---|--------|--------|--------|-------------|
| 12 | **CI schema quality gate**: Reject schemas without `additionalProperties:false` or with hollow stub pattern. | 2-3h | HIGH (preventive) | Code-Review-P3-7 |
| 13 | **Rules quality audit tool**: Flag rules files under 30 lines as potential stubs needing review or deletion. | 1-2h | MEDIUM (preventive) | Code-Review-P3-8 |
| 14 | **Pre-commit hook** for skill artifact completeness (every skill has at least SKILL.md + rules file). | 2h | MEDIUM (preventive) | DevOps-Low-2 |
| 15 | **ADR: Tiered artifact creation approach**. Document when full triads vs minimal artifacts are appropriate. Define Tier 1/2/3 criteria. | 1h | HIGH (preventive) | Reflection-Future-6 |
| 16 | **Context overload mitigation**: Investigate selective rules loading, consolidate stub rules, or implement lazy loading for rules files. | 4-8h | HIGH | QA-004 |

---

## Key Metrics to Track

| Metric | Current | Target (After Tier 1) | Target (After Tier 2) |
|--------|---------|----------------------|----------------------|
| Hollow stub schemas | 55 (63%) | 0 (consolidated to default) | 0 |
| Schemas with `additionalProperties:false` | 15 (17%) | 87 (100%) | 87 (100%) |
| Orphaned catalog entries | 22 | 0 | 0 |
| Stub rules files | 15 (15%) | 15 | 0 |
| Schema envelope archetypes | 2 | 2 (but documented) | 1 (migrated) |
| Context token load from rules | ~30-80K | ~30-80K | ~25-60K (stubs removed) |

---

## Cross-Review Agreement Matrix

All 4 reviews agreed on these findings (high confidence):

1. **Hollow stub schemas are the #1 problem** (all 4 reviews flagged)
2. **Missing `additionalProperties:false` is a security gap** (3 of 4 reviews)
3. **Command quality is the strongest dimension** (3 of 4 reviews)
4. **Trail of Bits security skills are exceptional quality** (2 of 4 reviews)
5. **Catalog orphans need immediate fix** (2 of 4 reviews)
6. **Context overload from auto-loaded rules is a systemic risk** (2 of 4 reviews)

Reviews diverged on:
- DevOps found zero critical issues (infrastructure perspective is clean)
- QA and Code Review both graded C+/B- (quality perspective sees debt)
- Reflection scored 0.72/1.0 (barely passing, consistency masks quality gaps)

---

## Decision Required

**Before executing Tier 1, decide:**

1. **Hollow stubs**: Delete (fewer files) vs. consolidate to default schema (explicit genericity)?
   - Recommendation: Consolidate to default schema (preserves catalog entries, makes intention clear)

2. **Schema envelope**: Migrate Structure A to B, or vice versa?
   - Recommendation: Keep Structure B (`{status, output}`), migrate Structure A in Tier 2

3. **Draft version**: Adopt Draft-07 as standard, or migrate to 2020-12?
   - Recommendation: Adopt Draft-07 (matches reality, less migration work)

---

*Generated by reflection-agent synthesizing 4 review reports*
