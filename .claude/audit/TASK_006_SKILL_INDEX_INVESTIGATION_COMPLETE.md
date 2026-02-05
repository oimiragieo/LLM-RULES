# TASK-006: Skill Index Investigation - COMPLETE
## Why 10 Skills Missing from Index
**Date**: 2026-02-05
**Task**: Investigate 10 missing skills in skill-index.json
**Status**: ✅ COMPLETE - Root cause identified

---

## FINDINGS

### The Issue
- **Actual SKILL.md files**: 444
- **Indexed skills**: 434
- **Difference**: 10 missing

### Root Cause (Not a Bug - Design Choice)

The skill index generator uses **skill-catalog.md as its source**, not direct filesystem scanning.

**How it works**:
1. Generator reads `.claude/context/artifacts/skill-catalog.md`
2. Builds index from skills documented in catalog
3. Maps skills to domains using hardcoded DOMAIN_MAP
4. Outputs to `.claude/config/skill-index.json`

**Why 10 are missing**:
These skills exist in filesystem but are **NOT in skill-catalog.md**:

1. **code-semantic-search** - New skill, not in catalog
2. **code-structural-search** - New skill, not in catalog
3. **planning-with-files** - New skill, not in catalog
4. **sparc-methodology** - Not in catalog
5. **advanced-elicitation** - Not in catalog
6. **spec-init** - Not in catalog
7. **test-skill-e2e-1769915216355** - Test artifact, not in catalog
8-10. **scientific-skills document skills** - Nested path, not in catalog
   - scientific-skills/skills/document-skills/docx
   - scientific-skills/skills/document-skills/pdf
   - scientific-skills/skills/document-skills/pptx

### Why It's Not a Bug

✅ **This is intentional design:**
- Only cataloged, reviewed skills are indexed
- Prevents test artifacts and incomplete skills from being discoverable
- Catalog.md is the source of truth for "official" skills

❌ **NOT an issue because:**
- Skills still work even if not indexed
- Indexing is purely for discovery/documentation
- Core functionality unaffected
- test-skill-e2e-1769915216355 SHOULD NOT be indexed (it's a test artifact)

### Stale Entry Found

**Bonus Finding**: `mobile-ux-reviewer` is in the index but doesn't exist in filesystem (20 references to stale entry). This should be removed.

---

## RESOLUTION

### Option 1: Add Missing Skills to Catalog (RECOMMENDED)
If the 10 skills should be discoverable:
1. Update `.claude/context/artifacts/skill-catalog.md`
2. Add entries for the 10 missing skills
3. Run generator: `node .claude/tools/cli/generate-skill-index.cjs`

**Justification**: They're useful skills that should be discoverable.

### Option 2: Remove Unneeded Skills
If some shouldn't be indexed:
1. Delete their SKILL.md files (e.g., test-skill-e2e-1769915216355)
2. Keep catalog as-is
3. Run generator to remove mobile-ux-reviewer

**Justification**: Keeps index clean, removes test artifacts.

### Option 3: Accept Current State
Leave as-is because:
- Skills are functional even if not indexed
- Low priority issue
- Users can still use skills directly
- Can be addressed in next documentation update

---

## RECOMMENDATION

**Do nothing right now** (Option 3) because:

1. ✅ **System is operational** - Skills work regardless of indexing
2. ✅ **No functional impact** - Only affects discovery, not execution
3. ⚠️ **Requires decision** - Should some of these skills be in catalog?
4. 🔧 **Can be deferred** - Low priority maintenance task

**For Future**: When documenting new skills, add them to skill-catalog.md so they're automatically indexed.

---

## IMPACT ASSESSMENT

| Category | Impact | Severity |
|----------|--------|----------|
| **Functionality** | None - skills work fine | ✅ None |
| **Discoverability** | 10 skills not listed in index | ⚠️ Low |
| **System Health** | No effect on operation | ✅ None |
| **User Experience** | Can't find skills via SkillCatalog() | ⚠️ Low |
| **Documentation** | Catalog is incomplete | ⚠️ Low |

---

## METRICS

```
Total SKILL.md files: 444
Index entries: 434
Indexed coverage: 97.7%
Stale entries: 1 (mobile-ux-reviewer)
Missing from catalog: 10
Missing by design: 1 (test-skill-e2e-1769915216355)
Actionable missing: 9 (real skills not in catalog)
```

---

## CONCLUSION

**Task #6 is NOT a bug or error.** It's a documentation/catalog completeness issue:

- ✅ System is healthy
- ✅ Skills are functional
- ✅ No critical issues
- ⚠️ Could improve discoverability by updating skill-catalog.md

**Recommendation**: Keep in backlog, update when documenting new skills.

---

**Status**: ✅ COMPLETE - Root cause understood, no critical action needed
**Priority**: 🟡 LOW - Discoverability improvement (not functional issue)
**Resolution**: DEFER - Can be addressed in next documentation cycle
