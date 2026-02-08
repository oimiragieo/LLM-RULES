<!-- Agent: planner | Task: #8 | Session: 2026-02-08 -->

# Implementation Plan: Memory Management Rebuild

**Version:** 1.0
**Date:** 2026-02-08
**Status:** Ready for Implementation
**Architecture Design:** `.claude/context/reports/architecture/memory-management-design-2026-02-08.md`
**Security Review:** `.claude/context/reports/security/memory-management-security-review-2026-02-08.md`
**ADR:** ADR-102 in `.claude/context/memory/decisions.md`

---

## Executive Summary

Implement the 3-component memory management system (memory-rotator, smart-pruner, cold-storage) with security mitigations first, following strict TDD. Total ~300 lines of new production code across 3 modules + ~60 lines of security utility + ~40 lines of config + ~80 lines of wiring changes. Approximately 11 implementation steps, each with test-first methodology.

**Target Agent:** `developer`
**Recommended Skills:** `tdd`, `verification-before-completion`, `debugging`

---

## Prerequisites

Before starting, the developer MUST read:

1. Architecture design: `.claude/context/reports/architecture/memory-management-design-2026-02-08.md`
2. Security review: `.claude/context/reports/security/memory-management-security-review-2026-02-08.md`
3. This plan (you are here)

**Existing utilities to use (DO NOT rewrite):**

| Utility | Path | Provides |
|---------|------|----------|
| `atomicWriteSync()` | `.claude/lib/utils/atomic-write.cjs` | Crash-safe file writes (temp + rename) |
| `createBackup()` | `.claude/lib/utils/atomic-write.cjs` | Pre-destructive-operation backups |
| `restoreFromBackup()` | `.claude/lib/utils/atomic-write.cjs` | Recovery from failed writes |
| `safeParseJSON()` | `.claude/lib/utils/safe-json.cjs` | Prototype-pollution-safe JSON parsing |
| `safeReadJSON()` | `.claude/lib/utils/safe-json.cjs` | File read + safe parse combo |
| `PROJECT_ROOT` | `.claude/lib/utils/project-root.cjs` | Canonical project root path |
| `validatePathWithinProject()` | `.claude/lib/utils/project-root.cjs` | Path traversal prevention |
| `createLogger()` | `.claude/lib/utils/logger.cjs` | Structured JSONL logging (no console.log) |

**Hybrid search note:** For codebase exploration during implementation, prefer `pnpm search:code "<query>"` or `node .claude/lib/code-indexing/search-cli.cjs "<query>"` over raw grep when searching for patterns across many files. Use `Grep` for precise single-pattern matches in known locations.

---

## Step 0: Create Test Fixtures

**Description:** Create test fixture files that all subsequent tests will share. This avoids duplicating fixture content in every test file.

**Files to Create:**

| File | Purpose | Size |
|------|---------|------|
| `tests/fixtures/memory-management/sample-learnings.md` | Small file under 20KB threshold | ~500 bytes |
| `tests/fixtures/memory-management/large-decisions.md` | File over 20KB requiring rotation | ~22KB |
| `tests/fixtures/memory-management/duplicate-issues.md` | Contains near-identical entries for dedup testing | ~2KB |
| `tests/fixtures/memory-management/resolved-issues.md` | Contains old resolved entries for pruning | ~1KB |
| `tests/fixtures/memory-management/permanent-entries.md` | Contains [PERMANENT] tagged entries | ~500 bytes |
| `tests/fixtures/memory-management/sensitive-content.md` | Contains API keys, JWTs, emails for scrubber testing | ~1KB |

**Fixture Format (sample-learnings.md):**

```markdown
# Learnings

## Pattern: TDD Cycle

**Date:** 2026-02-08

Use red-green-refactor for all new code.

---

## Pattern: Atomic Writes

**Date:** 2026-02-07

All file writes should use atomicWriteSync().

---
```

**Fixture Format (large-decisions.md):** 15+ sections with `## ADR-NNN` headers, each ~1.5KB, totaling >20KB. Include a mix of:
- Accepted ADRs (old dates, archivable)
- Recent ADRs (keep in active file)
- One `[PERMANENT]` tagged ADR (must never be archived)

**Fixture Format (duplicate-issues.md):**

```markdown
# Issues

## Windows Path Normalization

**Date:** 2026-02-01

path.relative() returns backslash on Windows. Normalize with .replace(/\\\\/g, '/').

---

## Windows Path Normalization Issue

**Date:** 2026-02-03

On Windows, path.relative() returns backslash paths. Must normalize paths with .replace(/\\\\/g, '/') before regex.

---

## Unrelated Issue

**Date:** 2026-02-05

Something completely different.

---
```

**Fixture Format (sensitive-content.md):**

```markdown
# Learnings

## API Key Fix

**Date:** 2026-01-15

Fixed issue with API key sk-abc123456789abcdef in the config.

---

## JWT Token Issue

**Date:** 2026-01-20

Token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U was expired.

---

## Contact Info

**Date:** 2026-01-25

Reported by admin@example.com via support channel. Password was reset for user.

---
```

