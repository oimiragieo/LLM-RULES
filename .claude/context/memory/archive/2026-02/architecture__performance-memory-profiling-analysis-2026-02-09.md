<!-- Agent: performance-engineer | Task: memory-profiling | Session: 2026-02-09 -->

# Memory Profiling Analysis: Agent-Studio OOM Investigation

**Date:** 2026-02-09
**Agent:** performance-engineer
**Methodology:** Static code analysis of memory allocation patterns, unbounded data structures, caching strategies, and process memory configuration across the entire codebase.

---

## Executive Summary

The agent-studio project has **6 CRITICAL**, **8 HIGH**, and **5 MEDIUM** memory risk areas. The primary OOM vectors are:

1. **BM25 indexer holding entire corpus in memory** (unbounded `this.documents[]` array)
2. **Embedding cache with no size limit** (`new Map()` growing without eviction)
3. **Async pipeline Promise.race heap fragmentation** (documented, known issue)
4. **14+ hook processes spawned per Write operation** (process overhead)
5. **Module-level caches in hooks without TTL or size bounds**
6. **LanceDB shared stores persisting in static Map across sessions**

Estimated memory budget under normal operation: **800MB-1.2GB RSS**
Estimated memory under code indexing: **2-8GB+ RSS** (OOM trigger)

---

## Memory Allocation Hotspot Map

### CRITICAL (OOM-causing, immediate attention required)

| #   | File                                                | Line(s) | Pattern                                                                                                                                                                                                                                             | Estimated Impact  |
| --- | --------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| C1  | `.claude/lib/code-indexing/bm25-indexer.cjs`        | 91      | `this.documents = []` grows unbounded; stores ALL document term frequencies in memory. No eviction, no max size. For 7000+ chunks each storing `termFreqs` objects, this is ~50-200MB.                                                              | **50-200MB**      |
| C2  | `.claude/lib/code-indexing/bm25-indexer.cjs`        | 92, 146 | `this.idf = {}` recalculated from all documents. IDF map size = unique terms across corpus. Typical codebase: 20K-100K unique terms.                                                                                                                | **10-50MB**       |
| C3  | `.claude/lib/code-indexing/index-manager.cjs`       | 526-638 | Async pipeline: `inFlight = new Set()` + `Promise.race(Array.from(inFlight))` causes V8 heap fragmentation. Documented to OOM at 600+ files. Each iteration creates new Promise wrappers, `.then()` closures retain `filePath` + `content` strings. | **2-8GB+ (OOM)**  |
| C4  | `.claude/lib/code-indexing/embedding-generator.cjs` | 50, 332 | `this.cache = new Map()` with no max size. Each entry = 64-byte SHA256 key + 384-float embedding (1536 bytes). At 7000 chunks = ~11MB minimum. Loaded from disk on init (line 360) and grows without eviction.                                      | **11-100MB**      |
| C5  | `.claude/lib/code-indexing/index-manager.cjs`       | 362     | `const fileHashes = {}` accumulates hash data for ALL indexed files. 10K files with chunk counts = ~5-10MB. Never freed during indexing.                                                                                                            | **5-10MB**        |
| C6  | `.claude/lib/code-indexing/vector-store.cjs`        | 176     | `JSON.stringify(this.bm25Index.toJSON())` serializes the ENTIRE BM25 index (all documents + IDF) to a single string. For a large corpus, this creates a temporary string of 50-200MB, doubling peak memory at serialization time.                   | **50-200MB peak** |

### HIGH (significant memory pressure, needs remediation)

