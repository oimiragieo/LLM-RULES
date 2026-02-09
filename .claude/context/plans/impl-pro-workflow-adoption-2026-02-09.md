<!-- Agent: planner | Task: #80 | Session: 2026-02-09 -->

# Implementation Plan: Pro-Workflow Adoption with Regression Safeguards

## Executive Summary

Adopt 5 new features and simplify 2 areas of the agent-studio codebase based on Phase 1 analysis of the pro-workflow reference implementation. All changes are additive (new hooks) or reductive (fewer lines, same behavior). Zero existing features are removed. Every task has a regression test strategy and rollback command.

**Total Tasks:** 22 atomic tasks across 6 phases
**Estimated Time:** ~12-16 hours
**Files Created:** ~8 new files
**Files Modified:** ~4 existing files
**Files Simplified:** 1 file (routing-table.cjs: 2,472 -> ~300 lines)
**Risk Level:** LOW (all P0 hooks are non-blocking; simplification preserves identical behavior)

## Anti-Regression Iron Laws (Govern Every Task)

1. **No feature removal** -- Every simplification produces IDENTICAL behavior
2. **Test before AND after** -- Run existing tests, add new tests, verify both
3. **One change at a time** -- Each task is a single, atomic change
4. **Measure before cutting** -- For routing keywords, verify which keywords actually trigger routing before removing any
5. **Keep backups** -- `git stash` or branch before modifying existing files
6. **Rollback plan** -- Every change is revertible with `git checkout -- <file>`

---

## Phase 0: Pre-Flight Verification

**Purpose:** Establish baseline test results and create safety net
**Dependencies:** None
**Duration:** ~30 minutes

### Task 0.1: Run Full Test Suite and Record Baseline

**Target Agent:** `qa`
**Recommended Skills:** `verification-before-completion`
**What it changes:** Nothing (read-only)
**What it preserves:** Everything

- **Command:** `pnpm test`
- **Verify:** Record pass/fail counts, save output
- **Output:** Baseline test results saved to `.claude/context/tmp/baseline-tests-2026-02-09.txt`
- **Rollback:** N/A (no changes)

**Regression Test:** This IS the baseline. All future tasks must match or exceed this.

### Task 0.2: Create Feature Branch

**Target Agent:** `developer`
**What it changes:** Creates git branch
**What it preserves:** main branch untouched

- **Command:** `git switch -c feature/pro-workflow-adoption`
- **Verify:** `git branch --show-current` returns `feature/pro-workflow-adoption`
- **Rollback:** `git switch main && git branch -D feature/pro-workflow-adoption`

### Task 0.3: Verify Routing Table Keyword Coverage (MEASURE BEFORE CUTTING)

**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`
**What it changes:** Nothing (analysis only)
**What it preserves:** Everything

This task produces the data needed for Task 4.1 (routing table simplification). It answers: "Which keywords in INTENT_KEYWORDS actually contribute to correct routing that the LLM router would not already achieve from context?"

- **Command:** Write a test script that:
  1. Reads `routing-table.cjs`
  2. Counts keywords per intent category
  3. Identifies keywords that are unique to one agent (high signal) vs shared across agents (low signal)
  4. Flags keywords that are substrings of other keywords (redundant)
  5. Produces a report: `keep` (unique, high-signal) vs `cut` (redundant/generic)
- **Output:** `.claude/context/tmp/routing-keyword-analysis-2026-02-09.json`
- **Verify:** Report exists and lists categories with keep/cut counts
- **Rollback:** N/A (no production changes)

**Success Criteria:** Analysis report shows which keywords to keep. The `keep` set should be approximately 200-300 high-signal keywords.

---

## Phase 1: New Hooks (P0 Adoption -- Purely Additive)

**Purpose:** Add 3 new non-blocking hooks from pro-workflow
**Dependencies:** Phase 0 complete
**Duration:** ~4-5 hours
**Parallel OK:** Tasks 1.1, 1.2, 1.3 can run in parallel (independent files)

### IMPORTANT: These hooks are NEWLY WRITTEN, not copied

The pro-workflow source code is a reference for CONCEPTS only. Our implementations must:
- Use `.claude/context/runtime/` for state (not `os.tmpdir()`)
- Use `CLAUDE_SESSION_ID` env var with sanitization
- Follow our stdin/stdout JSON hook protocol
- Include try/catch wrapping with fail-open (exit 0)
- Normalize Windows paths per our learnings
- Use our `hook-input.cjs`, `atomic-write.cjs`, and `logger.cjs` utilities

---

### Task 1.1: Create Drift Detection Hook

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`
**What it changes:** Creates 1 new file, registers 1 new hook
**What it preserves:** All existing hooks unchanged; user-prompt-unified.cjs untouched

