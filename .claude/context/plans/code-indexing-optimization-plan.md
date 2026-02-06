# Plan: Code Indexing Optimization (BM25 Hybrid + GPU Acceleration)

**Version:** 1.0.0
**Created:** 2026-02-05
**Status:** Phase 0 - Research
**Framework:** Agent-Studio v2.2.1
**Estimated Duration:** 4-7 days

---

## Executive Summary

This plan implements two optimization phases for the code indexing pipeline:

1. **Phase 1: Hybrid Sparse + Dense Search (BM25)** - Add BM25 sparse search alongside existing dense embeddings for 10-100x query speed improvement
2. **Phase 2: GPU Acceleration** - Enable ONNX Runtime GPU acceleration for embedding generation, achieving 10-50x reindex speedup

**Total Tasks:** 42 atomic tasks
**Files Modified:** 12+ files
**New Files:** 4 files

---

## Overview

### Current Architecture (Bottleneck Analysis)

```
INDEXING PIPELINE (Current):
Files ──→ Parser ──→ Chunker ──→ EmbeddingGenerator ──→ VectorStore
                                  ↓ BOTTLENECK
                                  @xenova/transformers (CPU only)
                                  10-20 embeddings/min

QUERY PIPELINE (Current):
Query ──→ EmbeddingGenerator ──→ VectorStore.search() ──→ Results
          ↓ SLOW                  ↓ Dense vector search
          ~50-100ms/query         L2/cosine similarity
```

### Target Architecture (After Optimization)

```
INDEXING PIPELINE (Optimized - Phase 2):
Files ──→ Parser ──→ Chunker ──┬──→ BM25Indexer (NEW) ──→ BM25Index
                               └──→ EmbeddingGenerator ──→ VectorStore
                                    ↓ GPU-ACCELERATED
                                    ONNX Runtime + CUDA
                                    200-1000 embeddings/min

QUERY PIPELINE (Optimized - Phase 1):
Query ──┬──→ BM25 Search (NEW) ──────────────→ Fast candidates
        │    ↓ 1-5ms                           (top-100)
        │                                          ↓
        └──→ Dense Embeddings ─────────────→ Rerank candidates
             ↓ 50ms                            (top-10)
             (only for top-K reranking)
                                                   ↓
                                            Hybrid Results
                                            (10-100x faster)
```

---

## Key Deliverables

| Phase | Deliverable | Files |
|-------|-------------|-------|
| 1 | BM25 indexer module | `.claude/lib/code-indexing/bm25-indexer.cjs` |
| 1 | Hybrid query interface | Updated `hybrid-search.cjs`, `vector-store.cjs` |
| 1 | BM25 config | Updated `code-index-config.json` |
| 2 | GPU-enabled embedding | Updated `embedding-generator.cjs` |
| 2 | GPU detection utility | `.claude/lib/code-indexing/gpu-detector.cjs` |
| 2 | Benchmark suite | `tests/benchmarks/indexing-benchmark.cjs` |

---

## Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose:** Research BM25 algorithms, GPU acceleration options, validate technical approach
**Duration:** 4-6 hours
**Parallel OK:** No (blocking for subsequent phases)

#### Research Requirements (MANDATORY)

Before creating ANY implementation artifact:

- [ ] Minimum 3 external sources on BM25 algorithm implementation
- [ ] Minimum 3 external sources on ONNX Runtime GPU acceleration for Node.js
- [ ] Research report generated and saved
- [ ] ADR documenting key decisions

**Research Output:** `.claude/context/artifacts/research-reports/indexing-optimization-research.md`

#### Constitution Checkpoint

**CRITICAL VALIDATION:** Before proceeding to Phase 1, ALL of the following MUST pass:

1. **Research Completeness**
   - [ ] BM25 algorithm implementation options documented (wink-bm25, lunr.js, custom)
   - [ ] GPU acceleration options documented (onnxruntime-node, fastembed, triton)
   - [ ] Research report contains minimum 3 external sources with citations
   - [ ] All [NEEDS CLARIFICATION] items resolved
   - [ ] ADR-XXX: BM25 Storage Strategy created
   - [ ] ADR-XXX: GPU Acceleration Strategy created