| #   | File                                                | Line(s)      | Pattern                                                                                                                                                                                                                                                                        | Estimated Impact |
| --- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| H1  | `.claude/lib/code-indexing/hybrid-lazy-indexer.cjs` | 50           | `this.ripgrepCache = new Map()` with no max size. Cache key = query string, value = full search results. 30s TTL per entry but no maximum entries. Under heavy search load, can grow unbounded.                                                                                | **5-50MB**       |
| H2  | `.claude/lib/memory/lancedb-client.cjs`             | 137          | `static _sharedStores = new Map()` class-level static Map. Shared stores are never evicted. Each store holds DB connection + table references + embedder. Multiple callers (code-indexing VectorStore, contextual-memory, memory-extraction-writer) create persistent entries. | **20-50MB**      |
| H3  | `.claude/hooks/routing/spawn-prompt-assembler.cjs`  | 203-209, 945 | Module-level caches: `_registryCache`, `_manifestCache`, `_constitutionCache`, `_presetsCache` -- loaded from JSON files and never invalidated during session.                                                                                                                 | **2-10MB**       |
| H4  | `.claude/hooks/routing/user-prompt-unified.cjs`     | 86           | `let agentCache = null` -- module-level cache of agent registry, persists for entire session.                                                                                                                                                                                  | **1-5MB**        |
| H5  | `.claude/lib/events/event-bus.cjs`                  | 31, 34       | `this.subscriptions = []` with `setMaxListeners(100)`. Subscriptions accumulate via `on()` but `off()` is rarely called. Each `emit()` filters ALL subscriptions (O(n) scan).                                                                                                  | **1-5MB**        |
| H6  | `.claude/lib/workflow/state-sync-manager.cjs`       | 13, 15       | `this.syncHistory = []` with `maxHistorySize: 1000` and `this.vectorClocks = new Map()`. Plus `this.systems` with 2 nested Maps. History bounded but vectorClocks are not.                                                                                                     | **2-10MB**       |
| H7  | `.claude/lib/code-indexing/code-parser.cjs`         | 50-51        | `this.grammars = new Map()` and `this.parsers = new Map()` -- tree-sitter parsers are native objects with significant memory footprint. Each language grammar = 5-20MB of native memory.                                                                                       | **10-80MB**      |
| H8  | `.claude/lib/code-indexing/index-manager.cjs`       | 366          | `const chunkBuffer = []` accumulates parsed chunks before flush. Flush threshold is 50 chunks. Each chunk contains `content` (source code string), `filePath`, `metadata`. During async pipeline, buffer can grow beyond flush size due to race conditions.                    | **10-50MB**      |

### MEDIUM (gradual growth, monitor and mitigate)

| #   | File                                                | Line(s) | Pattern                                                                                                                                                                       | Estimated Impact        |
| --- | --------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| M1  | `.claude/lib/code-indexing/hybrid-lazy-indexer.cjs` | 55      | `this.embedQueue = []` -- unbounded queue for background embedding. Files added via `incrementalUpdate()` without queue size check. Under burst of edits, queue grows.        | **1-20MB**              |
| M2  | `.claude/lib/utils/memory-monitor.cjs`              | 98      | `this.memoryHistory = []` bounded to 100 entries. Each entry has 7 numeric fields. Properly bounded.                                                                          | **< 1MB**               |
| M3  | `.claude/lib/error-pattern-detector.cjs`            | 50+     | Multiple `new Map()` instances created per analysis call (not cached). Has `MAX_INPUT_ERRORS = 10000` safety limit. Properly bounded per call but could be called repeatedly. | **1-5MB per call**      |
| M4  | `.claude/hooks/routing/code-index-updater.cjs`      | 331     | `debounceTimer = setTimeout(...)` -- single timer, properly cleared. But the hook is invoked on every Write/Edit, spawning a full Node.js process each time.                  | **10-30MB per process** |
| M5  | `.claude/lib/workflow/task-cleanup-manager.cjs`     | 168     | `this.cleanupTimer = setInterval(...)` -- properly cleaned up in `stop()`. Timer reference prevents GC if not stopped.                                                        | **< 1MB**               |

---

## Subsystem Analysis

### 1. Code Indexing Subsystem (`.claude/lib/code-indexing/`)

**Memory budget needed:** 500MB-2GB minimum for full reindex

**Architecture:**