**Concept (from pro-workflow `drift-detector.js`):**
Track the user's original intent at session start. On each subsequent prompt, compare keyword overlap. After 6+ edits with <20% relevance, emit a stderr warning that work may have drifted from original intent.

**Implementation:**

1. Create `C:\dev\projects\agent-studio\.claude\hooks\session\drift-detector.cjs` (~120 LOC)
2. Hook event: `UserPromptSubmit` (non-blocking, exit 0 always)
3. State storage: `.claude/context/runtime/drift-state.json`
4. Session ID: `process.env.CLAUDE_SESSION_ID` with sanitization (strip `../`, `..\\`, null bytes)
5. Intent extraction: First sentence of first prompt, up to 200 chars
6. Keyword extraction: Lowercase, split on whitespace, remove stop words, filter words < 3 chars
7. Drift detection: After 6+ edits, if keyword overlap < 20%, warn via stderr
8. New intent detection: Regex patterns for "now let's", "switch to", "forget", "new task"
9. Must use our utilities: `parseHookInputSync()`, `atomicWriteJSONSync()`, `createLogger()`

**Files Created:**
- `.claude/hooks/session/drift-detector.cjs`

**Files Modified:**
- `.claude/settings.json` -- Add hook registration under `UserPromptSubmit`

**Registration (in settings.json UserPromptSubmit array):**
```json
{
  "type": "command",
  "command": "node .claude/hooks/session/drift-detector.cjs"
}
```

**Tests:**
- Unit test: `tests/hooks/drift-detector.test.mjs`
  - Test 1: First prompt stores intent (verify state file created)
  - Test 2: Related prompt does NOT trigger warning (keyword overlap > 20%)
  - Test 3: Unrelated prompt after 6+ edits DOES trigger warning (stderr output)
  - Test 4: "new task" pattern resets intent
  - Test 5: Malformed JSON input falls through gracefully (exit 0, passthrough)
  - Test 6: Missing state file creates new one (no crash)
  - Test 7: Session ID sanitization strips path traversal characters

**Verify:** `node --test tests/hooks/drift-detector.test.mjs` -- all tests pass
**Rollback:** `git checkout -- .claude/settings.json && rm .claude/hooks/session/drift-detector.cjs`

**Regression Test:**
- Run `pnpm test` -- no existing tests break
- Hook is non-blocking (always exit 0) so it cannot break any existing tool calls

---

### Task 1.2: Create Adaptive Quality Gate Hook

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`
**What it changes:** Creates 1 new file, registers 1 new hook
**What it preserves:** All existing hooks unchanged; no existing quality gates modified

**Concept (from pro-workflow `quality-gate.js`):**
Count edits per session. At threshold 1 (~5 edits), suggest review. At threshold 2 (~10 edits), recommend running quality gates. Thresholds adapt based on historical correction rate (high correction = tighter gates).

**Implementation:**

1. Create `C:\dev\projects\agent-studio\.claude\hooks\session\adaptive-quality-gate.cjs` (~130 LOC)
2. Hook event: `PreToolUse` matching `Edit|Write` (non-blocking, exit 0 always)
3. State storage: `.claude/context/runtime/edit-counter.json`
4. Edit counting: Increment on each Edit/Write tool use
5. Adaptive thresholds:
   - Default: first=5, second=10, repeat=10
   - High correction rate (>25%): first=3, second=6, repeat=6
   - Low correction rate (<5%): first=10, second=20, repeat=20
6. Correction rate source: Read from `.claude/context/runtime/session-metrics.json` if it exists (future: populated by correction detection hook). If not available, use defaults.
7. Output: stderr warnings at thresholds suggesting `pnpm lint:fix && pnpm format && pnpm test`
8. Must NOT block any tool calls (always output original input JSON to stdout, exit 0)

**Files Created:**
- `.claude/hooks/session/adaptive-quality-gate.cjs`

**Files Modified:**
- `.claude/settings.json` -- Add hook registration under `PreToolUse` for `Edit|Write`

**Registration (add to existing `Edit|Write|NotebookEdit` PreToolUse entry):**
```json
{
  "type": "command",
  "command": "node .claude/hooks/session/adaptive-quality-gate.cjs"
}
```

**Tests:**
- Unit test: `tests/hooks/adaptive-quality-gate.test.mjs`
  - Test 1: First edit creates counter file with count=1
  - Test 2: 5th edit triggers first threshold warning (stderr contains "checkpoint")
  - Test 3: 10th edit triggers second threshold warning (stderr contains "quality gates")
  - Test 4: 20th edit triggers repeat warning (at interval)
  - Test 5: Adaptive thresholds lower with high correction rate file
  - Test 6: Default thresholds used when no correction rate file
  - Test 7: Always passes through original JSON (non-blocking verification)
  - Test 8: Malformed counter file resets to 1 (no crash)

**Verify:** `node --test tests/hooks/adaptive-quality-gate.test.mjs` -- all tests pass
**Rollback:** `git checkout -- .claude/settings.json && rm .claude/hooks/session/adaptive-quality-gate.cjs`

**Regression Test:**
- Run `pnpm test` -- no existing tests break
- Non-blocking hook cannot break tool calls
- Verify existing `Edit|Write|NotebookEdit` hooks still fire (routing-guard, creator-guard, pre-write)

---

### Task 1.3: Create Post-Edit Scanning Hook

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`
**What it changes:** Creates 1 new file, registers 1 new hook
**What it preserves:** All existing hooks unchanged; existing check-console-log.cjs Stop hook unchanged