2. **Technical Feasibility**
   - [ ] BM25 library selected and available via npm
   - [ ] ONNX Runtime GPU bindings confirmed for Windows
   - [ ] LanceDB compatibility with hybrid search confirmed
   - [ ] No blocking technical issues discovered

3. **Security Review**
   - [ ] No security implications (search optimization only)
   - [ ] Input validation requirements documented
   - [ ] No external data handling concerns

4. **Specification Quality**
   - [ ] Query latency targets defined (< 50ms for BM25 stage)
   - [ ] Reindex throughput targets defined (> 100 embeddings/min on GPU)
   - [ ] Edge cases documented (empty index, GPU unavailable, etc.)

**If ANY item fails, return to research phase. DO NOT proceed to implementation.**

#### Phase 0 Tasks

- [ ] **0.1** Research BM25 implementations for Node.js (~2 hours)
  - **Queries:** "BM25 algorithm Node.js implementation", "TF-IDF sparse search JavaScript", "inverted index JavaScript library"
  - **Sources:** wink-bm25 docs, lunr.js docs, Elasticsearch BM25 paper
  - **Output:** `.claude/context/artifacts/research-reports/bm25-research.md`
  - **Verify:** Research report exists with 3+ sources, library recommendation

- [ ] **0.2** Research GPU acceleration options (~2 hours)
  - **Queries:** "ONNX Runtime Node.js GPU CUDA", "transformers.js GPU acceleration", "FastEmbed Node.js GPU"
  - **Sources:** ONNX Runtime docs, transformers.js issues, FastEmbed Python->Node bridge
  - **Output:** `.claude/context/artifacts/research-reports/gpu-acceleration-research.md`
  - **Verify:** Research report exists with 3+ sources, feasibility assessment

- [ ] **0.3** Document architecture decisions (~1 hour)
  - **ADR-1:** BM25 Storage Strategy (in-memory vs LanceDB vs file)
  - **ADR-2:** GPU Acceleration Strategy (ONNX vs FastEmbed vs custom)
  - **ADR-3:** Query Fusion Strategy (RRF vs linear blend)
  - **Output:** `.claude/context/memory/decisions.md`
  - **Verify:** ADRs include alternatives considered and rationale

- [ ] **0.4** Constitution checkpoint validation (~30 min)
  - **Verify:** All 4 gates pass
  - **Output:** Checkpoint status documented in plan

**Success Criteria:** Constitution checkpoint passed (all 4 gates green)

---

### Phase 1: BM25 Foundation (Sparse Index Implementation)

**Purpose:** Implement BM25 sparse indexer as standalone module
**Dependencies:** Phase 0 complete (constitution checkpoint passed)
**Duration:** 6-8 hours
**Parallel OK:** Partial (1.1-1.3 can run in parallel)

#### Tasks

- [ ] **1.1** Create BM25 indexer module (~3 hours)
  - **File:** `.claude/lib/code-indexing/bm25-indexer.cjs`
  - **Command:** Create new file with BM25 algorithm implementation
  - **API:**
    ```javascript
    class BM25Indexer {
      constructor(options = {}) // k1, b, avgDocLength
      addDocument(id, text)     // Index single document
      addDocuments(docs)        // Batch index
      search(query, limit)      // Return ranked results
      remove(id)                // Remove document
      clear()                   // Clear index
      save(path)                // Persist to disk
      load(path)                // Load from disk
      getStats()                // Index statistics
    }
    ```
  - **Verify:** `node -e "require('./.claude/lib/code-indexing/bm25-indexer.cjs')"`
  - **Rollback:** `rm .claude/lib/code-indexing/bm25-indexer.cjs`

- [ ] **1.2** Implement inverted index data structure (~2 hours)
  - **File:** `.claude/lib/code-indexing/bm25-indexer.cjs` (continued)
  - **Data Structure:**
    ```javascript
    {
      vocabulary: Map<term, { df: number, idf: number }>,
      documents: Map<docId, { length: number, terms: Map<term, tf> }>,
      invertedIndex: Map<term, Set<docId>>,
      avgDocLength: number,
      totalDocs: number
    }
    ```
  - **Verify:** Unit test for addDocument/search passes
  - **Rollback:** Git revert changes

