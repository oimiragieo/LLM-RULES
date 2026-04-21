<!-- Agent: architect | Task: #2 | Session: 2026-02-15 -->

# Architectural Design: Enterprise Audit Findings Remediation

**Version**: 1.0
**Author**: Architect Agent
**Date**: 2026-02-15
**Status**: Final
**Inputs**: PM requirements (pm-requirements-enterprise-2026-02-15.md), Bug audit (codebase-audit-bugs-2026-02-15.md), Performance audit (performance-audit-2026-02-15.md), Memory: ADR-115/116/102, learnings.md

---

## 1. Executive Summary

This document covers fix architecture for 5 verified bug findings (CRIT-001, CRIT-002, CRIT-003, HIGH-001, HIGH-002) plus one performance finding (LTM eviction from CRIT-004 in performance audit). Each decision includes alternatives considered, risk analysis, and implementation order. The overarching design principle is: **additive-only, zero-dependency additions where possible, backward-compatible public API preservation**.

---

## 2. Module Dependency Diagram

```
                     safe-json.cjs (CRIT-001, CRIT-002)
                          |
                          | used by
                    +-----+-----+
                    |           |
              hooks/*.cjs    lib/*.cjs
              (42 JSON.parse) (44 JSON.parse)
                    |           |
                    v           v
           hook-input.cjs   memory-manager-core-*.cjs (HIGH-001)
                               |
                               | uses
                               v
                    memory-manager-core-storage.cjs
                          |
                          | uses
                          v
                    atomic-write.cjs  <--- file-locker.cjs (proper-lockfile)
                          |
                          | used by
                          v
                    memory-tiers.cjs (CRIT-004 / LTM eviction)
                          |
                          | used by
                          v
              contextual-memory-context-loader.cjs (HIGH-002 hot path)
                          |
                          | loaded by
                          v
              spawn-prompt-assembler.core.cjs (HIGH-002 hot path)
```

---

## 3. Design Decisions

### 3.1 CRIT-001: Silent Data Loss in safe-json.cjs Deep Copy

**Problem**: `JSON.parse(JSON.stringify(value))` fails on circular refs, functions, or undefined; catch block silently replaces user data with schema defaults.

**Decision**: Use `structuredClone()` as primary deep copy; fall back to `JSON.parse(JSON.stringify())` only if `structuredClone` throws; log errors to stderr; preserve original value as last resort instead of discarding to defaults.

**Alternatives Considered**:

| Alternative | Pros | Cons | Verdict |
|---|---|---|---|
| `structuredClone()` (Node 17+) | Zero deps, handles circular refs, handles Dates/RegExp/Maps, native V8 speed | Cannot clone functions (throws) | **SELECTED** - covers 99% of cases, Node 22.17.1 confirmed |
| `lodash.cloneDeep` | Handles more edge cases (functions, symbols) | External dep (217KB), slower than native, supply chain risk | REJECTED - unnecessary dep for this use case |
| Keep `JSON.parse(JSON.stringify())` with better error handling | No code changes beyond catch block | Still loses functions, Dates become strings, undefined stripped | REJECTED - fundamentally lossy |

**Implementation Approach**:

```javascript
// In safe-json.cjs, replace lines 234-253
if (Array.isArray(value) || typeof value === 'object') {
  try {
    validated[key] = structuredClone(value);
  } catch (cloneErr) {
    // structuredClone fails on functions - try JSON roundtrip
    try {
      validated[key] = JSON.parse(JSON.stringify(value));
    } catch (jsonErr) {
      // PRESERVE original value, LOG error (never silently default)
      process.stderr.write(
        `[WARN] safe-json: Deep copy failed for key "${key}": ${jsonErr.message}. Using original reference.\n`
      );
      validated[key] = value;
    }
  }
}
```

**Risk Assessment**: LOW. `structuredClone` is a strict superset of JSON roundtrip for data-only objects. No behavioral change for existing callers that pass serializable data. The only difference: previously silently-lost data is now preserved.

**Estimated Complexity**: 1 hour (single file, ~20 lines changed, straightforward logic)

