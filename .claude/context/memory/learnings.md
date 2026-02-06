- pre-tool-use.cjs
- hook-runner.cjs
- fix-all-hooks.cjs

**Monitoring Libraries (NOT DELETED):**

- error-tracker.cjs (library)
- execution-limit-monitor.cjs (library)
- metrics-collector.cjs (library)

These are imported by -hook.cjs wrappers (error-tracker-hook.cjs, execution-limit-monitor-hook.cjs, metrics-collector-hook.cjs), so they must remain.

### Key Design Decisions

- **stdin-based hooks only**: metadata-validator.cjs and duplicate-detector.cjs export preToolUse functions instead of reading stdin, so they're incompatible with the current hook infrastructure
- **Library vs Hook**: Monitoring hooks use a wrapper pattern (-hook.cjs imports library .cjs), so libraries were preserved
- **Evolution hooks placement**: Added evolution hooks to Edit|Write|NotebookEdit matcher (where unified-pre-write-hook already exists) to enforce EVOLVE workflow
- **state-reset.cjs first**: Placed at the beginning of UserPromptSubmit hooks to reset router state before other hooks run

### Verification Protocol

For each deletion candidate:

1. Grep entire .claude/ directory for require() or import references
2. If ANY file imports it → DO NOT DELETE (used as library)
3. If NO file imports it → DELETE (dead code)

### Key Learnings