**Acceptance Criteria:**
- [ ] All 6 fixture files exist and are valid markdown
- [ ] `large-decisions.md` is >20KB (verified by checking file size)
- [ ] `duplicate-issues.md` has two entries with >50% word overlap
- [ ] `sensitive-content.md` contains at least one API key, one JWT, and one email

**Dependencies:** None (first step)
**Estimated Lines:** ~200 lines of fixture content (not production code)
**Risk:** LOW

---

## Step 1: Enhance safe-json.cjs with Schema-Free Safe Parse (MF-001)

**Description:** The existing `safe-json.cjs` already handles prototype pollution when a schema is provided. However, the memory modules will parse JSON content from JSONL files and arbitrary JSON where no schema applies. The no-schema fallback path already strips `__proto__`, `constructor`, `prototype` keys (lines 174-185). **Verify** this existing behavior works for memory module needs and add a `'memory-entry'` schema if needed.

**Security Mitigation:** MF-001 (Prototype Pollution Protection)

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/lib/utils/safe-json.cjs` | Add `'memory-entry'` schema for cold storage JSONL entries (optional, low priority) |

**Test File:** `tests/lib/utils/safe-json-memory.test.cjs`

**TDD Sequence:**

1. **RED:** Write test that parses JSON with `__proto__` key using `safeParseJSON(content, null)` -- verify `__proto__` is stripped
2. **RED:** Write test that parses JSONL entry `{"date":"2026-01","source":"decisions.md","__proto__":{"polluted":true},"content":"..."}` -- verify no pollution
3. **RED:** Write test that parses malformed JSON -- verify graceful fallback to empty object
4. **GREEN:** Verify all tests pass with existing `safe-json.cjs` code (expected: already passing)
5. If any test fails, add minimal fix

**Acceptance Criteria:**
- [ ] `safeParseJSON('{"__proto__":{"polluted":true}}', null)` returns object without pollution
- [ ] `({}).polluted` remains `undefined` after parsing
- [ ] `safeParseJSON('invalid json', null)` returns empty object (no throw)
- [ ] All new tests green

**Dependencies:** Step 0 (fixtures)
**Estimated Lines:** ~40 lines of test code, 0-10 lines of production code
**Risk:** LOW -- existing code likely already handles this

---

## Step 2: Create Sensitive Data Scrubber Utility (MF-003)

**Description:** Create a new utility function `scrubSensitiveContent(text)` that redacts API keys, JWT tokens, email addresses, and password patterns from text before archival to cold storage.

**Security Mitigation:** MF-003 (Sensitive Data Scrubbing Before Cold Archival)

**Files to Create:**

| File | Purpose |
|------|---------|
| `.claude/lib/utils/sensitive-scrubber.cjs` | `scrubSensitiveContent(text)` utility |

**Test File:** `tests/lib/utils/sensitive-scrubber.test.cjs`

**TDD Sequence:**

1. **RED:** Test API key pattern: `"API_KEY=sk-abc123456789"` -> `"API_KEY=[REDACTED]"`
2. **RED:** Test JWT pattern: `"eyJhbGciOiJIUzI1NiJ9.xxx.yyy"` -> `"[JWT-REDACTED]"`
3. **RED:** Test email pattern: `"user@example.com"` -> `"[EMAIL-REDACTED]"`
4. **RED:** Test password pattern: `"password=secret123"` -> `"password=[REDACTED]"`
5. **RED:** Test that legitimate code references are NOT redacted: `"const password = req.body.password"` should keep variable name but redact actual values
6. **RED:** Test no-op on clean text: `"This is safe content"` -> unchanged
7. **GREEN:** Implement `scrubSensitiveContent()` with regex patterns
8. **REFACTOR:** Extract regex patterns to named constants

**API Design:**

```javascript
/**
 * Scrub sensitive data patterns from text content.
 * Used before cold storage archival to prevent credential persistence.
 *
 * @param {string} text - Content to scrub
 * @returns {{ scrubbed: string, redactionCount: number }}
 */
function scrubSensitiveContent(text)

