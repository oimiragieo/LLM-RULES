# Archived Validation Scripts

This directory contains validation scripts that are no longer active but are preserved for reference.

## Archived Scripts

### validate-index.mjs (archived 2026-02-07)

**Reason:** Overlapping functionality with `validate-rule-index-paths.mjs` (subset/superset relationship).

**Issues:**
- Had phantom import: `.claude/tools/context/context-path-resolver.mjs` (old path from pre-Pipeline #7)
- Only validated paths in rule-index.json
- `validate-rule-index-paths.mjs` validates paths AND version compatibility (superset)
- Root wrapper `scripts/validate-index.mjs` now delegates to superset

**What happened:**
- Root wrapper updated to delegate to `validate-rule-index-paths.mjs`
- Implementation archived to avoid confusion
- `pnpm validate:index` npm script still works (delegates to superset)

**Restoration:** Not recommended. The superset `validate-rule-index-paths.mjs` covers all functionality plus version checking.

## General Restoration Process

To restore an archived script:

1. Verify it's not redundant with existing scripts
2. Fix any broken imports/references
3. Ensure package.json script entry still points correctly
4. Test thoroughly
5. Use `git mv` to restore: `git mv scripts/validation/_archive/script.mjs scripts/validation/script.mjs`
6. Update this README to remove the archived entry
