# Skills System Audit Report

**Date**: 2026-02-05
**Agent**: developer
**Task ID**: audit-skills-001

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| **Filesystem SKILL.md files** | 444 | - |
| **Index entries** | 434 | - |
| **Missing from index** | 149 | CRITICAL |
| **Stale in index** | 139 | CRITICAL |
| **Net discrepancy** | +10 (149 - 139) | - |
| **Creator skills wiring** | 7/7 OK | PASS |
| **Skill catalog** | 809 lines, valid | PASS |

## Issue Summary

### 1. CRITICAL: Missing Skills from Index (149 total)

These skills exist in filesystem but are NOT in skill-index.json:

**Core Missing Skills (7)**:
1. `advanced-elicitation`
2. `code-semantic-search`
3. `code-structural-search`
4. `planning-with-files`
5. `sparc-methodology`
6. `spec-init`
7. `test-skill-e2e-1769915216355`

**Scientific-Skills Path Mismatch (142)**:
The index has entries with path `scientific-skills/<name>` but filesystem has `scientific-skills/skills/<name>`.

Examples:
- Index: `scientific-skills/biopython`
- Filesystem: `scientific-skills/skills/biopython`

All 142 scientific-skills entries have this path mismatch.

### 2. CRITICAL: Stale Entries in Index (139 total)

These entries exist in index but NOT in filesystem:

**Completely Invalid Entry (1)**:
- `mobile-ux-reviewer` - This is an AGENT, not a SKILL. No `.claude/skills/mobile-ux-reviewer/SKILL.md` exists.

**Path Mismatch Entries (138)**:
All `scientific-skills/<name>` entries in index that should be `scientific-skills/skills/<name>`.

Examples of stale paths:
- `scientific-skills/rdkit`
- `scientific-skills/scanpy`
- `scientific-skills/biopython`
- `scientific-skills/chembl-database`
- `scientific-skills/uniprot-database`
- `scientific-skills/pubmed-database`
- ... (138 total)

### 3. Root Cause Analysis

**Issue**: The skill index generator at `.claude/tools/cli/generate-skill-index.cjs` does NOT handle nested skill directories correctly.

**Evidence**:
- Filesystem path: `.claude/skills/scientific-skills/skills/biopython/SKILL.md`
- Expected index key: `scientific-skills/skills/biopython`
- Actual index key: `scientific-skills/biopython`

The generator is stripping the intermediate `skills/` directory from the path.

---

## Detailed Inventory

### Filesystem Skill Count by Category

| Directory | SKILL.md Count |
|-----------|----------------|
| `.claude/skills/` (top-level) | 301 |
| `.claude/skills/scientific-skills/` | 1 (parent) |
| `.claude/skills/scientific-skills/skills/` | 142 (nested) |
| **Total** | **444** |