```
IndexManager
  +-- CodeParser (tree-sitter grammars: 10-80MB native)
  +-- SemanticChunker (stateless, low memory)
  +-- VectorStore
  |     +-- MemoryVectorStore (LanceDB: disk-backed, low memory)
  |     +-- BM25Indexer (ALL documents in RAM: 50-200MB)
  +-- MerkleTree (built per-run, ~5MB)
  +-- Piscina worker pool (1-4 workers, each with resource limits)
```

**Critical Path (BM25-only mode, proven stable):**

- Sync fast-path at line 447-518 processes files sequentially
- Simple 50-line chunking (no AST)
- Result: 1330 files in 19.5s, 120MB peak RSS, 7182 chunks
- BM25 save every 500 files prevents memory buildup in IDF

**Dangerous Path (Async pipeline with embeddings):**

- Lines 523-648: `inFlight` Set + `Promise.race` pattern
- Each iteration: `runOne()` reads file content into memory, parses via worker/in-process
- `.then()` closures retain references to `filePath`, `content`, `result`
- `chunkBuffer` grows between flushes
- Documented to OOM at 600 files due to V8 heap fragmentation from `Promise.race`

**Specific Unbounded Growth Points:**

1. **BM25Indexer.documents[]** (line 91): Each call to `addDocuments()` pushes new entries. Over a full reindex of 7000+ chunks, this array holds all document metadata. The `termFreqs` object per document can have hundreds of unique terms. No eviction, no max size, no streaming.

2. **BM25Indexer.idf{}** (line 146): Recalculated from scratch via `_calculateIDF()`. Iterates all documents twice (once for df, once for idf). For 7000 docs with ~50K unique terms, creates a 50K-entry object.

3. **BM25 serialization** (vector-store.cjs:176): `JSON.stringify(this.bm25Index.toJSON())` creates a string representation of the entire BM25 index. At 7000 docs, this string can be 50-200MB, temporarily doubling memory usage during save.

4. **EmbeddingGenerator.cache** (embedding-generator.cjs:50): `new Map()` with SHA256 keys and 384-float arrays. Loaded from disk on init. No max size. Each entry = ~1.6KB. At 7000 chunks = ~11MB minimum, but grows without limit as new texts are embedded.

### 2. Hook Execution System (`.claude/hooks/`)

**Per-hook invocation cost:** Each hook is a separate Node.js process spawned via stdin/stdout JSON protocol.

**Current hook execution per Write operation:**

| Hook                       | File Size (lines) | Memory per invocation |
| -------------------------- | ----------------- | --------------------- |
| routing-guard.cjs          | 2126 lines        | ~30-50MB RSS          |
| spawn-prompt-assembler.cjs | 1074 lines        | ~20-40MB RSS          |
| user-prompt-unified.cjs    | 1659 lines        | ~25-45MB RSS          |
| pre-tool-unified.cjs       | 598 lines         | ~15-25MB RSS          |
| unified-creator-guard.cjs  | 701 lines         | ~15-30MB RSS          |
| code-index-updater.cjs     | ~350 lines        | ~15-25MB RSS          |

**Total per Write operation:** 6+ hooks = **120-215MB RSS** in transient process memory.

**Module-level caches in hooks (persist within process lifetime):**

- `spawn-prompt-assembler.cjs`: 4 module-level caches (`_registryCache`, `_manifestCache`, `_constitutionCache`, `_presetsCache`) -- never invalidated
- `user-prompt-unified.cjs`: `agentCache` -- never invalidated
- `unified-creator-guard.cjs`: reads/writes state JSON files on every invocation

Since hooks are short-lived processes (they exit after handling one event), these caches are recreated on every invocation, wasting startup time without memory accumulation. However, each invocation requires loading the entire module graph, including `require()` chains.

### 3. Memory Management Subsystem (`.claude/lib/memory/`)

**LanceDB Client (lancedb-client.cjs):**

- `static _sharedStores = new Map()` at line 137: Class-level singleton map
- Never cleared during session
- Multiple consumers: code-indexing VectorStore, contextual-memory, memory-extraction-writer
- Each store instance holds: DB connection, table reference, embedder pipeline (if initialized)
- The `@xenova/transformers` model is ~25MB when loaded