---

### 3.2 CRIT-002: Unbounded `warnedSchemas` Set Memory Leak

**Problem**: `warnedSchemas` Set grows unbounded with unique schema keys. In long sessions, thousands of entries accumulate.

**Decision**: Use a bounded Set with FIFO eviction (no external dependency). Cap at 200 entries.

**Alternatives Considered**:

| Alternative | Pros | Cons | Verdict |
|---|---|---|---|
| Bounded Set + FIFO eviction | Zero deps, 8 lines of code, O(1) check/add | Evicts oldest (not least-used) | **SELECTED** - simplest correct solution |
| `lru-cache` npm package | True LRU, mature, battle-tested | New dependency for a warning-only Set, overkill | REJECTED - warning suppression does not need LRU semantics |
| WeakRef-based Set | Auto GC cleanup | Keys are strings (not objects), WeakRef doesn't work on primitives | REJECTED - technically impossible |
| Clear Set on session boundary | Periodic cleanup | No session boundary signal available in this module | REJECTED - no reliable trigger |

**Why 200 (not 100)?**: The codebase has ~146 schema name combinations (7 named schemas x various dynamic keys + `__missing__`). 200 provides headroom without allowing unbounded growth. Each entry is a string key averaging 30 bytes, so 200 entries = ~6KB max.

**Implementation Approach**:

```javascript
// Replace line 24 in safe-json.cjs
const warnedSchemas = new Set();
const MAX_WARNED_SCHEMAS = 200;

function trackWarned(key) {
  if (warnedSchemas.size >= MAX_WARNED_SCHEMAS) {
    const oldest = warnedSchemas.values().next().value;
    warnedSchemas.delete(oldest);
  }
  warnedSchemas.add(key);
}
```

**Risk Assessment**: NEGLIGIBLE. Warning-only path. If a key is evicted and re-encountered, the warning simply re-fires (correct behavior - periodic reminder is better than silent suppression).

**Estimated Complexity**: 30 minutes (10 lines changed, same file as CRIT-001)

---

### 3.3 CRIT-003: Prototype Pollution Prevention (raw JSON.parse)

**Problem**: 86 occurrences of raw `JSON.parse()` across 60 files in hooks/ and lib/ (42 in hooks, 44 in lib). Each is a potential prototype pollution and crash vector.

**Decision**: Tiered migration to `safeParseJSON()` from the existing `safe-json.cjs` utility. Do NOT add `@fastify/secure-json-parse` as a new dependency.

**Alternatives Considered**:

| Alternative | Pros | Cons | Verdict |
|---|---|---|---|
| Migrate all to existing `safeParseJSON()` | Already in codebase (ADR-115), zero new deps, prototype pollution protection built in | Requires schema for full protection; schemaless mode still strips __proto__ | **SELECTED** - leverages existing investment |
| `@fastify/secure-json-parse` | Drop-in JSON.parse replacement, battle-tested | New dependency, different API than existing safeParseJSON, two competing solutions | REJECTED - creates dual-standard confusion |
| ESLint rule banning raw JSON.parse | Prevents future violations | Does not fix existing 86 occurrences | COMPLEMENTARY - add as Phase 2 |

**Migration Tiers**:

1. **Tier 1 (P0, Week 1)**: 15 files in hot-path hooks (routing/, safety/, validation/) - these handle untrusted input from stdin and agent output
2. **Tier 2 (P1, Week 2)**: 20 files in lib/memory/ and lib/routing/ - these parse state files that could be corrupted
3. **Tier 3 (P2, Week 3)**: 25 remaining files in lib/ and hooks/ (code-indexing, monitoring, session) - lower risk, parse internal data

**Files Requiring Immediate Fix (Tier 1)**:

