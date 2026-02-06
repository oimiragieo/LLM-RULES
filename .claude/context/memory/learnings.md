- Check if future use expected (backups, sessions, ml, memory subdirs) → KEEP .gitkeep
- Otherwise → DELETE directory

3. **Non-empty directory with .gitkeep**:
   - Remove .gitkeep (it served its purpose - directory won't be deleted by git)

**File Relocation Pattern**:

When moving files to comply with conventions:

1. Create target directory if it doesn't exist
2. Move files with `mv source/* target/`
3. Verify files moved successfully
4. Remove now-empty source directory
5. Update any path references in code (use `grep -r` to find references)

**Plans vs Artifacts Distinction**:

- **Plans** (`.claude/context/plans/`): Implementation plans, design docs, roadmaps
  - Examples: PHASE_1_IMPLEMENTATION_PLAN.md, deployment-execution-log.md
- **Artifacts** (`.claude/context/artifacts/`): Catalogs, analysis, summaries, specs
  - Examples: skill-catalog.md, gap-analysis, architecture-review-findings.md

**Empty Directory Categories**:

1. **Expected empty** (KEEP): tmp, backups, sessions, ml, memory subdirectories
2. **Superseded** (DELETE): data/code-index (replaced by data/lancedb)
3. **Obsolete** (DELETE): checkpoints, archive directories
4. **Empty after migration** (DELETE): artifacts/plans (after moving to context/plans)

### Files Modified

**File Relocations**:

- 18 plan files: `artifacts/plans/*.md` → `context/plans/*.md`

**Directories Deleted** (9):

- artifacts/plans/, artifacts/error-reports/archive/, artifacts/phase-2-tests/, artifacts/reports/archive/, artifacts/reports/, checkpoints/, data/code-index/, reports/archive/, reports/database/

**Files Deleted** (8 .gitkeep files):

- artifacts/, artifacts/analysis/, artifacts/catalogs/, artifacts/database/, artifacts/summaries/, reports/, reports/database/, self-healing/

### Impact

- ✅ **Workspace conventions compliant**: Plans in `context/plans/`, reports in `context/reports/`
- ✅ **No empty directories** (except tmp and intentional future-use directories)
- ✅ **No orphaned .gitkeep files** (removed from directories with content)
- ✅ **Clean directory structure**: 18 top-level directories, all with clear purpose
- ✅ **No broken references**: Plans moved to correct location per conventions
- ✅ **Memory preserved**: .gitkeep kept in memory subdirectories for git tracking
