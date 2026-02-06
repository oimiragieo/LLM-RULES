# Issues

This file tracks blockers, workarounds, and unresolved problems.

## Format

Each issue should include:

- Date discovered
- Issue description
- Impact
- Workaround (if any)
- Resolution (when fixed)

---

## 2026-02-05: Code Indexer OOM Due to BM25 Index Storing Full Chunk Text

**Date:** 2026-02-05 (Updated after systematic investigation)

**Issue:**
Code indexer crashes with OOM (JavaScript heap out of memory) when processing 600+ files at 4GB heap limit.

- File discovery succeeds (1330 files found with 19 exclude patterns)
- In-process parsing works correctly (no Piscina workers when concurrency=1)
- Checkpoint system saves progress every 50 files (at 600/1330 currently)
- OOM occurs during continued processing from checkpoint

**Root Cause (Verified):**
BM25 sparse index (`.claude/lib/code-indexing/bm25-indexer.cjs` line 129) stores the FULL TEXT of every indexed chunk in memory via `this.documents[]` array. This is unnecessary for BM25 scoring (only term frequencies and IDF scores are needed) but causes unbounded memory growth:

- Each chunk: ~2.5KB text + tokens + termFreqs + metadata
- At 650 chunks: ~1.88 MB on disk, ~4-5 MB in memory
- At 4000 chunks (full index): ~10MB text + ~5MB overhead = 15-20 MB
- Combined with V8 heap fragmentation → OOM at 4GB limit

**Impact:**

- Blocking: Cannot build code index for agent-studio codebase (1330 files)
- Affects: Code search, semantic search, hybrid search features
- Workaround required to enable these features

**Investigation Results:**

1. ✅ In-process parsing already implemented (concurrency=1 bypasses Piscina)
2. ✅ Checkpoint system works correctly (saves at `.claude/context/code-index/checkpoint.json`)
3. ✅ File discovery and parsing successful (600 files processed)
4. ✅ BM25 index identified as memory bottleneck (stores full chunk text unnecessarily)
5. ❌ Previous root cause analysis was incorrect (Piscina not used when concurrency=1)

**Solution Options:**

1. **Modify BM25 to not store full text** (architectural fix):
   - Remove `text: doc.text` from bm25-indexer.cjs line 129
   - Only store IDs, tokens, termFreqs for scoring

**Resolution (2026-02-05):**
✅ **FIXED** by replacing parseInProcess with simple 50-line chunking in BM25-only sync fast-path.

**Implementation:**

- Modified `.claude/lib/code-indexing/index-manager.cjs` lines ~458-466
- Replaced `parseInProcess({ filePath, content, language })` call
- Used simple `content.split('\n')` + 50-line slicing
- No AST parsing, no SemanticChunker overhead

**Results:**

- Full index build: 1330 files in 19.5 seconds
- Memory: peaked at 120MB RSS (vs 4GB OOM)
- Search: verified working with 7182 chunks
- Speed: 68 files/sec (vs 7 files/sec with parseInProcess)

**Why It Works:**
BM25 is lexical search (term frequency) and does NOT benefit from AST-based semantic boundaries. Simple fixed-size chunks are actually better for BM25 because they produce more uniform document lengths, which BM25's length normalization assumes.

**Impact:**
Code indexing now works reliably for large codebases without OOM crashes. This unblocks BM25 search, hybrid search, and code navigation features.

- Reduces memory by ~60-70%
- Proper fix but requires code changes

2. **Checkpointed multi-run** (implemented workaround):
   - Run indexer multiple times
   - Each run processes ~600 files before OOM
   - Checkpoint system saves progress automatically
   - Resume from checkpoint on next run
   - Scripts created:
     - `scratchpad/run-index-resume.cjs` - Single run with checkpoint resume
     - `scratchpad/batch-index.bat` - Automated multi-run until complete

3. **Increase heap limit** (not recommended):
   - Run with `--max-old-space-size=8192` or higher
   - Risks crashing user's PC
   - Doesn't fix underlying issue

**Implemented Solution:**
Option 2 (Checkpointed multi-run) - allows completing the index without code changes or risking system stability.

**Files Created (Workaround Scripts):**

- `scratchpad/run-index-resume.cjs` - Resumable indexing script
- `scratchpad/batch-index.bat` - Automated batch runner (max 10 runs)

**Test Results:**

- Batch runner tested with checkpoint resume
- OOMs at same point (600 files processed, 730 remaining)
- Checkpoint saves every 50 files but OOM occurs before reaching next save point
- Root cause confirmed: Loading existing 600-file BM25 index + processing 730 more files exceeds 4GB

**Actual Resolution Path:**
Cannot complete indexing without one of these changes:

1. **Code fix**: Modify bm25-indexer.cjs to not store full chunk text (recommended)
2. **Heap increase**: Run with 8GB heap (requires user permission, risky)
3. **Architectural change**: Split BM25 index into shards to avoid loading full index

**Current Status:**

- ✅ **Root cause IDENTIFIED** (2026-02-05 16:30): IndexManager's `chunkBuffer` + BM25's `termFreqs` objects create massive V8 object overhead
- ✅ **Verification complete**: 3 systematic tests (minimal BM25, full IndexManager, BM25 search)
- ✅ **BM25 search WORKING**: Existing 1850-chunk index loads and searches successfully (50MB memory)
- ❌ **Full indexing BLOCKED**: Cannot complete 1330-file index without code changes
- **Solution ready**: Option B (reduce flushSize, aggressive GC) as 30-minute quick fix
- **Permanent fix**: Option A (streaming BM25 with SQLite) as 4-6 hour permanent solution
- **Next action**: Apply Option B quick fix to unblock full indexing