- [ ] **1.3** Implement persistence layer (~2 hours)
  - **File:** `.claude/lib/code-indexing/bm25-indexer.cjs` (continued)
  - **Storage Format:** JSON file with compressed inverted index
  - **Path:** `.claude/data/code-index/bm25-index.json`
  - **Features:**
    - Atomic writes (write to temp, rename)
    - Lazy loading (load on first search if not in memory)
    - Incremental updates (update document without full rebuild)
  - **Verify:** Save/load round-trip test passes
  - **Rollback:** Git revert changes

- [ ] **1.4** Add BM25 unit tests (~2 hours)
  - **File:** `tests/lib/code-indexing/bm25-indexer.test.cjs`
  - **Test Cases:**
    - [ ] Basic TF-IDF scoring correctness
    - [ ] BM25 k1/b parameter effects
    - [ ] Empty query handling
    - [ ] Large document handling (>10k tokens)
    - [ ] Save/load persistence
    - [ ] Remove document functionality
    - [ ] Concurrent access safety
  - **Verify:** `pnpm test -- --grep "bm25"`
  - **Rollback:** `rm tests/lib/code-indexing/bm25-indexer.test.cjs`

#### Phase 1 Verification Gate

```bash
# All must pass before proceeding to Phase 2
node -e "require('./.claude/lib/code-indexing/bm25-indexer.cjs')"
pnpm test -- --grep "bm25" 2>&1 | grep -E "passing|PASS"
ls .claude/lib/code-indexing/bm25-indexer.cjs
```

**Success Criteria:** BM25 module exists, all unit tests pass, API is stable

---

### Phase 2: BM25 Integration (Hybrid Search Pipeline)

**Purpose:** Integrate BM25 with existing vector store and hybrid search
**Dependencies:** Phase 1 complete
**Duration:** 6-8 hours
**Parallel OK:** No (sequential integration)

#### Commit Checkpoint (REQUIRED - 10+ files project)

Before starting Phase 2, commit Phase 1 changes:
```bash
git add .claude/lib/code-indexing/bm25-indexer.cjs tests/lib/code-indexing/bm25-indexer.test.cjs
git commit -m "checkpoint: Phase 1 BM25 foundation complete"
```

#### Tasks

- [ ] **2.1** Update IndexManager to build BM25 during indexing (~2 hours)
  - **File:** `.claude/lib/code-indexing/index-manager.cjs`
  - **Changes:**
    - Import BM25Indexer
    - Add `this.bm25Indexer` initialization in constructor
    - In `indexDirectory()`: call `bm25Indexer.addDocument()` for each chunk (parallel to embedding)
    - In `indexDirectory()`: call `bm25Indexer.save()` after indexing complete
    - Add `--skip-bm25` flag for backward compatibility
  - **Verify:** `node .claude/tools/cli/index-codebase.cjs index . --verbose` shows BM25 indexing
  - **Rollback:** Git revert changes to index-manager.cjs

- [ ] **2.2** Update VectorStore to support hybrid search (~2 hours)
  - **File:** `.claude/lib/code-indexing/vector-store.cjs`
  - **Changes:**
    - Add `hybridSearch(query, options)` method
    - Add `bm25Search(query, options)` method (delegates to BM25Indexer)
    - Add `setBm25Indexer(indexer)` method for dependency injection
  - **API:**
    ```javascript
    async hybridSearch(query, {
      limit = 10,
      bm25Weight = 0.3,
      semanticWeight = 0.7,
      bm25Candidates = 100,  // Pre-filter to top-100 BM25
      minScore = 0.5,
    }) => HybridResult[]
    ```
  - **Verify:** Unit test for hybridSearch passes
  - **Rollback:** Git revert changes to vector-store.cjs

- [ ] **2.3** Update HybridSearch to use BM25 stage (~2 hours)
  - **File:** `.claude/lib/code-indexing/hybrid-search.cjs`
  - **Changes:**
    - Add Stage 0.5: BM25 pre-filtering (before semantic)
    - Modify `search()` to use BM25 candidates for semantic stage
    - Add BM25 timing to `timing` object
    - Add `useBm25: true` option (default: true)
  - **Pipeline:**
    ```
    Stage 0: Query Analysis
    Stage 0.5: BM25 Pre-filter (NEW) -> top-100 candidates
    Stage 1: Semantic Search (on BM25 candidates only)
    Stage 2: Structural Refinement (ast-grep)
    Stage 3: Combine and Rank
    ```
  - **Verify:** Hybrid search CLI shows BM25 timing
  - **Rollback:** Git revert changes to hybrid-search.cjs