| File | Occurrences | Risk |
|---|---|---|
| `hooks/routing/pre-task-unified-state.cjs` | 3 | HIGH - parses task state |
| `hooks/routing/spawn-prompt-assembler.core.cjs` | 2 | HIGH - parses agent registry |
| `hooks/routing/routing-guard-core.shared.cjs` | 1 | HIGH - parses routing state |
| `hooks/reflection/reflection-queue-processor.cjs` | 2 | HIGH - parses reflection queue |
| `hooks/validation/pre-completion-validation.cjs` | 2 | MEDIUM - parses validation state |
| `hooks/session/adaptive-quality-gate.cjs` | 3 | MEDIUM - parses quality metrics |
| `hooks/session/drift-detector.cjs` | 2 | MEDIUM - parses stdin |
| `hooks/safety/spawn-prompt-validator.cjs` | 1 | MEDIUM - parses prompt metadata |
| `hooks/memory/sync-memory-index.cjs` | 1 | HIGH - parses memory DB state |

**Pattern for migration** (each file):

```javascript
// BEFORE:
const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

// AFTER:
const { safeReadJSON } = require('../../lib/utils/safe-json.cjs');
const parsed = safeReadJSON(stateFile, null); // null = no schema, but still strips __proto__
```

**Risk Assessment**: LOW per file (additive wrapper), MEDIUM overall (86 files to touch). Each migration is independently safe and independently deployable.

**Estimated Complexity**: 3-4 hours for Tier 1 (15 files, mechanical replacement), 2-3 hours each for Tiers 2 and 3.

---

### 3.4 CRIT-004: LTM Tier Eviction Policy

**Problem**: LTM directory accumulates summary files without any eviction. After 500+ sessions, this grows to 250MB-1GB.

**Decision**: Add `maxLTMSummaries` config constant (default 20) with FIFO eviction in `summarizeOldSessions()`. Evict oldest summary files when limit exceeded.

**Alternatives Considered**:

| Alternative | Pros | Cons | Verdict |
|---|---|---|---|
| FIFO eviction (oldest files deleted) | Simple, deterministic, oldest data is least valuable | Loses old summaries permanently | **SELECTED** - old summaries have diminishing value, matches MTM pattern |
| LRU eviction (least recently read) | Keeps frequently accessed summaries | Requires access tracking, adds complexity, LTM summaries rarely re-read | REJECTED - over-engineered for this use case |
| TTL-based (delete after N days) | Time-natural cleanup | Requires date parsing on every check, inconsistent with MTM model | REJECTED - adds time complexity |
| Circular buffer (fixed-size ring) | Elegant, constant space | Requires index tracking, more complex implementation | REJECTED - FIFO achieves same result simpler |

**Why 20 summaries?**: Each summary represents ~5 MTM sessions. 20 summaries = ~100 session history retained. At ~500KB-2MB per summary, 20 summaries = 10-40MB max. This is within acceptable memory footprint for a development tool.

**Implementation Approach**:

```javascript
// In memory-tiers.cjs, add to CONFIG:
const CONFIG = {
  MTM_MAX_SESSIONS: 10,
  MTM_WARN_THRESHOLD: 8,
  SUMMARY_MIN_SESSIONS: 5,
  LTM_MAX_SUMMARIES: 20,        // NEW: cap LTM growth
};

// In summarizeOldSessions(), after writing new summary:
function evictOldLTMSummaries(projectRoot) {
  const ltmDir = getTierPath('LTM', projectRoot);
  if (!fs.existsSync(ltmDir)) return;

  const files = fs.readdirSync(ltmDir)
    .filter(f => f.startsWith('summary_') && f.endsWith('.json'))
    .sort(); // Alphabetical = chronological (timestamp-based names)

  const excess = files.length - CONFIG.LTM_MAX_SUMMARIES;
  if (excess <= 0) return;

  // Delete oldest summaries
  for (let i = 0; i < excess; i++) {
    const filePath = path.join(ltmDir, files[i]);
    fs.unlinkSync(filePath);
  }

  appendTierEvent('ltm_evicted', {
    evicted: excess,
    remaining: CONFIG.LTM_MAX_SUMMARIES,
  }, projectRoot);
}
```

**Note on promoted sessions**: Promoted files (prefix `promoted_`) are excluded from eviction since they were manually marked as high-value. Only auto-generated `summary_*` files are evicted.