**Contextual Memory (contextual-memory.cjs):**

- SQLite database via `DatabaseSync` (node:sqlite) -- disk-backed, low memory impact
- Access stats loaded from JSON file, bounded by entry count
- `Buffer.alloc(stat.size - start)` at line 801: Allocates buffer based on file size -- safe for typical memory files (< 20KB) but vulnerable if memory files grow unbounded

### 4. Event Bus (`.claude/lib/events/event-bus.cjs`)

- Singleton pattern (module-level `const bus = new EventBus()`)
- `this.subscriptions = []` grows via `on()`, shrinks only via explicit `off()` calls
- `setMaxListeners(100)` allows up to 100 listeners without warning
- `registerDefaultSinks(bus)` adds sinks on first import
- Each `emit()` iterates ALL subscriptions (O(n) filter)
- **Risk:** If sinks register listeners and never unregister, subscriptions array grows across session

### 5. Workflow Managers

**StateSyncManager (state-sync-manager.cjs):**

- `this.syncHistory = []` bounded at 1000 entries
- `this.vectorClocks = new Map()` -- unbounded, one entry per task ID
- `this.systems` has 2 Maps, one entry per task
- `backgroundSyncInterval` at line 321: `setInterval()` running periodically

**TaskCleanupManager (task-cleanup-manager.cjs):**

- Properly bounded with retention period and batch size
- `setInterval()` properly cleaned up in `stop()`
- Low risk

---

## Node.js Process Memory Configuration

**Current configuration found in package.json:**

| Script               | Heap Limit               | Expose GC |
| -------------------- | ------------------------ | --------- |
| `validate`           | 4096MB                   | Yes       |
| `validate:full`      | 4096MB                   | Yes       |
| `code:index:reindex` | **32768MB (32GB!)**      | No        |
| All other scripts    | Default (~4GB on 64-bit) | No        |

**Analysis:**

- The `code:index:reindex` script requests 32GB heap, suggesting OOM was so severe that a massive heap was the workaround
- Validation scripts request 4GB + `--expose-gc`, indicating they also hit memory pressure
- No `--max-old-space-size` on the actual tool/hook processes
- No `NODE_OPTIONS` environment variable set by default in `.env.example` (commented out at line 668)

---

## Dependency Memory Analysis

| Dependency               | Category    | Memory Footprint | Notes                            |
| ------------------------ | ----------- | ---------------- | -------------------------------- |
| `@lancedb/lancedb`       | Vector DB   | 50-100MB         | Native bindings, disk-backed     |
| `@xenova/transformers`   | ML Model    | 25-100MB         | Model weights loaded into memory |
| `tree-sitter` + grammars | Parser      | 10-80MB          | Native objects, one per language |
| `sharp`                  | Image       | 30-50MB          | Native libvips bindings          |
| `fastembed`              | ML          | 20-50MB          | Alternative embedding engine     |
| `onnxruntime-node-gpu`   | ML Runtime  | 100-500MB        | Optional GPU runtime             |
| `piscina`                | Worker Pool | 50-200MB         | Per worker thread (up to 4)      |
| `ajv` + `ajv-formats`    | Schema      | 5-10MB           | Schema compilation cache         |

**High-risk combinations:**

- `@xenova/transformers` + `tree-sitter` + `piscina` workers = 200-500MB baseline before indexing starts
- `onnxruntime-node-gpu` (optional) adds 100-500MB if CUDA detected
- `sharp` loaded even though project has no image processing needs (memory overhead for nothing)

---

## Recommended Memory Budget and Limits

### Per-Subsystem Budgets