- [ ] **2.4** Implement query fusion (RRF) (~2 hours)
  - **File:** `.claude/lib/code-indexing/result-ranker.cjs`
  - **Changes:**
    - Add `reciprocalRankFusion(bm25Results, semanticResults, k = 60)` method
    - Update `combine()` to use RRF when both result sets available
  - **Algorithm:**
    ```
    RRF(d) = sum over r in {bm25, semantic} of: 1 / (k + rank_r(d))
    where k = 60 (constant to prevent high ranks from dominating)
    ```
  - **Verify:** Unit test for RRF scoring correctness
  - **Rollback:** Git revert changes to result-ranker.cjs

- [ ] **2.5** Update config for BM25 tuning (~1 hour)
  - **File:** `.claude/config/code-index-config.json`
  - **Changes:**
    ```json
    {
      "bm25": {
        "enabled": true,
        "k1": 1.2,
        "b": 0.75,
        "persistPath": ".claude/data/code-index/bm25-index.json",
        "candidateLimit": 100
      },
      "search": {
        "hybridMode": "rrf",
        "bm25Weight": 0.3,
        "semanticWeight": 0.7,
        "rrfK": 60
      }
    }
    ```
  - **Verify:** Config parses without error
  - **Rollback:** Git revert changes to code-index-config.json

- [ ] **2.6** Add hybrid search integration tests (~2 hours)
  - **File:** `tests/lib/code-indexing/hybrid-search.test.cjs`
  - **Test Cases:**
    - [ ] BM25 pre-filtering reduces candidate set
    - [ ] Hybrid search faster than dense-only (benchmark)
    - [ ] RRF fusion produces correct ranking
    - [ ] Fallback to dense-only when BM25 unavailable
    - [ ] Config options respected
  - **Verify:** `pnpm test -- --grep "hybrid"`
  - **Rollback:** Git revert test file changes

#### Phase 2 Verification Gate

```bash
# All must pass before proceeding to Phase 3
node .claude/tools/cli/index-codebase.cjs index . --verbose 2>&1 | grep -i "bm25"
node .claude/tools/cli/index-codebase.cjs hybrid-search "authentication" 2>&1 | grep -i "bm25"
pnpm test -- --grep "hybrid" 2>&1 | grep -E "passing|PASS"
```

**Success Criteria:** Hybrid search works with BM25, integration tests pass, timing shows BM25 < 10ms

---

### Phase 3: GPU Research & Setup (ONNX Runtime)

**Purpose:** Research and configure GPU acceleration for embedding generation
**Dependencies:** Phase 2 complete (hybrid search working)
**Duration:** 4-6 hours
**Parallel OK:** No (sequential research)

#### Commit Checkpoint (REQUIRED - 10+ files project)

Before starting Phase 3, commit Phase 2 changes:
```bash
git add .
git commit -m "checkpoint: Phase 2 BM25 integration complete"
```

#### Tasks

- [ ] **3.1** Research ONNX Runtime GPU options (~2 hours)
  - **Goal:** Determine best GPU acceleration path for Windows + Node.js
  - **Options to Evaluate:**
    1. `onnxruntime-node` with CUDA provider
    2. `onnxruntime-web` with WebGPU (if Node.js supports)
    3. FastEmbed (Python) via child_process
    4. Custom ONNX model loading with GPU session
  - **Output:** `.claude/context/artifacts/research-reports/gpu-acceleration-detailed.md`
  - **Verify:** Research report recommends specific approach with rationale

- [ ] **3.2** Verify CUDA availability on target system (~1 hour)
  - **Command:** `nvidia-smi` (check GPU)
  - **Command:** `nvcc --version` (check CUDA toolkit)
  - **Requirements:**
    - NVIDIA GPU with CUDA Compute Capability >= 3.5
    - CUDA Toolkit 11.x or 12.x
    - cuDNN 8.x
  - **Output:** GPU capability report
  - **Verify:** GPU detected and CUDA available