**Risk Assessment**: LOW. LTM summaries are compressed aggregates of already-deleted MTM sessions. Deleting old summaries loses historical context but prevents unbounded growth. The most recent 20 summaries (covering ~100 sessions) provide sufficient history.

**Estimated Complexity**: 1 hour (30 lines in memory-tiers.cjs, straightforward file operations)

---

### 3.5 HIGH-001: File Locking for Memory Operations

**Problem**: Memory manager lacks file-level locking. Concurrent agents can corrupt JSON state files through interleaved reads and writes.

**Decision**: Use the existing `withFileLockSync()` from `memory-manager-core-storage.cjs` more broadly, and add `proper-lockfile`-based async locking via the existing `file-locker.cjs` for additional state files.

**Key Discovery**: The codebase already has TWO locking mechanisms:

1. **Sync**: `withFileLockSync()` in `memory-manager-core-storage.cjs` (uses `fs.mkdirSync` atomic lock)
2. **Async**: `file-locker.cjs` wrapping `proper-lockfile` (already a dependency)

The problem is not that locking doesn't exist, but that it's not applied consistently.

**Files Needing Locking (not currently locked)**:

| File | Lock Type | Justification |
|---|---|---|
| `memory-tiers.cjs` (MTM/LTM operations) | Sync (mkdirSync lock) | Consolidation and summarization are sync operations |
| `contextual-memory-context-loader.cjs` | Read lock not needed | Read-only path; locking writers is sufficient |
| `workflow-state-manager.cjs` | Sync (mkdirSync lock) | State file written by hooks (sync context) |
| `loop-prevention state files` | Sync (mkdirSync lock) | Written in hook pre-tool (sync context) |
| `router-state.json` | Already locked via safe-json + atomic-write | Verify coverage |

**Sync vs Async Locking for Hooks**:

Hooks MUST use sync locking because the Claude Code hook protocol is synchronous (JSON in via stdin, JSON out via stdout, process exits). The existing `withFileLockSync()` implementation is correct for this:
- Uses `fs.mkdirSync()` for atomic lock acquisition (POSIX-safe)
- Has stale lock detection (configurable timeout)
- Has busy-wait retry with configurable intervals
- Properly handles EEXIST, EPERM, EBUSY error codes

**Implementation Approach**: Wrap the 3 functions in `memory-tiers.cjs` that write to disk:

```javascript
// consolidateSession: wrap MTM write + STM delete
// summarizeOldSessions: wrap LTM summary write + MTM deletes
// promoteToLTM: wrap LTM write + MTM delete
```

Each wraps its write operations inside `withFileLockSync(targetFile, () => { ... })`.

**Risk Assessment**: LOW-MEDIUM. Sync locking adds 0-20ms per locked operation (fast path when uncontested). Risk of deadlock is mitigated by stale lock timeout (default 10s). Main risk: if a hook crashes without releasing lock, stale detection handles it after timeout.

**Estimated Complexity**: 2-3 hours (wrap 3-4 functions, import locking utility, test concurrent scenarios)

---

### 3.6 HIGH-002: Sync I/O Caching for Hot Paths

**Problem**: 52 `readFileSync`/`writeFileSync` calls in hooks/routing/ alone. Repeated reads of immutable files (constitution, agent-registry, config) on every spawn.

**Decision**: Implement module-level read-through cache for immutable and semi-immutable files. Do NOT convert hooks to async (hook protocol is synchronous by design).

**Alternatives Considered**:

| Alternative | Pros | Cons | Verdict |
|---|---|---|---|
| Module-level cache with TTL | Fast repeated reads, simple implementation | Cache invalidation complexity | **SELECTED** - matches hook lifecycle |
| Convert to async I/O | Non-blocking, better Node.js patterns | Hook protocol is sync (stdin/stdout); would require protocol redesign | REJECTED - architectural mismatch |
| Pre-load at hook registration | Zero per-request I/O | No cache invalidation, stale reads after file changes | COMPLEMENTARY - for truly immutable files |
| Memory-mapped files | OS-level caching, zero-copy reads | Platform-specific, complex error handling, overkill | REJECTED - unnecessary complexity |

