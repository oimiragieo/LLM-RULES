<!-- Agent: devops-troubleshooter | Task: memory-leak-investigation | Session: 2026-02-09 -->

# Memory Leak Analysis Report -- OOM Root Cause Investigation

**Date:** 2026-02-09
**Investigator:** devops-troubleshooter
**Scope:** Full codebase analysis of agent-studio framework for memory leak sources

---

## Executive Summary

The agent-studio project is a Claude Code multi-agent orchestration framework (NOT a REST API server). It has **no HTTP server process**. OOM crashes occur in the **code indexing subsystem** and the **hook execution pipeline**. Six distinct memory leak sources were identified, ranked by severity below.

---

## Severity 1 (CRITICAL): Async Pipeline Promise.race / inFlight Pattern

**File:** `C:\dev\projects\agent-studio\.claude\lib\code-indexing\index-manager.cjs`
**Lines:** 526-640

### Root Cause

The async indexing pipeline (used when `embeddingMode !== 'off'`) uses a `Promise.race(Array.from(inFlight))` pattern combined with a `Set()` of in-flight promises. This causes V8 heap fragmentation:

```javascript
// Line 526
const inFlight = new Set();

// Line 580 - Promise.race creates intermediate Promise objects that retain closures
await Promise.race(Array.from(inFlight));

// Line 585-586 - Same pattern repeated in the concurrency limiter
while (inFlight.size >= concurrency) {
  await Promise.race(Array.from(inFlight));
}
```

**Why it leaks:**

1. `Promise.race()` creates a new Promise that holds references to ALL promises in the array
2. Each `Array.from(inFlight)` creates a new array snapshot
3. The `.then()` callback on line 592-637 captures `filePath`, `result`, `chunkBuffer`, `flushPromise` in closure scope
4. Resolved promises in the Set are only deleted via `.finally()` (line 637), but the intermediate Promise.race references persist
5. V8 cannot garbage-collect the closure-captured variables until ALL promises in that race batch are settled

**Evidence from learnings.md:**

> "Async pipeline still OOMs due to V8 heap fragmentation from Promise.race/inFlight patterns"
> "BM25-only mode: 1330 files in 19.5s, 120MB peak RSS, 7182 chunks (vs OOM at 600 files with async pipeline)"

### Impact

- **OOM at 600+ files** when embedding mode is enabled
- RSS grows unbounded because closures retain file contents, parsed ASTs, and chunk buffers
- The `chunkBuffer.push(...result.chunks)` (line 619) accumulates in memory between flushes

### Recommended Fix

1. Replace `Promise.race(Array.from(inFlight))` with a semaphore/worker-pool pattern (e.g., `p-limit` or the existing Piscina pool)
2. Process files serially when memory is constrained (the sync fast-path already does this for BM25-only)
3. Break closure captures by extracting the `.then()` handler into a separate function that receives only needed data
4. Clear `result.chunks` after pushing to `chunkBuffer` to allow GC

---

## Severity 2 (HIGH): BM25 Index Unbounded Document Array

**File:** `C:\dev\projects\agent-studio\.claude\lib\code-indexing\bm25-indexer.cjs`
**Lines:** 91, 170-194

### Root Cause

The `BM25Indexer.documents` array stores ALL documents in memory with their `termFreqs` objects:

```javascript
// Line 91
this.documents = []; // Array of { id, text, tokens, length, termFreqs }

// Line 180 - Every document added to array with full termFreqs map
this.documents.push({
  id: doc.id,
  length: tokens.length,
  termFreqs, // Object with EVERY unique term -> count
});
```

**Why it leaks:**

- For 7000+ chunks (measured in production), each document stores a `termFreqs` object with potentially hundreds of unique terms
- The `_calculateIDF()` method (lines 134-152) creates a SECOND copy of all terms in the `this.idf` object
- `toJSON()` serializes the entire `documents` array + `idf` object into a massive JSON string
- `saveBM25Index()` calls `JSON.stringify(this.bm25Index.toJSON())` which creates yet another copy

### Impact

- Memory usage scales as O(D \* T) where D = documents and T = average unique terms per document
- For 7000 chunks with ~100 unique terms each: ~2.8M term entries in memory
- `JSON.stringify` during save doubles peak memory momentarily
- The `idf` object (line 146) grows with corpus vocabulary (every unique term across ALL documents)

### Recommended Fix

1. Implement incremental IDF calculation instead of full recalculation
2. Use a streaming JSON writer for `saveBM25Index()` to avoid double-copy
3. Consider using a term-id mapping to reduce string duplication in `termFreqs`
4. Add a document count limit with LRU eviction for the `documents` array

---

## Severity 3 (HIGH): Embedding Generator Unbounded Cache

**File:** `C:\dev\projects\agent-studio\.claude\lib\code-indexing\embedding-generator.cjs`
**Lines:** 50, 331-334