- [ ] **3.3** Install ONNX Runtime GPU dependencies (~1 hour)
  - **Command:** `pnpm add onnxruntime-node` (already has GPU support)
  - **Alternative:** `pnpm add onnxruntime-gpu` (explicit GPU build)
  - **Verify:** `node -e "require('onnxruntime-node')"`
  - **Note:** ONNX Runtime auto-detects CUDA; no manual config needed

- [ ] **3.4** Create GPU detector utility (~2 hours)
  - **File:** `.claude/lib/code-indexing/gpu-detector.cjs`
  - **API:**
    ```javascript
    class GPUDetector {
      static async detectGPU()              // Returns { available, type, memory, cudaVersion }
      static async getCUDAProviders()       // Returns available ONNX providers
      static async getBestProvider()        // Returns 'CUDAExecutionProvider' or 'CPUExecutionProvider'
      static async getOptimalBatchSize()    // Returns batch size based on GPU memory
    }
    ```
  - **Verify:** `node -e "require('./.claude/lib/code-indexing/gpu-detector.cjs').GPUDetector.detectGPU().then(console.log)"`
  - **Rollback:** `rm .claude/lib/code-indexing/gpu-detector.cjs`

#### Phase 3 Verification Gate

```bash
# All must pass before proceeding to Phase 4
node -e "require('onnxruntime-node')"
node -e "require('./.claude/lib/code-indexing/gpu-detector.cjs').GPUDetector.detectGPU().then(r => console.log(r))"
ls .claude/context/artifacts/research-reports/gpu-acceleration-detailed.md
```

**Success Criteria:** ONNX Runtime installed, GPU detector works, research complete

---

### Phase 4: GPU Integration (Embedding Generator)

**Purpose:** Integrate GPU acceleration into embedding pipeline
**Dependencies:** Phase 3 complete
**Duration:** 6-8 hours
**Parallel OK:** No (sequential implementation)

#### Tasks

- [ ] **4.1** Update EmbeddingGenerator to use ONNX Runtime (~3 hours)
  - **File:** `.claude/lib/code-indexing/embedding-generator.cjs`
  - **Changes:**
    - Import GPUDetector
    - Add `executionProvider` option ('CUDAExecutionProvider' | 'CPUExecutionProvider')
    - Modify `initialize()` to configure ONNX session with GPU provider
    - Add `useGPU: true` option (default: auto-detect)
  - **API Changes:**
    ```javascript
    constructor(options = {
      model: 'Xenova/all-MiniLM-L6-v2',
      useGPU: 'auto',  // NEW: 'auto' | true | false
      gpuBatchSize: 64, // NEW: larger batches for GPU
      cpuBatchSize: 32, // NEW: smaller batches for CPU
    })
    ```
  - **Verify:** Embedding generation uses GPU when available
  - **Rollback:** Git revert changes to embedding-generator.cjs

- [ ] **4.2** Implement GPU-optimized batch embedding (~2 hours)
  - **File:** `.claude/lib/code-indexing/embedding-generator.cjs` (continued)
  - **Changes:**
    - Add `batchEmbedGPU(texts)` method for GPU-optimized batching
    - Use larger batch sizes (64-256) for GPU
    - Implement dynamic batch size tuning based on GPU memory
    - Add memory monitoring to prevent OOM
  - **Batching Strategy:**
    ```
    GPU: batch_size = min(256, GPU_MEMORY_MB / 50)
    CPU: batch_size = 32 (existing)
    ```
  - **Verify:** GPU batching achieves > 100 embeddings/sec
  - **Rollback:** Git revert changes

- [ ] **4.3** Implement CPU fallback with warning (~1 hour)
  - **File:** `.claude/lib/code-indexing/embedding-generator.cjs` (continued)
  - **Changes:**
    - If GPU unavailable: log warning, fallback to CPU
    - Add `getExecutionProvider()` method to report current provider
    - Add `isGPUEnabled()` method
  - **Warning Message:**
    ```
    [WARN] GPU acceleration unavailable (reason: {reason}).
           Falling back to CPU. Reindex may be slower.
           To enable GPU: Install CUDA toolkit and restart.
    ```
  - **Verify:** CPU fallback works when CUDA_VISIBLE_DEVICES=""
  - **Rollback:** Git revert changes

