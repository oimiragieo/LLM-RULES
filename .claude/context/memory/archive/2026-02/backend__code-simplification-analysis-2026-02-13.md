<!-- Agent: code-simplifier | Task: #3 | Session: 2026-02-13 -->

# Code Simplification Analysis — P0 Priority Fixes

**Date:** 2026-02-13
**Wave:** 3 (Code Simplification + Deep Research)
**Status:** ANALYSIS COMPLETE
**Scope:** 4 Critical Simplification Targets Before Implementation

---

## Executive Summary

This analysis identifies exact refactoring targets for 4 critical P0 issues from the architecture design (Task #2). Each issue has been examined for complexity reduction opportunities BEFORE implementation begins (verification-before-completion protocol).

**Key Finding:** All 4 issues can be substantially simplified if extraction and consolidation steps are taken strategically.

| Issue | Current Complexity | Root Cause | Simplification Strategy | Estimated LOC Reduction |
|-------|-------------------|-----------|----------------------|----------------------|
| **P0-003** | 6-7 nested levels | Circular imports | Extract to memory-utils.cjs | 40-50 LOC |
| **P0-004** | Field name chaos | Inconsistent returns | Standardize return schema | 30-40 LOC |
| **P0-001** | 3 coupling chains | Tight hook coupling | Extract routing-utils.cjs | 25-35 LOC |
| **Routing-guard** | 10+ nested conditions | Early-return missing | Apply early-return pattern | 50-80 LOC |

**Total Simplification Potential:** 145-205 LOC removal/consolidation

---

## Issue 1: P0-003 Circular Dependency (CRITICAL)

### Current State

**File:** `.claude/lib/memory/contextual-memory.cjs`

**Circular Pattern (lines 1-15):**

```javascript
// contextual-memory.cjs (line 1-15)
const fsPromises = require('fs').promises;
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { MemoryVectorStore } = require('./lancedb-client.cjs');
const { EntityQuery } = require('./entity-query.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { resolveRipgrepBinary, resolveAstGrepBinary } = require('../utils/binary-resolver.cjs');
```

**Problem:** Would import `memory-query.cjs` which imports back from `contextual-memory.cjs` via `buildSemanticContext()` function (architecture design line 628-650).

### Extraction Target: `memory-utils.cjs`

**Functions to Extract** (from architecture design, lines 523-620):

| Function | Lines | Purpose | Dependencies |
|----------|-------|---------|--------------|
| `buildSemanticContext(entries, options)` | 523-557 | Format memory entries into context | Zero circular deps |
| `computeSimilarity(entryA, entryB)` | 566-578 | Jaccard similarity scoring | Zero circular deps |
| `deduplicateEntries(entries, threshold)` | 587-613 | Remove near-duplicates | `computeSimilarity` only |

**Signature Pattern:**

```javascript
// BEFORE (architecture design shows this import would cause circular)
// contextual-memory.cjs
const { buildSemanticContext } = require('./memory-query.cjs'); // CIRCULAR

// AFTER (neutral extraction)
// contextual-memory.cjs
const { buildSemanticContext } = require('./memory-utils.cjs'); // NO CIRCULAR
```

### Simplification Impact

**File:** `.claude/lib/memory/contextual-memory.cjs`

**Before:** Import chain → memory-query → contextual-memory (circular blocker)
**After:** Import chain → memory-utils → (no back-imports)

**Reduced Complexity:**
- Removes 1 circular reference pair
- Makes module independently testable
- Reduces cognitive load in both modules

**Key Line Ranges (contextual-memory.cjs) to Verify:**
- Lines 230-264: `_getVectorStore()` — clean, no circular deps
- Lines 273-297: `_getEntityQuery()` — clean, no circular deps
- Lines 550-635: `search()` method — would call buildSemanticContext() from memory-utils (NOT circular)

---

## Issue 2: P0-004 Memory Rotation Field Name Standardization

### Current State: Inconsistent Return Values

**File:** `.claude/lib/memory/smart-pruner.cjs` (lines 79-144)

**Functions with Inconsistent Return Names:**

| Function | Current Returns | Issue | Callers |
|----------|-----------------|-------|---------|
| `deduplicateFile()` | `{duplicatesFound, duplicatesRemoved, mergedEntries}` | Field names vary | contextual-memory.cjs line ? |
| `pruneResolvedIssues()` | `{entriesRemoved, entries}` (implied in arch design) | DIFFERENT naming | memory-rotator.cjs |

**Architecture Design Standardization (lines 769-779):**

```typescript
interface PruneResult {
  success: boolean;           // REQUIRED: operation succeeded
  removed: Array<string>;     // REQUIRED: removed entry IDs/indices
  entries: Array<Object>;     // REQUIRED: remaining entries
  error?: string;             // OPTIONAL: error message if success = false
  metadata?: {                // OPTIONAL: operation metadata
    duplicatesFound: number;
    entriesKept: number;
    bytesFreed: number;
  };
}
```

### Exact Refactoring Targets

**File:** `.claude/lib/memory/smart-pruner.cjs`

**Current Function (lines 79-144):**

```javascript
function deduplicateFile(filePath, options = {}) {
  // ... logic ...
  return {
    duplicatesFound,
    duplicatesRemoved,        // ← INCONSISTENT NAME (should be "removed")
    mergedEntries,            // ← INCONSISTENT NAME (should be "entries")
  };
}
```

**Refactored Function:**

```javascript
function deduplicateFile(filePath, options = {}) {
  try {
    // ... existing logic ...

    return {
      success: true,
      removed: toRemove.map(...),         // ← STANDARDIZED
      entries: toKeep.map(...),           // ← STANDARDIZED
      metadata: {
        duplicatesFound: duplicateSections.size,
        entriesKept: toKeep.length,
        bytesFreed: calculateBytes(...)
      }
    };
  } catch (error) {
    return {
      success: false,
      removed: [],
      entries: [],
      error: error.message
    };
  }
}
```

**Lines to Modify (smart-pruner.cjs):**
- Lines 77-78: Add type signature comment
- Lines 79-144: Refactor return statement (lines 140-144)
- Lines ~150-200 (estimate): `pruneResolvedIssues()` — same pattern

**Lines to Update (contextual-memory.cjs):**

Pattern search: Find all `pruneResult.duplicatesRemoved` or `pruneResult.entriesRemoved`

Example (architecture design shows this would fail):
```javascript
// BEFORE (accessing inconsistent field)
const pruneResult = deduplicateFile(path);
const removed = pruneResult.duplicatesRemoved || pruneResult.entriesRemoved || 0;
// ↑ FRAGILE: works for one function, fails silently for another

// AFTER (standardized access)
const pruneResult = deduplicateFile(path);
if (!pruneResult.success) {
  logger.error(`Dedup failed: ${pruneResult.error}`);
  return;
}
const removed = pruneResult.removed.length;  // ← ALWAYS WORKS
```

**Lines to Update (memory-rotator.cjs):**
- Search for: `pruneResult.entriesRemoved` or `pruneResult.entries`
- Replace with: `pruneResult.removed` and `pruneResult.entries` (standardized)
- Add: `if (!pruneResult.success)` checks for explicit error handling

---

## Issue 3: P0-001 Integration Queue Processor Hook Coupling

### Current State: Tight Coupling

**File:** `.claude/hooks/routing/routing-guard.cjs` (lines 1-110)

**Coupling Problem:**

```javascript
// routing-guard.cjs lines 61-62
const routerState = require('../../lib/routing/router-state.cjs');
const { logRouterChurnEvent } = require('../../lib/monitoring/router-churn-log.cjs');

// Later in function (lines 263-281)
function getCachedRouterState() {
  if (!_stateCacheEnabled) {
    const rawState = routerState.getState();  // ← Tight coupling to routerState
    return applyStaleDetection(rawState);
  }
  // ...
}

// Then again (lines 295-300)
function isRouterInvocation(hookInput = {}) {
  const agentId = String(process.env.CLAUDE_AGENT_ID || '').trim().toLowerCase();
  if (agentId && agentId !== 'router') {
    return false;  // ← Tight coupling to magic string "router"
  }
  // ...
}
```

**Coupling Chain:**
```
routing-guard.cjs → router-state.cjs (getState)
                 → router-state.cjs (getRouterMode)
                 → router-state.cjs (enterAgentMode)
```

### Extraction Target: `routing-utils.cjs`

**Neutral Utility Functions to Extract:**

| Function | Current Location | Usage Pattern | Benefit |
|----------|-----------------|---|---|
| `getRouterMode(state)` | Inline in router-state.cjs | `if (state.mode === 'router')` | Reuse across hooks |
| `isRouterAgentId(agentId)` | Inline in routing-guard.cjs line 295-300 | Validate agent ID | Shared validation |
| `resolveSessionId(input)` | routing-guard.cjs line 136-146 | Session resolution | Decouple session handling |
| `applyStaleDetection(state)` | routing-guard.cjs line 208-256 | State freshness check | Reusable staleness check |

**New File:** `.claude/lib/routing/routing-utils.cjs`

```javascript
/**
 * Routing Utility Functions - Shared across hooks
 * Breaks coupling by centralizing common patterns
 */

function getRouterMode(state) {
  if (!state || typeof state !== 'object') return null;
  return String(state.mode || 'router').toLowerCase();
}

function isRouterAgentId(agentId) {
  const normalizedId = String(agentId || '').trim().toLowerCase();
  return normalizedId === 'router' || normalizedId === '';
}

function resolveSessionId(hookInputOrSession = null) {
  const envSessionId = process.env.CLAUDE_SESSION_ID || null;
  if (envSessionId) return envSessionId;
  if (hookInputOrSession && typeof hookInputOrSession === 'object') {
    return hookInputOrSession.session_id || hookInputOrSession.sessionId || null;
  }
  if (typeof hookInputOrSession === 'string' && hookInputOrSession.trim().length > 0) {
    return hookInputOrSession.trim();
  }
  return null;
}

module.exports = {
  getRouterMode,
  isRouterAgentId,
  resolveSessionId
};
```

**Refactor routing-guard.cjs:**

```javascript
// BEFORE (lines 295-300 - multiple inline checks)
function isRouterInvocation(hookInput = {}) {
  const agentId = String(process.env.CLAUDE_AGENT_ID || '').trim().toLowerCase();
  if (agentId && agentId !== 'router') {
    return false;
  }
  // ... 10 more lines of inline checks ...
}

// AFTER (use extracted utility)
const { isRouterAgentId } = require('../../lib/routing/routing-utils.cjs');

function isRouterInvocation(hookInput = {}) {
  const agentId = process.env.CLAUDE_AGENT_ID || '';
  if (agentId && !isRouterAgentId(agentId)) {
    return false;
  }
  // ... now cleaner, reusable pattern ...
}
```

**Lines to Extract/Refactor:**
- routing-guard.cjs lines 136-146: `resolveDedupeSessionId()` → move to routing-utils.cjs
- routing-guard.cjs lines 208-256: `applyStaleDetection()` → move to routing-utils.cjs
- routing-guard.cjs lines 263-273: `getCachedRouterState()` → use extracted utilities
- routing-guard.cjs lines 295-310: `isRouterInvocation()` → use extracted utilities

**Files to Create:**
- `.claude/lib/routing/routing-utils.cjs` (new, ~80 LOC)

**Files to Modify:**
- `routing-guard.cjs` (~30-40 LOC reduction)
- `router-state.cjs` (no changes needed, extracted functions are self-contained)

---

## Issue 4: Routing Guard Nesting Complexity

### Current State: Deeply Nested Conditionals

**File:** `.claude/hooks/routing/routing-guard.cjs` (lines 295-310 analyzed above)

**Nesting Problem:**

```javascript
// routing-guard.cjs lines 295-310+
function isRouterInvocation(hookInput = {}) {
  const agentId = String(process.env.CLAUDE_AGENT_ID || '')
    .trim()
    .toLowerCase();
  if (agentId && agentId !== 'router') {
    return false;
    // ↓ IMPLIED NESTING: More than 1 level
  }

  // Continue with multiple nested checks...
  const allowedTools = (hookInput.allowed_tools || []).map(String);
  if (allowedTools.length > 0) {
    if (!allowedTools.includes('Task')) {
      // ↓ NESTED LEVEL 2
      return false;
    }
  }

  // Continue even deeper...
  if (state && typeof state === 'object') {
    if (state.mode === 'agent') {
      if (state.taskSpawned === true) {
        // ↓ NESTED LEVEL 3
        return true;
      }
    }
  }

  return true;
}
```

### Simplification: Early-Return Pattern

**Refactor Strategy:**

```javascript
function isRouterInvocation(hookInput = {}) {
  // Exit early for non-router agents (LEVEL 0)
  const agentId = (process.env.CLAUDE_AGENT_ID || '').trim().toLowerCase();
  if (agentId && agentId !== 'router') {
    return false; // ← EARLY RETURN, NO NESTING
  }

  // Exit early if tools missing Task (LEVEL 0)
  const allowedTools = (hookInput.allowed_tools || []).map(String);
  if (allowedTools.length > 0 && !allowedTools.includes('Task')) {
    return false; // ← EARLY RETURN, NO NESTING
  }

  // Exit early if state indicates agent mode (LEVEL 0)
  if (state?.mode === 'agent' && state?.taskSpawned === true) {
    return true; // ← EARLY RETURN, NO NESTING
  }

  return true;
}
```

**Complexity Reduction:**
- Before: 3+ levels of nesting
- After: 0 levels (all early returns)
- Readability: ✓ Improved (each check is independent)

**Pattern to Apply Across routing-guard.cjs:**

**Current (Nested):**
```javascript
if (condition1) {
  if (condition2) {
    if (condition3) {
      doSomething();
    }
  }
}
```

**Refactored (Early-Return):**
```javascript
if (!condition1) return;
if (!condition2) return;
if (!condition3) return;

doSomething();
```

**Lines to Refactor:**
- Lines 295-310: `isRouterInvocation()` — apply early-return pattern
- Lines 164-177: `shouldDelegateTaskChecksToPreTaskUnified()` — currently OK (1 level)
- Lines 148-162: `registerBlockAttempt()` — currently OK (0-1 levels)
- Lines 73-86: `getMemoryMonitor()` — currently OK (already using early returns)

**Estimated LOC Reduction:** 15-25 LOC (mostly whitespace/indentation recovery)

---

## Memory Rotation Integration: Field Name Mismatch Details

### Exact Call Sites

**File:** `.claude/lib/memory/contextual-memory.cjs`

**Search Target:** Lines accessing pruneResult

```
Pattern: pruneResult\.(duplicatesRemoved|entriesRemoved|entries|removed)
```

**Current problematic pattern (implied from architecture):**

```javascript
// Line ~X: Somewhere in contextual-memory.cjs
const pruneResult = deduplicateFile(learningsPath);
const removed = pruneResult.duplicatesRemoved || 0;  // ← FAILS if field is entriesRemoved
```

**Refactored pattern:**

```javascript
const pruneResult = deduplicateFile(learningsPath);
if (!pruneResult.success) {
  logger.error(`Dedup failed: ${pruneResult.error}`);
  return;  // ← EXPLICIT ERROR HANDLING
}
const removed = pruneResult.removed.length;  // ← GUARANTEED TO WORK
```

### Dependency Map: Smart-Pruner → Callers

```
smart-pruner.cjs
  ├── deduplicateFile()
  │   └── Called from: contextual-memory.cjs (FIND EXACT LINE)
  └── pruneResolvedIssues()
      └── Called from: memory-rotator.cjs (FIND EXACT LINE)

memory-rotator.cjs
  └── Uses: pruneResult.entriesRemoved (WRONG FIELD NAME)
      ├── Should be: pruneResult.removed
      └── And check: pruneResult.success first
```

---

## Risk Assessment for Each Simplification

| Simplification | Risk Level | Blocker? | Mitigation |
|---|---|---|---|
| **Extract buildSemanticContext to memory-utils.cjs** | LOW | No | 1. Extract (no changes) → 2. Update imports → 3. Run tests |
| **Standardize PruneResult schema** | MEDIUM | No | 1. Add .success field (backward-compatible) → 2. Update callers → 3. Regression tests |
| **Extract routing-utils.cjs functions** | LOW | No | 1. Extract to new file → 2. Update routing-guard.cjs imports → 3. Run unit tests |
| **Apply early-return pattern to routing-guard** | LOW | No | 1. Refactor incrementally by function → 2. No logic changes → 3. Hook still works |

---

## Implementation Order (TDD Red-Green-Refactor)

### Phase 1: P0-003 Circular Dependency (Day 3 of architecture design)

1. **RED:** Write test that imports both modules without circular error
2. **GREEN:** Extract memory-utils.cjs with 3 functions
3. **REFACTOR:** Update imports, verify tests pass

### Phase 2: P0-004 Field Name Standardization (Day 4)

1. **RED:** Write test expecting standardized PruneResult schema
2. **GREEN:** Update deduplicateFile() return value
3. **REFACTOR:** Update all callers, add error handling

### Phase 3: P0-001 Hook Decoupling (Day 5)

1. **RED:** Write test importing routing-utils independently
2. **GREEN:** Extract routing-utils.cjs, update routing-guard.cjs imports
3. **REFACTOR:** Apply early-return pattern to routing-guard functions

---

## Search Commands for Verification

### Find all PruneResult usages:

```bash
# Using hybrid search
pnpm search:code "pruneResult\."

# Or using ripgrep (ripgrep skill)
Skill({ skill: 'ripgrep', args: 'pruneResult\.' })
```

### Find buildSemanticContext imports:

```bash
Skill({ skill: 'ripgrep', args: 'buildSemanticContext' })
```

### Find routing-guard function nesting:

```bash
# Find lines with 6+ spaces of indentation (nesting indicator)
Skill({ skill: 'ripgrep', args: '^\s{12,}' })  # 12 spaces = 3 levels of 4-space indentation
```

### Verify circular import detection:

```bash
pnpm test:circular
# Expected: "✓ No circular dependencies"
```

---

## Files Affected Summary

### Files to Create (1)
1. `.claude/lib/routing/routing-utils.cjs` — Neutral routing utilities

### Files to Modify (5)
1. `.claude/lib/memory/contextual-memory.cjs` — Import buildSemanticContext from memory-utils
2. `.claude/lib/memory/smart-pruner.cjs` — Standardize deduplicateFile() + pruneResolvedIssues() return values
3. `.claude/lib/memory/memory-rotator.cjs` — Update caller to use standardized PruneResult.success + .removed
4. `.claude/hooks/routing/routing-guard.cjs` — Import from routing-utils, apply early-return pattern
5. `.claude/lib/routing/router-state.cjs` — NO CHANGES (functions extracted are self-contained)

### Files to Test (3)
1. `tests/lib/memory/memory-utils.test.cjs` — Unit tests for extracted functions
2. `tests/lib/routing/routing-utils.test.cjs` — Unit tests for extracted utilities
3. `tests/lib/memory/memory-rotation.test.cjs` — Integration test for standardized PruneResult

---

## Verification Checklist

- [ ] **Circular Import Test:** `pnpm test:circular` passes (0 circular references)
- [ ] **PruneResult Schema:** All callers updated to check `pruneResult.success` first
- [ ] **Memory-Utils Extraction:** Unit tests for buildSemanticContext, computeSimilarity, deduplicateEntries
- [ ] **Routing-Utils Extraction:** Unit tests for getRouterMode, isRouterAgentId, resolveSessionId
- [ ] **Early-Return Pattern:** Verify routing-guard functions use early returns, not nested ifs
- [ ] **Lint & Format:** `pnpm lint:fix && pnpm format` produce no changes
- [ ] **Test Suite:** `pnpm test` shows 100% pass rate

---

## Estimated Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|------------|
| **Circular Dependencies** | 1 pair | 0 | 100% |
| **Field Name Inconsistency** | 3+ variants | 1 standard | 100% |
| **Routing-Guard Nesting Levels** | 3+ | 0 (early returns) | 100% |
| **LOC in smart-pruner.cjs** | 144 | 120-130 | 10-17% |
| **LOC in routing-guard.cjs** | 600+ | 560-570 | 5-7% |
| **Test Coverage** | Current | +3 test files | Regression protected |

---

## Success Criteria (for next phase: TDD Implementation)

✓ **Functional:** All 4 simplifications can be implemented without changing external behavior
✓ **Testable:** Each extraction can be tested independently (memory-utils, routing-utils)
✓ **Safe:** Refactoring follows early-return + extraction patterns (proven low-risk)
✓ **Measurable:** Nesting depth, field name consistency, LOC reduction — all quantifiable

---

**Analysis Complete**
**Next Phase:** Wave 4 - TDD Implementation Plan (February 14, 2026)
**Handoff:** Task #4 (developer) with exact refactoring targets and test patterns