**Cache Tier Strategy**:

| File Category | TTL | Invalidation | Examples |
|---|---|---|---|
| **Immutable** (session lifetime) | Infinity (no TTL) | None needed | constitution.md, behaviour.md |
| **Semi-immutable** (changes rarely) | 60 seconds | TTL expiry | agent-registry.json, config.yaml |
| **State** (changes frequently) | 5 seconds | TTL expiry | router-state.json, workflow-state.json |
| **Dynamic** (changes every call) | No cache | N/A | stdin input, task metadata |

**Implementation Approach**: Create a lightweight `file-cache.cjs` utility:

```javascript
// .claude/lib/utils/file-cache.cjs
'use strict';
const fs = require('fs');

const cache = new Map();

function cachedReadFileSync(filePath, encoding, ttlMs) {
  const now = Date.now();
  const entry = cache.get(filePath);

  if (entry && (now - entry.timestamp) < ttlMs) {
    return entry.content;
  }

  const content = fs.readFileSync(filePath, encoding);
  cache.set(filePath, { content, timestamp: now });

  // Bound cache size (max 50 entries)
  if (cache.size > 50) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }

  return content;
}

function invalidateCache(filePath) {
  if (filePath) {
    cache.delete(filePath);
  } else {
    cache.clear();
  }
}

module.exports = { cachedReadFileSync, invalidateCache };
```

**Target Files for Caching** (highest impact, spawn-prompt-assembler hot path):

| File | Current reads/spawn | With cache | Savings |
|---|---|---|---|
| `spawn-prompt-assembler.core.cjs` (constitution) | 1 readFileSync | 0 (cached) | ~5ms |
| `spawn-prompt-assembler.core.cjs` (behaviour) | 1 readFileSync | 0 (cached) | ~5ms |
| `spawn-prompt-assembler.task-tools.cjs` (agent-registry) | 1 readFileSync + JSON.parse | 0 (cached) | ~10ms |
| `contextual-memory-context-loader.cjs` (6 reads) | 6 readFileSync + JSON.parse | 0-1 (cached) | ~50ms |
| **Total per spawn** | ~10 sync reads | ~1 sync read | **~70ms saved** |

**Risk Assessment**: LOW. Cache is process-local (no cross-process sharing concerns). TTL ensures eventual consistency. Immutable files (constitution, behaviour) genuinely never change during a session.

**Estimated Complexity**: 3-4 hours (create utility, integrate into 4-5 hot-path files, test cache hit/miss)

---

## 4. Implementation Order

The order is driven by three constraints:
1. **Dependency**: CRIT-001 and CRIT-002 are in the same file (do together)
2. **Risk reduction**: Fix data loss (CRIT-001) before performance (HIGH-002)
3. **Foundation**: Locking (HIGH-001) must be in place before caching (HIGH-002) to prevent cached stale reads during concurrent writes

```
Phase 1: CRIT-001 + CRIT-002  (safe-json.cjs)     [0.5 day]
    |
    v
Phase 2: CRIT-004             (memory-tiers.cjs)   [0.5 day]
    |
    v
Phase 3: HIGH-001             (locking)            [0.5 day]
    |
    v
Phase 4: HIGH-002             (caching)            [1 day]
    |
    v
Phase 5: CRIT-003 Tier 1      (15 hook files)      [0.5 day]
    |
    v
Phase 6: CRIT-003 Tiers 2-3   (45 lib files)       [1 day]
```

```
Timeline (critical path):
Day 1: Phase 1 (CRIT-001+002) + Phase 2 (CRIT-004)
Day 2: Phase 3 (HIGH-001) + Phase 4 start (HIGH-002)
Day 3: Phase 4 complete (HIGH-002) + Phase 5 (CRIT-003 Tier 1)
Day 4: Phase 6 (CRIT-003 Tiers 2-3) + Integration testing
Day 5: Buffer / Regression testing / ESLint rule for JSON.parse ban
```

**Total estimated effort**: 4-5 working days

---

## 5. Risk Assessment Summary