- [ ] **4.4** Update IndexManager for GPU progress (~1 hour)
  - **File:** `.claude/lib/code-indexing/index-manager.cjs`
  - **Changes:**
    - Report GPU vs CPU status in progress callback
    - Adjust expected embedding rate based on GPU (10x faster)
    - Add GPU-specific timing metrics
  - **Verify:** `index-codebase.cjs index .` shows GPU status
  - **Rollback:** Git revert changes

- [ ] **4.5** Update LanceDB client for GPU embeddings (~2 hours)
  - **File:** `.claude/lib/memory/lancedb-client.cjs`
  - **Changes:**
    - Add `gpuAcceleration: 'auto'` option
    - Update `generateEmbeddingsBatch()` to use GPU batch size
    - Report GPU status in `getEmbeddingStatus()`
  - **Verify:** LanceDB client uses GPU for batch embeddings
  - **Rollback:** Git revert changes

- [ ] **4.6** Update config for GPU tuning (~1 hour)
  - **File:** `.claude/config/code-index-config.json`
  - **Changes:**
    ```json
    {
      "embedding": {
        "provider": "local",
        "model": "Xenova/all-MiniLM-L6-v2",
        "gpu": {
          "enabled": "auto",
          "batchSize": 64,
          "memoryLimit": 4096,
          "provider": "CUDAExecutionProvider"
        },
        "cpu": {
          "batchSize": 32
        }
      }
    }
    ```
  - **Verify:** Config parses without error
  - **Rollback:** Git revert changes

#### Phase 4 Verification Gate

```bash
# All must pass before proceeding to Phase 5
node -e "
const { EmbeddingGenerator } = require('./.claude/lib/code-indexing/embedding-generator.cjs');
const gen = new EmbeddingGenerator({ useGPU: 'auto' });
gen.initialize().then(() => console.log('GPU:', gen.isGPUEnabled()));
"
pnpm test -- --grep "embedding" 2>&1 | grep -E "passing|PASS"
```

**Success Criteria:** GPU embedding works, CPU fallback works, config respected

---

### Phase 5: Testing & Benchmarking

**Purpose:** Comprehensive testing and performance benchmarking
**Dependencies:** Phase 4 complete
**Duration:** 4-6 hours
**Parallel OK:** Yes (benchmarks can run in parallel)

#### Commit Checkpoint (REQUIRED - 10+ files project)

Before starting Phase 5, commit Phase 3-4 changes:
```bash
git add .
git commit -m "checkpoint: Phase 3-4 GPU acceleration complete"
```

#### Tasks

- [ ] **5.1** Create benchmark suite (~2 hours) [parallel OK]
  - **File:** `tests/benchmarks/indexing-benchmark.cjs`
  - **Benchmarks:**
    - [ ] BM25 indexing speed (docs/sec)
    - [ ] BM25 query speed (queries/sec)
    - [ ] Dense embedding speed (CPU vs GPU)
    - [ ] Hybrid search latency (BM25 + semantic)
    - [ ] Full reindex time (before/after optimization)
  - **Output Format:**
    ```
    BENCHMARK RESULTS (2026-02-05)
    ============================
    BM25 Indexing:    10,000 docs/sec
    BM25 Query:       5,000 queries/sec
    Dense Embed CPU:  15 docs/sec
    Dense Embed GPU:  200 docs/sec (13x speedup)
    Hybrid Search:    45ms (was 500ms, 11x speedup)
    Full Reindex:     2 min (was 20 min, 10x speedup)
    ```
  - **Verify:** `node tests/benchmarks/indexing-benchmark.cjs`
  - **Rollback:** `rm tests/benchmarks/indexing-benchmark.cjs`

- [ ] **5.2** Add GPU unit tests (~2 hours) [parallel OK]
  - **File:** `tests/lib/code-indexing/gpu-detector.test.cjs`
  - **Test Cases:**
    - [ ] GPU detection on CUDA system
    - [ ] GPU detection on non-CUDA system (graceful fallback)
    - [ ] Optimal batch size calculation
    - [ ] Provider selection logic
  - **Verify:** `pnpm test -- --grep "gpu"`
  - **Rollback:** `rm tests/lib/code-indexing/gpu-detector.test.cjs`