### Root Cause

The `EmbeddingGenerator` uses an unbounded `Map` for caching embeddings:

```javascript
// Line 50
this.cache = new Map();

// Lines 331-334 - Every embedding added to cache, never evicted
addToCache(text, embedding) {
  const key = this.getCacheKey(text);
  this.cache.set(key, embedding);
}
```

**Why it leaks:**

- Each embedding is a `number[]` of 384 floats = ~3KB per entry
- 7000 chunks = ~21MB of cached embeddings in memory
- The cache has NO eviction policy, NO max size
- `loadCache()` (lines 354-365) loads the ENTIRE cache JSON file into memory at initialization
- Cache keys are SHA-256 hashes (64 chars each), adding ~450KB for 7000 entries

### Impact

- Memory grows linearly with indexed files, never shrinks
- The `loadCache()` call parses a potentially multi-MB JSON file into a Map
- During `saveCache()`, `Object.fromEntries(this.cache)` + `JSON.stringify()` creates 2 full copies

### Recommended Fix

1. Add `maxSize` option to cache with LRU eviction
2. Use a streaming cache loader instead of `JSON.parse` of entire file
3. Consider persisting cache to a lighter format (e.g., binary or SQLite)
4. Add `this.cache.clear()` after saving to free memory when indexing is complete

---

## Severity 4 (MEDIUM): HybridLazyIndexer ripgrepCache Without Eviction

**File:** `C:\dev\projects\agent-studio\.claude\lib\code-indexing\hybrid-lazy-indexer.cjs`
**Lines:** 50, 181-185, 242

### Root Cause

The `HybridLazyIndexer` has an in-memory `ripgrepCache` Map with time-based freshness checks but NO size limit:

```javascript
// Line 50
this.ripgrepCache = new Map();

// Lines 181-185 - Cache checked by time but never evicted by size
const cached = this.ripgrepCache.get(cacheKey);
if (cached && Date.now() - cached.time < this.config.cacheExpiryMs) {
  return cached.results;
}

// Line 242 - New entries always added, old ones never removed
this.ripgrepCache.set(cacheKey, { results, time: Date.now() });
```

**Why it leaks:**

- Old entries are checked for staleness on READ, but stale entries are never proactively removed
- A unique query generates a new cache key: `rg:${query}:${options.limit}`
- Each cache entry stores the full ripgrep results array (file paths, match objects)
- The `embedQueue` (line 55) also accumulates without bound via `incrementalUpdate()`

### Impact

- Over a long session, the cache Map grows with every unique search query
- The `structureCache` (line 51) stores full project tree analysis and never expires until manually cleared
- `processEmbedQueue()` processes the queue but new entries can arrive faster than processing

### Recommended Fix

1. Add `maxSize` to `ripgrepCache` with LRU eviction (e.g., keep last 50 queries)
2. Add periodic cleanup sweep for stale entries (not just on read)
3. Add `maxLength` to `embedQueue` to prevent unbounded growth
4. Call `clearCache()` after major indexing operations

---

## Severity 5 (MEDIUM): EventBus Subscription Array Grows Without Cleanup

**File:** `C:\dev\projects\agent-studio\.claude\lib\events\event-bus.cjs`
**Lines:** 31, 92-93

### Root Cause

The EventBus singleton stores all subscriptions in an unbounded array:

```javascript
// Line 31
this.subscriptions = [];

// Lines 92-93 - Subscriptions pushed but rarely removed
this.subscriptions.push(subscription);
```

**Why it leaks:**

- The EventBus is a **singleton** (line 142: `const bus = new EventBus()`)
- Every `on()` call adds to `this.subscriptions` but there is no automatic cleanup
- The `once()` method (lines 102-108) does remove after first fire, but persistent subscriptions accumulate
- The `code-index-updater.cjs`, `spawn-prompt-assembler.cjs`, and other hooks call `eventBus.on()` or `eventBus.emit()` without corresponding `off()`
- `emit()` (lines 60-62) filters subscriptions on every call: `this.subscriptions.filter(sub => sub.eventType === eventType)` which creates a new array each time

### Impact

- Subscription array grows over session lifetime
- Each subscription object retains a reference to its handler closure
- Handler closures may capture outer scope variables (e.g., hook state, file paths)
- `emit()` creates temporary filtered/sorted arrays on every event

### Recommended Fix

1. Add subscription cleanup on session reset (subscribe/unsubscribe lifecycle)
2. Implement subscription deduplication (same event + same handler = reuse)
3. Add `maxSubscriptions` guard (the `setMaxListeners(100)` on line 34 only applies to the internal EventEmitter, not the subscriptions array)
4. Use WeakRef for subscription handlers where possible

---

## Severity 6 (LOW): MemoryVectorStore Shared Store Static Map