| Subsystem                    | Current Estimated | Recommended Budget | Enforcement Mechanism                     |
| ---------------------------- | ----------------- | ------------------ | ----------------------------------------- |
| Code Indexing (BM25)         | 50-200MB          | **100MB max**      | Add `maxDocuments` limit to BM25Indexer   |
| Code Indexing (Embeddings)   | 25-100MB          | **50MB max**       | LRU cache with 5000-entry limit           |
| Code Indexing (Pipeline)     | 2-8GB+            | **500MB max**      | Streaming pipeline, no batch accumulation |
| Hook Execution (per hook)    | 15-50MB           | **30MB max**       | Already short-lived processes             |
| Event Bus                    | 1-5MB             | **2MB max**        | Subscription limit + automatic cleanup    |
| Memory System                | 20-50MB           | **30MB max**       | Bounded query results                     |
| Workflow Managers            | 2-10MB            | **5MB max**        | Bounded Maps with LRU eviction            |
| Dependencies (ML)            | 50-500MB          | **150MB max**      | Lazy loading, unload when idle            |
| **Total (normal operation)** | **200MB-1GB**     | **400MB target**   |                                           |
| **Total (during indexing)**  | **2-8GB+**        | **800MB target**   |                                           |

### Specific Code Fixes Required

**P0 -- OOM Prevention (fix immediately):**

1. **BM25Indexer: Add max document limit**
   - File: `bm25-indexer.cjs` line 86
   - Add: `this.maxDocuments = options.maxDocuments || 50000;`
   - In `addDocuments()`: check length, evict oldest if exceeded
   - In `toJSON()`: stream serialize instead of `JSON.stringify` of entire object

2. **BM25 serialization: Use streaming write**
   - File: `vector-store.cjs` line 176
   - Replace: `fs.writeFileSync(tempPath, JSON.stringify(this.bm25Index.toJSON()))`
   - With: Stream-based JSON serialization (write `documents` array in batches)

3. **EmbeddingGenerator: Add LRU cache with max size**
   - File: `embedding-generator.cjs` line 50
   - Replace: `this.cache = new Map()`
   - With: LRU cache limited to 10000 entries (or use a `Map` with FIFO eviction)

4. **Async pipeline: Replace Promise.race pattern**
   - File: `index-manager.cjs` lines 523-648
   - Replace `Promise.race(Array.from(inFlight))` with sequential batch processing
   - Or: Use the proven BM25-only sync fast-path (lines 447-518) for all modes

**P1 -- Memory pressure reduction (fix this sprint):**

5. **HybridLazyIndexer: Add max cache size for ripgrepCache**
   - File: `hybrid-lazy-indexer.cjs` line 50
   - Add max entries (e.g., 100) with LRU eviction

6. **LanceDB shared stores: Add cleanup method**
   - File: `lancedb-client.cjs` line 137
   - Add `static clearUnusedStores()` method
   - Call on session end or when memory pressure detected

7. **Hook module caches: Add TTL-based invalidation**
   - Files: `spawn-prompt-assembler.cjs`, `user-prompt-unified.cjs`
   - Add timestamp to cache, invalidate after 5 minutes
   - (Lower priority since hooks are short-lived processes)

8. **EventBus: Add subscription leak detection**
   - File: `event-bus.cjs`
   - Log warning when subscriptions exceed 50
   - Add `removeAllListeners(eventType)` method

**P2 -- Optimization (address in next sprint):**

9. **Remove `sharp` dependency if not used for image processing**
10. **Make tree-sitter grammar loading lazy (only load for detected languages)**
11. **Add `--max-old-space-size=2048` to hook processes via NODE_OPTIONS**
12. **Add memory reporting to CI pipeline (track RSS over time)**

---

## Patterns That Could Cause Unbounded Growth

### Pattern 1: Cache Without Eviction (3 instances)

```javascript
// DANGEROUS: Map grows without limit
this.cache = new Map();              // embedding-generator.cjs:50
this.ripgrepCache = new Map();       // hybrid-lazy-indexer.cjs:50
static _sharedStores = new Map();    // lancedb-client.cjs:137
```

**Fix:** Replace with LRU cache or add max size check.

### Pattern 2: Array Accumulation Without Bounds (2 instances)