- [ ] **5.3** Add embedding generator GPU tests (~2 hours) [parallel OK]
  - **File:** `tests/lib/code-indexing/embedding-generator.test.cjs`
  - **Test Cases (NEW):**
    - [ ] GPU initialization when available
    - [ ] CPU fallback when GPU unavailable
    - [ ] Batch size adjustment for GPU
    - [ ] Memory monitoring during GPU batch
    - [ ] Concurrent embedding requests
  - **Verify:** `pnpm test -- --grep "embedding"`
  - **Rollback:** Git revert test file changes

- [ ] **5.4** End-to-end integration test (~2 hours)
  - **File:** `tests/integration/indexing-optimization.test.cjs`
  - **Test Scenarios:**
    - [ ] Full reindex with BM25 + GPU
    - [ ] Incremental update with BM25
    - [ ] Hybrid search with BM25 pre-filter
    - [ ] Graceful degradation (no GPU, no BM25)
  - **Verify:** `pnpm test -- --grep "indexing-optimization"`
  - **Rollback:** `rm tests/integration/indexing-optimization.test.cjs`

- [ ] **5.5** Performance regression test (~1 hour)
  - **File:** `tests/performance/indexing-regression.test.cjs`
  - **Assertions:**
    - [ ] BM25 query latency < 10ms (p95)
    - [ ] Hybrid search latency < 100ms (p95)
    - [ ] GPU embedding > 100 docs/sec
    - [ ] Full reindex < 5 min for 10k files
  - **Verify:** `pnpm test -- --grep "regression"`
  - **Rollback:** `rm tests/performance/indexing-regression.test.cjs`

#### Phase 5 Verification Gate

```bash
# All must pass before proceeding to Phase FINAL
pnpm test 2>&1 | tail -5
node tests/benchmarks/indexing-benchmark.cjs 2>&1 | head -20
```

**Success Criteria:** All tests pass, benchmarks show expected speedups

---

### Phase FINAL: Evolution & Reflection Check

**Purpose:** Quality assessment and learning extraction
**Dependencies:** Phase 5 complete

#### Tasks

- [ ] **FINAL.1** Spawn reflection-agent for session analysis
  - **Command:**
    ```javascript
    Task({
      subagent_type: "reflection-agent",
      description: "Session reflection and learning extraction",
      prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed indexing optimization work, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
    })
    ```

- [ ] **FINAL.2** Extract learnings and update memory files
  - **Learnings to record:**
    - BM25 integration pattern for Node.js
    - GPU acceleration with ONNX Runtime
    - Hybrid search fusion strategies
    - Benchmark-driven optimization workflow
  - **Output:** `.claude/context/memory/learnings.md`

- [ ] **FINAL.3** Check for evolution opportunities
  - **Potential new skills:**
    - `performance-benchmark` skill
    - `gpu-optimization` skill
  - **Potential new agents:**
    - `performance-engineer` agent
  - **Output:** Evolution recommendations in reflection

- [ ] **FINAL.4** Final documentation update
  - **Update:** `.claude/docs/CODE_INDEXING_DESIGN.md`
  - **Update:** `.claude/config/code-index-config.json` (document new options)
  - **Add:** Performance tuning guide

**Success Criteria:**
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation | Rollback |
|------|--------|-------------|------------|----------|
| BM25 memory usage for large index | Medium | Medium | Use streaming/chunked index loading | Remove BM25, use dense-only |
| GPU not available on target system | High | Medium | Implement robust CPU fallback | Disable GPU option in config |
| ONNX Runtime compatibility issues | High | Low | Pin to known-working version | Revert to @xenova/transformers CPU |
| Query latency regression | High | Low | Benchmark-driven development | Disable hybrid mode, use semantic-only |
| LanceDB compatibility with hybrid | Medium | Low | Test thoroughly before integration | Use separate BM25 store |

---

## Architecture Decisions

### ADR-1: BM25 Storage Strategy