**File:** `C:\dev\projects\agent-studio\.claude\lib\memory\lancedb-client.cjs`
**Lines:** 137, 150-158

### Root Cause

```javascript
// Line 137 - Static Map on class, never cleared
static _sharedStores = new Map();

// Lines 150-158 - Stores created and cached permanently
static getSharedStore(config = {}) {
  const key = MemoryVectorStore._makeKey(config);
  if (MemoryVectorStore._sharedStores.has(key)) {
    return MemoryVectorStore._sharedStores.get(key);
  }
  const store = new MemoryVectorStore(config);
  store._shared = true;
  MemoryVectorStore._sharedStores.set(key, store);
  return store;
}
```

**Why it leaks:**

- Shared stores are never removed from the static Map
- Each store holds LanceDB connections, embedder model references, and table handles
- The `close()` method (lines 760-767) refuses to close shared stores: `if (this._shared) return;`
- Multiple callers can create stores with different config keys, each retained permanently

### Impact

- LOW: In practice, usually only 1-3 unique store configs exist
- Each store retains the transformer model (~50MB when loaded) in memory
- The LanceDB connection handle is retained even after the table is dropped

### Recommended Fix

1. Add `MemoryVectorStore.closeAll()` static method for session cleanup
2. Implement reference counting on shared stores
3. Allow `close()` on shared stores when reference count reaches 0

---

## Non-Leak Observations (Ruled Out)

### Hooks Execute Per-Process (No Cumulative State)

The hook system spawns a **new Node.js process** for each hook invocation. This means in-process state (like `_cachedRouterState` in `routing-guard.cjs` line 117) is ephemeral and does NOT accumulate across calls. The anomaly detector state is persisted to disk (`anomaly-state.json`), which has proper history limits (MAX_TOKEN_HISTORY=100, MAX_DURATION_HISTORY=100, MAX_PROMPT_PATTERNS=50).

### BM25-Only Sync Fast-Path is Memory-Safe

The sync fast-path (index-manager.cjs lines 447-518) that runs when `embeddingMode === 'off'` processes files one at a time synchronously. It does NOT use Promise.race or inFlight tracking. Memory usage is bounded. This is the currently recommended mode.

### File-Based State Files

`router-state.json`, `anomaly-state.json`, `workflow-state.json` are read-from-disk/write-to-disk per hook invocation. They do not accumulate in memory.

---

## Summary Table

| #   | Severity | Component              | File                           | Root Cause                                                         | Memory Impact                 |
| --- | -------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------ | ----------------------------- |
| 1   | CRITICAL | Async Index Pipeline   | index-manager.cjs:526-640      | Promise.race + closure capture retains file contents, ASTs, chunks | OOM at 600+ files             |
| 2   | HIGH     | BM25 Indexer           | bm25-indexer.cjs:91,170        | Unbounded documents array with termFreqs objects                   | O(D\*T) growth, ~2.8M entries |
| 3   | HIGH     | Embedding Cache        | embedding-generator.cjs:50,331 | Unbounded Map cache, no eviction, full JSON load                   | ~21MB for 7000 chunks         |
| 4   | MEDIUM   | Ripgrep Cache          | hybrid-lazy-indexer.cjs:50,242 | No size limit on search result cache                               | Grows with unique queries     |
| 5   | MEDIUM   | EventBus Subscriptions | event-bus.cjs:31,92            | Singleton array accumulates subscriptions                          | Grows over session lifetime   |
| 6   | LOW      | Shared Vector Stores   | lancedb-client.cjs:137,150     | Static Map never clears, close() blocked on shared                 | ~50MB per transformer model   |

---

## Recommended Priority Order

1. **Immediate (P0):** Keep `LANCEDB_EMBEDDING_MODE=off` (BM25-only sync fast-path) -- this avoids Severity 1 entirely
2. **Short-term (P1):** Add LRU eviction to EmbeddingGenerator cache and HybridLazyIndexer ripgrepCache
3. **Medium-term (P2):** Refactor async pipeline to use a bounded worker pool pattern instead of Promise.race
4. **Medium-term (P2):** Add streaming JSON serialization for BM25 index saves
5. **Long-term (P3):** Add EventBus subscription lifecycle management and shared store cleanup

---

## Verification Commands

```bash
# Check current embedding mode (should be 'off' for safety)
node -e "console.log(process.env.LANCEDB_EMBEDDING_MODE || 'not set')"

# Monitor memory during indexing
node --max-old-space-size=4096 --expose-gc -e "
  process.env.LANCEDB_EMBEDDING_MODE = 'off';
  const {IndexManager} = require('./.claude/lib/code-indexing/index-manager.cjs');
  const m = new IndexManager({ projectRoot: process.cwd(), verbose: true });
  m.indexDirectory(process.cwd()).then(r => console.log(r));
"

# Check BM25 index size on disk
# File: .claude/context/data/lancedb/bm25-index.json
```
