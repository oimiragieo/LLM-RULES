# Archived Testing Scripts

This directory contains testing scripts that are no longer active but are preserved for reference.

## Archived Scripts

### benchmark-ml-performance.cjs (archived 2026-02-07)

**Reason:** Dead script with no package.json wiring and broken relative import paths.

**Issues:**

- Used relative paths like `./.claude/lib/ml/pattern-detector.cjs` which resolved from CWD, not script location
- ML modules may not exist or are not in use
- No npm script entry
- No references from any agent, workflow, or other code

**Restoration:** If ML benchmarking is needed in the future:

1. Verify ML modules exist at correct paths
2. Fix relative imports to use proper path resolution
3. Add package.json script entry
4. Add to relevant workflows

## General Restoration Process

To restore an archived script:

1. Verify dependencies exist
2. Fix any broken imports/references
3. Add package.json script entry if needed
4. Test thoroughly
5. Use `git mv` to restore: `git mv scripts/testing/_archive/script.cjs scripts/testing/script.cjs`
6. Update this README to remove the archived entry