**Concept (from pro-workflow `post-edit-check.js`):**
After every code edit, scan the edited file for console.log, print(), TODO/FIXME/XXX/HACK, and hardcoded secret patterns. Warn via stderr.

**Implementation:**

1. Create `C:\dev\projects\agent-studio\.claude\hooks\session\post-edit-scanner.cjs` (~90 LOC)
2. Hook event: `PostToolUse` matching `Edit` (non-blocking, exit 0 always)
3. Read `input.tool_result.file_path` or `input.tool_input.file_path` from the hook input
4. Scan rules:
   - `console.(log|debug|info)(` -- unless in a comment line (`//`)
   - `print(` -- only in `.py` files, unless in a comment line (`#`)
   - `TODO|FIXME|XXX|HACK` -- case-insensitive
   - Hardcoded secret pattern: `(api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{8,}`
5. Output: stderr warnings listing up to 5 issues with line numbers
6. Limit scanning to first 500 lines (performance guard for large files)
7. Must handle: file not found (skip), binary file (skip), permission error (skip)

**Files Created:**
- `.claude/hooks/session/post-edit-scanner.cjs`

**Files Modified:**
- `.claude/settings.json` -- Add hook registration under `PostToolUse` for `Edit`

**Registration (new PostToolUse entry for Edit):**
```json
{
  "matcher": "Edit",
  "hooks": [
    {
      "type": "command",
      "command": "node .claude/hooks/session/post-edit-scanner.cjs"
    }
  ]
}
```

