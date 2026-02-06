# Plan: .claude Directory Restructuring

## Executive Summary

Restructure the `.claude/` directory to eliminate dead folders, consolidate `data/` into `context/data/`, colocate tests with source, prune AI-generated doc slop, and update all code references. Estimated 50+ files affected across 9 phases. The plan prioritizes zero-risk deletions first and defers high-risk reference updates to the end, with verification gates between each phase.

## Key Constraints

- **85+ hooks** use relative `require('../../lib/utils/...')` paths -- hooks/ and lib/ directories DO NOT MOVE
- **settings.json** has 25+ hook command paths -- none change (hooks stay in place)
- **CLAUDE.md** has ~50 `.claude/` path references -- must be updated for data/ -> context/data/ moves
- **8 .cjs source files** reference `'.claude', 'data', 'lancedb'` or `'.claude', 'data', 'memory.db'` -- MUST be updated
- **docs/** references to `.claude/data/` are informational only (lower priority)

## Risk Assessment

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Code references to `.claude/data/` break | HIGH | Phase 6 updates ALL 8 .cjs files | `git checkout -- .claude/lib/ .claude/hooks/ .claude/tools/` |
| BM25 index path mismatch | HIGH | Rebuild index in Phase 8 | Copy backup back from `.claude/context/data/lancedb.bak/` |
| Hook relative paths break | CRITICAL | Hooks DO NOT MOVE (by design) | N/A (no change) |
| Git history loss | LOW | All moves via `git mv` where possible | `git reflog` |
| Missing test file after colocation | MEDIUM | Verify test runs in Phase 7 | `git checkout -- .claude/tests/` |

---

## Phases

### Phase 1: CLEANUP - Delete Trash, Empty Dirs, Duplicates (~10 min)

**Purpose**: Remove confirmed-dead files and directories with zero functional impact
**Dependencies**: None
**Parallel OK**: Yes (all deletions are independent)

#### Tasks

- [ ] **1.1** Delete root `nul` trash file (~1 min)
  - **Command**: `rm "C:\dev\projects\agent-studio\nul"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\nul" 2>&1 | grep "No such file"`
  - **Rollback**: N/A (trash file, no content)

- [ ] **1.2** Delete root `.tmp/` directory (34 stale memory-record dirs + 1 stale txt file) (~1 min) [parallel OK]
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.tmp"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.tmp" 2>&1 | grep "No such file"`
  - **Rollback**: N/A (temp files from Feb 4-5, all stale)
  - **Contents being deleted**: 26 `memory-record-*` directories (each containing `.claude/context/memory/patterns.json` or `gotchas.json` and some with `.claude/data/memory.db`), plus 1 UUID-named `.txt` file (3.6MB)

- [ ] **1.3** Delete `.claude/.tmp/` directory (contains only `post-creation-reminder-last-run.txt`, 13 bytes) (~1 min) [parallel OK]
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.claude\.tmp"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\.tmp" 2>&1 | grep "No such file"`
  - **Rollback**: N/A (13 bytes, timestamp file)

- [ ] **1.4** Delete `.claude/audit/` directory (confirmed empty) (~1 min) [parallel OK]
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.claude\audit"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\audit" 2>&1 | grep "No such file"`
  - **Rollback**: `mkdir "C:\dev\projects\agent-studio\.claude\audit"`

- [ ] **1.5** Delete `.claude/staging/` directory (12 empty test subdirs: agents, context, knowledge, memory, memory-test-retry-1 through -5, metrics, performance-benchmarks, sessions) (~1 min) [parallel OK]
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.claude\staging"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\staging" 2>&1 | grep "No such file"`
  - **Rollback**: N/A (all empty directories, no data)
  - **Note**: `STAGING_ENVIRONMENT.md` in docs references this path but staging was never populated. The doc describes a theoretical staging system.

- [ ] **1.6** Delete `.claude/archive/` directory (user confirmed deletion) (~1 min) [parallel OK]
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.claude\archive"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\archive" 2>&1 | grep "No such file"`
  - **Rollback**: `git checkout -- .claude/archive/` (files are tracked in git)
  - **Note**: Contains archived sync-layer.cjs, session hooks, etc. All replaced by active code. Referenced in docs (HOOKS_REFERENCE.md, MEMORY_SYSTEM.md, DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md) but only as historical context ("moved to archive").

- [ ] **1.7** Delete empty test directories in `.claude/data/` (~1 min) [parallel OK]
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.claude\data\lancedb-test" "C:\dev\projects\agent-studio\.claude\data\test-fastembed-gpu-cpu" "C:\dev\projects\agent-studio\.claude\data\test-fastembed-gpu-gpu" "C:\dev\projects\agent-studio\.claude\data\code-index"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\data" 2>&1` should show only `lancedb` and `memory.db`
  - **Rollback**: N/A (all empty directories)

- [ ] **1.8** Delete `.claude/agents/router.md` duplicate if it exists (~1 min) [parallel OK]
  - **Pre-check**: `ls "C:\dev\projects\agent-studio\.claude\agents\router.md" 2>&1`
  - **Command**: `rm "C:\dev\projects\agent-studio\.claude\agents\router.md"` (only if exists)
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\agents\router.md" 2>&1 | grep "No such file"`
  - **Note**: Investigation shows this was already deleted. Task is idempotent.
  - **Rollback**: N/A (canonical copy at `.claude/agents/core/router.md`)

#### Phase 1 Error Handling

These are all deletions of empty/trash/confirmed-dead content. If any `rm` fails:
1. Check if path exists (may already be deleted)
2. Check permissions (Windows may lock files)
3. Skip and continue -- no downstream dependencies

#### Phase 1 Verification Gate

```bash
# All must pass before proceeding
test ! -e "C:\dev\projects\agent-studio\nul" && \
test ! -d "C:\dev\projects\agent-studio\.tmp" && \
test ! -d "C:\dev\projects\agent-studio\.claude\.tmp" && \
test ! -d "C:\dev\projects\agent-studio\.claude\audit" && \
test ! -d "C:\dev\projects\agent-studio\.claude\staging" && \
test ! -d "C:\dev\projects\agent-studio\.claude\archive" && \
echo "Phase 1 PASSED" || echo "Phase 1 FAILED"
```

---

### Phase 2: MOVE Debug Files to docs/archive/ (~5 min)

**Purpose**: Clear root-level debug/audit markdown files from `.claude/` root into a docs archive
**Dependencies**: Phase 1 complete
**Parallel OK**: Yes

#### Tasks

- [ ] **2.1** Create docs/archive/ directory (~1 min)
  - **Command**: `mkdir -p "C:\dev\projects\agent-studio\.claude\docs\archive"`
  - **Verify**: `ls -d "C:\dev\projects\agent-studio\.claude\docs\archive"`
  - **Rollback**: `rm -rf "C:\dev\projects\agent-studio\.claude\docs\archive"`

- [ ] **2.2** Move debug .md files from .claude/ root to docs/archive/ (~2 min)
  - **Files to move** (3 files):
    - `AUDIT_FIXES_SUMMARY.md`
    - `DEBUG_LOG_ANALYSIS_FIXES.md`
    - `HOOK_FIXES_APPLIED.md`
  - **Command**:
    ```bash
    mv "C:\dev\projects\agent-studio\.claude\AUDIT_FIXES_SUMMARY.md" "C:\dev\projects\agent-studio\.claude\docs\archive/" && \
    mv "C:\dev\projects\agent-studio\.claude\DEBUG_LOG_ANALYSIS_FIXES.md" "C:\dev\projects\agent-studio\.claude\docs\archive/" && \
    mv "C:\dev\projects\agent-studio\.claude\HOOK_FIXES_APPLIED.md" "C:\dev\projects\agent-studio\.claude\docs\archive/"
    ```
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\docs\archive/"` shows all 3 files AND `ls "C:\dev\projects\agent-studio\.claude/"*.md` shows only `CLAUDE.md`
  - **Rollback**:
    ```bash
    mv "C:\dev\projects\agent-studio\.claude\docs\archive\AUDIT_FIXES_SUMMARY.md" "C:\dev\projects\agent-studio\.claude/" && \
    mv "C:\dev\projects\agent-studio\.claude\docs\archive\DEBUG_LOG_ANALYSIS_FIXES.md" "C:\dev\projects\agent-studio\.claude/" && \
    mv "C:\dev\projects\agent-studio\.claude\docs\archive\HOOK_FIXES_APPLIED.md" "C:\dev\projects\agent-studio\.claude/"
    ```

#### Phase 2 Verification Gate

```bash
# Only CLAUDE.md should remain at .claude/ root level
ls "C:\dev\projects\agent-studio\.claude/"*.md 2>/dev/null | grep -v CLAUDE.md && echo "FAIL: extra .md files at root" || echo "Phase 2 PASSED"
```

---

### Phase 3: MOVE references/ and teams/ (~5 min)

**Purpose**: Relocate orphaned directories to their proper homes
**Dependencies**: Phase 1 complete
**Parallel OK**: Yes (moves are independent)

#### Tasks

- [ ] **3.1** Move `.claude/references/` files to `.claude/docs/reference/` (~2 min)
  - **Pre-check**: These 3 files are referenced by `.claude/agents/core/planner.md` via `@.claude/references/ui-patterns.md` and `@.claude/references/continuation-format.md`
  - **Files**:
    - `ui-patterns.md`
    - `continuation-format.md`
    - `lazy-loading.md`
  - **Command**:
    ```bash
    mkdir -p "C:\dev\projects\agent-studio\.claude\docs\reference" && \
    mv "C:\dev\projects\agent-studio\.claude\references\ui-patterns.md" "C:\dev\projects\agent-studio\.claude\docs\reference/" && \
    mv "C:\dev\projects\agent-studio\.claude\references\continuation-format.md" "C:\dev\projects\agent-studio\.claude\docs\reference/" && \
    mv "C:\dev\projects\agent-studio\.claude\references\lazy-loading.md" "C:\dev\projects\agent-studio\.claude\docs\reference/" && \
    rmdir "C:\dev\projects\agent-studio\.claude\references"
    ```
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\docs\reference/"` shows 3 files AND `test ! -d "C:\dev\projects\agent-studio\.claude\references"`
  - **Rollback**:
    ```bash
    mkdir -p "C:\dev\projects\agent-studio\.claude\references" && \
    mv "C:\dev\projects\agent-studio\.claude\docs\reference\ui-patterns.md" "C:\dev\projects\agent-studio\.claude\references/" && \
    mv "C:\dev\projects\agent-studio\.claude\docs\reference\continuation-format.md" "C:\dev\projects\agent-studio\.claude\references/" && \
    mv "C:\dev\projects\agent-studio\.claude\docs\reference\lazy-loading.md" "C:\dev\projects\agent-studio\.claude\references/"
    ```
  - **CRITICAL**: Must also update planner.md references in Phase 6 (Task 6.8)

- [ ] **3.2** Move `.claude/teams/` to `.claude/context/teams/` (~2 min) [parallel OK]
  - **Pre-check**: Teams CSVs are referenced by `party-orchestrator.md` and `router-decision.md` workflow
  - **Files** (3 CSVs):
    - `code-review.csv`
    - `secure-implementation.csv`
    - `architecture-decision.csv`
  - **Command**:
    ```bash
    mkdir -p "C:\dev\projects\agent-studio\.claude\context\teams" && \
    mv "C:\dev\projects\agent-studio\.claude\teams\code-review.csv" "C:\dev\projects\agent-studio\.claude\context\teams/" && \
    mv "C:\dev\projects\agent-studio\.claude\teams\secure-implementation.csv" "C:\dev\projects\agent-studio\.claude\context\teams/" && \
    mv "C:\dev\projects\agent-studio\.claude\teams\architecture-decision.csv" "C:\dev\projects\agent-studio\.claude\context\teams/" && \
    rmdir "C:\dev\projects\agent-studio\.claude\teams"
    ```
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\context\teams/"` shows 3 CSV files AND `test ! -d "C:\dev\projects\agent-studio\.claude\teams"`
  - **Rollback**:
    ```bash
    mkdir -p "C:\dev\projects\agent-studio\.claude\teams" && \
    mv "C:\dev\projects\agent-studio\.claude\context\teams\code-review.csv" "C:\dev\projects\agent-studio\.claude\teams/" && \
    mv "C:\dev\projects\agent-studio\.claude\context\teams\secure-implementation.csv" "C:\dev\projects\agent-studio\.claude\teams/" && \
    mv "C:\dev\projects\agent-studio\.claude\context\teams\architecture-decision.csv" "C:\dev\projects\agent-studio\.claude\teams/"
    ```
  - **CRITICAL**: Must update `party-orchestrator.md` and `router-decision.md` references in Phase 6 (Task 6.9)

#### Phase 3 Verification Gate

```bash
test -d "C:\dev\projects\agent-studio\.claude\docs\reference" && \
test -d "C:\dev\projects\agent-studio\.claude\context\teams" && \
test ! -d "C:\dev\projects\agent-studio\.claude\references" && \
test ! -d "C:\dev\projects\agent-studio\.claude\teams" && \
echo "Phase 3 PASSED" || echo "Phase 3 FAILED"
```

---

### Phase 4: CONSOLIDATE data/ into context/data/ (~10 min)

**Purpose**: Merge `.claude/data/` contents into `.claude/context/data/` to eliminate the data/ vs context/ overlap
**Dependencies**: Phase 1 complete (empty test dirs already deleted from data/)
**Parallel OK**: No (sequential -- must create dir, then move, then verify)

**COMMIT CHECKPOINT**: This phase modifies data files. Commit Phase 1-3 changes before proceeding.

#### Pre-Phase Checkpoint

- [ ] **4.0** Commit Phase 1-3 changes before data migration (~2 min)
  - **Command**: `cd "C:\dev\projects\agent-studio" && git add -A && git commit -m "checkpoint: Phase 1-3 cleanup complete (delete trash, move debug/refs/teams)"`
  - **Verify**: `git status -s` shows clean working tree for deleted/moved files
  - **Rollback**: `git reset --soft HEAD~1`

#### Tasks

- [ ] **4.1** Create `.claude/context/data/` directory (~1 min)
  - **Command**: `mkdir -p "C:\dev\projects\agent-studio\.claude\context\data"`
  - **Verify**: `ls -d "C:\dev\projects\agent-studio\.claude\context\data"`
  - **Rollback**: `rmdir "C:\dev\projects\agent-studio\.claude\context\data"`

- [ ] **4.2** Move `.claude/data/lancedb/` to `.claude/context/data/lancedb/` (~3 min)
  - **Pre-check**: `ls "C:\dev\projects\agent-studio\.claude\data\lancedb/"` should show `bm25-index.json` (14.69MB)
  - **Command**: `mv "C:\dev\projects\agent-studio\.claude\data\lancedb" "C:\dev\projects\agent-studio\.claude\context\data\lancedb"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\context\data\lancedb\bm25-index.json"` exists
  - **Rollback**: `mv "C:\dev\projects\agent-studio\.claude\context\data\lancedb" "C:\dev\projects\agent-studio\.claude\data\lancedb"`

- [ ] **4.3** Move `.claude/data/memory.db` to `.claude/context/data/memory.db` (~1 min)
  - **Pre-check**: `ls "C:\dev\projects\agent-studio\.claude\data\memory.db"` exists
  - **Command**: `mv "C:\dev\projects\agent-studio\.claude\data\memory.db" "C:\dev\projects\agent-studio\.claude\context\data\memory.db"`
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\context\data\memory.db"` exists
  - **Rollback**: `mv "C:\dev\projects\agent-studio\.claude\context\data\memory.db" "C:\dev\projects\agent-studio\.claude\data\memory.db"`

- [ ] **4.4** Remove empty `.claude/data/` directory (~1 min)
  - **Pre-check**: `ls "C:\dev\projects\agent-studio\.claude\data/"` should show nothing (all contents moved)
  - **Command**: `rmdir "C:\dev\projects\agent-studio\.claude\data"` (will fail if not empty -- safety check)
  - **Verify**: `test ! -d "C:\dev\projects\agent-studio\.claude\data"`
  - **Rollback**: `mkdir "C:\dev\projects\agent-studio\.claude\data"` (but files are in new location)

#### Phase 4 Error Handling

If any move fails:
1. Check if source exists (may already be moved)
2. Check disk space (lancedb is ~15MB)
3. Do NOT proceed to Phase 6 (code references must be updated to match actual file locations)
4. Rollback: Move files back to `.claude/data/`

#### Phase 4 Verification Gate

```bash
test -f "C:\dev\projects\agent-studio\.claude\context\data\lancedb\bm25-index.json" && \
test -f "C:\dev\projects\agent-studio\.claude\context\data\memory.db" && \
test ! -d "C:\dev\projects\agent-studio\.claude\data" && \
echo "Phase 4 PASSED" || echo "Phase 4 FAILED"
```

---

### Phase 5: COLOCATE TESTS with Source (~10 min)

**Purpose**: Move `.claude/tests/skill-triggering/` tests next to their source following enterprise `__tests__/` pattern
**Dependencies**: Phase 1 complete
**Parallel OK**: No (sequential moves)

#### Tasks

- [ ] **5.1** Analyze test files and determine colocation target (~2 min)
  - **Source**: `.claude/tests/skill-triggering/`
  - **Contents**:
    - `run-skill-triggering-test.cjs` (test runner)
    - `prompts/manifest.json` (test manifest)
    - `prompts/dispatching-parallel-agents.txt`
    - `prompts/executing-plans.txt`
    - `prompts/requesting-code-review.txt`
    - `prompts/systematic-debugging.txt`
    - `prompts/test-driven-development.txt`
    - `prompts/writing-plans.txt`
  - **Target**: `.claude/skills/__tests__/skill-triggering/` (tests for the skills system)
  - **Rationale**: These tests validate skill triggering behavior, so they belong under skills/
  - **Command**: Read the test runner to check for relative path imports: `head -30 "C:\dev\projects\agent-studio\.claude\tests\skill-triggering\run-skill-triggering-test.cjs"`
  - **Verify**: Understand any require() paths that need updating

- [ ] **5.2** Create target directory and move test files (~3 min)
  - **Command**:
    ```bash
    mkdir -p "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering\prompts" && \
    cp -r "C:\dev\projects\agent-studio\.claude\tests\skill-triggering\prompts\." "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering\prompts/" && \
    cp "C:\dev\projects\agent-studio\.claude\tests\skill-triggering\run-skill-triggering-test.cjs" "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering/"
    ```
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering/"` shows `run-skill-triggering-test.cjs` and `prompts/`
  - **Rollback**: `rm -rf "C:\dev\projects\agent-studio\.claude\skills\__tests__"`

- [ ] **5.3** Update relative paths in test runner if needed (~3 min)
  - **Pre-check**: Read `run-skill-triggering-test.cjs` for any `require('../../` paths
  - **Command**: Update any relative require() paths to account for new location (2 levels deeper: `tests/skill-triggering/` -> `skills/__tests__/skill-triggering/`)
  - **Old path base**: `../../` (from `tests/skill-triggering/` to `.claude/`)
  - **New path base**: `../../../` (from `skills/__tests__/skill-triggering/` to `.claude/`)
  - **Verify**: `node "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering\run-skill-triggering-test.cjs" --help 2>&1` (should not crash with MODULE_NOT_FOUND)
  - **Rollback**: Restore from `tests/skill-triggering/`

- [ ] **5.4** Delete old `.claude/tests/` directory (~1 min)
  - **Pre-check**: Verify all files copied successfully to new location
  - **Command**: `rm -rf "C:\dev\projects\agent-studio\.claude\tests"`
  - **Verify**: `test ! -d "C:\dev\projects\agent-studio\.claude\tests"`
  - **Rollback**: `git checkout -- .claude/tests/`

#### Phase 5 Verification Gate

```bash
test -f "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering\run-skill-triggering-test.cjs" && \
test -f "C:\dev\projects\agent-studio\.claude\skills\__tests__\skill-triggering\prompts\manifest.json" && \
test ! -d "C:\dev\projects\agent-studio\.claude\tests" && \
echo "Phase 5 PASSED" || echo "Phase 5 FAILED"
```

---

### Phase 6: UPDATE ALL CODE REFERENCES (~30 min)

**Purpose**: Fix every hardcoded path that references the old `.claude/data/` location. This is the highest-risk phase.
**Dependencies**: Phase 4 complete (files must be in new location before updating references)
**Parallel OK**: Partial (independent files can be edited in parallel, but verify after all edits)

#### Source Code Files (8 files -- CRITICAL)

These files use `path.join(...)` to construct paths to `.claude/data/`. Each must be updated from `'data'` to `'context', 'data'`.

- [ ] **6.1** Update `vector-store.cjs` -- persistDirectory default (~3 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\code-indexing\vector-store.cjs`
  - **Line 19**: `path.join(projectRoot, '.claude', 'data', 'lancedb')`
  - **Change to**: `path.join(projectRoot, '.claude', 'context', 'data', 'lancedb')`
  - **Command**: Edit line 19 in vector-store.cjs
  - **Verify**: `grep -n "context.*data.*lancedb" "C:\dev\projects\agent-studio\.claude\lib\code-indexing\vector-store.cjs"` returns line 19
  - **Rollback**: `git checkout -- .claude/lib/code-indexing/vector-store.cjs`

- [ ] **6.2** Update `hybrid-lazy-indexer.cjs` -- lanceDbPath (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\code-indexing\hybrid-lazy-indexer.cjs`
  - **Line 27**: `path.join(this.projectRoot, '.claude', 'data', 'lancedb')`
  - **Change to**: `path.join(this.projectRoot, '.claude', 'context', 'data', 'lancedb')`
  - **Command**: Edit line 27 in hybrid-lazy-indexer.cjs
  - **Verify**: `grep -n "context.*data.*lancedb" "C:\dev\projects\agent-studio\.claude\lib\code-indexing\hybrid-lazy-indexer.cjs"` returns line 27
  - **Rollback**: `git checkout -- .claude/lib/code-indexing/hybrid-lazy-indexer.cjs`

- [ ] **6.3** Update `memory-dashboard.cjs` -- persistDirectory and dbPath (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\memory\memory-dashboard.cjs`
  - **Line 339**: `path.join(projectRoot, '.claude', 'data', 'memory.db')`
  - **Line 570**: `path.join(projectRoot, '.claude', 'data', 'lancedb')`
  - **Change both to**: Insert `'context',` before `'data'`
  - **Command**: Edit lines 339 and 570 in memory-dashboard.cjs
  - **Verify**: `grep -c "context.*data" "C:\dev\projects\agent-studio\.claude\lib\memory\memory-dashboard.cjs"` returns 2
  - **Rollback**: `git checkout -- .claude/lib/memory/memory-dashboard.cjs`

- [ ] **6.4** Update `cold-storage.cjs` -- two persistDirectory references (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\memory\cold-storage.cjs`
  - **Line 158**: `path.join(projectRoot, '.claude', 'data', 'lancedb')`
  - **Line 291**: `path.join(projectRoot, '.claude', 'data', 'lancedb')`
  - **Change both to**: Insert `'context',` before `'data'`
  - **Command**: Edit lines 158 and 291 in cold-storage.cjs
  - **Verify**: `grep -c "context.*data.*lancedb" "C:\dev\projects\agent-studio\.claude\lib\memory\cold-storage.cjs"` returns 2
  - **Rollback**: `git checkout -- .claude/lib/memory/cold-storage.cjs`

- [ ] **6.5** Update `memory-extraction-writer.cjs` -- persistDirectory (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\memory\memory-extraction-writer.cjs`
  - **Line 117**: `path.join(projectRoot, '.claude', 'data', 'lancedb')`
  - **Change to**: `path.join(projectRoot, '.claude', 'context', 'data', 'lancedb')`
  - **Command**: Edit line 117 in memory-extraction-writer.cjs
  - **Verify**: `grep -n "context.*data.*lancedb" "C:\dev\projects\agent-studio\.claude\lib\memory\memory-extraction-writer.cjs"` returns line 117
  - **Rollback**: `git checkout -- .claude/lib/memory/memory-extraction-writer.cjs`

- [ ] **6.6** Update `memory-entity-links.cjs` -- dbPath (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\memory\memory-entity-links.cjs`
  - **Line 23**: `path.join(root, '.claude', 'data', 'memory.db')`
  - **Change to**: `path.join(root, '.claude', 'context', 'data', 'memory.db')`
  - **Command**: Edit line 23 in memory-entity-links.cjs
  - **Verify**: `grep -n "context.*data.*memory" "C:\dev\projects\agent-studio\.claude\lib\memory\memory-entity-links.cjs"` returns line 23
  - **Rollback**: `git checkout -- .claude/lib/memory/memory-entity-links.cjs`

- [ ] **6.7** Update `memory-manager.cjs` -- dbPath (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\memory\memory-manager.cjs`
  - **Line 170**: `path.join(projectRoot, '.claude', 'data', 'memory.db')`
  - **Change to**: `path.join(projectRoot, '.claude', 'context', 'data', 'memory.db')`
  - **Command**: Edit line 170 in memory-manager.cjs
  - **Verify**: `grep -n "context.*data.*memory" "C:\dev\projects\agent-studio\.claude\lib\memory\memory-manager.cjs"` returns line 170
  - **Rollback**: `git checkout -- .claude/lib/memory/memory-manager.cjs`

- [ ] **6.8** Update `context-reset.cjs` -- lancedbDir (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\lib\utils\context-reset.cjs`
  - **Line 35**: `path.join(PROJECT_ROOT, '.claude', 'data', 'lancedb')`
  - **Change to**: `path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'lancedb')`
  - **Command**: Edit line 35 in context-reset.cjs
  - **Verify**: `grep -n "context.*data.*lancedb" "C:\dev\projects\agent-studio\.claude\lib\utils\context-reset.cjs"` returns line 35
  - **Rollback**: `git checkout -- .claude/lib/utils/context-reset.cjs`

- [ ] **6.9** Update `unified-reflection-handler.cjs` -- LANCEDB_URI fallback (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\hooks\reflection\unified-reflection-handler.cjs`
  - **Line 805**: `path.join(PROJECT_ROOT, '.claude', 'data', 'lancedb')`
  - **Change to**: `path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'lancedb')`
  - **Command**: Edit line 805 in unified-reflection-handler.cjs
  - **Verify**: `grep -n "context.*data.*lancedb" "C:\dev\projects\agent-studio\.claude\hooks\reflection\unified-reflection-handler.cjs"` returns line 805
  - **Rollback**: `git checkout -- .claude/hooks/reflection/unified-reflection-handler.cjs`

- [ ] **6.10** Update `sync-memory-index.cjs` -- two dbPath references (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\hooks\memory\sync-memory-index.cjs`
  - **Line 215**: `path.join(PROJECT_ROOT, '.claude', 'data', 'memory.db')`
  - **Line 265**: `path.join(PROJECT_ROOT, '.claude', 'data', 'memory.db')`
  - **Change both to**: Insert `'context',` before `'data'`
  - **Command**: Edit lines 215 and 265 in sync-memory-index.cjs
  - **Verify**: `grep -c "context.*data.*memory" "C:\dev\projects\agent-studio\.claude\hooks\memory\sync-memory-index.cjs"` returns 2
  - **Rollback**: `git checkout -- .claude/hooks/memory/sync-memory-index.cjs`

- [ ] **6.11** Update `sync-memory-json.cjs` -- dbPath (~3 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\tools\cli\sync-memory-json.cjs`
  - **Line 30**: `path.join(PROJECT_ROOT, '.claude', 'data', 'memory.db')`
  - **Change to**: `path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'memory.db')`
  - **Command**: Edit line 30 in sync-memory-json.cjs
  - **Verify**: `grep -n "context.*data.*memory" "C:\dev\projects\agent-studio\.claude\tools\cli\sync-memory-json.cjs"` returns line 30
  - **Rollback**: `git checkout -- .claude/tools/cli/sync-memory-json.cjs`

#### Config Files (1 file)

- [ ] **6.12** Update `code-index-config.json` -- exclude pattern and persistDirectory (~3 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\config\code-index-config.json`
  - **Line 10**: `"**/.claude/data/**"` -> `"**/.claude/context/data/**"`
  - **Line 71**: `".claude/data/code-index"` -> `".claude/context/data/code-index"`
  - **Command**: Edit lines 10 and 71 in code-index-config.json
  - **Verify**: `grep -c "context/data" "C:\dev\projects\agent-studio\.claude\config\code-index-config.json"` returns 2
  - **Rollback**: `git checkout -- .claude/config/code-index-config.json`

#### Agent/Workflow Reference Updates (for Phase 3 moves)

- [ ] **6.13** Update `planner.md` -- references/ path (~2 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\agents\core\planner.md`
  - **Line 48**: `@.claude/references/ui-patterns.md` -> `@.claude/docs/reference/ui-patterns.md`
  - **Line 52**: `@.claude/references/continuation-format.md` -> `@.claude/docs/reference/continuation-format.md`
  - **Command**: Edit lines 48 and 52 in planner.md
  - **Verify**: `grep "docs/reference" "C:\dev\projects\agent-studio\.claude\agents\core\planner.md"` returns 2 matches
  - **Rollback**: `git checkout -- .claude/agents/core/planner.md`

- [ ] **6.14** Update `party-orchestrator.md` -- teams/ path (~2 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\agents\orchestrators\party-orchestrator.md`
  - **Line containing**: `.claude/teams/*.csv` -> `.claude/context/teams/*.csv`
  - **Command**: Edit party-orchestrator.md, update teams path
  - **Verify**: `grep "context/teams" "C:\dev\projects\agent-studio\.claude\agents\orchestrators\party-orchestrator.md"` returns match
  - **Rollback**: `git checkout -- .claude/agents/orchestrators/party-orchestrator.md`

- [ ] **6.15** Update `router-decision.md` -- teams/ path (~2 min) [parallel OK]
  - **File**: `C:\dev\projects\agent-studio\.claude\workflows\core\router-decision.md`
  - **Line containing**: `.claude/teams/default.csv` -> `.claude/context/teams/default.csv`
  - **Command**: Edit router-decision.md, update teams path
  - **Verify**: `grep "context/teams" "C:\dev\projects\agent-studio\.claude\workflows\core\router-decision.md"` returns match
  - **Rollback**: `git checkout -- .claude/workflows/core/router-decision.md`

#### Phase 6 Error Handling

If any edit fails:
1. Verify the file exists at the expected path
2. Verify the line number matches (may have shifted from earlier edits in same file)
3. Use `grep` to find the actual line containing the old path
4. Do NOT skip -- every path reference MUST be updated for the system to function
5. If stuck, rollback Phase 4 (move data back) and all Phase 6 edits

#### Phase 6 Verification Gate

```bash
# No source files should reference old 'data' path without 'context' prefix
grep -r "'data', 'lancedb'" \
  "C:\dev\projects\agent-studio\.claude\lib" \
  "C:\dev\projects\agent-studio\.claude\hooks" \
  "C:\dev\projects\agent-studio\.claude\tools" \
  2>/dev/null && echo "FAIL: Old lancedb paths remain" || echo "lancedb paths OK"

grep -r "'data', 'memory.db'" \
  "C:\dev\projects\agent-studio\.claude\lib" \
  "C:\dev\projects\agent-studio\.claude\hooks" \
  "C:\dev\projects\agent-studio\.claude\tools" \
  2>/dev/null && echo "FAIL: Old memory.db paths remain" || echo "memory.db paths OK"

echo "Phase 6 PASSED (if both OK above)"
```

---

### Phase 7: VERIFY - Test Everything Works (~15 min)

**Purpose**: Run all verification tests to ensure nothing is broken
**Dependencies**: Phase 6 complete
**Parallel OK**: Partial

#### Tasks

- [ ] **7.1** Verify BM25 search works with new data path (~3 min)
  - **Command**: `cd "C:\dev\projects\agent-studio" && node -e "const {VectorStore} = require('./.claude/lib/code-indexing/vector-store.cjs'); const vs = new VectorStore({projectRoot: process.cwd(), embeddingMode: 'off'}); console.log('persistDir:', vs.persistDirectory); const fs = require('fs'); console.log('bm25 exists:', fs.existsSync(require('path').join(vs.persistDirectory, 'bm25-index.json')));"`
  - **Verify**: Output shows `persistDir: ...context\data\lancedb` and `bm25 exists: true`
  - **Rollback**: If false, check Phase 4 data move and Phase 6 path update

- [ ] **7.2** Verify memory.db accessible with new path (~3 min) [parallel OK]
  - **Command**: `cd "C:\dev\projects\agent-studio" && node -e "const path = require('path'); const fs = require('fs'); const dbPath = path.join(process.cwd(), '.claude', 'context', 'data', 'memory.db'); console.log('exists:', fs.existsSync(dbPath)); console.log('size:', fs.statSync(dbPath).size, 'bytes');"`
  - **Verify**: Output shows `exists: true` and a non-zero size
  - **Rollback**: Check Phase 4 move

- [ ] **7.3** Verify no require() MODULE_NOT_FOUND errors in key hooks (~5 min)
  - **Command**: `cd "C:\dev\projects\agent-studio" && node -e "try { require('./.claude/hooks/memory/sync-memory-index.cjs'); console.log('sync-memory-index: OK'); } catch(e) { console.error('FAIL:', e.message); }"`
  - **Verify**: Output shows "OK" (no MODULE_NOT_FOUND)
  - **Note**: Hooks use relative require paths for lib/utils -- these should NOT have changed. This test confirms no collateral damage.

- [ ] **7.4** Verify settings.json hook paths are still valid (~3 min) [parallel OK]
  - **Command**: `cd "C:\dev\projects\agent-studio" && node -e "const settings = require('./.claude/settings.json'); const hooks = settings.hooks || []; const fs = require('fs'); const path = require('path'); let ok = 0, fail = 0; hooks.forEach(h => { const cmd = (h.command || '').split(' '); const scriptPath = cmd.find(p => p.endsWith('.cjs')); if (scriptPath) { const full = path.resolve(process.cwd(), scriptPath); if (fs.existsSync(full)) ok++; else { fail++; console.error('MISSING:', full); } } }); console.log('Hooks:', ok, 'OK,', fail, 'MISSING');"`
  - **Verify**: Output shows 0 MISSING
  - **Rollback**: No hook paths should have changed (hooks directory did not move)

- [ ] **7.5** Verify planner.md references resolve (~2 min) [parallel OK]
  - **Command**: `cd "C:\dev\projects\agent-studio" && ls ".claude/docs/reference/ui-patterns.md" ".claude/docs/reference/continuation-format.md" 2>&1`
  - **Verify**: Both files listed (no "No such file")

- [ ] **7.6** Verify teams CSVs accessible at new location (~1 min) [parallel OK]
  - **Command**: `ls "C:\dev\projects\agent-studio\.claude\context\teams\code-review.csv" "C:\dev\projects\agent-studio\.claude\context\teams\secure-implementation.csv" "C:\dev\projects\agent-studio\.claude\context\teams\architecture-decision.csv"`
  - **Verify**: All 3 files listed

#### Phase 7 Error Handling

If any verification fails:
1. Identify which phase introduced the failure
2. Rollback that specific phase using its rollback commands
3. Re-apply the phase with corrections
4. Do NOT proceed to Phase 8 until all verifications pass

#### Phase 7 Verification Gate

```bash
echo "All Phase 7 tasks must show OK/PASSED individually"
echo "If ANY task fails, stop and fix before proceeding"
```

---

### Phase 8: CLEAN DOCS and REBUILD INDEX (~20 min)

**Purpose**: Prune AI-generated doc slop from docs/ and rebuild the code search index
**Dependencies**: Phase 7 complete (all paths verified working)
**Parallel OK**: Partial

#### Docs Cleanup

The `.claude/docs/` directory has 100+ markdown files. The following categories are defined:

**KEEP (essential -- referenced by CLAUDE.md or critical architecture docs):**
- All 12 `@`-prefixed files (`@AGENT_ROUTING_TABLE.md`, `@CREATOR_SKILLS_TABLE.md`, `@DIRECTORY_STRUCTURE.md`, `@ENFORCEMENT_HOOKS.md`, `@ENTERPRISE_WORKFLOWS.md`, `@ENVIRONMENT_CONFIG.md`, `@EVOLUTION_WORKFLOW.md`, `@MODEL_SELECTION.md`, `@SKILL_CATALOG_TABLE.md`, `@SKILL_USAGE_GUIDE.md`, `@TASK_TRACKING_GUIDE.md`, `@TOOL_REFERENCE.md`)
- `ARCHITECTURE.md` - system architecture
- `HOOKS_REFERENCE.md` - hook documentation
- `MEMORY_SYSTEM.md` - memory system design
- `MEMORY_SCHEMA.md` - database schema
- `CODE_INDEXING_DESIGN.md` - code indexing design
- `DEVELOPER_ONBOARDING.md` - onboarding guide
- `GETTING_STARTED.md` - getting started
- `CONFIGURATION.md` - configuration reference
- `ROUTER_PROTOCOL.md` - router protocol
- `ROUTER_ENFORCEMENT.md` - router enforcement
- `ROUTER_KEYWORD_GUIDE.md` - router keywords
- `ROUTER_TRAINING_EXAMPLES.md` - router training
- `CHANGELOG.md` - changelog
- `AGENTS.md` - agent docs
- `CONTEXT_AND_MODES.md` - context docs
- `BEHAVIOUR_RULES.md` - behaviour rules
- `DEEP_DIVE_AUDIT_MEMORY_AND_CORE.md` - deep dive (historical)
- `FILE_PLACEMENT_RULES.md` - file placement
- `SHELL-SECURITY-GUIDE.md` - security guide
- `FASTEMBED_GPU_GUIDE.md` - GPU guide (if exists)

**DELETE (AI-generated slop, redundant, or never-referenced):**
- `ADVANCED_ELICITATION.md` - AI-generated, not referenced
- `AGENT_CONFIG_AND_QA_REFERENCE.md` - redundant with config.yaml
- `AGENT_IDENTITY.md` - AI-generated personality docs
- `AGENT_SKILL_WORKFLOW_REVIEW.md` - one-time audit output
- `BROWNFIELD_DETECTION.md` - AI-generated, not implemented
- `CODE_DEDUPLICATION_GUIDE.md` - AI-generated, not referenced
- `CODE_INDEXING_IMPLEMENTATION_ROADMAP.md` - superseded by actual implementation
- `CODE_INDEXING_TECH_STACK.md` - superseded by CODE_INDEXING_DESIGN.md
- `CODE_INDEX_AUTO_UPDATE.md` - AI-generated, partial implementation
- `CODE_REVIEW_MEMORY_CHECKLIST.md` - AI-generated checklist
- `COMPOSITION_PATTERNS_SKILL.md` - AI-generated, not referenced
- `COST_TRACKING.md` - not implemented
- `CREATOR_SKILLS_ALIGNMENT_AUDIT.md` - one-time audit output
- `DEEP_DIVE_REMEDIATION_FEEDBACK.md` - one-time audit output
- `DEEP_DIVE_SUPERPOWERS_MAPPING.md` - AI-generated mapping
- `DEVELOPER_WORKFLOW.md` - redundant with GETTING_STARTED.md
- `EXECUTION_LIMITS.md` - AI-generated, partially implemented
- `FEATURE_FLAGS.md` - not implemented
- `GIT_NOTES_AUDIT.md` - one-time audit output
- `GSD_PATTERN_INTEGRATION_VERIFICATION.md` - one-time verification
- `HANDOFF_CHECKLIST.md` - AI-generated checklist
- `HOOK_DEVELOPMENT_GUIDE.md` - redundant with HOOKS_REFERENCE.md
- `KNOWLEDGE_BASE.md` - AI-generated, not referenced
- `LESSONS_LEARNED.md` - redundant with learnings.md
- `MEMORY_MANAGEMENT.md` - redundant with MEMORY_SYSTEM.md
- `MEMORY_OPERATIONAL_RUNBOOK.md` - AI-generated runbook
- `ML_FEATURES_GUIDE.md` - AI-generated, not implemented
- `MONITORING.md` - AI-generated, not fully implemented
- `MONITORING_RUNBOOK.md` - AI-generated runbook
- `MULTI_FEATURE_INTEGRATION_TESTING.md` - AI-generated
- `OBSERVABILITY.md` - AI-generated, not implemented
- `OPERATIONS_HANDBOOK.md` - AI-generated
- `OPTIONAL_TASKS_OUTLINE.md` - one-time planning output
- `PARTY_MODE.md` - feature not active
- `PARTY_MODE_ARCHITECTURE.md` - feature not active
- `PARTY_MODE_OPERATIONS.md` - feature not active
- `PARTY_MODE_ROLLBACK.md` - feature not active
- `PARTY_MODE_SECURITY.md` - feature not active
- `PERFORMANCE_BUDGETS.md` - AI-generated, not enforced
- `PHASED_ROLLOUT.md` - AI-generated
- `PRODUCTION_DEPLOYMENT_CHECKLIST.md` - AI-generated
- `PROGRESSIVE_DISCLOSURE.md` - redundant with skill
- `PROJECT_COMPLETION_SUMMARY.md` - one-time output
- `REACT_NATIVE_SKILL.md` - belongs in skills/, not docs
- `REACT_PERFORMANCE_SKILL.md` - belongs in skills/, not docs
- `REGISTRY_MANAGEMENT.md` - AI-generated
- `ROLLBACK_PROCEDURES.md` - AI-generated
- `SCAFFOLD_SKILLS_ARCHIVE_MAP.md` - one-time mapping
- `SECURITY_LINT.md` - AI-generated
- `SECURITY_VALIDATORS.md` - AI-generated
- `SELF_EVOLUTION.md` - redundant with @EVOLUTION_WORKFLOW.md
- `SKILL_BUILD.md` - AI-generated
- `SKILLCATALOG_ARCHITECTURE.md` - AI-generated
- `SKILLCATALOG_USAGE.md` - redundant with @SKILL_USAGE_GUIDE.md
- `SKILL_USAGE_GUIDE.md` - redundant with @SKILL_USAGE_GUIDE.md
- `SKILL_WORKFLOW_REFERENCE.md` - AI-generated
- `SKILLS.md` - redundant with @SKILL_CATALOG_TABLE.md
- `SMART_REVERT.md` - AI-generated, not implemented
- `SPEC_INITIALIZATION.md` - AI-generated
- `SPEC_KIT_INTEGRATION.md` - one-time integration doc
- `STAGING_ENVIRONMENT.md` - staging deleted, doc no longer relevant
- `SYSTEM_ARCHITECTURE_HANDBOOK.md` - redundant with ARCHITECTURE.md
- `TESTING.md` - AI-generated
- `TOOL_AUDIT_REPORT_20260131.md` - one-time audit output
- `TRACK_METADATA.md` - AI-generated
- `USER_GUIDE.md` - AI-generated
- `VERCEL_DEPLOY_SKILL.md` - belongs in skills/
- `VERIFY_AGENT_SKILLS_TOOLS_REGISTRATION.md` - one-time verification
- `WEB_DESIGN_SKILL.md` - belongs in skills/
- `ARCHITECTURE_DESIGN_TOOL_AWARENESS.md` - AI-generated

#### Tasks

- [ ] **8.1** Move docs flagged for deletion to docs/archive/ (~5 min)
  - **Rationale**: Move to archive rather than hard-delete, so user can review before permanent deletion
  - **Command**: For each file in the DELETE list above:
    ```bash
    mv "C:\dev\projects\agent-studio\.claude\docs\{FILENAME}" "C:\dev\projects\agent-studio\.claude\docs\archive\"
    ```
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\docs/" | wc -l` should show ~25-30 files (down from 100+)
  - **Rollback**: `mv "C:\dev\projects\agent-studio\.claude\docs\archive\{FILENAME}" "C:\dev\projects\agent-studio\.claude\docs/"`

- [ ] **8.2** Update `@DIRECTORY_STRUCTURE.md` to reflect new structure (~5 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\docs\@DIRECTORY_STRUCTURE.md`
  - **Changes**:
    - Remove `archive/`, `audit/`, `staging/`, `tests/`, `references/`, `teams/` entries
    - Add `context/data/` (with `lancedb/` and `memory.db`)
    - Add `context/teams/` (with CSV files)
    - Add `docs/reference/` (with 3 reference files)
    - Add `docs/archive/` (with archived docs)
    - Add `skills/__tests__/` (with colocated tests)
    - Remove `data/` top-level entry
  - **Verify**: Read the updated file and confirm structure matches actual filesystem
  - **Rollback**: `git checkout -- .claude/docs/@DIRECTORY_STRUCTURE.md`

- [ ] **8.3** Update docs that reference `.claude/data/` paths (~5 min)
  - **Files to update** (informational references -- lower priority):
    - `MEMORY_SYSTEM.md`: Update `.claude/data/memory.db` -> `.claude/context/data/memory.db` and `.claude/data/lancedb` -> `.claude/context/data/lancedb`
    - `MEMORY_SCHEMA.md`: Update `.claude/data/memory.db` references
    - `CODE_INDEXING_DESIGN.md`: Update `.claude/data/code-index` and `.claude/data/lancedb` references
    - `FASTEMBED_GPU_GUIDE.md`: Update `.claude/data/lancedb` reference (if kept)
  - **Command**: Search-and-replace `.claude/data/` with `.claude/context/data/` in each doc
  - **Verify**: `grep -l "\.claude/data/" "C:\dev\projects\agent-studio\.claude\docs/"*.md 2>/dev/null` should return empty (no remaining old references in kept docs)
  - **Rollback**: `git checkout -- .claude/docs/`
  - **Note**: Docs in archive/ do NOT need updating (they are historical)

- [ ] **8.4** Rebuild BM25 code index (~5 min)
  - **Command**: `cd "C:\dev\projects\agent-studio" && node .claude/tools/cli/index-codebase.cjs index .`
  - **If CLI fails**, use the proven minimal approach:
    ```bash
    cd "C:\dev\projects\agent-studio" && LANCEDB_EMBEDDING_MODE=off node -e "
      process.env.LANCEDB_EMBEDDING_MODE = 'off';
      const {IndexManager} = require('./.claude/lib/code-indexing/index-manager.cjs');
      const im = new IndexManager({projectRoot: process.cwd()});
      im.indexIncremental().then(() => console.log('Done')).catch(e => console.error(e));
    "
    ```
  - **Verify**: `ls "C:\dev\projects\agent-studio\.claude\context\data\lancedb\bm25-index.json"` exists and is non-empty
  - **Rollback**: Copy from git: `git checkout -- .claude/context/data/lancedb/bm25-index.json`

#### Phase 8 Verification Gate

```bash
# Docs count should be reduced
ls "C:\dev\projects\agent-studio\.claude\docs/"*.md 2>/dev/null | wc -l
# Should be ~25-30 (not 100+)

# BM25 index should exist at new path
test -f "C:\dev\projects\agent-studio\.claude\context\data\lancedb\bm25-index.json" && \
echo "Phase 8 PASSED" || echo "Phase 8 FAILED: BM25 index missing"
```

---

### Phase 9: FORMAT, LINT, and COMMIT (~10 min)

**Purpose**: Final formatting pass and clean commit
**Dependencies**: Phase 8 complete
**Parallel OK**: No (sequential)

#### Tasks

- [ ] **9.1** Run prettier/lint on all modified .cjs files (~3 min)
  - **Command**: `cd "C:\dev\projects\agent-studio" && npx prettier --write .claude/lib/code-indexing/vector-store.cjs .claude/lib/code-indexing/hybrid-lazy-indexer.cjs .claude/lib/memory/memory-dashboard.cjs .claude/lib/memory/cold-storage.cjs .claude/lib/memory/memory-extraction-writer.cjs .claude/lib/memory/memory-entity-links.cjs .claude/lib/memory/memory-manager.cjs .claude/lib/utils/context-reset.cjs .claude/hooks/reflection/unified-reflection-handler.cjs .claude/hooks/memory/sync-memory-index.cjs .claude/tools/cli/sync-memory-json.cjs .claude/config/code-index-config.json`
  - **Verify**: Exit code 0
  - **Rollback**: `git checkout -- .claude/lib/ .claude/hooks/ .claude/tools/ .claude/config/`

- [ ] **9.2** Run eslint fix on modified files (~3 min) [parallel OK after 9.1]
  - **Command**: `cd "C:\dev\projects\agent-studio" && npx eslint --fix .claude/lib/code-indexing/vector-store.cjs .claude/lib/code-indexing/hybrid-lazy-indexer.cjs .claude/lib/memory/memory-dashboard.cjs .claude/lib/memory/cold-storage.cjs .claude/lib/memory/memory-extraction-writer.cjs .claude/lib/memory/memory-entity-links.cjs .claude/lib/memory/memory-manager.cjs .claude/lib/utils/context-reset.cjs .claude/hooks/reflection/unified-reflection-handler.cjs .claude/hooks/memory/sync-memory-index.cjs .claude/tools/cli/sync-memory-json.cjs 2>&1 || true`
  - **Verify**: No errors (warnings OK)
  - **Rollback**: `git checkout -- .claude/lib/ .claude/hooks/ .claude/tools/`

- [ ] **9.3** Final git status check (~1 min)
  - **Command**: `cd "C:\dev\projects\agent-studio" && git status -s`
  - **Verify**: Review all changes, ensure no unexpected modifications

- [ ] **9.4** Commit all restructuring changes (~2 min)
  - **Command**:
    ```bash
    cd "C:\dev\projects\agent-studio" && \
    git add -A && \
    git commit -m "refactor: restructure .claude directory - consolidate data into context/data, colocate tests, prune docs"
    ```
  - **Verify**: `git log --oneline -1` shows the commit
  - **Rollback**: `git reset --soft HEAD~1`

#### Phase 9 Verification Gate

```bash
git log --oneline -1 | grep "restructure" && echo "Phase 9 PASSED" || echo "Phase 9 FAILED"
```

---

### Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed restructuring work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed .claude directory restructuring work, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Complete File Change Manifest

### Files DELETED (Phase 1)

| Path | Reason |
|------|--------|
| `nul` (project root) | Trash file |
| `.tmp/` (project root) | 34 stale memory-record dirs |
| `.claude/.tmp/` | 13-byte timestamp file |
| `.claude/audit/` | Empty directory |
| `.claude/staging/` | 12 empty test directories |
| `.claude/archive/` | User confirmed deletion |
| `.claude/data/lancedb-test/` | Empty test directory |
| `.claude/data/test-fastembed-gpu-cpu/` | Empty test directory |
| `.claude/data/test-fastembed-gpu-gpu/` | Empty test directory |
| `.claude/data/code-index/` | Empty directory |
| `.claude/agents/router.md` | Duplicate (if exists) |

### Files MOVED (Phases 2-5)

| From | To | Reason |
|------|----|--------|
| `.claude/AUDIT_FIXES_SUMMARY.md` | `.claude/docs/archive/` | Debug file cleanup |
| `.claude/DEBUG_LOG_ANALYSIS_FIXES.md` | `.claude/docs/archive/` | Debug file cleanup |
| `.claude/HOOK_FIXES_APPLIED.md` | `.claude/docs/archive/` | Debug file cleanup |
| `.claude/references/ui-patterns.md` | `.claude/docs/reference/` | Consolidate references |
| `.claude/references/continuation-format.md` | `.claude/docs/reference/` | Consolidate references |
| `.claude/references/lazy-loading.md` | `.claude/docs/reference/` | Consolidate references |
| `.claude/teams/code-review.csv` | `.claude/context/teams/` | Consolidate under context |
| `.claude/teams/secure-implementation.csv` | `.claude/context/teams/` | Consolidate under context |
| `.claude/teams/architecture-decision.csv` | `.claude/context/teams/` | Consolidate under context |
| `.claude/data/lancedb/` | `.claude/context/data/lancedb/` | Consolidate data under context |
| `.claude/data/memory.db` | `.claude/context/data/memory.db` | Consolidate data under context |
| `.claude/tests/skill-triggering/` | `.claude/skills/__tests__/skill-triggering/` | Colocate tests with source |
| 65+ docs files | `.claude/docs/archive/` | AI slop cleanup |

### Files EDITED (Phase 6)

| File | Change |
|------|--------|
| `.claude/lib/code-indexing/vector-store.cjs` (line 19) | `'data', 'lancedb'` -> `'context', 'data', 'lancedb'` |
| `.claude/lib/code-indexing/hybrid-lazy-indexer.cjs` (line 27) | `'data', 'lancedb'` -> `'context', 'data', 'lancedb'` |
| `.claude/lib/memory/memory-dashboard.cjs` (lines 339, 570) | Both `'data'` -> `'context', 'data'` |
| `.claude/lib/memory/cold-storage.cjs` (lines 158, 291) | Both `'data', 'lancedb'` -> `'context', 'data', 'lancedb'` |
| `.claude/lib/memory/memory-extraction-writer.cjs` (line 117) | `'data', 'lancedb'` -> `'context', 'data', 'lancedb'` |
| `.claude/lib/memory/memory-entity-links.cjs` (line 23) | `'data', 'memory.db'` -> `'context', 'data', 'memory.db'` |
| `.claude/lib/memory/memory-manager.cjs` (line 170) | `'data', 'memory.db'` -> `'context', 'data', 'memory.db'` |
| `.claude/lib/utils/context-reset.cjs` (line 35) | `'data', 'lancedb'` -> `'context', 'data', 'lancedb'` |
| `.claude/hooks/reflection/unified-reflection-handler.cjs` (line 805) | `'data', 'lancedb'` -> `'context', 'data', 'lancedb'` |
| `.claude/hooks/memory/sync-memory-index.cjs` (lines 215, 265) | Both `'data', 'memory.db'` -> `'context', 'data', 'memory.db'` |
| `.claude/tools/cli/sync-memory-json.cjs` (line 30) | `'data', 'memory.db'` -> `'context', 'data', 'memory.db'` |
| `.claude/config/code-index-config.json` (lines 10, 71) | `.claude/data/` -> `.claude/context/data/` |
| `.claude/agents/core/planner.md` (lines 48, 52) | `references/` -> `docs/reference/` |
| `.claude/agents/orchestrators/party-orchestrator.md` | `.claude/teams/` -> `.claude/context/teams/` |
| `.claude/workflows/core/router-decision.md` | `.claude/teams/` -> `.claude/context/teams/` |
| `.claude/docs/@DIRECTORY_STRUCTURE.md` | Full structure update |
| `.claude/docs/MEMORY_SYSTEM.md` | `.claude/data/` -> `.claude/context/data/` |
| `.claude/docs/MEMORY_SCHEMA.md` | `.claude/data/` -> `.claude/context/data/` |
| `.claude/docs/CODE_INDEXING_DESIGN.md` | `.claude/data/` -> `.claude/context/data/` |

### Directories CREATED

| Path | Purpose |
|------|---------|
| `.claude/docs/archive/` | Archived debug files and pruned docs |
| `.claude/docs/reference/` | Moved reference files |
| `.claude/context/data/` | Consolidated data directory |
| `.claude/context/teams/` | Moved team CSVs |
| `.claude/skills/__tests__/skill-triggering/` | Colocated tests |

### Directories REMOVED

| Path | Reason |
|------|--------|
| `.claude/archive/` | User confirmed |
| `.claude/audit/` | Empty |
| `.claude/staging/` | Empty test dirs |
| `.claude/.tmp/` | Temp file |
| `.claude/references/` | Moved to docs/reference/ |
| `.claude/teams/` | Moved to context/teams/ |
| `.claude/data/` | Consolidated into context/data/ |
| `.claude/tests/` | Colocated into skills/__tests__/ |
| `<project-root>/.tmp/` | Stale temp dirs |

---

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Risk |
|-------|-------|-----------|-----------|------|
| 1: Cleanup | 8 | 10 min | Yes | Zero |
| 2: Move Debug Files | 2 | 5 min | Yes | Low |
| 3: Move refs/teams | 2 | 5 min | Yes | Low |
| 4: Consolidate data | 5 | 10 min | No | Medium |
| 5: Colocate tests | 4 | 10 min | No | Low |
| 6: Update references | 15 | 30 min | Partial | HIGH |
| 7: Verify | 6 | 15 min | Partial | N/A |
| 8: Clean docs + rebuild | 4 | 20 min | Partial | Medium |
| 9: Format + commit | 4 | 10 min | No | Low |
| FINAL: Reflection | 1 | 5 min | N/A | N/A |
| **Total** | **51** | **~120 min** | | |
