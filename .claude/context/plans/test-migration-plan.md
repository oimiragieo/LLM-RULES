# Plan: Test Migration from .claude\tests\ to tests\

## Overview

Migrate 3 test files from `.claude\tests\integration\` to root `tests\` directory, update path references, and clean up deprecated structure. This aligns with project convention of co-locating tests with source files and using root `tests\` for unit/integration tests.

## Context

**Files to Migrate**:

1. `.claude\tests\integration\template-system-e2e.test.cjs`
2. `.claude\tests\integration\template-system-e2e-happy.test.cjs`
3. `.claude\tests\integration\e2e\phase1a-e2e.test.cjs`

**Path Depth Change**: From 3-level deep (`.claude\tests\integration\`) to 2-level deep (`tests\integration\`) = 1 fewer directory level = 1 less `..` needed in relative imports.

**Example**:

```javascript
// OLD (from .claude/tests/integration/file.test.cjs):
const PROJECT_ROOT = path.resolve(__dirname, '../../..'); // Up 3 levels

// NEW (from tests/integration/file.test.cjs):
const PROJECT_ROOT = path.resolve(__dirname, '../..'); // Up 2 levels
```

## Phases

### Phase 0: Pre-Migration Validation (FOUNDATION)

**Purpose**: Verify tests pass at current location before migration
**Duration**: 5-10 minutes
**Parallel OK**: No (must validate current state first)

#### Tasks

- [ ] **0.1** Run existing tests at current location (~5 min)
  - **Command**: `node --test .claude/tests/integration/template-system-e2e.test.cjs`
  - **Verify**: Exit code 0 (all tests pass)
  - **Verify**: `node --test .claude/tests/integration/template-system-e2e-happy.test.cjs` (exit 0)
  - **Verify**: `node --test .claude/tests/integration/e2e/phase1a-e2e.test.cjs` (exit 0)
  - **Rollback**: N/A (read-only validation)

- [ ] **0.2** Document current test count (~2 min)
  - **Command**: `node --test .claude/tests/integration/ --test-reporter=tap 2>&1 | grep -E "^(# pass|# fail)"`
  - **Verify**: Record total passing tests (baseline)
  - **Record**: Save count to compare post-migration

**Success Criteria**: All 3 test files pass at current location (baseline established)

---

### Phase 1: Create Target Directory Structure

**Purpose**: Set up `tests\integration\` directory structure
**Dependencies**: Phase 0 complete
**Parallel OK**: No

#### Tasks

- [ ] **1.1** Create `tests\integration\` directory (~1 min)
  - **Command**: `if not exist "tests\integration" mkdir "tests\integration"`
  - **Verify**: `dir tests\integration 2>&1`
  - **Rollback**: `rmdir tests\integration` (if empty)

- [ ] **1.2** Create `tests\integration\e2e\` directory (~1 min)
  - **Command**: `if not exist "tests\integration\e2e" mkdir "tests\integration\e2e"`
  - **Verify**: `dir tests\integration\e2e 2>&1`
  - **Rollback**: `rmdir tests\integration\e2e` (if empty)

- [ ] **1.3** Create `tests\integration\output\` directory (~1 min)
  - **Command**: `if not exist "tests\integration\output" mkdir "tests\integration\output"`
  - **Verify**: `dir tests\integration\output 2>&1`
  - **Note**: Used by template-system-e2e.test.cjs for test artifacts
  - **Rollback**: `rmdir tests\integration\output` (if empty)

#### Phase 1 Verification Gate

```bash
# All directories must exist before Phase 2
dir tests\integration && dir tests\integration\e2e && dir tests\integration\output
```

**Success Criteria**: All target directories created

---

### Phase 2: File Migration with Path Updates

**Purpose**: Copy files to new location and update relative paths
**Dependencies**: Phase 1 complete
**Parallel OK**: No (sequential to avoid conflicts)

#### Tasks

- [ ] **2.1** Migrate template-system-e2e.test.cjs (~10 min)
  - **Command**: `copy ".claude\tests\integration\template-system-e2e.test.cjs" "tests\integration\template-system-e2e.test.cjs"`
  - **Verify**: `dir tests\integration\template-system-e2e.test.cjs`
  - **Path Update**: Edit `tests\integration\template-system-e2e.test.cjs`:
    - Find: `path.resolve(__dirname, '../../..')`
    - Replace: `path.resolve(__dirname, '../..')`
    - Reason: 1 fewer directory level (3→2)
  - **Path Update**: Edit `tests\integration\template-system-e2e.test.cjs`:
    - Find: `path.join(PROJECT_ROOT, '.claude', 'tests', 'integration', 'output')`
    - Replace: `path.join(PROJECT_ROOT, 'tests', 'integration', 'output')`
    - Reason: OUTPUT_DIR moved from `.claude\tests\` to `tests\`
  - **Verify**: `node --test tests\integration\template-system-e2e.test.cjs` (exit 0)
  - **Rollback**: `del tests\integration\template-system-e2e.test.cjs`

- [ ] **2.2** Migrate template-system-e2e-happy.test.cjs (~10 min)
  - **Command**: `copy ".claude\tests\integration\template-system-e2e-happy.test.cjs" "tests\integration\template-system-e2e-happy.test.cjs"`
  - **Verify**: `dir tests\integration\template-system-e2e-happy.test.cjs`
  - **Path Update**: Edit `tests\integration\template-system-e2e-happy.test.cjs`:
    - Find: `path.resolve(__dirname, '../../..')`
    - Replace: `path.resolve(__dirname, '../..')`
    - Reason: 1 fewer directory level
  - **Path Update**: Edit `tests\integration\template-system-e2e-happy.test.cjs`:
    - Find: `path.join(PROJECT_ROOT, '.claude', 'tests', 'integration', 'output')`
    - Replace: `path.join(PROJECT_ROOT, 'tests', 'integration', 'output')`
    - Reason: OUTPUT_DIR location changed
  - **Verify**: `node --test tests\integration\template-system-e2e-happy.test.cjs` (exit 0)
  - **Rollback**: `del tests\integration\template-system-e2e-happy.test.cjs`

- [ ] **2.3** Migrate phase1a-e2e.test.cjs (~10 min)
  - **Command**: `copy ".claude\tests\integration\e2e\phase1a-e2e.test.cjs" "tests\integration\e2e\phase1a-e2e.test.cjs"`
  - **Verify**: `dir tests\integration\e2e\phase1a-e2e.test.cjs`
  - **Path Update**: Edit `tests\integration\e2e\phase1a-e2e.test.cjs`:
    - Find: `path.resolve(__dirname, '../../../..')` (4 levels up from .claude/tests/integration/e2e/)
    - Replace: `path.resolve(__dirname, '../../..')` (3 levels up from tests/integration/e2e/)
    - Reason: 1 fewer directory level
  - **Verify**: `node --test tests\integration\e2e\phase1a-e2e.test.cjs` (exit 0)
  - **Rollback**: `del tests\integration\e2e\phase1a-e2e.test.cjs`

#### Phase 2 Error Handling

If any test fails after migration:

1. Run rollback command for that file
2. Document error: `echo "Phase 2.X failed: [error]" >> .claude\context\memory\issues.md`
3. Do NOT proceed to Phase 3 until error resolved

#### Phase 2 Verification Gate

```bash
# All tests must pass at new location
node --test tests\integration\template-system-e2e.test.cjs && ^
node --test tests\integration\template-system-e2e-happy.test.cjs && ^
node --test tests\integration\e2e\phase1a-e2e.test.cjs
```

**Success Criteria**: All 3 test files pass at new location with updated paths

---

### Phase 3: Documentation Updates

**Purpose**: Update references to test locations in documentation
**Dependencies**: Phase 2 complete
**Parallel OK**: Yes (independent edits)

#### Tasks

- [ ] **3.1** Update TESTING.md (~5 min) [⚡ parallel OK]
  - **Edit**: `.claude\docs\TESTING.md`
  - **Find** (lines 24-31):
    ```
    └── .claude/
        └── tests/
            └── integration/
                ├── e2e/
                │   ├── phase1a-e2e.test.cjs     # Phase 1A E2E tests (20 tests)
                │   └── .tmp/                     # Test artifacts (auto-cleaned)
                ├── template-system-e2e.test.cjs
                └── template-system-e2e-happy.test.cjs
    ```
  - **Replace**:
    ```
    ├── tests/
    │   ├── integration/
    │   │   ├── e2e/
    │   │   │   ├── phase1a-e2e.test.cjs     # Phase 1A E2E tests (20 tests)
    │   │   │   └── .tmp/                     # Test artifacts (auto-cleaned)
    │   │   ├── template-system-e2e.test.cjs
    │   │   ├── template-system-e2e-happy.test.cjs
    │   │   └── output/                       # Integration test artifacts
    ```
  - **Find** (line 46):
    ```
    - **Location**: `.claude/tests/integration/e2e/`
    ```
  - **Replace**:
    ```
    - **Location**: `tests/integration/e2e/`
    ```
  - **Find** (line 68):
    ```
    node --test .claude/tests/integration/e2e/phase1a-e2e.test.cjs --test-reporter=spec
    ```
  - **Replace**:
    ```
    node --test tests/integration/e2e/phase1a-e2e.test.cjs --test-reporter=spec
    ```
  - **Verify**: `grep "tests/integration" .claude\docs\TESTING.md` (finds new paths)
  - **Rollback**: `git checkout .claude\docs\TESTING.md`

- [ ] **3.2** Update CLAUDE.md directory structure (~5 min) [⚡ parallel OK]
  - **Edit**: `.claude\CLAUDE.md`
  - **Find** (Section 9.9):
    ```
    | `.claude/tests/`    | Moved to co-locate with source files      |
    ```
  - **Replace**:
    ```
    | `.claude/tests/`    | Moved to root `tests/` directory (2026-01-28) |
    ```
  - **Verify**: `grep "tests/" .claude\CLAUDE.md` (confirms note updated)
  - **Rollback**: `git checkout .claude\CLAUDE.md`

#### Phase 3 Verification Gate

```bash
# Verify documentation references updated
grep -q "tests/integration/e2e" .claude\docs\TESTING.md && ^
grep -q "Moved to root" .claude\CLAUDE.md
```

**Success Criteria**: All documentation updated to reference new test locations

---

### Phase 4: Cleanup Old Structure

**Purpose**: Remove deprecated `.claude\tests\` directory
**Dependencies**: Phase 2 complete (tests verified at new location)
**Parallel OK**: No

#### Tasks

- [ ] **4.1** Delete backup file (~1 min)
  - **Command**: `del .claude\tests\integration\template-system-e2e-happy.test.cjs.backup`
  - **Verify**: `dir .claude\tests\integration\*.backup 2>&1 | find "File Not Found"`
  - **Rollback**: N/A (backup file not needed)

- [ ] **4.2** Delete old test files (~2 min)
  - **Command**: `del .claude\tests\integration\template-system-e2e.test.cjs`
  - **Command**: `del .claude\tests\integration\template-system-e2e-happy.test.cjs`
  - **Command**: `del .claude\tests\integration\e2e\phase1a-e2e.test.cjs`
  - **Verify**: `dir .claude\tests\integration\*.cjs 2>&1 | find "File Not Found"`
  - **Verify**: `dir .claude\tests\integration\e2e\*.cjs 2>&1 | find "File Not Found"`
  - **Rollback**: Restore from git: `git checkout .claude\tests\integration\`

- [ ] **4.3** Remove empty directories (~1 min)
  - **Command**: `rmdir .claude\tests\integration\e2e`
  - **Command**: `rmdir .claude\tests\integration\output` (if empty)
  - **Command**: `rmdir .claude\tests\integration`
  - **Command**: `rmdir .claude\tests` (if empty)
  - **Verify**: `dir .claude\tests 2>&1 | find "File Not Found"`
  - **Rollback**: `mkdir .claude\tests\integration\e2e` (if needed to restore)

#### Phase 4 Error Handling

If directory removal fails (not empty):

1. Run: `dir .claude\tests /s /b` to list remaining files
2. Document: `echo "Cleanup incomplete: [files]" >> .claude\context\memory\issues.md`
3. Manual review required (do not force delete)

#### Phase 4 Verification Gate

```bash
# Verify old structure removed
dir .claude\tests 2>&1 | find "File Not Found" && echo "✓ Cleanup complete"
```

**Success Criteria**: `.claude\tests\` directory removed (no orphaned files)

---

### Phase 5: Post-Migration Validation

**Purpose**: Verify all tests still pass and npm test works
**Dependencies**: Phase 2 complete
**Parallel OK**: No

#### Tasks

- [ ] **5.1** Run full test suite (~30 min)
  - **Command**: `npm test`
  - **Verify**: Exit code 0
  - **Verify**: Compare test count to Phase 0.2 baseline (should match)
  - **Rollback**: If tests fail, restore old structure: `git checkout .claude\tests\`

- [ ] **5.2** Verify integration tests specifically (~5 min)
  - **Command**: `node --test tests\integration\ --test-reporter=spec`
  - **Verify**: All integration tests pass (template-system, phase1a)
  - **Verify**: Test artifacts created in `tests\integration\output\`

- [ ] **5.3** Update package.json test script (if needed) (~2 min)
  - **Check**: `type package.json | findstr "test"`
  - **Action**: If test script references `.claude\tests\`, update to `tests\`
  - **Verify**: `npm test` works correctly

#### Phase 5 Verification Gate

```bash
# All tests must pass in CI/CD environment
npm test && echo "✓ Migration complete"
```

**Success Criteria**: All tests pass, no references to old paths

---

### Phase [FINAL]: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:

```javascript
Task({
  subagent_type: 'reflection-agent',
  description: 'Session reflection and learning extraction',
  prompt:
    'You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created).',
});
```

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk                          | Impact | Mitigation                                 | Rollback                                                 |
| ----------------------------- | ------ | ------------------------------------------ | -------------------------------------------------------- |
| Tests fail after path updates | Medium | Validate each file individually in Phase 2 | `git checkout tests\` + restore old structure            |
| npm test breaks               | High   | Test script validation in Phase 5.3        | Update package.json test script                          |
| Old files not cleaned up      | Low    | Manual verification in Phase 4             | `git clean -fd .claude\tests\` (if safe)                 |
| Documentation drift           | Low    | Update docs in Phase 3 (parallel safe)     | `git checkout .claude\docs\TESTING.md .claude\CLAUDE.md` |

---

## Timeline Summary

| Phase     | Tasks  | Est. Time   | Parallel? |
| --------- | ------ | ----------- | --------- |
| 0         | 2      | 7 min       | No        |
| 1         | 3      | 3 min       | No        |
| 2         | 3      | 30 min      | No        |
| 3         | 2      | 10 min      | Yes       |
| 4         | 3      | 4 min       | No        |
| 5         | 3      | 37 min      | No        |
| **Total** | **16** | **~91 min** |           |

---

## Key Path Changes Reference

| File                               | Old PROJECT_ROOT         | New PROJECT_ROOT      | Change   |
| ---------------------------------- | ------------------------ | --------------------- | -------- |
| template-system-e2e.test.cjs       | `../../..` (3 levels)    | `../..` (2 levels)    | -1 level |
| template-system-e2e-happy.test.cjs | `../../..` (3 levels)    | `../..` (2 levels)    | -1 level |
| phase1a-e2e.test.cjs               | `../../../..` (4 levels) | `../../..` (3 levels) | -1 level |

---

## Post-Migration Checklist

- [ ] All tests pass: `npm test` (exit 0)
- [ ] Integration tests run: `node --test tests\integration\` (exit 0)
- [ ] Documentation updated: `TESTING.md`, `CLAUDE.md`
- [ ] Old structure removed: `.claude\tests\` deleted
- [ ] Git status clean: No untracked files in `.claude\tests\`
- [ ] Test artifacts in correct location: `tests\integration\output\`
- [ ] Learnings recorded in memory files

---

## Notes

- **Why migrate**: Aligns with project convention (root `tests\` for unit/integration, co-located for lib tests)
- **Path calculation**: Old depth (3) - New depth (2) = 1 fewer `..` in `path.resolve(__dirname, ...)`
- **Backup strategy**: Git history preserves old structure (no manual backup needed)
- **Parallel execution**: Only Phase 3 tasks can run in parallel (independent doc edits)
- **Safety**: Copy-first approach (Phase 2 copies before deleting), validate at each step

---

**Plan Status**: Ready for execution
**Created**: 2026-01-28
**Estimated Duration**: ~91 minutes (~1.5 hours)
**File Count**: 3 test files + 2 documentation files