**Status:** PROPOSED (to be finalized in Phase 0)

**Context:** BM25 index needs to be persisted for incremental updates.

**Options:**
1. **In-memory HashMap** - Fast, but lost on restart
2. **LanceDB table** - Consistent with vector store, but overkill for sparse index
3. **Flat JSON file** - Simple, portable, good for moderate-size index
4. **SQLite FTS5** - Full-featured, but adds dependency

**Decision:** TBD after Phase 0 research

**Consequences:** TBD

---

### ADR-2: GPU Acceleration Strategy

**Status:** PROPOSED (to be finalized in Phase 0)

**Context:** Embedding generation is bottlenecked at 10-20/min on CPU.

**Options:**
1. **ONNX Runtime Node.js** - Native bindings, automatic CUDA detection
2. **FastEmbed via child_process** - Python-based, proven fast
3. **WebGPU via transformers.js** - Browser-focused, experimental in Node.js
4. **Custom ONNX model** - Maximum control, high effort

**Decision:** TBD after Phase 0 research

**Consequences:** TBD

---

### ADR-3: Query Fusion Strategy

**Status:** PROPOSED

**Context:** Need to combine BM25 and semantic search results.

**Options:**
1. **Reciprocal Rank Fusion (RRF)** - Simple, proven effective
2. **Linear blend** - Weighted average of scores
3. **Threshold-based** - Use BM25 above threshold, semantic below
4. **Learned fusion** - ML model to combine (overkill for this use case)

**Decision:** RRF (k=60) based on research showing consistent performance

**Consequences:** Simple to implement, no tuning required

---

## Timeline Summary

| Phase | Tasks | Est. Time | Dependencies | Parallel? |
|-------|-------|-----------|--------------|-----------|
| 0 | 4 | 4-6 hours | None | No |
| 1 | 4 | 6-8 hours | Phase 0 | Partial |
| 2 | 6 | 6-8 hours | Phase 1 | No |
| 3 | 4 | 4-6 hours | Phase 2 | No |
| 4 | 6 | 6-8 hours | Phase 3 | No |
| 5 | 5 | 4-6 hours | Phase 4 | Yes |
| FINAL | 4 | 2-3 hours | Phase 5 | No |
| **Total** | **33** | **~33-45 hours (4-7 days)** | | |

---

## Appendix: File Changes Summary

### New Files (4)

| File | Purpose | Phase |
|------|---------|-------|
| `.claude/lib/code-indexing/bm25-indexer.cjs` | BM25 sparse indexer | 1 |
| `.claude/lib/code-indexing/gpu-detector.cjs` | GPU detection utility | 3 |
| `tests/lib/code-indexing/bm25-indexer.test.cjs` | BM25 unit tests | 1 |
| `tests/benchmarks/indexing-benchmark.cjs` | Performance benchmarks | 5 |

### Modified Files (8+)

| File | Changes | Phase |
|------|---------|-------|
| `.claude/lib/code-indexing/index-manager.cjs` | BM25 integration | 2 |
| `.claude/lib/code-indexing/vector-store.cjs` | Hybrid search API | 2 |
| `.claude/lib/code-indexing/hybrid-search.cjs` | BM25 stage | 2 |
| `.claude/lib/code-indexing/result-ranker.cjs` | RRF fusion | 2 |
| `.claude/lib/code-indexing/embedding-generator.cjs` | GPU acceleration | 4 |
| `.claude/lib/memory/lancedb-client.cjs` | GPU embeddings | 4 |
| `.claude/config/code-index-config.json` | New config options | 2, 4 |
| `tests/lib/code-indexing/hybrid-search.test.cjs` | Integration tests | 2 |

---

## Success Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Query latency (p95) | 500ms | < 50ms | Benchmark suite |
| Reindex throughput | 10-20/min | 200-1000/min | Benchmark suite |
| BM25 query latency | N/A | < 10ms | Benchmark suite |
| Full reindex time (10k files) | 20 min | < 2 min | Benchmark suite |
| Memory usage (peak) | 500MB | < 1GB | Process monitoring |

---

**Plan Status:** Ready for Phase 0 execution

**Next Step:** Begin Phase 0 research tasks (0.1, 0.2, 0.3)