module.exports = { scrubSensitiveContent };
```

**Regex Patterns (from security review):**

```javascript
const PATTERNS = [
  // API keys and tokens (sk-, api_key=, token=, secret=, etc.)
  { regex: /(sk-|api[_-]?key|token|secret|password|credential)[=:\s]+\S{8,}/gi, replacement: '$1=[REDACTED]' },
  // JWT tokens (three base64 segments separated by dots)
  { regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[JWT-REDACTED]' },
  // Email addresses
  { regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[EMAIL-REDACTED]' },
];
```

**Acceptance Criteria:**
- [ ] All 6 test cases green
- [ ] Function returns `{ scrubbed, redactionCount }` object
- [ ] No `console.log` in production code
- [ ] Uses `createLogger()` for any logging
- [ ] grep for `JSON.parse` returns 0 in this file

**Dependencies:** Step 0
**Estimated Lines:** ~60 lines production, ~80 lines test
**Risk:** MEDIUM -- regex false positives on code content; conservative patterns preferred

---

## Step 3: Implement parseSections() in memory-rotator.cjs

**Description:** Build the section parser that splits markdown memory files into semantic sections. This is the foundational function used by both the rotator and the pruner.

**Files to Create:**

| File | Purpose |
|------|---------|
| `.claude/lib/memory/memory-rotator.cjs` | Start with `parseSections()` + `module.exports` stub |

**Test File:** `tests/lib/memory/memory-rotator.test.cjs`

**TDD Sequence:**

1. **RED:** Test `parseSections()` with `---` delimited content -> returns array of section objects
2. **RED:** Test `parseSections()` with `## ` H2 header delimited content -> correct splitting
3. **RED:** Test date extraction from `**Date:** 2026-02-08` pattern within sections
4. **RED:** Test `[PERMANENT]` tag detection -> `section.isPermanent === true`
5. **RED:** Test `**Status: RESOLVED**` detection -> `section.isResolved === true`
6. **RED:** Test empty content -> returns empty array
7. **RED:** Test malformed content (no delimiters) -> returns single section
8. **GREEN:** Implement `parseSections(content)` returning `Array<{ title, content, date, isResolved, isPermanent }>`
9. **REFACTOR:** Extract regex constants

**API (from architecture design):**

```javascript
/**
 * Parse a markdown memory file into sections.
 * Sections are delimited by `---` horizontal rules or `## ` H2 headers.
 *
 * @param {string} content - File content
 * @returns {Array<{ title: string, content: string, date: string|null,
 *                    isResolved: boolean, isPermanent: boolean }>}
 */
function parseSections(content)
```

**Acceptance Criteria:**
- [ ] Correctly parses `---` delimited sections
- [ ] Correctly parses `## ` delimited sections
- [ ] Extracts dates from `**Date:** YYYY-MM-DD` pattern
- [ ] Detects `[PERMANENT]` and `isResolved` flags
- [ ] Handles empty/malformed input gracefully
- [ ] All tests green
- [ ] No `console.log` in production code

**Dependencies:** Step 0 (fixtures)
**Estimated Lines:** ~40 lines production, ~80 lines test
**Risk:** LOW -- pure function, no I/O

---

## Step 4: Implement rotateIfNeeded() in memory-rotator.cjs

**Description:** Implement the main rotation logic that checks file size, parses sections, archives old ones, and truncates the active file. Uses `atomicWriteSync()` and `createBackup()` for crash safety (MF-002).

**Security Mitigation:** MF-002 (Atomic Archive-Then-Truncate)

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/lib/memory/memory-rotator.cjs` | Add `rotateIfNeeded()` function |

**Test File:** `tests/lib/memory/memory-rotator.test.cjs` (append to existing)

**TDD Sequence:**

1. **RED:** Test file under threshold (< 20KB) -> returns `{ rotated: false }`, file unchanged
2. **RED:** Test file over threshold -> returns `{ rotated: true, archivedBytes > 0, sectionsArchived > 0 }`
3. **RED:** Test archive file is created at `archive/{basename}-YYYY-MM.md`
4. **RED:** Test active file is truncated to `keepSections` most recent sections
5. **RED:** Test `[PERMANENT]` sections are never archived
6. **RED:** Test idempotency: calling twice on already-rotated file is a no-op
7. **RED:** Test archive directory is auto-created if missing
8. **RED:** Test archive path is validated with `validatePathWithinProject()`
9. **GREEN:** Implement `rotateIfNeeded(filePath, options)` using `atomicWriteSync()` + `createBackup()`
10. **REFACTOR:** Ensure all writes go through `atomicWriteSync()`

**Implementation Pattern (archive-then-truncate with backup):**

```javascript
// 1. Parse sections
// 2. Split: keep N most recent + all [PERMANENT]; rest go to archive
// 3. Write archive file (atomicWriteSync) -- additive, append to existing month file
// 4. Create backup of active file (createBackup)
// 5. Write truncated active file (atomicWriteSync)
// If step 5 fails, backup allows recovery via restoreFromBackup()
```

**Acceptance Criteria:**
- [ ] Files under threshold are untouched
- [ ] Files over threshold are rotated with archive created
- [ ] `[PERMANENT]` sections preserved in active file
- [ ] All file writes use `atomicWriteSync()` (verify: `grep "writeFileSync\|appendFileSync" memory-rotator.cjs` returns 0)
- [ ] `createBackup()` called before active file truncation
- [ ] Archive paths validated with `validatePathWithinProject()`
- [ ] Idempotent (second call is no-op)
- [ ] All tests green

**Dependencies:** Step 3
**Estimated Lines:** ~60 lines production (total ~100 for rotator so far), ~100 lines test
**Risk:** MEDIUM -- file I/O operations; test with temp directories

---

## Step 5: Implement searchArchives() in memory-rotator.cjs

**Description:** Add cross-archive search capability to the rotator module. Simple case-insensitive substring match across all warm archive files.

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/lib/memory/memory-rotator.cjs` | Add `searchArchives()` function; finalize module exports |

**Test File:** `tests/lib/memory/memory-rotator.test.cjs` (append)

**TDD Sequence:**

1. **RED:** Test search with matching query -> returns array of `{ file, section, match }`
2. **RED:** Test search with no matches -> returns empty array
3. **RED:** Test case-insensitive search
4. **RED:** Test search across multiple archive files
5. **RED:** Test search with missing archive directory -> returns empty array (no throw)
6. **GREEN:** Implement `searchArchives(query, archiveDir)`
7. **REFACTOR:** Optimize to avoid reading all files when early matches found

**Acceptance Criteria:**
- [ ] Returns matching sections from warm archives
- [ ] Case-insensitive matching
- [ ] Graceful handling of missing archive directory
- [ ] All tests green

**Dependencies:** Step 4
**Estimated Lines:** ~20 lines production (total ~120 for rotator), ~50 lines test
**Risk:** LOW -- read-only function

---

## Step 6: Implement jaccardSimilarity() and deduplicateFile() in smart-pruner.cjs

**Description:** Create the smart-pruner module with Jaccard word-similarity deduplication. Reuses `parseSections()` from memory-rotator for section parsing.

**Files to Create:**

| File | Purpose |
|------|---------|
| `.claude/lib/memory/smart-pruner.cjs` | Deduplication and pruning module |

**Test File:** `tests/lib/memory/smart-pruner.test.cjs`

**TDD Sequence:**

1. **RED:** `jaccardSimilarity("hello world", "hello world")` -> 1.0
2. **RED:** `jaccardSimilarity("hello", "goodbye")` -> 0.0
3. **RED:** `jaccardSimilarity("the quick brown fox", "the quick red fox")` -> ~0.6 (3/5 overlap)
4. **RED:** `jaccardSimilarity("", "")` -> 0 (edge case: empty strings)
5. **RED:** `deduplicateFile()` with duplicate-issues.md fixture -> removes 1 duplicate, keeps longer entry
6. **RED:** `deduplicateFile()` preserves `[PERMANENT]` entries even if similar
7. **RED:** `deduplicateFile()` with `dryRun: true` -> returns results but does not modify file
8. **RED:** `deduplicateFile()` with no duplicates -> no changes, returns `{ duplicatesFound: 0 }`
9. **GREEN:** Implement both functions
10. **REFACTOR:** Use `atomicWriteSync()` for file writes

**API (from architecture design):**

```javascript
function jaccardSimilarity(textA, textB)   // returns 0-1
function deduplicateFile(filePath, options) // returns { duplicatesFound, duplicatesRemoved, mergedEntries }
```

**Dedup Algorithm:**
1. Parse sections (via `require('./memory-rotator.cjs').parseSections`)
2. For each pair, compute Jaccard similarity
3. If similarity >= threshold (0.5), mark shorter as duplicate
4. Skip `[PERMANENT]` sections
5. Write back with duplicates removed (via `atomicWriteSync`)

**Acceptance Criteria:**
- [ ] `jaccardSimilarity` returns correct values for exact, zero, and partial overlap
- [ ] `deduplicateFile` correctly identifies and removes near-duplicates
- [ ] `[PERMANENT]` sections never removed
- [ ] `dryRun` mode works without modifying files
- [ ] All file writes use `atomicWriteSync()`
- [ ] All tests green

**Dependencies:** Step 3 (parseSections)
**Estimated Lines:** ~60 lines production, ~100 lines test
**Risk:** LOW -- well-defined algorithm

---

## Step 7: Implement pruneResolvedEntries() in smart-pruner.cjs

**Description:** Add resolved-entry pruning to the smart-pruner. Removes entries tagged `[RESOLVED]` or `**Status: RESOLVED**` that are older than a configurable threshold.

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/lib/memory/smart-pruner.cjs` | Add `pruneResolvedEntries()` function; finalize exports |

**Test File:** `tests/lib/memory/smart-pruner.test.cjs` (append)

**TDD Sequence:**

1. **RED:** Test with resolved issues older than 30 days -> removed
2. **RED:** Test with resolved issues younger than 30 days -> kept
3. **RED:** Test `[PERMANENT]` resolved entries -> always kept
4. **RED:** Test with no resolved entries -> no changes
5. **GREEN:** Implement `pruneResolvedEntries(filePath, options)`

**Acceptance Criteria:**
- [ ] Old resolved entries pruned correctly
- [ ] Recent resolved entries kept
- [ ] `[PERMANENT]` never pruned
- [ ] All file writes use `atomicWriteSync()`
- [ ] All tests green

**Dependencies:** Step 6
**Estimated Lines:** ~30 lines production (total ~100 for pruner), ~60 lines test
**Risk:** LOW

---

## Step 8: Implement cold-storage.cjs (archiveWarmToCold, searchCold, getStorageStats)

**Description:** Create the cold storage module that moves old warm archives to JSONL format and provides cross-tier search and stats.

**Security Mitigations Applied:** MF-003 (calls `scrubSensitiveContent()` before writing to cold), MF-001 (uses `safeParseJSON` for JSONL reads), MF-002 (uses `atomicWriteSync` for writes).

**Files to Create:**

| File | Purpose |
|------|---------|
| `.claude/lib/memory/cold-storage.cjs` | Tiered archival + search module |

**Test File:** `tests/lib/memory/cold-storage.test.cjs`

**TDD Sequence:**

1. **RED:** `archiveWarmToCold()` with warm file >30 days old -> creates JSONL in `archive/cold/`
2. **RED:** `archiveWarmToCold()` with no old warm files -> returns `{ archived: 0 }`
3. **RED:** Verify JSONL entries have sensitive data scrubbed (use fixture from Step 0)
4. **RED:** `archiveWarmToCold()` validates cold dir path with `validatePathWithinProject()`
5. **RED:** `searchCold("query")` finds matching entries in JSONL files
6. **RED:** `searchCold()` with no matches -> empty array
7. **RED:** `searchCold()` handles missing cold directory gracefully
8. **RED:** `getStorageStats()` returns correct byte counts for HOT, WARM, COLD tiers
9. **RED:** `getStorageStats()` with empty tiers returns `{ hot: { files: 0, totalKB: 0 }, ... }`
10. **GREEN:** Implement all three functions
11. **REFACTOR:** Ensure `safeParseJSON` used for all JSONL line parsing

**Cold JSONL Format:**

```jsonl
{"date":"2026-01-15","source":"decisions.md","title":"ADR-075","content":"...full section text..."}
```

**Key Implementation Details:**
- `archiveWarmToCold()` reads warm archive files, parses into sections via `parseSections()`
- Each section becomes a JSONL entry with `scrubSensitiveContent()` applied
- Original warm file deleted ONLY after successful JSONL write
- `searchCold()` reads JSONL line by line, uses `safeParseJSON()` per line
- `getStorageStats()` uses `fs.statSync()` to sum file sizes per tier

**Acceptance Criteria:**
- [ ] Warm archives older than threshold moved to JSONL
- [ ] Sensitive data scrubbed before JSONL write (verify: fixture API key becomes `[REDACTED]`)
- [ ] `safeParseJSON` used for all JSON parsing (grep for `JSON.parse` returns 0)
- [ ] All file writes use `atomicWriteSync()`
- [ ] Cold directory path validated
- [ ] Cross-tier search works
- [ ] Stats correctly sum all tiers
- [ ] All tests green

**Dependencies:** Steps 2 (scrubber), 3 (parseSections), 1 (safeParseJSON)
**Estimated Lines:** ~80 lines production, ~120 lines test
**Risk:** MEDIUM -- file age calculations require careful date handling

---

## Step 9: Wire into memory-scheduler.cjs

**Description:** Replace the disabled stubs in `memory-scheduler.cjs` with real implementations using the new modules.

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/lib/memory/memory-scheduler.cjs` | Wire rotator into `runPruning()`, pruner into `runDeduplication()`, cold-storage into `runArchiveOldLTM()` |

**Test File:** `tests/lib/memory/memory-scheduler-integration.test.cjs`

**Specific Changes:**

### 9a. Wire `runDeduplication()` (line 342-349)

**Current (disabled stub):**
```javascript
function runDeduplication(_projectRoot = PROJECT_ROOT) {
  return {
    type: 'deduplication',
    timestamp: new Date().toISOString(),
    success: false,
    details: 'Deduplication disabled (smart-pruner archived)',
  };
}
```

**New implementation:**
```javascript
function runDeduplication(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const result = {
    type: 'deduplication',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  const pruner = safeRequire(path.join(getLibDir(projectRoot), 'smart-pruner.cjs'));
  if (!pruner) {
    result.details = 'smart-pruner.cjs not available';
    return result;
  }

  try {
    const memoryDir = getMemoryDir(projectRoot);
    const files = ['learnings.md', 'decisions.md', 'issues.md'];
    const totalResult = { duplicatesFound: 0, duplicatesRemoved: 0 };

    for (const file of files) {
      const filePath = path.join(memoryDir, file);
      if (!fs.existsSync(filePath)) continue;
      const dedupResult = pruner.deduplicateFile(filePath);
      totalResult.duplicatesFound += dedupResult.duplicatesFound;
      totalResult.duplicatesRemoved += dedupResult.duplicatesRemoved;
    }

    result.success = true;
    result.details = totalResult;
  } catch (e) {
    result.details = e.message;
  }

  return result;
}
```

### 9b. Wire `runPruning()` (line 354-388)

**Add rotation** for `decisions.md` and `issues.md` (in addition to existing learnings archival):

```javascript
// After existing learnings archival, add:
const rotator = safeRequire(path.join(libDir, 'memory-rotator.cjs'));
if (rotator) {
  const memoryDir = getMemoryDir(projectRoot);
  for (const file of ['decisions.md', 'issues.md']) {
    const filePath = path.join(memoryDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const rotResult = rotator.rotateIfNeeded(filePath);
        if (rotResult.rotated) {
          result.rotation = result.rotation || [];
          result.rotation.push({ file, ...rotResult });
        }
      } catch (e) {
        logger.warn('Rotation failed', { file, error: e.message });
      }
    }
  }
}

// Add resolved entry pruning for issues.md
const pruner = safeRequire(path.join(libDir, 'smart-pruner.cjs'));
if (pruner) {
  const issuesPath = path.join(getMemoryDir(projectRoot), 'issues.md');
  if (fs.existsSync(issuesPath)) {
    try {
      const pruneResult = pruner.pruneResolvedEntries(issuesPath);
      result.resolvedPruned = pruneResult.removed;
    } catch (e) {
      logger.warn('Resolved entry pruning failed', { error: e.message });
    }
  }
}
```

### 9c. Wire `runArchiveOldLTM()` (line 395-462)

**Replace** the current `spawnSync` approach (which tries to import from archived path) with direct `require()`:

```javascript
function runArchiveOldLTM(projectRoot = PROJECT_ROOT) {
  validateProjectRoot(projectRoot);
  const result = {
    type: 'archiveOldLTM',
    timestamp: new Date().toISOString(),
    success: false,
    details: null,
  };

  const coldStorage = safeRequire(path.join(getLibDir(projectRoot), 'cold-storage.cjs'));
  if (!coldStorage) {
    result.details = 'cold-storage.cjs not available';
    return result;
  }

  try {
    const archiveResult = coldStorage.archiveWarmToCold({ projectRoot });
    result.success = true;
    result.details = archiveResult;
  } catch (e) {
    result.details = e.message;
  }

  // Record lastColdArchive (best-effort)
  if (result.success) {
    try {
      const status = readStatus(projectRoot);
      status.lastColdArchive = result.timestamp;
      writeStatus(status, projectRoot);
    } catch (_e) { /* ignore */ }
  }

  return result;
}
```

**TDD Sequence:**

1. **RED:** `runDeduplication()` returns success with dedup counts
2. **RED:** `runPruning()` triggers rotation for oversized decisions.md
3. **RED:** `runArchiveOldLTM()` calls cold-storage.archiveWarmToCold()
4. **RED:** All three return graceful results when modules not available (`safeRequire` returns null)
5. **GREEN:** Apply the wiring changes above
6. **VERIFY:** Run `pnpm test` to ensure no regressions

**Acceptance Criteria:**
- [ ] `runDeduplication()` calls `smart-pruner.deduplicateFile()` for each memory file
- [ ] `runPruning()` calls `memory-rotator.rotateIfNeeded()` for decisions.md and issues.md
- [ ] `runPruning()` calls `smart-pruner.pruneResolvedEntries()` for issues.md
- [ ] `runArchiveOldLTM()` calls `cold-storage.archiveWarmToCold()` (no more spawnSync)
- [ ] All three degrade gracefully when modules unavailable
- [ ] Existing tests still pass (no regressions)
- [ ] All tests green

**Dependencies:** Steps 4, 6, 7, 8
**Estimated Lines:** ~80 lines of changes in scheduler, ~60 lines test
**Risk:** MEDIUM -- modifying existing working code; ensure backward compatibility

---

## Step 10: Wire into sync-memory-index.cjs Hook

**Description:** Add a post-write size check to the sync-memory-index.cjs hook that triggers rotation when a memory file exceeds the threshold.

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/hooks/memory/sync-memory-index.cjs` | Add rotation trigger after existing sync logic |

**Test File:** `tests/hooks/sync-memory-index-rotation.test.cjs`

**Specific Change Location:** After line 284 (after the existing entity extraction and embedding logic), add:

```javascript
// Post-write size check: trigger rotation if file is oversized
try {
  const rotator = require('../../lib/memory/memory-rotator.cjs');
  const stats = fs.statSync(absPath);
  const thresholdKB = Number(process.env.MEMORY_ROTATION_THRESHOLD_KB || 20);
  if (stats.size > thresholdKB * 1024) {
    rotator.rotateIfNeeded(absPath);
    debugLog('sync-memory-index', `Rotation triggered for ${path.basename(absPath)} (${Math.round(stats.size / 1024)}KB)`);
  }
} catch (rotErr) {
  // Non-blocking: rotation failure must not break the sync hook
  debugLog('sync-memory-index', 'Rotation check failed (non-blocking)', rotErr);
}
```

**Also add `learnings.md` to the `CORE_MEMORY_MARKDOWN_FILES` set** (line 36) so rotation also triggers for learnings:

```javascript
const CORE_MEMORY_MARKDOWN_FILES = new Set(['decisions.md', 'issues.md', 'learnings.md']);
```

**TDD Sequence:**

1. **RED:** Test that writing to a >20KB memory file triggers `rotateIfNeeded()`
2. **RED:** Test that writing to a <20KB memory file does NOT trigger rotation
3. **RED:** Test that rotation failure does not crash the hook (exits 0)
4. **GREEN:** Apply the changes above
5. **VERIFY:** Run existing sync-memory-index tests to check no regressions

**Acceptance Criteria:**
- [ ] Rotation triggered when file exceeds threshold after write
- [ ] No rotation triggered for small files
- [ ] Hook never crashes on rotation failure (always exits 0)
- [ ] `learnings.md` added to `CORE_MEMORY_MARKDOWN_FILES`
- [ ] All existing tests still pass
- [ ] All new tests green

**Dependencies:** Steps 4, 9
**Estimated Lines:** ~15 lines production change, ~40 lines test
**Risk:** LOW -- additive change, non-blocking

---

## Step 11: Add config.yaml Entries

**Description:** Add the memory management configuration section to `.claude/config.yaml`.

**Files to Modify:**

| File | Change |
|------|--------|
| `.claude/config.yaml` | Add `rotation`, `deduplication`, `cold_storage`, `pruning` under `memory_management` |

**Exact YAML to Add (after line 106, under `memory_management:`):**

```yaml
  # Memory file rotation (ADR-102)
  rotation:
    enabled: true
    threshold_kb: 20
    keep_sections: 10
    archive_dir: archive

  # Deduplication (ADR-102)
  deduplication:
    enabled: true
    similarity_threshold: 0.5
    skip_permanent: true

  # Cold storage (ADR-102)
  cold_storage:
    enabled: true
    warm_max_age_days: 30
    cold_dir: archive/cold
    format: jsonl

  # Pruning (ADR-102)
  pruning:
    resolved_max_age_days: 30
    preserve_permanent: true
```

**Test:** Verify YAML is valid by reading the file back.

**TDD Sequence:**

1. **RED:** Test that `config.yaml` can be loaded and `memory_management.rotation.threshold_kb` equals 20
2. **GREEN:** Add the YAML content
3. **VERIFY:** `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('.claude/config.yaml', 'utf8'))"`

**Acceptance Criteria:**
- [ ] YAML is valid (parseable without errors)
- [ ] All config values match architecture design Section 6
- [ ] No existing config sections disturbed

**Dependencies:** None (can be done in parallel with implementation steps)
**Estimated Lines:** ~20 lines of YAML
**Risk:** NONE -- additive only

---

## Step 12: Integration Tests

**Description:** Write integration tests that verify the full pipeline: agent writes to memory file -> hook triggers rotation -> scheduler runs deduplication and cold archival.

**Test File:** `tests/integration/memory-management-pipeline.test.cjs`

**Integration Test Cases:**

1. **Scheduler + Rotator:** Call `runPruning()` with an oversized `decisions.md` fixture -> verify rotation occurred
2. **Scheduler + Pruner:** Call `runDeduplication()` with `duplicate-issues.md` fixture -> verify dedup count
3. **Scheduler + Cold Storage:** Call `runArchiveOldLTM()` with an old warm archive -> verify JSONL created
4. **Full Weekly Cycle:** Call `runWeeklyMaintenance()` -> verify all tasks execute (rotation, dedup, cold archival, pruning)
5. **Sensitive Data E2E:** Write sensitive content to warm archive -> run cold archival -> verify JSONL has scrubbed content

**TDD Sequence:**

1. **RED:** Write all 5 integration test cases
2. **GREEN:** All should pass if Steps 1-11 are complete
3. **VERIFY:** Run `pnpm test` -- all tests (unit + integration) green

**Acceptance Criteria:**
- [ ] All 5 integration tests green
- [ ] Full weekly maintenance cycle completes without errors
- [ ] Sensitive data correctly scrubbed in cold storage output
- [ ] No regressions in existing test suite

**Dependencies:** Steps 1-11 (all must be complete)
**Estimated Lines:** ~150 lines of integration test code
**Risk:** LOW -- tests only, no production code changes

---

## Summary Table

| Step | Description | Files Changed | Lines (prod) | Lines (test) | Dependencies | Risk |
|------|-------------|---------------|-------------|-------------|--------------|------|
| 0 | Test fixtures | 6 new fixtures | 0 | ~200 fixtures | None | LOW |
| 1 | Safe JSON verification (MF-001) | safe-json.cjs (verify) | 0-10 | ~40 | Step 0 | LOW |
| 2 | Sensitive data scrubber (MF-003) | sensitive-scrubber.cjs (new) | ~60 | ~80 | Step 0 | MEDIUM |
| 3 | parseSections() | memory-rotator.cjs (new) | ~40 | ~80 | Step 0 | LOW |
| 4 | rotateIfNeeded() (MF-002) | memory-rotator.cjs | ~60 | ~100 | Step 3 | MEDIUM |
| 5 | searchArchives() | memory-rotator.cjs | ~20 | ~50 | Step 4 | LOW |
| 6 | jaccardSimilarity + deduplicateFile | smart-pruner.cjs (new) | ~60 | ~100 | Step 3 | LOW |
| 7 | pruneResolvedEntries | smart-pruner.cjs | ~30 | ~60 | Step 6 | LOW |
| 8 | cold-storage.cjs | cold-storage.cjs (new) | ~80 | ~120 | Steps 2,3,1 | MEDIUM |
| 9 | Wire into scheduler | memory-scheduler.cjs | ~80 | ~60 | Steps 4,6,7,8 | MEDIUM |
| 10 | Wire into hook | sync-memory-index.cjs | ~15 | ~40 | Steps 4,9 | LOW |
| 11 | Config additions | config.yaml | ~20 | ~10 | None | NONE |
| 12 | Integration tests | new test file | 0 | ~150 | Steps 1-11 | LOW |
| **TOTAL** | | **10 files** | **~465** | **~1090** | | |

---

## Dependency Graph

```
Step 0 (fixtures)
  ├─> Step 1 (safe-json verify)
  ├─> Step 2 (scrubber)  ──────────────────────────┐
  ├─> Step 3 (parseSections)                        │
  │     ├─> Step 4 (rotateIfNeeded)                 │
  │     │     ├─> Step 5 (searchArchives)           │
  │     │     ├─> Step 9 (wire scheduler) <─────────┤
  │     │     └─> Step 10 (wire hook) <── Step 9    │
  │     ├─> Step 6 (jaccard + dedup)                │
  │     │     ├─> Step 7 (pruneResolved)            │
  │     │     └─> Step 9 (wire scheduler) <─────────┤
  │     └─> Step 8 (cold-storage) <─── Steps 1,2   │
  │           └─> Step 9 (wire scheduler) <─────────┘
  └─> Step 11 (config) [parallel, no deps]

Step 12 (integration tests) <── All steps complete
```

**Parallelizable groups:**
- Steps 3 and 2 can run in parallel (no shared deps beyond Step 0)
- Steps 5 and 6 can run in parallel (5 depends on 4; 6 depends on 3)
- Step 11 can run at any time (no code dependencies)

---

## Commit Checkpoint

**Since this plan modifies 10+ files, a commit checkpoint is REQUIRED after Steps 1-8 (before wiring):**

```
After Step 8 (all 3 new modules + scrubber complete and tested):
  git add .claude/lib/memory/memory-rotator.cjs .claude/lib/memory/smart-pruner.cjs .claude/lib/memory/cold-storage.cjs .claude/lib/utils/sensitive-scrubber.cjs tests/
  git commit -m "checkpoint: memory management modules + security utilities complete (pre-wiring)"
```

This creates a recovery point before modifying existing scheduler and hook files (Steps 9-10).

---

## Risk Flags

| Risk | Step | Mitigation |
|------|------|------------|
| Regex false positives in scrubber | Step 2 | Conservative patterns; test with real code content; prefer under-scrubbing over over-scrubbing |
| File date parsing for age-based operations | Steps 4, 8 | Use `fs.statSync().mtime` for warm archive age, not filename dates |
| Windows path separators in archive paths | Steps 4, 5, 8 | Always use `path.join()` and `path.normalize()`; never string concatenation for paths |
| Concurrent scheduler + hook rotation | Steps 9, 10 | `atomicWriteSync()` handles concurrent writes; size-check guard prevents double rotation |
| Large `issues.md` (53KB) first rotation | Step 4 | Test with fixture > 20KB; verify sections are correctly split |
| `memory-manager.cjs` still has `checkAndArchiveLearnings()` | Step 9 | Leave existing function; rotator supplements (does not replace) for now |

---

## Post-Implementation Verification Checklist

Before marking Task #9 complete, the developer MUST verify:

1. **Security:** `grep -rn "JSON.parse" .claude/lib/memory/memory-rotator.cjs .claude/lib/memory/smart-pruner.cjs .claude/lib/memory/cold-storage.cjs` returns 0 results
2. **Security:** `grep -rn "writeFileSync\|appendFileSync" .claude/lib/memory/memory-rotator.cjs .claude/lib/memory/smart-pruner.cjs .claude/lib/memory/cold-storage.cjs` returns 0 results
3. **Security:** `grep -rn "console.log" .claude/lib/memory/memory-rotator.cjs .claude/lib/memory/smart-pruner.cjs .claude/lib/memory/cold-storage.cjs` returns 0 results
4. **Tests:** `pnpm test` passes (all tests green, including new tests)
5. **Line count:** Each new module under 150 lines (verify with `wc -l`)
6. **Config:** `config.yaml` parses without errors
7. **Integration:** `node .claude/lib/memory/memory-scheduler.cjs run deduplication` no longer returns "disabled"

---

## Phase [FINAL]: Evolution and Reflection Check

**Purpose:** Quality assessment and learning extraction after implementation.

**Tasks:**

1. Spawn reflection-agent to analyze completed memory management implementation
2. Extract learnings to `.claude/context/memory/learnings.md`
3. Check for evolution opportunities (e.g., does the new system suggest new skills or agents?)

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted
- Any evolution opportunities logged