| Finding | Fix Risk | Regression Risk | Mitigation |
|---|---|---|---|
| CRIT-001 (data loss) | LOW | LOW | structuredClone is superset of JSON roundtrip; fallback preserves original |
| CRIT-002 (memory leak) | NEGLIGIBLE | NONE | Warning path only; bounded Set is strictly better |
| CRIT-003 (prototype pollution) | LOW per file | MEDIUM overall | Mechanical replacement; existing safeParseJSON is proven (ADR-115) |
| CRIT-004 (LTM eviction) | LOW | LOW | Only deletes auto-generated summaries; preserves promoted sessions |
| HIGH-001 (file locking) | LOW-MEDIUM | LOW | Existing lock infrastructure proven; stale detection prevents deadlocks |
| HIGH-002 (sync caching) | LOW | LOW | TTL-based invalidation; bounded cache size; immutable files genuinely static |

**Biggest overall risk**: CRIT-003 (86 files to touch). Mitigation: tier the migration, commit after each tier, run full test suite between tiers.

---

## 6. Complexity Estimates

| Phase | Finding | Files Modified | Lines Changed | Complexity | Effort |
|---|---|---|---|---|---|
| 1 | CRIT-001 + CRIT-002 | 1 | ~40 | LOW | 1.5 hours |
| 2 | CRIT-004 | 1 | ~30 | LOW | 1 hour |
| 3 | HIGH-001 | 2-3 | ~60 | MEDIUM | 2-3 hours |
| 4 | HIGH-002 | 5-6 | ~100 | MEDIUM | 3-4 hours |
| 5 | CRIT-003 T1 | 15 | ~45 | LOW (mechanical) | 3-4 hours |
| 6 | CRIT-003 T2-3 | 45 | ~135 | LOW (mechanical) | 5-6 hours |
| **Total** | | **~70** | **~410** | | **~4 days** |

---

## 7. Test Strategy

Each phase requires targeted tests before merge:

| Phase | Test Focus | Test Count |
|---|---|---|
| 1 | structuredClone with circular refs; bounded Set eviction; error logging | 5 |
| 2 | LTM eviction at boundary; promoted files preserved; event logging | 4 |
| 3 | Concurrent write safety; stale lock recovery; lock timeout | 5 |
| 4 | Cache hit/miss; TTL expiry; invalidation; bounded cache size | 5 |
| 5-6 | safeReadJSON/safeParseJSON integration; prototype stripping; malformed JSON | 5 |
| **Total** | | **24 tests** |

These 24 tests address the bug fix suite. They are separate from and complementary to the 95 PM-specified tests for routing/task/workflow coverage gaps (PM requirements Phase 1-2).

---

## 8. Backward Compatibility

All changes maintain backward API compatibility:

- **safe-json.cjs**: `safeParseJSON()` and `safeReadJSON()` signatures unchanged. Return type unchanged. Only internal deep-copy mechanism and warning behavior change.
- **memory-tiers.cjs**: All exported functions unchanged. New `LTM_MAX_SUMMARIES` config constant added (additive). New `evictOldLTMSummaries` internal function (not exported).
- **file-cache.cjs**: New module (additive). Consumers opt-in by importing.
- **CRIT-003 migration**: Each file's behavior is identical - same parsing, same output. Only error handling and prototype stripping differ.

---

## 9. Dependencies

**No new npm dependencies required**:

- `structuredClone()`: Built into Node.js 17+ (confirmed: Node 22.17.1)
- `proper-lockfile`: Already in package.json (used by atomic-write.cjs and file-locker.cjs)
- `safeParseJSON`: Already in `.claude/lib/utils/safe-json.cjs`

**New files created**: 1 (`file-cache.cjs` utility)
**Files modified**: ~70 (mostly mechanical CRIT-003 migration)
**Files with logic changes**: 4 (safe-json.cjs, memory-tiers.cjs, memory-manager-core-storage.cjs, file-cache.cjs)

---

## 10. Decisions Record (ADR Format)

### ADR-125: structuredClone for Safe Deep Copy