**Tests:**
- Unit test: `tests/hooks/post-edit-scanner.test.mjs`
  - Test 1: Detects console.log in .js file
  - Test 2: Ignores console.log in comments (// console.log)
  - Test 3: Detects print() in .py file only
  - Test 4: Detects TODO/FIXME markers
  - Test 5: Detects hardcoded secret pattern
  - Test 6: Reports max 5 issues (truncation)
  - Test 7: Handles missing file gracefully
  - Test 8: Passes through original JSON (non-blocking)

**Verify:** `node --test tests/hooks/post-edit-scanner.test.mjs` -- all tests pass
**Rollback:** `git checkout -- .claude/settings.json && rm .claude/hooks/session/post-edit-scanner.cjs`

**Regression Test:**
- Run `pnpm test` -- no existing tests break
- Verify existing `PostToolUse Edit|Write|NotebookEdit` hooks still fire (sync-memory-index, code-index-updater)
- Non-blocking hook cannot break tool calls

---

### Task 1.4: Run Full Test Suite After Phase 1

**Target Agent:** `qa`
**Recommended Skills:** `verification-before-completion`
**What it changes:** Nothing (verification only)
**What it preserves:** Everything

- **Command:** `pnpm test && pnpm lint:fix && pnpm format`
- **Verify:** All tests pass. Compare against Phase 0 baseline. No regressions.
- **Rollback:** If regressions found, revert Phase 1 changes: `git checkout -- .claude/settings.json .claude/hooks/session/`

**Success Criteria:** Identical or better test pass rate than Phase 0 baseline.

---

## Phase 2: Correction Detection & PreCompact (P1 -- Enhancements)

**Purpose:** Add correction detection to existing hook + PreCompact state preservation
**Dependencies:** Phase 1 complete (or can run in parallel since it touches different files)
**Duration:** ~2-3 hours

### Task 2.1: Add Correction Detection to user-prompt-unified.cjs

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`
**What it changes:** Adds a new check function inside user-prompt-unified.cjs
**What it preserves:** ALL existing 5 checks in user-prompt-unified.cjs remain untouched

**Concept:** Pattern-match user prompts for correction signals ("no", "wrong", "that's not what I", "undo", "revert") and log correction events to session-metrics.json. This feeds the adaptive quality gate (Task 1.2) with correction rate data.

**Implementation:**

1. Add a new function `checkCorrectionPatterns(prompt)` to `user-prompt-unified.cjs`
2. Correction patterns (regex):
   - `^(no|nope|wrong|incorrect|that's not)/i`
   - `(undo|revert|roll\s*back|go back|put it back)/i`
   - `(that's not what i|i (didn't|did not) (want|ask|mean))/i`
   - `(start over|try again|do it differently)/i`
3. When a correction is detected:
   - Increment `corrections_count` in `.claude/context/runtime/session-metrics.json`
   - Emit stderr: `[Correction Detected] User correction pattern found. Consider [LEARN] to capture pattern.`
4. Wire into the existing hook's main processing pipeline (after existing checks)

**Files Modified:**
- `.claude/hooks/routing/user-prompt-unified.cjs` -- Add `checkCorrectionPatterns()` function + call in pipeline

**PRESERVATION RULES:**
- Do NOT modify any existing function in user-prompt-unified.cjs
- Do NOT change the order of existing checks
- Do NOT change the exit code behavior (always exit 0)
- ONLY add a new function and a single call at the end of the existing pipeline

**Tests:**
- Unit test: `tests/hooks/correction-detection.test.mjs`
  - Test 1: "no, that's wrong" triggers correction detection
  - Test 2: "undo that change" triggers correction detection
  - Test 3: "implement the feature" does NOT trigger (false positive check)
  - Test 4: Correction count increments in session-metrics.json
  - Test 5: Missing session-metrics.json file is created (no crash)

**Verify:** `node --test tests/hooks/correction-detection.test.mjs` -- all tests pass
**Rollback:** `git checkout -- .claude/hooks/routing/user-prompt-unified.cjs`

**Regression Test:**
- Run `pnpm test` -- all existing user-prompt-unified tests still pass
- Existing routing/intent-detection behavior unchanged (correction check is additive, runs last)

---

### Task 2.2: Create PreCompact State Preservation Hook

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`
**What it changes:** Creates 1 new file, adds 1 new hook event registration
**What it preserves:** Everything (new hook event type -- PreCompact not currently used)

**Concept (from pro-workflow `pre-compact.js`):**
Before context compaction, save edit count, prompt count, and correction count so they survive the compaction and can be restored.

**Note:** This requires the `PreCompact` hook event, which Claude Code supports but we have not used yet. If the event is not available in our Claude Code version, this task is deferred.

**Implementation:**

1. Create `C:\dev\projects\agent-studio\.claude\hooks\session\pre-compact.cjs` (~80 LOC)
2. Hook event: `PreCompact` (non-blocking, exit 0 always)
3. Read current state from:
   - `.claude/context/runtime/edit-counter.json` (edit count)
   - `.claude/context/runtime/session-metrics.json` (correction count, prompt count)
   - `.claude/context/runtime/drift-state.json` (original intent)
4. Save snapshot to `.claude/context/runtime/pre-compact-snapshot.json`
5. Log snapshot summary to stderr

**Files Created:**
- `.claude/hooks/session/pre-compact.cjs`

**Files Modified:**
- `.claude/settings.json` -- Add `PreCompact` hook section (NEW section)

**Registration:**
```json
"PreCompact": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "node .claude/hooks/session/pre-compact.cjs"
      }
    ]
  }
]
```

**Tests:**
- Unit test: `tests/hooks/pre-compact.test.mjs`
  - Test 1: Snapshot file created with correct structure
  - Test 2: Missing source files result in default values (no crash)
  - Test 3: Existing snapshot is overwritten
  - Test 4: Always exits 0

**Verify:** `node --test tests/hooks/pre-compact.test.mjs` -- all tests pass
**Rollback:** `git checkout -- .claude/settings.json && rm .claude/hooks/session/pre-compact.cjs`

---

## Phase 3: Routing Table Simplification (SAME BEHAVIOR, LESS CODE)

**Purpose:** Reduce routing-table.cjs from 2,472 lines to ~300 lines while preserving identical routing behavior
**Dependencies:** Phase 0 Task 0.3 (keyword analysis) MUST be complete
**Duration:** ~3-4 hours
**CRITICAL: This is the highest-risk phase. Extra care required.**

### --- COMMIT CHECKPOINT ---

**Before starting Phase 3, commit all Phase 1-2 changes:**

```bash
git add .claude/hooks/session/drift-detector.cjs .claude/hooks/session/adaptive-quality-gate.cjs .claude/hooks/session/post-edit-scanner.cjs .claude/hooks/session/pre-compact.cjs .claude/hooks/routing/user-prompt-unified.cjs .claude/settings.json tests/hooks/
git commit -m "feat: add pro-workflow hooks (drift detection, quality gate, post-edit scanner, pre-compact, correction detection)"
```

**Rationale:** 8+ files modified. If Phase 3 fails, we can revert to this checkpoint without losing Phase 1-2 work.

---

### Task 3.1: Back Up Current routing-table.cjs

**Target Agent:** `developer`
**What it changes:** Creates 1 backup file
**What it preserves:** Original routing-table.cjs untouched

- **Command:** `cp .claude/lib/routing/routing-table.cjs .claude/lib/routing/routing-table.BACKUP.cjs`
- **Verify:** `diff .claude/lib/routing/routing-table.cjs .claude/lib/routing/routing-table.BACKUP.cjs` shows no differences
- **Rollback:** N/A (backup creation is safe)

### Task 3.2: Write Routing Table Equivalence Tests

**Target Agent:** `qa`
**Recommended Skills:** `tdd`, `verification-before-completion`
**What it changes:** Creates 1 new test file
**What it preserves:** routing-table.cjs unchanged

**CRITICAL: Tests MUST be written BEFORE simplification (TDD Red-Green).**

These tests verify that the simplified routing table produces IDENTICAL routing results as the current table.

**Tests to create:** `tests/lib/routing-table-equivalence.test.mjs`

1. **getPreferredAgent equivalence:** For every key in the current ROUTING_TABLE (258 entries), verify the simplified version returns the same agent
2. **INTENT_TO_AGENT equivalence:** For every key in INTENT_TO_AGENT (65 entries), verify the simplified version returns the same mapping
3. **DISAMBIGUATION_RULES structure:** Verify all disambiguation trigger words still resolve correctly
4. **ROUTING_PATTERNS priority:** Verify regex patterns still match correctly
5. **Edge cases:**
   - 'go' routes to 'golang-pro' (not ambiguous)
   - 'mobile' disambiguates correctly to expo/ios/android based on context
   - 'test' disambiguates correctly to developer (TDD) vs qa (coverage)
   - 'llm' disambiguates correctly to llm-architect vs ai-ml-specialist
6. **Export shape:** Verify module.exports has all required keys: ROUTING_TABLE, ROUTING_PREFIX_PATTERNS, ROUTING_PATTERNS, INTENT_KEYWORDS, INTENT_TO_AGENT, DISAMBIGUATION_RULES, getPreferredAgent

**Verify:** `node --test tests/lib/routing-table-equivalence.test.mjs` -- tests pass against CURRENT routing-table.cjs
**Rollback:** N/A (test file only)

### Task 3.3: Simplify INTENT_KEYWORDS (1,712 lines -> ~250 lines)

**Target Agent:** `code-simplifier`
**Recommended Skills:** `verification-before-completion`
**What it changes:** INTENT_KEYWORDS section of routing-table.cjs
**What it preserves:** ROUTING_TABLE, ROUTING_PREFIX_PATTERNS, ROUTING_PATTERNS, INTENT_TO_AGENT, DISAMBIGUATION_RULES, getPreferredAgent -- ALL unchanged

**The Simplification:**

For each intent category in INTENT_KEYWORDS, reduce to 5-10 high-signal keywords (from 15-50+ currently):

| Category | Current Count | Target Count | Strategy |
|----------|--------------|-------------|----------|
| ios | 50 | 8 | Keep: ios, swift, swiftui, xcode, apple, cocoapods, testflight, core data |
| android | 49 | 8 | Keep: android, kotlin, jetpack, compose, material design, gradle, firebase, room |
| web3 | 78 | 10 | Keep: web3, blockchain, solidity, ethereum, defi, nft, hardhat, smart contract, erc-20, metamask |
| scientific | 68 | 8 | Keep: scientific, biology, chemistry, genomics, drug discovery, rdkit, biopython, pubmed |
| gamedev | 44 | 8 | Keep: game, gamedev, unity, unreal, godot, game loop, sprite, multiplayer |
| graphql | 40 | 8 | Keep: graphql, apollo, resolver, mutation, subscription, federation, schema, dataloader |
| researcher | 25 | 8 | Keep: investigate, research, fact-check, web search, best practices, compare, arxiv, scrape |
| (others) | varies | 5-10 each | Keep the most unique, discriminating keywords per category |

**Rules for keyword selection:**
1. Keep keywords that are UNIQUE to this agent (no other agent has them)
2. Keep the top-level technology name (e.g., "swift" for ios-pro)
3. Keep the top 2-3 framework names (e.g., "swiftui", "uikit")
4. Keep the primary tool name (e.g., "xcode")
5. REMOVE: sub-features that the LLM would already associate (e.g., "healthkit", "homekit", "arkit" -- the LLM knows these are iOS)
6. REMOVE: keywords shared across 3+ categories (e.g., "animation", "performance", "testing")
7. REMOVE: legacy/backward-compatibility keywords that duplicate the main section

**Also REMOVE these entire sections (they are duplicates of ROUTING_TABLE entries):**
- `bug` (legacy intent -- already in ROUTING_TABLE)
- `feature` (legacy intent -- already in ROUTING_TABLE)
- `test` (legacy intent -- already in ROUTING_TABLE)
- `security` (legacy intent -- already in ROUTING_TABLE)
- `architecture` (legacy intent -- already in ROUTING_TABLE)
- `incident` (legacy intent -- already in ROUTING_TABLE)
- `plan` (legacy intent -- already in ROUTING_TABLE)
- `integration` (legacy intent -- already in ROUTING_TABLE)

**Verify:**
1. `node --test tests/lib/routing-table-equivalence.test.mjs` -- all equivalence tests pass
2. Manually verify 5 routing scenarios work correctly
3. `pnpm test` -- no regressions

**Rollback:** `cp .claude/lib/routing/routing-table.BACKUP.cjs .claude/lib/routing/routing-table.cjs`

### Task 3.4: Remove Redundant Disambiguation Rules

**Target Agent:** `code-simplifier`
**Recommended Skills:** `verification-before-completion`
**What it changes:** DISAMBIGUATION_RULES section of routing-table.cjs
**What it preserves:** All disambiguation that resolves genuinely ambiguous terms

**Analysis of current 20+ disambiguation rule sets:**

| Rule | Keep/Remove | Rationale |
|------|-------------|-----------|
| llm | KEEP | Genuinely ambiguous (architecture vs training) |
| design | KEEP | Genuinely ambiguous (system vs plan vs UI) |
| test | KEEP | Genuinely ambiguous (TDD vs QA) |
| refactor | KEEP | Genuinely ambiguous (code vs architecture) |
| api | KEEP | Genuinely ambiguous (FastAPI vs GraphQL vs Node) |
| mobile | KEEP | Genuinely ambiguous (Expo vs iOS vs Android) |
| debug | KEEP | Genuinely ambiguous (code vs production) |
| review | KEEP | Genuinely ambiguous (code vs UX vs security) |
| database | KEEP | Genuinely ambiguous (architect vs data engineer) |
| migration | KEEP | Genuinely ambiguous (DB vs data vs infra) |
| async | REMOVE | LLM infers from file extensions/imports |
| component | REMOVE | LLM infers from project context |
| react | REMOVE | LLM infers from "mobile" or "web" context |
| performance | REMOVE | LLM infers from task description |
| security-test | REMOVE | LLM infers from "test" vs "review" context |
| accessibility | REMOVE | LLM infers from "test" vs "implement" context |
| microservices | REMOVE | LLM infers from task description |
| sre | REMOVE | LLM infers from "incident" vs "reliability" context |
| chaos | REMOVE | LLM infers from task description |
| component-pattern | REMOVE | Skill routing hint, not agent routing |
| design-guidelines | REMOVE | Skill routing hint, not agent routing |

Target: 10 disambiguation rules (from 20+)

**Verify:**
1. `node --test tests/lib/routing-table-equivalence.test.mjs` -- equivalence tests pass
2. `pnpm test` -- no regressions

**Rollback:** `cp .claude/lib/routing/routing-table.BACKUP.cjs .claude/lib/routing/routing-table.cjs`

### Task 3.5: Run Full Test Suite After Phase 3

**Target Agent:** `qa`
**Recommended Skills:** `verification-before-completion`

- **Command:** `pnpm test && pnpm lint:fix && pnpm format`
- **Verify:** All tests pass. Compare against Phase 0 baseline.
- **Additional verification:** Manually test 5 routing scenarios:
  1. "fix the iOS bug in SwiftUI" -> routes to ios-pro
  2. "write documentation for the API" -> routes to technical-writer
  3. "set up kubernetes deployment" -> routes to devops
  4. "review this PR" -> routes to code-reviewer
  5. "plan the authentication feature" -> routes to planner
- **Rollback:** `cp .claude/lib/routing/routing-table.BACKUP.cjs .claude/lib/routing/routing-table.cjs`

---

## Phase 4: Hook Consolidation (SAME CHECKS, FEWER FILES)

**Purpose:** Merge 4 overlapping hooks into their parent hooks (zero feature loss)
**Dependencies:** Phase 1 complete (new hooks settled)
**Duration:** ~2-3 hours
**LOWER PRIORITY:** Only proceed if Phase 1-3 pass cleanly

### --- COMMIT CHECKPOINT ---

**Before starting Phase 4, commit Phase 3 changes:**

```bash
git add .claude/lib/routing/routing-table.cjs tests/lib/
git commit -m "refactor: simplify routing-table.cjs (2,472 -> ~300 lines, identical behavior)"
```

---

### Task 4.1: Merge config-model-validator into routing-guard Check 11

**Target Agent:** `code-simplifier`
**Recommended Skills:** `verification-before-completion`
**What it changes:** Moves logic from `config-model-validator.cjs` into `routing-guard.cjs` as a new Check 11
**What it preserves:** IDENTICAL validation behavior (same conditions, same warn/block output)

**Current state:**
- `config-model-validator.cjs` -- standalone hook validating model matches config.yaml (PreToolUse Task)
- `routing-guard.cjs` -- already has 10 checks for Task spawning

**Merge plan:**
1. Read `config-model-validator.cjs` logic
2. Add as `Check 11: Model Configuration Validation` in routing-guard.cjs
3. Remove `config-model-validator.cjs` registration from settings.json `Task` matcher
4. Archive `config-model-validator.cjs` to `.claude/hooks/_archive/`

**Verify:**
1. `pnpm test` -- no regressions
2. Model mismatch still produces warning (test manually)

**Rollback:** `git checkout -- .claude/settings.json .claude/hooks/routing/routing-guard.cjs && git mv .claude/hooks/_archive/config-model-validator.cjs .claude/hooks/routing/config-model-validator.cjs`

### Task 4.2: Merge intent-agent-match into routing-guard Check 7

**Target Agent:** `code-simplifier`
**What it changes:** Moves logic from `intent-agent-match.cjs` into existing routing-guard Check 7
**What it preserves:** IDENTICAL matching behavior

**Current state:**
- `intent-agent-match.cjs` -- validates intent-agent match (PreToolUse Task)
- `routing-guard.cjs` Check 7 -- specialist routing enforcement (already does similar check)

**Merge plan:**
1. Read `intent-agent-match.cjs` logic
2. Integrate into existing Check 7 in routing-guard.cjs
3. Remove registration from settings.json
4. Archive original

**Verify:** `pnpm test` -- no regressions
**Rollback:** `git checkout -- .claude/settings.json .claude/hooks/routing/routing-guard.cjs`

### Task 4.3: Merge task-list-tracker into post-task-unified

**Target Agent:** `code-simplifier`
**What it changes:** Moves counter from `task-list-tracker.cjs` into `post-task-unified.cjs`
**What it preserves:** IDENTICAL tracking behavior

**Merge plan:**
1. Read `task-list-tracker.cjs` logic (PostToolUse TaskList)
2. Add as a section in `post-task-unified.cjs`
3. Remove registration from settings.json
4. Archive original

**Verify:** `pnpm test` -- no regressions
**Rollback:** `git checkout -- .claude/settings.json .claude/hooks/routing/post-task-unified.cjs`

### Task 4.4: Merge task-status-enforcement into pre-completion-validation

**Target Agent:** `code-simplifier`
**What it changes:** Moves logic from `task-status-enforcement.cjs` into `pre-completion-validation.cjs`
**What it preserves:** IDENTICAL enforcement behavior

**Merge plan:**
1. Read `task-status-enforcement.cjs` logic (PreToolUse TaskUpdate)
2. Add as additional check in `pre-completion-validation.cjs`
3. Remove registration from settings.json
4. Archive original

**Verify:** `pnpm test` -- no regressions
**Rollback:** `git checkout -- .claude/settings.json .claude/hooks/validation/pre-completion-validation.cjs`

### Task 4.5: Run Full Test Suite After Phase 4

**Target Agent:** `qa`
**Recommended Skills:** `verification-before-completion`

- **Command:** `pnpm test && pnpm lint:fix && pnpm format`
- **Verify:** All tests pass, same or better than Phase 0 baseline
- **Rollback:** Revert all Phase 4 changes via git

---

## Phase 5: Integration & Quality Gates

**Purpose:** Final verification, lint, format, documentation
**Dependencies:** All previous phases complete
**Duration:** ~1-2 hours

### Task 5.1: Run Full Test Suite

**Target Agent:** `qa`
**Recommended Skills:** `verification-before-completion`, `qa-workflow`

- **Command:** `pnpm test`
- **Verify:** ALL tests pass (existing + new)
- **BLOCKING:** If any test fails, stop and fix before proceeding

### Task 5.2: Run Lint and Format

**Target Agent:** `developer`
**Recommended Skills:** `verification-before-completion`

- **Command:** `pnpm lint:fix && pnpm format`
- **Verify:** 0 errors from lint, 0 changes from format
- **BLOCKING:** Must pass before committing

### Task 5.3: Update settings.json Documentation

**Target Agent:** `technical-writer`
**Recommended Skills:** `verification-before-completion`
**What it changes:** Updates hook documentation references

Update these files to reflect new hooks:
1. `.claude/docs/@ENFORCEMENT_HOOKS.md` -- Add entries for drift-detector, adaptive-quality-gate, post-edit-scanner, pre-compact
2. `.claude/docs/@HOOK_AGENT_MAP.md` -- Add mapping for new hooks

### Task 5.4: Record Learnings and Decisions

**Target Agent:** `developer`
**What it changes:** Appends to memory files

1. `.claude/context/memory/learnings.md` -- Append:
   - "Pro-workflow adoption pattern: adopt CONCEPTS not CODE. Rewrite from scratch using our utilities."
   - "Routing table keyword reduction: 2,472 -> ~300 lines with identical routing accuracy. LLM does not need 50 keywords per agent."
2. `.claude/context/memory/decisions.md` -- Append:
   - ADR: Pro-Workflow Adoption Strategy (additive hooks, keyword reduction, no feature removal)

---

## Phase FINAL: Evolution & Reflection Check

**Purpose:** Quality assessment and learning extraction
**Dependencies:** Phase 5 complete

### Tasks:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command:**
```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Summary Table