### Index Statistics

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-02-05T03:16:14.785Z",
  "metadata": {
    "totalSkills": 434,
    "totalDomains": 22,
    "totalCategories": 25
  }
}
```

### Skill Catalog Statistics

- **File**: `.claude/context/artifacts/skill-catalog.md`
- **Lines**: 809
- **Format**: Valid markdown
- **Last Updated**: 2026-01-30
- **Claimed Total**: 436 (2 deprecated)

**Catalog Accuracy**: The catalog claims 436 skills but index has 434. This is a minor discrepancy.

---

## Creator Skills Verification

| Skill | In Filesystem | In Index | Status |
|-------|---------------|----------|--------|
| `research-synthesis` | YES | YES | PASS |
| `skill-creator` | YES | YES | PASS |
| `agent-creator` | YES | YES | PASS |
| `hook-creator` | YES | YES | PASS |
| `workflow-creator` | YES | YES | PASS |
| `template-creator` | YES | YES | PASS |
| `schema-creator` | YES | YES | PASS |

**Creator Skills Wiring**: All 7 creator skills are properly indexed and accessible.

---

## Skill Invocation Testing

The Skill() tool properly loads skills when invoked. The skills loaded during this session:

| Skill | Status |
|-------|--------|
| `tdd` | Loaded successfully |
| `debugging` | Loaded successfully |
| `git-expert` | Loaded successfully |
| `ripgrep` | Loaded successfully |
| `code-semantic-search` | Loaded successfully |
| `code-structural-search` | Loaded successfully |
| `security-architect` | Loaded successfully |
| `context-compressor` | Loaded successfully |
| `github-mcp` | Loaded successfully |
| `verification-before-completion` | Loaded successfully |
| `checklist-generator` | Loaded successfully |
| `code-analyzer` | Loaded successfully |
| `code-quality-expert` | Loaded successfully |
| `code-style-validator` | Loaded successfully |
| `chrome-browser` | Loaded successfully |
| `commit-validator` | Loaded successfully |

**Note**: Skill invocation works even for skills missing from index because the Skill() tool appears to use filesystem discovery as fallback.

---

## Orphan Files Analysis

Non-SKILL.md markdown files in skills directory (supporting documentation):

| File | Purpose |
|------|---------|
| `arxiv-mcp/references/original-README.md` | Reference |
| `code-structural-search/PATTERNS.md` | Pattern examples |
| `code-structural-search/README.md` | Documentation |
| `composition-patterns-vercel/rules/*.md` | Rule definitions |
| `computer-use/references/api-reference.md` | API docs |
| `debugging/*.md` | Supporting techniques |
| `gitops-workflow/references/*.md` | ArgoCD setup |
| `helm-chart-scaffolding/references/*.md` | Chart structure |
| `k8s-*/references/*.md` | K8s reference docs |
| `project-analyzer/references/*.md` | Pattern definitions |
| `react-best-practices-vercel/rules/*.md` | Rule definitions |

These are NOT orphans - they are supporting documentation files correctly placed within skill directories.

---

## Remediation Plan

### Priority 1: Fix Index Generator (CRITICAL)

**File**: `.claude/tools/cli/generate-skill-index.cjs`

**Fix Required**: Handle nested skill directories correctly.

```javascript
// Current behavior (WRONG):
// .claude/skills/scientific-skills/skills/biopython/SKILL.md -> scientific-skills/biopython

// Expected behavior (CORRECT):
// .claude/skills/scientific-skills/skills/biopython/SKILL.md -> scientific-skills/skills/biopython
```

### Priority 2: Remove Stale Entry

Remove `mobile-ux-reviewer` from skill-index.json - this is an AGENT, not a SKILL.

### Priority 3: Regenerate Index

After fixing the generator:
```bash
node .claude/tools/cli/generate-skill-index.cjs
```

This should:
1. Add 7 missing core skills
2. Fix 142 scientific-skills paths
3. Remove 1 stale entry (mobile-ux-reviewer)

### Priority 4: Update Skill Catalog

Update `.claude/context/artifacts/skill-catalog.md` to reflect accurate counts after index regeneration.

---

## Files Affected

| File | Action Required |
|------|-----------------|
| `.claude/tools/cli/generate-skill-index.cjs` | FIX: Nested directory handling |
| `.claude/config/skill-index.json` | REGENERATE after fix |
| `.claude/context/artifacts/skill-catalog.md` | UPDATE counts |

---

## Verification Checklist

After remediation:
- [ ] Index generator handles nested directories
- [ ] `mobile-ux-reviewer` removed from skill-index.json
- [ ] All 444 filesystem skills have index entries
- [ ] All index entries have filesystem SKILL.md files
- [ ] Skill catalog count matches index count
- [ ] Creator skills still accessible via Skill()

---

## Cross-Reference to Previous Findings

This audit confirms findings from learnings.md entry **TASK-006-SKILL-INDEX** (2026-02-04):

> **Root Causes**:
> 1. **11 skills missing from index** (not indexed at all)
> 2. **1 stale entry in index** (mobile-ux-reviewer - doesn't exist in filesystem)
> 3. **142 scientific-skills path mismatch** (index has `scientific-skills/X` but filesystem has `scientific-skills/skills/X`)

**Note**: The previous audit found 11 missing. This audit found 7 core + 142 path-mismatched = 149 total missing. The difference is because the 4 document-skills (`docx`, `pdf`, `pptx`, `xlsx`) are under `scientific-skills/skills/document-skills/` and were counted separately.

---

## Summary

| Issue | Count | Severity | Remediation |
|-------|-------|----------|-------------|
| Missing skills (core) | 7 | HIGH | Add to index |
| Missing skills (path) | 142 | CRITICAL | Fix generator |
| Stale entries (path) | 138 | CRITICAL | Fix generator |
| Stale entries (invalid) | 1 | HIGH | Remove |
| Creator skills | 0 issues | - | None |
| Skill invocation | 0 issues | - | None |
| Supporting files | 0 issues | - | None |

**Overall Status**: CRITICAL - Index generator bug causes 280 incorrect entries (138 stale + 142 missing due to path mismatch).

---

**Report Generated**: 2026-02-05
**Auditor**: developer agent
**Task ID**: audit-skills-001