```javascript
// DANGEROUS: Array grows with every document
this.documents = []; // bm25-indexer.cjs:91
this.embedQueue = []; // hybrid-lazy-indexer.cjs:55
```

**Fix:** Add `maxDocuments` limit; add `maxQueueSize` with backpressure.

### Pattern 3: Serialization of Large In-Memory Structures

```javascript
// DANGEROUS: Creates string copy of entire structure
JSON.stringify(this.bm25Index.toJSON()); // vector-store.cjs:176
```

At 7000 documents with term frequency maps, the JSON string alone can be 50-200MB. Combined with the live data structure, peak memory doubles during serialization.

**Fix:** Use streaming JSON writer or serialize in chunks.

### Pattern 4: Promise.race with Growing Set (1 instance)

```javascript
// DANGEROUS: V8 heap fragmentation
const inFlight = new Set();
while (inFlight.size >= concurrency) {
  await Promise.race(Array.from(inFlight)); // index-manager.cjs:585-587
}
```

`Array.from(inFlight)` creates a new array on each iteration. `Promise.race` creates wrapper promises. Combined with `.then()` closures retaining file content, this fragments the V8 heap and prevents GC from reclaiming memory.

**Fix:** Use a bounded semaphore pattern instead of Promise.race with Set.

### Pattern 5: Module-Level Singletons (4 instances)

```javascript
// These persist for entire session/process lifetime
const bus = new EventBus(); // event-bus.cjs:142
let globalMonitor = null; // memory-monitor.cjs:410
let _registryCache = null; // spawn-prompt-assembler.cjs:203
let agentCache = null; // user-prompt-unified.cjs:86
```

Module-level singletons prevent garbage collection of their internal state. The EventBus subscriptions array and the MemoryMonitor history array are the primary risks.

**Fix:** Add cleanup methods; call on session end; add max size bounds.

---

## Summary of Findings

| Severity | Count | Top Issue                                                           |
| -------- | ----- | ------------------------------------------------------------------- |
| CRITICAL | 6     | BM25 unbounded documents array + serialization doubles memory       |
| HIGH     | 8     | Embedding cache without eviction, async pipeline heap fragmentation |
| MEDIUM   | 5     | Module-level caches, timer references, queue growth                 |

**Root Cause of OOM:** The code indexing subsystem loads the ENTIRE BM25 corpus into RAM (`this.documents[]` with term frequency maps), then serializes it to JSON as a single string (doubling peak memory), while simultaneously running an async pipeline that fragments the V8 heap through `Promise.race` patterns. A 7000-chunk corpus can require 400-800MB for BM25 alone, and the serialization spike can push total to 1-2GB. Combined with tree-sitter grammars (10-80MB) and ML models (25-100MB), the total easily exceeds the default 4GB heap limit.

The BM25-only sync fast-path (120MB peak for 1330 files) proves that the architecture CAN work within reasonable memory bounds. The async pipeline with embeddings is the primary OOM vector.

---

## Measurement Methodology

This analysis was conducted via static code analysis:

1. **Pattern detection**: Searched for `new Map()`, `new Set()`, `= []`, `= {}` patterns in all `.claude/lib/` and `.claude/hooks/` files
2. **Growth analysis**: Traced all `push()`, `set()`, `add()` calls to identify unbounded growth
3. **Cache audit**: Identified all caching patterns and verified presence/absence of eviction
4. **Timer audit**: Searched for `setInterval`/`setTimeout` and verified cleanup patterns
5. **Process audit**: Counted hook processes per tool operation via settings.json registration
6. **Dependency audit**: Reviewed package.json for known memory-heavy packages
7. **Configuration audit**: Searched for `--max-old-space-size` and heap configuration

**Next Steps:**

1. Implement P0 fixes (BM25 bounds, streaming serialization, LRU embedding cache)
2. Run `--expose-gc` + `--trace-gc` profiling on `code:index:reindex` to validate fix impact
3. Add heap snapshot comparison (before/after) for each P0 fix
4. Establish automated memory regression testing (fail if RSS exceeds 800MB during indexing)