**Status**: PROPOSED
**Context**: CRIT-001 finding - JSON.parse(JSON.stringify()) silently loses data on circular refs / non-serializable values
**Decision**: Use `structuredClone()` (Node 17+ native) as primary deep copy in `safe-json.cjs`. Fall back to JSON roundtrip, then preserve original value with stderr warning. Never silently replace with defaults.
**Consequences**: Handles circular refs, Dates, RegExp, ArrayBuffer natively. Functions still fail (rare in our data paths). Zero new dependencies.

### ADR-126: Bounded Set for Warning Deduplication

**Status**: PROPOSED
**Context**: CRIT-002 finding - warnedSchemas Set grows unbounded
**Decision**: Cap at 200 entries with FIFO eviction. No LRU cache dependency.
**Consequences**: ~6KB max memory. Evicted keys may re-trigger warning (acceptable - periodic reminder is better than suppression).

### ADR-127: Tiered JSON.parse Migration to safeParseJSON

**Status**: PROPOSED
**Context**: CRIT-003 finding - 86 raw JSON.parse calls across 60 files
**Decision**: Migrate in 3 tiers (hooks hot path first, then memory/routing lib, then remaining). Use existing `safeParseJSON()` from ADR-115. Add ESLint rule to prevent future regressions.
**Consequences**: 60 files touched over 2-3 days. Each tier independently deployable. Prototype pollution protection and crash safety added.

### ADR-128: FIFO LTM Eviction with maxLTMSummaries

**Status**: PROPOSED
**Context**: Performance audit CRIT-004 - LTM grows unbounded across sessions
**Decision**: Add `LTM_MAX_SUMMARIES: 20` config. Evict oldest `summary_*` files when exceeded. Preserve `promoted_*` files.
**Consequences**: Max LTM directory size ~40MB. History covers last ~100 sessions. Oldest summaries lost but value is minimal.

### ADR-129: Read-Through File Cache for Hook Hot Paths

**Status**: PROPOSED
**Context**: HIGH-002 finding - 52 readFileSync calls in routing hooks per spawn
**Decision**: Module-level cache with tiered TTL (infinity for immutable, 60s for semi-immutable, 5s for state). Bounded to 50 entries.
**Consequences**: ~70ms saved per agent spawn. Cache is process-local and session-scoped. No cross-process consistency issues.

---

## 11. Items Explicitly Deferred

| Item | Reason | When |
|---|---|---|
| MED-001 (index-manager race conditions) | Lower severity, code-indexing path is not hook-critical | Next sprint |
| INSPECT-001 (hook-input.cjs null return) | File does not exist at reported path; needs re-verification | Next sprint |
| Async I/O conversion for hooks | Hook protocol is fundamentally sync; would require protocol redesign | Not planned |
| spawn-prompt-assembler refactor (3-layer) | Architectural change, not a bug fix; requires separate ADR | Next quarter |
| Memory tier simplification (STM/MTM/LTM to single-tier) | Significant architecture change; out of scope for bug remediation | Next quarter |
| ESLint rule for JSON.parse ban | Complementary to CRIT-003 but requires separate tooling work | Week after migration |

---

## 12. Coordination with PM Test Requirements

The PM requirements document specifies 95 integration tests for routing/task/workflow coverage gaps. Those tests are a separate workstream from these bug fixes. However, the two workstreams share dependencies:

- **Bug fixes FIRST**: CRIT-001/002 must be fixed before tests can reliably exercise safe-json paths
- **Locking FIRST**: HIGH-001 must be in place before task lifecycle state tests can exercise concurrent scenarios
- **Tests can proceed in parallel** with CRIT-003 migration (different files, no conflicts)

**Recommended parallelization**:

```
                 Bug Fix Track              Test Track
Day 1:     CRIT-001+002, CRIT-004    Routing-guard tests (20)
Day 2:     HIGH-001, HIGH-002         Task lifecycle tests (15)
Day 3:     CRIT-003 Tier 1            Cycle detection tests (10)
Day 4:     CRIT-003 Tier 2-3          Batch/memory/disambiguation (40)
Day 5:     Buffer + regression        Integration testing
```

---

**End of Architectural Design Document**