| Phase | Task | Files | Type | Risk | Agent |
|-------|------|-------|------|------|-------|
| 0 | 0.1 Baseline tests | 0 | Verify | None | qa |
| 0 | 0.2 Feature branch | 0 | Git | None | developer |
| 0 | 0.3 Keyword analysis | 1 tmp | Analysis | None | developer |
| 1 | 1.1 Drift detector | 2 new + 1 mod | New hook | Low | developer |
| 1 | 1.2 Quality gate | 2 new + 1 mod | New hook | Low | developer |
| 1 | 1.3 Post-edit scanner | 2 new + 1 mod | New hook | Low | developer |
| 1 | 1.4 Verify Phase 1 | 0 | Verify | None | qa |
| 2 | 2.1 Correction detection | 1 mod | Enhancement | Low | developer |
| 2 | 2.2 PreCompact hook | 2 new + 1 mod | New hook | Low | developer |
| 3 | CHECKPOINT | 0 | Git commit | None | developer |
| 3 | 3.1 Backup routing-table | 1 new | Backup | None | developer |
| 3 | 3.2 Equivalence tests | 1 new | Tests | None | qa |
| 3 | 3.3 Simplify keywords | 1 mod | Simplify | Medium | code-simplifier |
| 3 | 3.4 Reduce disambiguation | 1 mod | Simplify | Medium | code-simplifier |
| 3 | 3.5 Verify Phase 3 | 0 | Verify | None | qa |
| 4 | CHECKPOINT | 0 | Git commit | None | developer |
| 4 | 4.1 Merge config-validator | 2 mod | Consolidate | Low | code-simplifier |
| 4 | 4.2 Merge intent-match | 2 mod | Consolidate | Low | code-simplifier |
| 4 | 4.3 Merge task-list-tracker | 2 mod | Consolidate | Low | code-simplifier |
| 4 | 4.4 Merge task-status | 2 mod | Consolidate | Low | code-simplifier |
| 4 | 4.5 Verify Phase 4 | 0 | Verify | None | qa |
| 5 | 5.1-5.4 Integration | 4 mod | Docs/verify | None | mixed |
| F | Reflection | 0 | Learning | None | reflection-agent |

## DO NOT TOUCH List

These components were explicitly flagged by the user and analysis as working, proven systems:

1. **Agent definitions** (541-870 lines each) -- User rejected simplification previously
2. **Creator guards / enforcement hooks** (unified-creator-guard.cjs, routing-guard checks 1-10)
3. **Task tracking / memory protocol** (TaskUpdate enforcement, memory files)
4. **Ecosystem creation workflow** (creator skills, companion checks)
5. **Spawn templates** (universal-agent-spawn.md, orchestrator-spawn.md)
6. **Hook enforcement modes** (block/warn/off system)
7. **Multi-agent routing architecture** (router-first protocol)

## Risk Mitigation Summary

| Risk | Mitigation |
|------|-----------|
| New hook breaks tool calls | All new hooks are non-blocking (exit 0 always) |
| Routing table simplification changes behavior | TDD: equivalence tests written BEFORE changes |
| Hook consolidation loses a check | Each merge preserves exact logic; tests verify |
| settings.json registration error | Session restart required; test registration separately |
| Windows path issues in new hooks | Use our path normalization patterns from MEMORY.md |
| State file corruption | Use atomicWriteJSONSync; handle missing/malformed files |

---

*End of implementation plan.*
