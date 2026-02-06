# Phase 2: Hybrid Code Search Design

## Semantic + Structural Search with ast-grep Integration

**Version:** 1.0
**Status:** DESIGN COMPLETE
**Author:** Planner Agent (Task #44)
**Date:** 2026-01-31
**Parent Documents:**
- `.claude/docs/CODE_INDEXING_DESIGN.md`
- `.claude/context/artifacts/PHASE_1_IMPLEMENTATION_PLAN.md`
- Phase 1 Implementation: `.claude/lib/code-indexing/`

---

## 1. Executive Summary

### 1.1 Overview

Phase 2 enhances the Phase 1 semantic code search system with **structural search** capabilities using [ast-grep](https://ast-grep.github.io/). This creates a **hybrid search pipeline** that combines:

1. **Ripgrep Discovery** (Fast keyword filtering)
2. **Semantic Search** (Conceptual understanding via embeddings)
3. **ast-grep Refinement** (Precise AST pattern matching)

**Why Hybrid Search?**

| Search Type | Strength | Weakness |
|-------------|----------|----------|
| **Keyword (Ripgrep)** | Fast, exact matches | No semantic understanding |
| **Semantic (Phase 1)** | Conceptual similarity | May miss exact patterns |
| **Structural (ast-grep)** | Precise code patterns | Requires pattern knowledge |
| **Hybrid (Phase 2)** | Best of all worlds | Slightly more complex |

### 1.2 Research Validation

**ast-grep Production Readiness (Verified 2026-01-31):**
- GitHub Stars: 12,273+ (active community)
- Latest Release: v0.35.0 (Jan 2026)
- Maintained By: ast-grep team (active development)
- Used By: Microsoft, Vercel, Cloudflare
- Language Support: 20+ languages via tree-sitter

**Key Insight:** Semantic + Structural search are **complementary**, not competing:
- Semantic: "Find code that handles authentication"
- Structural: "Find functions with exactly 3 parameters"
- Hybrid: "Find authentication handlers with specific patterns"

### 1.3 Phase 2 Value Proposition

| Metric | Phase 1 | Phase 2 Target | Improvement |
|--------|---------|----------------|-------------|
| Query Accuracy | 80% | 95%+ | +19% |
| Query Types | Semantic only | Semantic + Structural | 2x |
| Pattern Matching | None | Full AST patterns | New capability |
| Search Speed (cached) | 0.9ms | 50ms (with ast-grep) | Still fast |
| Large Codebase | Good | Excellent | Optimized |

---

## 2. Architecture Overview

### 2.1 High-Level Hybrid Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                        USER QUERY                                       │
│        "Find authentication functions that validate passwords"          │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    QUERY ANALYZER (New)                                 │
│    ┌─────────────────────────────────────────────────────────────┐    │
│    │ 1. Detect query type: semantic, structural, or hybrid       │    │
│    │ 2. Extract keywords for ripgrep                             │    │
│    │ 3. Extract concepts for semantic search                     │    │
│    │ 4. Generate ast-grep pattern (if structural)                │    │
│    └─────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            │                   │                   │
            ▼                   ▼                   ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ STAGE 1: RIPGREP │  │ STAGE 2: SEMANTIC│  │ STAGE 3: AST-GREP│
│    (Optional)    │  │    (Phase 1)     │  │     (New)        │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ Keywords: auth,  │  │ Query embedding  │  │ Pattern:         │
│ password, valid  │  │ Vector search    │  │ function $NAME   │
│                  │  │ Top-K results    │  │ ($$$) { $$ }     │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ Output: 15 files │  │ Output: 10 matches│ │ Output: 5 exact  │
│ Time: <100ms     │  │ Time: 50ms cached │  │ Time: <50ms      │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    RESULT COMBINER & RANKER                            │
│    ┌─────────────────────────────────────────────────────────────┐    │
│    │ 1. Combine results from all stages                          │    │
│    │ 2. Calculate combined score:                                │    │
│    │    score = 0.7 * semantic + 0.3 * structural               │    │
│    │ 3. Deduplicate by file:line                                 │    │
│    │ 4. Sort by combined score                                   │    │
│    │ 5. Return top-K results                                     │    │
│    └─────────────────────────────────────────────────────────────┘    │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SEARCH RESULTS                                   │
│    [                                                                   │
│      {                                                                 │
│        code: "function validatePassword(username, password) {...}",   │
│        filePath: "src/auth/validator.ts",                             │
│        lineRange: [45, 72],                                           │
│        semanticScore: 0.89,                                           │
│        structuralScore: 1.0,                                          │
│        combinedScore: 0.923,                                          │
│        explanation: "Exact pattern match + high semantic similarity"  │
│      },                                                                │
│      ...                                                               │
│    ]                                                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    .claude/lib/code-indexing/                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Phase 1 Components (Existing)                 │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  code-parser.cjs      │ tree-sitter wrapper                     │   │
│  │  semantic-chunker.cjs │ AST to semantic chunks                  │   │
│  │  embedding-generator.cjs │ all-MiniLM-L6-v2 embeddings         │   │
│  │  vector-db.cjs        │ In-memory vector storage                │   │
│  │  index-manager.cjs    │ Pipeline orchestration                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Phase 2 Components (New)                      │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  ast-grep-wrapper.cjs │ ast-grep CLI wrapper                    │   │
│  │  hybrid-search.cjs    │ Three-stage search orchestration        │   │
│  │  query-analyzer.cjs   │ Query type detection + pattern gen      │   │
│  │  result-ranker.cjs    │ Score combination + ranking             │   │
│  │  pattern-library.cjs  │ Pre-defined ast-grep patterns           │   │
│  │  merkle-tree.cjs      │ Incremental indexing (diff detection)   │   │
│  │  file-watcher.cjs     │ Auto-update on file changes             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow Diagram

```
                    USER QUERY
                        │
                        ▼
              ┌─────────────────┐
              │  QueryAnalyzer  │
              │                 │
              │ - detectType()  │
              │ - extractKw()   │
              │ - genPattern()  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ Ripgrep │   │Semantic │   │ast-grep │
    │ (opt)   │   │ Search  │   │ (opt)   │
    └────┬────┘   └────┬────┘   └────┬────┘
         │             │             │
         │    ┌────────┴────────┐    │
         │    │                 │    │
         └────►  ResultRanker  ◄────┘
              │                 │
              │ - combine()     │
              │ - dedupe()      │
              │ - rank()        │
              └────────┬────────┘
                       │
                       ▼
                RANKED RESULTS
```

---

## 3. Component Specifications

### 3.1 ast-grep Wrapper

**File:** `.claude/lib/code-indexing/ast-grep-wrapper.cjs`

**Purpose:** Wrap the ast-grep CLI for programmatic access to structural code search.

**Interface:**
```javascript
/**
 * ast-grep wrapper for structural code search
 * @class AstGrepSearch
 */
class AstGrepSearch {
  /**
   * Initialize ast-grep wrapper
   * @param {Object} options - Configuration
   * @param {string} options.binPath - Path to sg binary (default: 'sg')
   * @param {string} options.projectRoot - Project root directory
   * @param {number} options.timeout - Search timeout in ms (default: 30000)
   */
  constructor(options = {})

  /**
   * Search for code matching an AST pattern
   * @param {string} pattern - ast-grep pattern (e.g., 'function $NAME($ARGS) { $BODY }')
   * @param {string} language - Programming language (js, ts, py, go, rs)
   * @param {Object} options - Search options
   * @param {string[]} options.include - Glob patterns to include
   * @param {string[]} options.exclude - Glob patterns to exclude
   * @param {number} options.maxResults - Maximum results (default: 100)
   * @returns {Promise<AstGrepResult[]>} Matching code locations
   */
  async search(pattern, language, options = {})

  /**
   * Refine semantic search results with structural patterns
   * @param {SemanticResult[]} semanticResults - Results from Phase 1 search
   * @param {string} pattern - ast-grep pattern to filter by
   * @param {string} language - Programming language
   * @returns {Promise<HybridResult[]>} Results with structural scores
   */
  async refine(semanticResults, pattern, language)

  /**
   * Check if ast-grep binary is available
   * @returns {Promise<boolean>} True if sg is installed and working
   */
  async isAvailable()

  /**
   * Get ast-grep version
   * @returns {Promise<string>} Version string (e.g., '0.35.0')
   */
  async getVersion()
}

/**
 * Single ast-grep match result
 * @typedef {Object} AstGrepResult
 * @property {string} filePath - Absolute path to file
 * @property {number} lineStart - Starting line number
 * @property {number} lineEnd - Ending line number
 * @property {number} colStart - Starting column
 * @property {number} colEnd - Ending column
 * @property {string} code - Matched code snippet
 * @property {Object} matches - Captured metavariables ($NAME, $ARGS, etc.)
 * @property {string} language - Detected language
 */
```

**Implementation Notes:**
- Uses `child_process.spawn` to call `sg` (ast-grep CLI)
- Output format: JSON (`--json` flag)
- Pattern syntax: tree-sitter patterns with metavariables
- Language auto-detection from file extension

**Example Usage:**
```javascript
const astGrep = new AstGrepSearch({ projectRoot: '/my/project' });

// Find all async functions
const results = await astGrep.search(
  'async function $NAME($ARGS) { $$ }',
  'typescript',
  { include: ['src/**/*.ts'] }
);

// Refine semantic results
const refined = await astGrep.refine(
  semanticResults,
  'function authenticate($USER, $PASS) { $$ }',
  'javascript'
);
```

---

### 3.2 Hybrid Search Engine

**File:** `.claude/lib/code-indexing/hybrid-search.cjs`

**Purpose:** Orchestrate the three-stage hybrid search pipeline.

**Interface:**
```javascript
/**
 * Hybrid search engine combining semantic and structural search
 * @class HybridSearchEngine
 */
class HybridSearchEngine {
  /**
   * Initialize hybrid search engine
   * @param {Object} options - Configuration
   * @param {IndexManager} options.indexManager - Phase 1 index manager
   * @param {AstGrepSearch} options.astGrep - ast-grep wrapper
   * @param {Object} options.weights - Score weights
   * @param {number} options.weights.semantic - Semantic weight (default: 0.7)
   * @param {number} options.weights.structural - Structural weight (default: 0.3)
   */
  constructor(options = {})

  /**
   * Perform hybrid search
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @param {string} options.pattern - Optional ast-grep pattern
   * @param {string} options.language - Language filter
   * @param {number} options.limit - Max results (default: 10)
   * @param {string} options.stage - Search stage ('semantic-only', 'structural-only', 'combined')
   * @param {boolean} options.useRipgrep - Enable ripgrep pre-filter (default: true)
   * @returns {Promise<HybridSearchResult>} Search results with scores
   */
  async search(query, options = {})

  /**
   * Perform ripgrep pre-filtering
   * @param {string} query - Query to extract keywords from
   * @param {string[]} targetFiles - Files to search within (optional)
   * @returns {Promise<string[]>} List of candidate file paths
   */
  async ripgrepPrefilter(query, targetFiles = [])

  /**
   * Analyze query to determine search strategy
   * @param {string} query - User query
   * @returns {QueryAnalysis} Analysis result
   */
  analyzeQuery(query)
}

/**
 * Hybrid search result
 * @typedef {Object} HybridSearchResult
 * @property {string} query - Original query
 * @property {string} pattern - ast-grep pattern used (if any)
 * @property {HybridMatch[]} results - Ranked results
 * @property {number} totalMatches - Total before limit
 * @property {Object} timing - Timing breakdown by stage
 */

/**
 * Single hybrid match
 * @typedef {Object} HybridMatch
 * @property {string} code - Matched code
 * @property {string} filePath - File path
 * @property {number[]} lineRange - [start, end] lines
 * @property {number} semanticScore - Semantic similarity (0-1)
 * @property {number} structuralScore - Structural match (0 or 1)
 * @property {number} combinedScore - Weighted combined score
 * @property {string} explanation - Why this matched
 * @property {Object} metadata - Additional metadata
 */
```

**Search Pipeline Implementation:**
```javascript
async search(query, options = {}) {
  const timing = {};
  const startTotal = Date.now();

  // Stage 0: Query Analysis
  const analysis = this.analyzeQuery(query);

  // Stage 1: Ripgrep Pre-filter (optional, for large codebases)
  let candidateFiles = null;
  if (options.useRipgrep && analysis.keywords.length > 0) {
    const ripgrepStart = Date.now();
    candidateFiles = await this.ripgrepPrefilter(analysis.keywords);
    timing.ripgrep = Date.now() - ripgrepStart;
  }

  // Stage 2: Semantic Search (Phase 1)
  const semanticStart = Date.now();
  const semanticResults = await this.indexManager.semanticSearch(query, {
    limit: options.limit * 2, // Get more for filtering
    filters: options.language ? { language: options.language } : {},
    ...(candidateFiles && { fileFilter: candidateFiles })
  });
  timing.semantic = Date.now() - semanticStart;

  // Stage 3: Structural Refinement (ast-grep)
  let structuralResults = [];
  const pattern = options.pattern || analysis.generatedPattern;

  if (pattern && await this.astGrep.isAvailable()) {
    const astGrepStart = Date.now();
    structuralResults = await this.astGrep.refine(
      semanticResults,
      pattern,
      options.language || analysis.detectedLanguage
    );
    timing.astGrep = Date.now() - astGrepStart;
  }

  // Stage 4: Combine and Rank
  const combineStart = Date.now();
  const combinedResults = this.combineAndRank(
    semanticResults,
    structuralResults,
    this.options.weights
  );
  timing.combine = Date.now() - combineStart;

  timing.total = Date.now() - startTotal;

  return {
    query,
    pattern,
    results: combinedResults.slice(0, options.limit || 10),
    totalMatches: combinedResults.length,
    timing
  };
}
```

---

### 3.3 Query Analyzer

**File:** `.claude/lib/code-indexing/query-analyzer.cjs`

**Purpose:** Analyze user queries to determine search strategy and generate patterns.

**Interface:**
```javascript
/**
 * Query analyzer for hybrid search
 * @class QueryAnalyzer
 */
class QueryAnalyzer {
  /**
   * Analyze a query to determine search strategy
   * @param {string} query - User query
   * @returns {QueryAnalysis} Analysis result
   */
  analyze(query)

  /**
   * Extract keywords for ripgrep pre-filtering
   * @param {string} query - User query
   * @returns {string[]} Keywords for ripgrep
   */
  extractKeywords(query)

  /**
   * Detect query type
   * @param {string} query - User query
   * @returns {'semantic' | 'structural' | 'hybrid'} Query type
   */
  detectType(query)

  /**
   * Generate ast-grep pattern from query
   * @param {string} query - User query
   * @param {string} language - Target language
   * @returns {string|null} Generated pattern or null
   */
  generatePattern(query, language)
}

/**
 * Query analysis result
 * @typedef {Object} QueryAnalysis
 * @property {string} type - 'semantic', 'structural', or 'hybrid'
 * @property {string[]} keywords - Extracted keywords
 * @property {string|null} generatedPattern - Auto-generated ast-grep pattern
 * @property {string|null} detectedLanguage - Detected target language
 * @property {string[]} concepts - Semantic concepts extracted
 * @property {number} confidence - Analysis confidence (0-1)
 */
```

**Pattern Generation Rules:**

| Query Pattern | Generated ast-grep Pattern |
|--------------|---------------------------|
| "function X" | `function $NAME($$$) { $$$ }` |
| "async function" | `async function $NAME($$$) { $$$ }` |
| "class X" | `class $NAME { $$$ }` |
| "method X" | `$NAME($$$) { $$$ }` (inside class) |
| "X with Y parameters" | `function $NAME($P1, $P2) { $$$ }` |
| "arrow function" | `const $NAME = ($$$) => $BODY` |
| "try catch" | `try { $$$ } catch ($E) { $$$ }` |
| "import X" | `import $X from $PATH` |
| "export function" | `export function $NAME($$$) { $$$ }` |

---

### 3.4 Result Ranker

**File:** `.claude/lib/code-indexing/result-ranker.cjs`

**Purpose:** Combine and rank results from semantic and structural search.

**Interface:**
```javascript
/**
 * Result ranker for hybrid search
 * @class ResultRanker
 */
class ResultRanker {
  /**
   * Initialize ranker with weights
   * @param {Object} weights - Score weights
   * @param {number} weights.semantic - Weight for semantic score (default: 0.7)
   * @param {number} weights.structural - Weight for structural score (default: 0.3)
   * @param {number} weights.recency - Weight for recency boost (default: 0.0)
   */
  constructor(weights = {})

  /**
   * Combine semantic and structural results
   * @param {SemanticResult[]} semanticResults - Results from Phase 1
   * @param {AstGrepResult[]} structuralResults - Results from ast-grep
   * @returns {HybridMatch[]} Combined, deduplicated results
   */
  combine(semanticResults, structuralResults)

  /**
   * Calculate combined score
   * @param {number} semanticScore - Semantic similarity (0-1)
   * @param {number} structuralScore - Structural match (0 or 1)
   * @returns {number} Combined score (0-1)
   */
  calculateScore(semanticScore, structuralScore)

  /**
   * Deduplicate results by file:line
   * @param {HybridMatch[]} results - Results to dedupe
   * @returns {HybridMatch[]} Deduplicated results
   */
  deduplicate(results)

  /**
   * Sort results by combined score
   * @param {HybridMatch[]} results - Results to sort
   * @returns {HybridMatch[]} Sorted results (descending)
   */
  sort(results)
}
```

**Scoring Algorithm:**

```javascript
calculateScore(semanticScore, structuralScore) {
  // Base calculation
  const baseScore = (
    this.weights.semantic * semanticScore +
    this.weights.structural * structuralScore
  );

  // Normalize to 0-1
  const maxPossible = this.weights.semantic + this.weights.structural;
  return baseScore / maxPossible;
}

// Example scores:
// - Semantic only (0.8 semantic, 0 structural): 0.8 * 0.7 = 0.56 / 1.0 = 0.56
// - Structural only (0 semantic, 1.0 structural): 1.0 * 0.3 = 0.3 / 1.0 = 0.3
// - Both (0.8 semantic, 1.0 structural): (0.8*0.7 + 1.0*0.3) / 1.0 = 0.86
```

---

### 3.5 Pattern Library

**File:** `.claude/lib/code-indexing/pattern-library.cjs`

**Purpose:** Pre-defined ast-grep patterns for common code structures.

**Categories:**

```javascript
const PATTERN_LIBRARY = {
  // Functions
  functions: {
    any: 'function $NAME($$$) { $$$ }',
    async: 'async function $NAME($$$) { $$$ }',
    arrow: 'const $NAME = ($$$) => $BODY',
    arrowAsync: 'const $NAME = async ($$$) => $BODY',
    exported: 'export function $NAME($$$) { $$$ }',
    default: 'export default function $NAME($$$) { $$$ }',
  },

  // Classes
  classes: {
    any: 'class $NAME { $$$ }',
    extends: 'class $NAME extends $PARENT { $$$ }',
    implements: 'class $NAME implements $INTERFACE { $$$ }',
    method: '$NAME($$$) { $$$ }',
    asyncMethod: 'async $NAME($$$) { $$$ }',
    getter: 'get $NAME() { $$$ }',
    setter: 'set $NAME($VALUE) { $$$ }',
    constructor: 'constructor($$$) { $$$ }',
  },

  // Control Flow
  controlFlow: {
    tryCatch: 'try { $$$ } catch ($E) { $$$ }',
    tryCatchFinally: 'try { $$$ } catch ($E) { $$$ } finally { $$$ }',
    ifElse: 'if ($COND) { $$$ } else { $$$ }',
    forLoop: 'for ($INIT; $COND; $UPDATE) { $$$ }',
    forOf: 'for (const $VAR of $ITER) { $$$ }',
    forIn: 'for (const $KEY in $OBJ) { $$$ }',
    while: 'while ($COND) { $$$ }',
    switch: 'switch ($VAL) { $$$ }',
  },

  // Imports/Exports
  modules: {
    import: 'import $X from $PATH',
    importNamed: 'import { $$$ } from $PATH',
    importAll: 'import * as $ALIAS from $PATH',
    require: 'const $NAME = require($PATH)',
    exportNamed: 'export { $$$ }',
    exportDefault: 'export default $EXPR',
  },

  // React (TypeScript/JavaScript)
  react: {
    component: 'function $NAME($PROPS) { return $$$ }',
    useState: 'const [$STATE, $SETTER] = useState($INIT)',
    useEffect: 'useEffect(() => { $$$ }, [$$$])',
    useCallback: 'useCallback(($$$) => { $$$ }, [$$$])',
    useMemo: 'useMemo(() => $EXPR, [$$$])',
    useRef: 'useRef($INIT)',
  },

  // Testing
  testing: {
    describe: 'describe($DESC, () => { $$$ })',
    it: 'it($DESC, () => { $$$ })',
    test: 'test($DESC, () => { $$$ })',
    expect: 'expect($VAL).$MATCHER($$$)',
    beforeEach: 'beforeEach(() => { $$$ })',
    afterEach: 'afterEach(() => { $$$ })',
  },

  // Security Patterns
  security: {
    eval: 'eval($CODE)',
    dangerouslySetInnerHTML: 'dangerouslySetInnerHTML={{ __html: $HTML }}',
    execSync: 'execSync($CMD)',
    spawn: 'spawn($CMD, $ARGS)',
    sqlQuery: '$DB.query($SQL)',
  },

  // Error Handling
  errors: {
    throw: 'throw new $ERROR($MSG)',
    throwError: 'throw new Error($MSG)',
    catchError: 'catch ($E) { $$$ }',
    reject: 'reject($ERROR)',
    rejectError: 'reject(new Error($MSG))',
  },

  // Common Patterns
  common: {
    consoleLog: 'console.log($$$)',
    consoleError: 'console.error($$$)',
    jsonParse: 'JSON.parse($STR)',
    jsonStringify: 'JSON.stringify($OBJ)',
    fetchCall: 'fetch($URL)',
    awaitFetch: 'await fetch($URL)',
  },
};
```

---

### 3.6 Merkle Tree (Incremental Indexing)

**File:** `.claude/lib/code-indexing/merkle-tree.cjs`

**Purpose:** Efficient change detection for incremental index updates.

**Interface:**
```javascript
/**
 * Merkle tree for file change detection
 * @class MerkleTree
 */
class MerkleTree {
  /**
   * Build Merkle tree from directory
   * @param {string} rootDir - Root directory to scan
   * @param {Object} options - Options
   * @param {string[]} options.exclude - Patterns to exclude
   * @returns {Promise<MerkleNode>} Root node
   */
  async build(rootDir, options = {})

  /**
   * Diff two Merkle trees to find changes
   * @param {MerkleNode} oldTree - Previous tree state
   * @param {MerkleNode} newTree - Current tree state
   * @returns {MerkleTreeDiff} Changes detected
   */
  diff(oldTree, newTree)

  /**
   * Save tree state to JSON
   * @param {MerkleNode} tree - Tree to save
   * @param {string} filePath - Output path
   */
  async save(tree, filePath)

  /**
   * Load tree state from JSON
   * @param {string} filePath - Input path
   * @returns {Promise<MerkleNode>} Loaded tree
   */
  async load(filePath)
}

/**
 * Merkle tree node
 * @typedef {Object} MerkleNode
 * @property {string} path - File/directory path
 * @property {string} hash - Content hash (SHA-256)
 * @property {'file' | 'directory'} type - Node type
 * @property {MerkleNode[]} children - Child nodes (for directories)
 * @property {number} size - File size (for files)
 * @property {string} mtime - Last modified time
 */

/**
 * Merkle tree diff result
 * @typedef {Object} MerkleTreeDiff
 * @property {string[]} added - New files
 * @property {string[]} modified - Changed files
 * @property {string[]} deleted - Removed files
 * @property {number} totalChanges - Total change count
 */
```

---

### 3.7 File Watcher

**File:** `.claude/lib/code-indexing/file-watcher.cjs`

**Purpose:** Watch for file changes and trigger incremental index updates.

**Interface:**
```javascript
/**
 * File watcher for auto-updating index
 * @class FileWatcher
 */
class FileWatcher {
  /**
   * Initialize watcher
   * @param {Object} options - Configuration
   * @param {string} options.projectRoot - Root directory to watch
   * @param {string[]} options.include - Patterns to include
   * @param {string[]} options.exclude - Patterns to exclude
   * @param {number} options.debounce - Debounce time in ms (default: 2000)
   */
  constructor(options = {})

  /**
   * Start watching for changes
   * @param {Function} onChange - Callback when files change
   */
  start(onChange)

  /**
   * Stop watching
   */
  stop()

  /**
   * Get current watch status
   * @returns {WatchStatus} Current status
   */
  getStatus()
}

/**
 * Watch status
 * @typedef {Object} WatchStatus
 * @property {boolean} running - Whether watcher is active
 * @property {number} filesWatched - Number of files being watched
 * @property {number} changesQueued - Pending changes in debounce
 * @property {string} lastUpdate - Last update timestamp
 */
```

---

## 4. Integration Points

### 4.1 Integration with Phase 1

**No Breaking Changes:** Phase 2 extends Phase 1 without modifying existing interfaces.

| Phase 1 Component | Phase 2 Integration |
|-------------------|---------------------|
| `index-manager.cjs` | Extended with `hybridSearch()` method |
| `vector-db.cjs` | Unchanged (used by hybrid search) |
| `embedding-generator.cjs` | Unchanged (used by semantic stage) |
| `semantic-chunker.cjs` | Unchanged |
| `code-parser.cjs` | Unchanged |

**Extended IndexManager:**
```javascript
// New method added to IndexManager
class IndexManager {
  // ... existing methods ...

  /**
   * Perform hybrid search (Phase 2)
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @returns {Promise<HybridSearchResult>} Hybrid search results
   */
  async hybridSearch(query, options = {}) {
    if (!this.hybridEngine) {
      this.hybridEngine = new HybridSearchEngine({
        indexManager: this,
        astGrep: new AstGrepSearch({ projectRoot: this.options.projectRoot }),
        weights: options.weights || { semantic: 0.7, structural: 0.3 }
      });
    }
    return this.hybridEngine.search(query, options);
  }
}
```

### 4.2 CLI Integration

**Extended Commands:**

```bash
# Existing Phase 1 commands (unchanged)
node .claude/tools/cli/index-codebase.cjs index <path>
node .claude/tools/cli/index-codebase.cjs search <query>
node .claude/tools/cli/index-codebase.cjs status
node .claude/tools/cli/index-codebase.cjs clear --confirm

# New Phase 2 commands
node .claude/tools/cli/index-codebase.cjs hybrid-search <query> [--pattern <ast-grep-pattern>]
node .claude/tools/cli/index-codebase.cjs structural-search <pattern> [--lang <language>]
node .claude/tools/cli/index-codebase.cjs refine <query> --pattern <ast-grep-pattern>
node .claude/tools/cli/index-codebase.cjs watch [--auto-index]
```

**Example Usage:**
```bash
# Hybrid search with auto-generated pattern
node .claude/tools/cli/index-codebase.cjs hybrid-search "async authentication functions"

# Hybrid search with explicit pattern
node .claude/tools/cli/index-codebase.cjs hybrid-search "error handling" \
  --pattern "try { \$\$\$ } catch (\$E) { \$\$\$ }"

# Structural-only search
node .claude/tools/cli/index-codebase.cjs structural-search \
  "function \$NAME(\$\$\$) { return await \$\$\$ }" \
  --lang typescript

# Refine semantic results
node .claude/tools/cli/index-codebase.cjs refine "database queries" \
  --pattern "\$DB.query(\$SQL)"

# Watch for changes
node .claude/tools/cli/index-codebase.cjs watch --auto-index
```

### 4.3 Skill Integration

**New Skills:**

| Skill | Purpose | File |
|-------|---------|------|
| `code-structural-search` | AST pattern-based search | `.claude/skills/code-structural-search/SKILL.md` |
| `code-hybrid-search` | Combined semantic + structural | `.claude/skills/code-hybrid-search/SKILL.md` |

**Enhanced Existing Skill:**

| Skill | Enhancement |
|-------|-------------|
| `code-semantic-search` | Add `--hybrid` flag for hybrid mode |

---

## 5. Performance Targets

### 5.1 Latency Targets

| Stage | Target | Phase 1 Actual | Phase 2 Target | Notes |
|-------|--------|----------------|----------------|-------|
| **Ripgrep** | <100ms | N/A | <100ms | Pre-filter only |
| **Semantic (cold)** | <500ms | 700ms | 700ms | First search |
| **Semantic (cached)** | <50ms | 0.9ms | 50ms | Subsequent |
| **ast-grep** | <100ms | N/A | <50ms | Pattern matching |
| **Combine/Rank** | <10ms | N/A | <10ms | In-memory |
| **Total (cold)** | <1000ms | 700ms | <800ms | First hybrid search |
| **Total (cached)** | <200ms | 0.9ms | <150ms | Subsequent |

### 5.2 Accuracy Targets

| Metric | Phase 1 | Phase 2 Target | Measurement |
|--------|---------|----------------|-------------|
| **Semantic Relevance** | 80% | 80% | Top-5 accuracy |
| **Structural Precision** | N/A | 99%+ | Exact pattern match |
| **Hybrid Accuracy** | N/A | 95%+ | Combined relevance |
| **False Positives** | 20% | 5% | Irrelevant in top-10 |

### 5.3 Resource Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Memory (Phase 2)** | +50MB | On top of Phase 1 |
| **Disk (Merkle)** | <10MB | Merkle tree state |
| **CPU (ast-grep)** | <1 core | Single-threaded |
| **ast-grep Binary** | ~10MB | Pre-built binary |

---

## 6. Implementation Plan

### 6.1 Phase 2.1: ast-grep Integration (3-4 days)

**Tasks:**

| Task | Description | Effort |
|------|-------------|--------|
| 2.1.1 | Install and verify ast-grep binary | 2h |
| 2.1.2 | Create ast-grep-wrapper.cjs skeleton | 2h |
| 2.1.3 | Implement search() method | 4h |
| 2.1.4 | Implement refine() method | 4h |
| 2.1.5 | Add error handling and timeout | 2h |
| 2.1.6 | Write unit tests | 4h |
| 2.1.7 | Performance benchmarking | 2h |

**Success Criteria:**
- ast-grep CLI accessible and working
- search() returns valid results
- refine() filters semantic results correctly
- All tests passing

### 6.2 Phase 2.2: Hybrid Orchestration (3-4 days)

**Tasks:**

| Task | Description | Effort |
|------|-------------|--------|
| 2.2.1 | Create query-analyzer.cjs | 4h |
| 2.2.2 | Create result-ranker.cjs | 4h |
| 2.2.3 | Create hybrid-search.cjs | 6h |
| 2.2.4 | Implement three-stage pipeline | 4h |
| 2.2.5 | Add ripgrep pre-filtering | 3h |
| 2.2.6 | Write integration tests | 4h |
| 2.2.7 | Performance optimization | 3h |

**Success Criteria:**
- Hybrid search returns combined results
- Scores correctly weighted
- Deduplication working
- All tests passing

### 6.3 Phase 2.3: CLI and Skills (2-3 days)

**Tasks:**

| Task | Description | Effort |
|------|-------------|--------|
| 2.3.1 | Add hybrid-search CLI command | 3h |
| 2.3.2 | Add structural-search CLI command | 2h |
| 2.3.3 | Add refine CLI command | 2h |
| 2.3.4 | Create code-structural-search skill | 3h |
| 2.3.5 | Create code-hybrid-search skill | 3h |
| 2.3.6 | Update code-semantic-search skill | 2h |
| 2.3.7 | Write CLI tests | 2h |

**Success Criteria:**
- All CLI commands working
- Skills documented and functional
- Integration with agent system verified

### 6.4 Phase 2.4: Advanced Features (3-4 days)

**Tasks:**

| Task | Description | Effort |
|------|-------------|--------|
| 2.4.1 | Create merkle-tree.cjs | 4h |
| 2.4.2 | Implement incremental indexing | 4h |
| 2.4.3 | Create file-watcher.cjs | 4h |
| 2.4.4 | Add watch CLI command | 2h |
| 2.4.5 | Create pattern-library.cjs | 3h |
| 2.4.6 | Add persistent VectorDB (ChromaDB) | 4h |
| 2.4.7 | Query caching | 3h |

**Success Criteria:**
- Incremental indexing <5s for small changes
- File watcher auto-updates index
- Persistent storage working
- Query cache improves repeated searches

### 6.5 Phase 2.5: Integration & Optimization (2-3 days)

**Tasks:**

| Task | Description | Effort |
|------|-------------|--------|
| 2.5.1 | End-to-end integration tests | 4h |
| 2.5.2 | Performance optimization | 4h |
| 2.5.3 | Documentation updates | 3h |
| 2.5.4 | Usage guides | 2h |
| 2.5.5 | Agent integration verification | 3h |

**Success Criteria:**
- All integration tests passing
- Performance targets met
- Documentation complete
- Agents can use hybrid search

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| ast-grep binary not available on all platforms | Medium | High | Provide fallback to semantic-only search |
| ast-grep patterns complex for users | Medium | Medium | Pre-built pattern library, auto-generation |
| Performance regression from additional stage | Low | Medium | Parallel execution, caching |
| Merkle tree state corruption | Low | Medium | Checksums, auto-rebuild |
| ChromaDB server dependency | Medium | Medium | Keep in-memory fallback |

---

## 8. Success Criteria

### 8.1 Functional Requirements

- [ ] ast-grep integration working with all supported languages
- [ ] Hybrid search returns results with both semantic and structural scores
- [ ] Query analyzer correctly detects query types
- [ ] Pattern library covers common use cases
- [ ] CLI commands all functional
- [ ] Agent skills work correctly

### 8.2 Performance Requirements

- [ ] Total hybrid search latency <800ms (cold), <150ms (cached)
- [ ] ast-grep stage <50ms
- [ ] Incremental indexing <5s for small changes
- [ ] Memory usage increase <50MB

### 8.3 Quality Requirements

- [ ] Hybrid accuracy 95%+
- [ ] All tests passing (unit + integration)
- [ ] Documentation complete
- [ ] No breaking changes to Phase 1 API

---

## 9. Future Roadmap (Phase 3)

| Feature | Description | Priority |
|---------|-------------|----------|
| Query Expansion | Auto-generate multiple ast-grep patterns from query | High |
| Pattern Templates | Domain-specific pattern sets (React, Express, etc.) | Medium |
| Security Scanning | Find vulnerable code patterns | High |
| Architecture Analysis | Detect dependency and structure patterns | Medium |
| Code Similarity | Find similar code across codebase | Medium |
| Refactoring Suggestions | Suggest improvements based on patterns | Low |

---

## 10. References

- [ast-grep Documentation](https://ast-grep.github.io/)
- [ast-grep Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html)
- [tree-sitter Patterns](https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries)
- [Phase 1 Design Document](../docs/CODE_INDEXING_DESIGN.md)
- [Phase 1 Implementation Plan](./PHASE_1_IMPLEMENTATION_PLAN.md)