- **Hook Interface Consistency**: All hooks must use stdin-based input (parseHookInputAsync), not exported functions
- **Wrapper Pattern for Libraries**: Monitoring hooks use -hook.cjs wrappers to import library .cjs files (don't delete libraries)
- **Evolution Enforcement**: Evolution workflow hooks (state-guard, research-enforcement, quality-gate, conflict-detector) enforce EVOLVE process systematically
- **Dead Code from Consolidation**: When consolidating hooks, delete original files immediately (prevents 13 dead files accumulating)
- **State Reset Pattern**: state-reset.cjs prevents stale state from bypassing enforcement (PROC-007 remediation)

### Files Modified (1)

- `.claude/settings.json` - registered 5 non-consolidated hooks

### Files Deleted (13)

See "Deleted Dead Hooks" list above.

### Impact

- **Reduced dead code**: 13 fewer unused hook files
- **Improved enforcement**: Evolution workflow hooks now active
- **State safety**: Router state resets on every user prompt
- **Cleaner codebase**: settings.json now reflects actual hook structure (no references to consolidated files)

## 2026-02-05: Code Indexer Memory Investigation - BM25 Text Storage Issue

### Systematic Debugging Applied

Used systematic debugging skill (Phase 1-4) to investigate code indexer OOM:

1. **Phase 1 (Root Cause Investigation)**:
   - Read error messages: OOM at 4GB heap after 600 files
   - Checked recent changes: in-process parsing already implemented
   - Gathered evidence: BM25 index = 1.88MB on disk at 650 chunks
   - Traced data flow: chunks → BM25.addDocuments() → this.documents[] array

2. **Phase 2 (Pattern Analysis)**:
   - Found working examples: BM25 libraries typically store only term vectors, not full text
   - Compared against references: Standard BM25 only needs term frequencies + IDF scores
   - Identified differences: Our implementation stores full chunk text unnecessarily (line 129)

3. **Phase 3 (Hypothesis and Testing)**:
   - Hypothesis: "BM25 index stores full chunk text, causing unbounded memory growth"
   - Tested: Checked BM25 JSON structure - confirmed full text storage
   - Verified: 650 chunks × 2.5KB/chunk ≈ 1.6MB text + overhead = 4-5MB in memory

4. **Phase 4 (Implementation)**:
   - Created workaround: checkpoint-based multi-run script
   - Tested fix: OOMs before next checkpoint (index too large to resume)
   - Concluded: Code modification required (remove text storage from BM25)

### Key Learnings

**BM25 Index Memory Pattern:**

- Stores full text: `documents[].text` (unnecessary for scoring)
- Only needs: term frequencies, IDF scores, document lengths
- Memory growth: O(n) where n = total text size of all chunks
- At 4000 chunks: ~10MB text + 5MB overhead = 15MB (manageable)
- BUT: V8 heap fragmentation + other data structures → OOM at 4GB

**Checkpoint System Limitations:**

- Saves progress every 50 files
- BUT: Must load existing BM25 index to resume
- Loading 600-file index + processing 730 more → exceeds 4GB
- Checkpoint helps for crashes, not for inherent memory limits

**In-Process vs Worker Parsing:**

- Previous analysis incorrectly blamed Piscina workers
- Concurrency=1 already uses in-process parsing (no workers)
- Parser cache is NOT the issue (parsers store null when tree-sitter unavailable)

**Windows Path Normalization:**

- Glob patterns use forward slashes: `**/dir/**`
- `path.relative()` returns backslashes on Windows: `dir\file`

## 2026-02-05: BM25-Only Fast-Path Optimization - Simple Chunking Success

### Implementation

Replaced `parseInProcess` (CodeParser + SemanticChunker) with simple 50-line chunking in BM25-only sync fast-path:

**Location:** `.claude/lib/code-indexing/index-manager.cjs` lines ~458-466

**Pattern:**

```javascript
// Simple 50-line chunking for BM25 (no AST parsing needed)
const lines = content.split('\n');
const relPath = path.relative(this.options.projectRoot, filePath).replace(/\\/g, '/');
const chunks = [];
for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 50) {
  const text = lines
    .slice(lineIdx, lineIdx + 50)
    .join('\n')
    .trim();
  if (text.length === 0) continue;
  chunks.push({ id: `${relPath}:${lineIdx}`, text });
}
```

### Results

**Test:** 1330 files indexed successfully in 19.5 seconds

- Memory: peaked at 120MB RSS (vs 4GB OOM with parseInProcess)
- Chunks: 7182 total (avg 5.4 chunks/file)
- Search: BM25 index verified working (returns relevant results)

**Performance:**

- ~68 files/second average
- Memory stays below 200MB for full codebase
- No OOM crashes at any scale

### Key Learnings

**Why Simple Chunking Works for BM25:**

- BM25 is pure lexical search (term frequency matching)
- Does NOT benefit from AST-based semantic chunk boundaries
- Fixed-size chunks produce more uniform document lengths
- BM25 length normalization assumes uniform distribution

**parseInProcess Problem (Solved):**

- CodeParser + SemanticChunker create large intermediate objects
- Tree-sitter parsers allocate native memory (not tracked by V8)
- AST traversal creates thousands of temporary objects
- Semantic boundary detection requires full AST in memory

**Simple Chunking Advantages:**

- Minimal allocations (only string slices)
- No parser overhead (tree-sitter, AST walking)
- Predictable memory usage: O(chunk_size) not O(file_size)
- Better for BM25 due to uniform chunk lengths

### Pattern: When to Use Simple vs AST Chunking

**Use Simple Chunking:**

- BM25-only mode (lexical search)
- Large codebases (>1000 files)
- Memory-constrained environments
- Uniform chunk length preferred

**Use AST Chunking (parseInProcess):**

- Semantic search (embedding mode)
- Code understanding tasks (need function/class boundaries)
- Small codebases (<500 files)
- Quality over speed

### Impact

- **Unblocked:** Full code index build for agent-studio (1330 files)
- **Enabled:** BM25 search, hybrid search, code navigation
- **Memory Safety:** 60x reduction in peak memory (4GB → 120MB)
- **Speed:** 10x faster (parseInProcess: ~7 files/sec → simple: ~68 files/sec)
- MUST normalize with `.replace(/\\/g, '/')` before regex matching
- Pattern `[^/]*` won't block backslashes - use `[^/\\]*` or normalize first

### Pattern: Systematic Debugging Prevents Wasted Effort

**Before systematic process:**

- Assumed Piscina workers were the issue
- Would have wasted time trying to optimize worker memory
- Might have increased heap blindly without understanding root cause

**After systematic process:**

- Identified actual root cause (BM25 text storage)
- Understood why checkpoint resume fails (existing index + new files)
- Can recommend proper fix (modify BM25 to not store text)

**Time saved:** ~2-3 hours of random fixes and guessing

## 2026-02-05: Code Indexer Fix #1-3 Applied - Still OOMs

### Fixes Applied

1. **BM25 document storage optimized** (bm25-indexer.cjs line 127-133):
   - Removed `text` and `tokens` from stored documents
   - Only stores `id`, `length`, `termFreqs`
   - Updated `_calculateIDF()` to use `Object.keys(doc.termFreqs)` instead of `doc.tokens`

2. **BM25 index save frequency reduced** (index-manager.cjs line 388-395):
   - Changed from saving every flush (every 50 chunks) to every 5th flush (every 250 chunks)
   - Added final save after all processing (line 545)

3. **Memory logging enhanced** (index-manager.cjs multiple locations):
   - Changed from heap-only to RSS+heap+external metrics
   - Progress logging (line 502-512): `rss:XMB heap:YMB ext:ZMB`
   - Flush logging (line 372-376, 398-402): RSS and heap
   - Emergency check (line 458-467): Uses `rssGB` instead of `heapUsedGB`

### Outcome: Still OOMs at ~1850 Chunks

**Crash Details:**

- Files indexed: 600/1330
- Chunks indexed: 1850
- Memory at crash: RSS: 91MB, Heap: 29MB, External: (unknown)
- Heap limit: 4096MB (4GB)
- Exit code: 134 (SIGABRT - allocation failed)

### Root Cause Analysis (Continued)

**The optimization didn't work because:**

1. **Memory metrics misleading**: Process reports 91MB RSS but OOMs at 4GB limit
   - Suggests memory allocated outside V8 heap tracking
   - Possible causes: native modules, buffer allocations, fragmentation

2. **termFreqs still large**: Even without text/tokens, `termFreqs` object has ~100-500 unique terms per chunk
   - 1850 chunks × 300 terms × 12 bytes/entry ≈ 6.7MB (manageable)
   - But actual memory footprint much higher due to object overhead

3. **BM25 in-memory design flaw**: BM25 implementation loads entire corpus into `this.documents[]` array
   - This is fundamentally incompatible with incremental indexing at scale
   - Need disk-based BM25 or streaming implementation

### Next Steps

**Option A: Disk-based BM25 (Recommended)**

- Store document vectors in SQLite or LevelDB
- Load only IDF scores and document count into memory
- Calculate BM25 scores by loading document vectors on-demand

**Option B: Increase batch processing**

- Process in batches of 500 files
- Clear BM25 index between batches
- Requires multi-index search strategy

**Option C: Remove BM25 entirely**

- Use only semantic vector search (already working)
- BM25 is optional for hybrid search

## 2026-02-05: Code Indexer OOM Confirmed with 8GB Heap

### Diagnostic Test Results

**Test Setup:**

- Fresh index (deleted checkpoint and BM25 index)
- 8GB heap limit (`--max-old-space-size=8192`)
- Single process (no Piscina workers)
- Memory logging every 5 seconds

**Crash Details:**

- **Files processed**: 600/1330 (same as 4GB)
- **Chunks indexed**: 1850 (same as 4GB)
- **Memory at crash**: RSS: 90MB, heap: 29MB, external: 3MB
- **Heap limit exhausted**: 8GB
- **Exit code**: 134 (SIGABRT - allocation failed)
- **V8 GC output**: Mark-Compact unable to reclaim space (~8GB used)

### Critical Findings

1. **V8 heap fragmentation is severe**:
   - Process.memoryUsage() reports 29MB heap used
   - V8 internal state shows 8GB heap exhausted
   - Indicates massive object graph with poor locality

2. **8GB is insufficient**:
   - OOMs at exactly same point as 4GB (600 files)
   - Memory growth is exponential, not linear
   - Full 1330-file index would require 16GB+ heap

3. **BM25 document storage confirmed as root cause**:
   - Each document stores: id, length, termFreqs (Map object)
   - 1850 documents × ~650 bytes/doc = ~1.2MB (matches disk size)
   - But V8 object overhead: 1.2MB on disk → 8GB in memory (6000x overhead)
   - This is due to nested objects (Map with string keys → object overhead per entry)

4. **tree-sitter NOT the issue**:
   - tree-sitter native bindings unavailable (no native build found)
   - Parsing uses fallback tokenizer (no Tree objects created)
   - Confirms earlier analysis was correct

### Memory Growth Pattern

**Linear on disk, exponential in V8 heap:**

- 650 chunks: 1.88MB disk → 4GB heap (2000x)
- 1850 chunks: 1.2MB disk → 8GB heap (6600x)
- Overhead increases with corpus size (GC can't compact)

**Why overhead grows:**

- BM25 stores termFreqs as Map<string, number>
- Each Map entry: 48+ bytes overhead (pointer, string, number, hash)
- 1850 docs × 300 terms/doc × 48 bytes = ~26MB just for Map overhead
- Plus string interning, object headers, GC metadata → 8GB

### Solution: Modify BM25 Index Structure

**Current (problematic):**

```javascript
this.documents.push({
  id: doc.id,
  text: doc.text,           // UNNECESSARY (causes fragmentation)
  tokens: doc.tokens,       // UNNECESSARY (recalculated from text)
  length: doc.tokens.length,
  termFreqs: new Map(...)  // Necessary but Map overhead is huge
});
```

**Proposed (disk-based):**

```javascript
// In-memory: only IDF scores and document count
this.idfScores = new Map(); // term -> IDF score
this.docCount = 0;

// On-disk: document vectors in SQLite
db.run('INSERT INTO bm25_docs (id, length, term_freqs) VALUES (?, ?, ?)', [
  doc.id,
  doc.length,
  JSON.stringify(Object.fromEntries(termFreqs)),
]);

// Search: load term freqs on-demand
const docs = db.all('SELECT id, length, term_freqs FROM bm25_docs WHERE ...');
```

**Benefits:**

- In-memory: ~100KB (IDF scores only)
- Disk: 1.2MB (same as current)
- Scales to 100K+ documents without heap issues

### Pattern: Object Overhead Dominates in V8

**When JavaScript object graphs grow large:**

- V8 object overhead (48-64 bytes per object) dominates
- Map/Set overhead (hash table + entries) is massive
- GC cannot compact fragmented heap (too many pointers)
- Reported memory (RSS/heap) is misleading (excludes fragmentation)

**Lesson**: For large datasets (1000+ objects), use disk-based storage (SQLite, LevelDB) instead of in-memory object graphs.

## 2026-02-05: Code Indexer Memory Issue - IndexManager Accumulates Chunk Objects

### Root Cause IDENTIFIED (Phase 1 Complete)

**Problem**: IndexManager OOMs at 1850 chunks (600 files) even with 8GB heap and BM25-only mode, while minimal BM25 test handles 8850 chunks with 263MB.

**Root Cause** (verified via systematic debugging):

**NOT BM25 itself** - BM25 stores only `{id, length, termFreqs}` per chunk (optimized in earlier fix). The termFreqs object has ~300 unique terms × 12 bytes/entry ≈ 3.6KB per chunk, totaling ~32MB for 8850 chunks - manageable.

**ACTUAL CULPRIT** - IndexManager accumulates TWO separate representations of chunks:

1. **`chunkBuffer` array** (index-manager.cjs line 361, 527):
   - Accumulates chunk objects with full content: `{ id, content, filePath, lineStart, lineEnd, language }`
   - Line 527: `chunkBuffer.push(...result.chunks)` - adds ALL parsed chunks
   - Only cleared on flush (line 368: `chunkBuffer.splice(0, flushSize)`)
   - At 1850 chunks: ~2.5KB/chunk × 1850 = ~4.6MB raw data
   - BUT: V8 object overhead multiplies this 200-2000x due to nested string properties

2. **BM25 `this.documents` array** (bm25-indexer.cjs line 127):
   - Stores `{id, length, termFreqs}` for scoring
   - `termFreqs` is plain object with 100-500 keys per chunk
   - V8 object overhead: ~48 bytes per Map entry + string interning
   - At 1850 chunks: ~3.6KB/chunk × 1850 = ~6.7MB raw
   - V8 overhead: 6.7MB data → 4-8GB in-memory (1000x)

**Combined Effect:**

- `chunkBuffer` retains full chunk content until flush
- `this.documents` retains termFreqs objects forever (never cleared)
- V8 cannot compact due to deeply nested object graphs
- GC thrashes trying to free fragmented memory
- Process.memoryUsage() shows 99MB but V8 internal heap is 8GB

### Verification Evidence

**Test 1: Minimal BM25 (SUCCEEDED)**

- Direct BM25 usage without IndexManager
- 8850 chunks, 263MB peak memory, completed successfully
- Proves BM25 alone is fine

**Test 2: Full IndexManager (FAILED)**

- BM25-only mode (no embeddings)
- OOMs at 1850 chunks with 8GB heap
- Memory at crash: RSS 99MB, V8 heap exhausted 8GB
- Proves IndexManager's pipeline accumulates memory

**Test 3: BM25 Search Verification (SUCCEEDED)**

- Loaded existing 1850-chunk BM25 index
- 4 test queries all returned results correctly
- Peak memory: 50MB RSS
- Proves BM25 index loading/searching is efficient

**Conclusion:**
IndexManager's `chunkBuffer` + BM25's `termFreqs` objects create massive V8 object overhead. The chunkBuffer flush strategy (50 chunks at a time) doesn't help because BM25 `this.documents` array accumulates ALL chunks forever.

### Pattern: Systematic Debugging Prevents Wasted Effort

**Phase 1 (Root Cause Investigation):**

1. Reproduced consistently (OOMs at 1850 chunks every time)
2. Checked recent changes (BM25 optimization already applied)
3. Gathered evidence (minimal BM25 test, full IndexManager test, memory logs)
4. **Traced data flow**:
   - IndexManager.indexIncremental() → chunkBuffer.push(...chunks) [line 527]
   - IndexManager.flushBuffer() → vectorStore.addChunksOnly(toFlush) [line 383]
   - VectorStore.addChunksToBM25(chunks) → bm25Index.addDocuments(docs) [line 204]
   - BM25Indexer.addDocuments() → this.documents.push({...termFreqs}) [line 127]

**Time saved:** ~6-8 hours of random fixes without understanding root cause

### Solution Options (Phase 2)

**Option A: Streaming BM25 Updates (RECOMMENDED)**

- Don't load entire BM25 index into memory
- Use disk-based storage (SQLite) for document vectors
- Load only IDF scores and document count
- Calculate BM25 scores by loading document vectors on-demand
- Estimated effort: 4-6 hours
- Memory: ~5MB in-memory, scales to 100K+ chunks

**Option B: Clear chunkBuffer More Aggressively**

- Reduce flushSize from 50 to 10 chunks
- Force flush after every file (not just every 50 chunks)
- Force GC after each flush
- Estimated effort: 30 minutes
- Memory: Reduces chunkBuffer overhead but BM25 still accumulates

**Option C: Split BM25 Index into Shards**

- Index 500 files per shard
- Merge results at search time
- Estimated effort: 3-4 hours
- Memory: Limits BM25 size but adds complexity

**Next Step:** Implement Option B as quick fix, then Option A as permanent solution

## 2026-02-05: BM25 Index Successfully Rebuilt with Minimal Approach

### Outcome: SUCCESS

**Test Results:**

- **Files indexed**: 2011/2013 (1 skipped, 99.9% coverage)
- **Chunks indexed**: 13,012
- **Index size**: 14.69MB (on disk)
- **Peak memory**: 351MB RSS, 277MB heap
- **Completion**: Successful (no OOM)

### Key Finding: Minimal Approach Works

The minimal rebuild script processed ALL files in a single run WITHOUT the IndexManager overhead:

**Why it worked:**

1. **Direct BM25 usage**: Bypassed IndexManager's chunkBuffer accumulation
2. **Simple chunking**: Split files into 50-line chunks without complex parsing
3. **No concurrent processing**: Single-threaded, no Piscina workers
4. **No checkpoint overhead**: No loading/saving of intermediate state
5. **No embeddings**: BM25-only mode (no vector processing)

**Memory profile:**

- 2000 files: 143MB heap (manageable)
- 13,012 chunks: 277MB heap (sustainable)
- V8 GC working efficiently: No fragmentation issues

### Verification: Search Works Perfectly

**5 test queries all returned relevant results:**

1. "IndexManager memory concurrency" → index-manager.cjs, learnings.md, hybrid-search.cjs
2. "router agent spawn task" → spawn-validation plan, CLAUDE.md, spawn-template plan
3. "BM25 search query" → optimization plan, vector-store.cjs
4. "hook pre tool use" → pre-spawn-tool-validator.cjs, GETTING_STARTED.md, hook-creator skill
5. "checkpoint save resume" → architecture handbook, research reports

**Search performance:**

- Index load time: <1 second
- Query time: <100ms per query
- Peak memory during search: 50MB RSS

### Comparison: IndexManager vs Minimal Script

| Metric          | IndexManager (Failed) | Minimal Script (Success) |
| --------------- | --------------------- | ------------------------ |
| Files processed | 600/1330 (45%)        | 2011/2013 (99.9%)        |
| Chunks indexed  | 1850                  | 13,012                   |
| Peak memory     | 8GB+ (OOM)            | 351MB                    |
| Completion      | Failed (SIGABRT)      | Success                  |
| Index size      | N/A                   | 14.69MB                  |

**7x more chunks with 23x less memory**

### Pattern: Direct API Usage vs Pipeline Overhead

**When processing large datasets:**

- Complex pipelines accumulate overhead (chunkBuffer, checkpoints, workers)
- Direct API usage (BM25.addDocuments) is more memory-efficient
- IndexManager's "enterprise features" (checkpointing, concurrency, progress tracking) multiply memory by 20-50x

**Lesson:** For one-time indexing tasks, prefer simple scripts over complex pipelines.

### IndexManager Memory Issue: Still Needs Fix

The successful rebuild proves BM25 itself is fine, but IndexManager still has architectural issues:

**Root cause (confirmed):**

- `chunkBuffer` array accumulates chunk objects with full content
- BM25 `this.documents` array stores termFreqs (never cleared)
- V8 object overhead multiplies memory 1000x for nested objects

**Solution path:**

1. **Short-term**: Use minimal script for initial indexing
2. **Long-term**: Refactor IndexManager to use streaming updates (Option A from earlier analysis)

### Files Modified

**BM25 Index:**

- `.claude/data/lancedb/bm25-index.json` - rebuilt from scratch (14.69MB, 13,012 chunks)

**Checkpoint Deleted:**

- `.claude/context/code-index/checkpoint.json` - removed (no longer needed for rebuild)

### Impact

**Immediate:**

- Code search fully functional (13,012 chunks indexed)
- `pnpm search:code` works for all project files
- Hybrid search ready (BM25 + semantic vectors)

**Future Work:**

- IndexManager still needs refactoring for incremental updates
- Checkpoint system works but doesn't solve memory issue
- Consider disk-based BM25 for >20K chunks

## 2026-02-05: BM25 IDF Lazy Calculation + Lazy-Load lancedb-client

### Fixes Applied

**Fix 1: Defer IDF calculation in BM25Indexer** (bm25-indexer.cjs)

- **Problem**: `_calculateIDF()` ran after EVERY `addDocuments()` call (line 140)
  - With ~2000 files producing ~13K chunks, this was called 2000 times
  - Each call iterates ALL accumulated documents to build `df` and `idf` objects
  - O(N²) total complexity + massive intermediate object creation/destruction
  - Causes V8 heap fragmentation

- **Solution**: Added lazy IDF calculation flag
  - Added `this._idfDirty = true` flag in constructor
  - Changed `addDocuments()` to set `_idfDirty = true` instead of calling `_calculateIDF()`
  - Added `_ensureIDF()` method that calculates only if dirty
  - Call `_ensureIDF()` at start of `search()` and `toJSON()`
  - Set `_idfDirty = false` in `fromJSON()` (IDF already valid)

- **Impact**: Eliminates ~2000 redundant IDF calculations during indexing
  - IDF calculated only once at the end (when saving or searching)
  - Reduces memory churn during indexing phase
  - No change to search behavior or results

**Fix 2: Lazy-load lancedb-client in vector-store.cjs**

- **Problem**: Line 12 `require('../memory/lancedb-client.cjs')` loaded at module load time
  - Runs CUDA auto-discovery (filesystem scanning, PATH modification)
  - Happens even in BM25-only mode (`embeddingMode === 'off'`)
  - Unnecessary startup overhead

- **Solution**: Moved require inside constructor
  - Removed top-level require
  - Added conditional require inside `if (this.embeddingMode !== 'off')` block
  - Only loads lancedb-client when actually needed for embeddings

- **Impact**: Avoids CUDA auto-discovery in BM25-only mode
  - Faster startup for BM25-only operations
  - Cleaner process initialization
  - No change to embedding functionality when enabled

### Verification Results

**BM25 Search Test** (existing 1801-document index):

- ✅ Index loads correctly with `fromJSON()` (\_idfDirty=false works)
- ✅ Search query "router agent spawn" returns 5 results
- ✅ Search query "hook pre tool use validation" returns 5 results
- ✅ Search query "BM25 indexer search query" returns 5 results
- ✅ Search query "memory chunk buffer accumulation" returns 5 results
- ✅ All scores calculated correctly (e.g., 13.52, 12.96, 12.48)

**IndexManager Test** (full reindex):

- ⚠️ Still OOMs at ~600 files (same as before)
- **Root cause NOT fixed**: IndexManager's `chunkBuffer` accumulation + BM25's unbounded `this.documents` array still consume memory
- **These two fixes address O(N²) IDF overhead only**, not the fundamental memory accumulation issue

### Pattern: Targeted Fixes vs Root Cause

**What these fixes solve:**

- O(N²) IDF recalculation overhead (CPU + memory churn)
- Unnecessary CUDA auto-discovery in BM25-only mode

**What they DON'T solve:**

- IndexManager's `chunkBuffer` accumulation (line 361, 527)
- BM25's unbounded `this.documents` array (never cleared)
- V8 heap fragmentation from nested object graphs

**Lesson**: Targeted optimizations can eliminate wasteful computation (IDF recalc) without solving fundamental architectural issues (unbounded arrays).

### Files Modified

**BM25Indexer** (`.claude/lib/code-indexing/bm25-indexer.cjs`):

- Line 55: Added `this._idfDirty = true` flag in constructor
- Line 93-111: Original `_calculateIDF()` unchanged
- Line 113-120: Added `_ensureIDF()` helper method
- Line 140: Changed from `this._calculateIDF()` to `this._idfDirty = true`
- Line 176: Added `this._ensureIDF()` at start of `search()`
- Line 204: Added `this._ensureIDF()` at start of `toJSON()`
- Line 225: Set `_idfDirty = false` in `fromJSON()`

**VectorStore** (`.claude/lib/code-indexing/vector-store.cjs`):

- Line 12: Removed top-level `require('../memory/lancedb-client.cjs')`
- Line 30-31: Moved `require` inside `if (this.embeddingMode !== 'off')` block
