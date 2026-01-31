# Code Indexing Technology Stack Rationale

**Version:** 1.0
**Status:** DRAFT
**Author:** Architect Agent (Task #35)
**Date:** 2026-01-31
**Parent Document:** CODE_INDEXING_DESIGN.md

---

## Overview

This document provides detailed reasoning for each technology choice in the Code Indexing and Semantic Search System, including alternatives considered, trade-offs, and decision rationale.

---

## 1. Code Parsing: tree-sitter

### Decision

**Selected:** tree-sitter (via node-tree-sitter)

### Alternatives Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **tree-sitter** | Incremental parsing library by GitHub | 40+ languages, battle-tested, incremental parsing, mature ecosystem | Native bindings, ~50MB per grammar, learning curve |
| **Babel** | JavaScript/TypeScript parser | Excellent JS/TS support, pure JS, no native deps | JS/TS only, no other languages |
| **esprima** | Fast JavaScript parser | Very fast, pure JS, lightweight | JavaScript only, dated |
| **@typescript-eslint/parser** | TypeScript-aware ESLint parser | Deep TypeScript understanding | TypeScript only, ESLint-focused |
| **Language-specific parsers** | Multiple parsers per language | Optimized for each language | N different APIs, N maintenance burdens |
| **Regex-based** | Pattern matching | Simple, no dependencies | Fragile, misses edge cases, no AST |

### Rationale

tree-sitter is the clear winner for multi-language semantic code analysis:

1. **Language Coverage:** Supports 40+ languages with a unified API. Adding a language is just adding a grammar package.

2. **Battle-Tested:** Used by GitHub (code navigation), Atom, Neovim, and many IDEs. The grammars are actively maintained.

3. **Incremental Parsing:** Can re-parse only changed sections, which aligns with our Merkle tree change detection strategy.

4. **AST Quality:** Produces a clean, traversable AST that makes semantic chunking straightforward.

5. **Cursor Precedent:** Cursor uses tree-sitter for their code indexing pipeline, validating the approach.

### Trade-offs Accepted

- **Native bindings:** Requires node-gyp build during install. May have issues on some platforms.
  - Mitigation: Pin versions, document known issues, test CI on Windows/Mac/Linux

- **Grammar size:** Each grammar is ~50MB loaded, but only loaded on demand.
  - Mitigation: Lazy loading, only load grammars for detected languages

- **Learning curve:** tree-sitter's query language has a learning curve.
  - Mitigation: Start with simple AST traversal, add query patterns incrementally

### Implementation Notes

```javascript
// Lazy grammar loading pattern
class CodeParser {
  #grammars = new Map();

  async getGrammar(language) {
    if (!this.#grammars.has(language)) {
      const Parser = require('tree-sitter');
      const grammar = require(`tree-sitter-${language}`);
      const parser = new Parser();
      parser.setLanguage(grammar);
      this.#grammars.set(language, parser);
    }
    return this.#grammars.get(language);
  }
}
```

---

## 2. Embedding Model: Local-First

### Decision

**Primary:** Xenova/all-MiniLM-L6-v2 (local, via transformers.js)
**Optional Fallback:** OpenAI text-embedding-3-small (cloud API)

### Alternatives Considered

| Option | Dimensions | Speed | Quality | Cost | Privacy |
|--------|------------|-------|---------|------|---------|
| **Xenova/all-MiniLM-L6-v2** | 384 | Very Fast | Good (0.82) | $0 | Local |
| **Xenova/all-mpnet-base-v2** | 768 | Fast | Better (0.88) | $0 | Local |
| **Ollama (nomic-embed-text)** | 768 | Fast | Good | $0 | Local |
| **OpenAI text-embedding-3-small** | 1536 | Fast | High (0.91) | $0.02/1M tokens | Cloud |
| **OpenAI text-embedding-3-large** | 3072 | Medium | Highest (0.95) | $0.13/1M tokens | Cloud |
| **Cohere embed-english-v3.0** | 1024 | Fast | High | $0.10/1M tokens | Cloud |
| **Voyage AI voyage-code-2** | 1536 | Fast | Best for code | $0.10/1M tokens | Cloud |

*Quality scores based on MTEB benchmark similarity tasks*

### Rationale

Local-first with optional cloud enhancement provides the best balance:

1. **Privacy Preservation:** Code never leaves the local machine. For proprietary codebases, this is essential.

2. **Zero Cost:** all-MiniLM-L6-v2 is free and runs locally. No API keys required for basic functionality.

3. **Offline Capability:** Works without internet connection, important for air-gapped environments.

4. **Acceptable Quality:** 0.82 quality score is sufficient for code search. Most queries find relevant code.

5. **Speed:** Local embeddings avoid network latency, making batch indexing faster.

6. **Optional Enhancement:** Users who want higher accuracy can enable OpenAI embeddings. The system is designed to support both.

### Trade-offs Accepted

- **Lower quality than cloud models:** 0.82 vs 0.91 (OpenAI). Some edge cases may have lower recall.
  - Mitigation: Query expansion, keyword fallback, optional cloud upgrade

- **Larger local footprint:** Model files are ~25MB each.
  - Mitigation: One-time download, cached in .claude/data/models

- **No code-specific training:** all-MiniLM-L6-v2 is trained on general text, not code.
  - Mitigation: Prepend language/type context, consider Voyage code model for Phase 4

### Implementation Notes

```javascript
// Using @xenova/transformers (ONNX runtime)
const { pipeline } = require('@xenova/transformers');

class LocalEmbedder {
  #embedder = null;

  async initialize() {
    this.#embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
  }

  async embed(text) {
    const output = await this.#embedder(text, {
      pooling: 'mean',
      normalize: true
    });
    return Array.from(output.data);
  }
}
```

---

## 3. Vector Database: ChromaDB

### Decision

**Selected:** ChromaDB (local, persistent mode)

### Alternatives Considered

| Option | Type | Cost | Performance | Complexity | Integration |
|--------|------|------|-------------|------------|-------------|
| **ChromaDB** | In-process | $0 | <10ms queries | Low | Existing in codebase |
| **Qdrant** | Server-based | $0 | <5ms queries | Medium | New dependency |
| **Milvus** | Server-based | $0 | <5ms queries | High | Heavy infrastructure |
| **Weaviate** | Server-based | $0 | <5ms queries | Medium | GraphQL-based |
| **Pinecone** | Cloud SaaS | $70+/month | <5ms queries | Low | External service |
| **pgvector** | PostgreSQL extension | $0 | 10-50ms | Medium | Requires PostgreSQL |
| **LanceDB** | Embedded | $0 | <10ms | Low | Newer, less mature |

### Rationale

ChromaDB is the optimal choice given our constraints:

1. **Existing Infrastructure:** Agent-Studio already uses ChromaDB for the memory system (ADR-054). Reusing it reduces dependencies and complexity.

2. **In-Process Mode:** ChromaDB can run in-process without a separate server. This aligns with our local-first philosophy.

3. **Persistence:** ChromaDB supports persistent storage to disk, enabling index survival across restarts.

4. **Performance:** <10ms query latency meets our <500ms target with room to spare.

5. **Simplicity:** No additional infrastructure (Docker, Kubernetes) required. Just npm install.

6. **HNSW Support:** ChromaDB uses HNSW (Hierarchical Navigable Small World) indexing, which provides excellent query performance for our use case.

### Trade-offs Accepted

- **Not the fastest:** Qdrant and Milvus are faster (5ms vs 10ms), but the difference is negligible for our use case.
  - Mitigation: 10ms is well within our 500ms target

- **JavaScript client limitations:** The ChromaDB JS client has fewer features than Python.
  - Mitigation: We use basic features (add, query, delete) which are well-supported

- **Single-node only:** ChromaDB doesn't scale horizontally.
  - Mitigation: Single-node is sufficient for local codebase indexing. If we need scale, we can migrate to Qdrant/Milvus later.

### Implementation Notes

```javascript
// Reusing ChromaDB infrastructure from ADR-054
const { ChromaClient } = require('chromadb');

class CodeVectorStore {
  constructor() {
    this.client = new ChromaClient({
      path: '.claude/data/code-index/chromadb'
    });
    this.collectionName = 'agent-studio-code';
  }

  async initialize() {
    this.collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' }
    });
  }
}
```

---

## 4. Change Detection: Merkle Trees

### Decision

**Selected:** Merkle trees + file content hashing

### Alternatives Considered

| Option | Detection Speed | Accuracy | Complexity | Storage |
|--------|-----------------|----------|------------|---------|
| **Merkle trees** | O(log n) diff | 100% | Medium | Tree JSON |
| **File modification time (mtime)** | O(n) | 99% (clock skew issues) | Low | Timestamp map |
| **Git status** | O(n) | 100% (for git-tracked) | Low | None |
| **File content hash** | O(n) | 100% | Low | Hash map |
| **inotify/fs.watch** | Real-time | 100% | Medium | Event buffer |
| **Polling** | O(n) per poll | 100% | Low | None |

### Rationale

Merkle trees provide the best balance for our requirements:

1. **Cursor Precedent:** Cursor uses Merkle trees for change detection. This validates the approach for code indexing.

2. **Efficient Diffing:** O(log n) diff algorithm means detecting changes in a 10,000-file project takes milliseconds, not seconds.

3. **Accuracy:** Content-based hashing guarantees no false negatives. If the hash changes, the file changed.

4. **Batch-Friendly:** Merkle trees naturally batch changes by directory, which aligns with our indexing strategy.

5. **Persistence:** The tree state can be persisted to JSON and restored, enabling resumable indexing.

### Trade-offs Accepted

- **More complex than mtime:** Merkle trees require building and maintaining a tree structure.
  - Mitigation: Clear abstraction in merkle-tree.cjs, well-tested implementation

- **Full read required for hashing:** Must read file contents to compute hash.
  - Mitigation: Use fast SHA-256, skip large files, cache hashes

- **No real-time detection:** Unlike fs.watch, we must explicitly check for changes.
  - Mitigation: Optional file watcher for development mode, explicit CLI for production

### Implementation Notes

```javascript
// Merkle tree node structure
class MerkleNode {
  constructor(path, isDirectory) {
    this.path = path;
    this.isDirectory = isDirectory;
    this.hash = null;
    this.children = isDirectory ? [] : null;
  }

  computeHash() {
    if (this.isDirectory) {
      const childHashes = this.children
        .map(c => c.hash)
        .sort()
        .join('');
      this.hash = sha256(childHashes);
    } else {
      this.hash = sha256(fs.readFileSync(this.path));
    }
  }
}

// Efficient diff
function diff(oldTree, newTree) {
  if (oldTree.hash === newTree.hash) {
    return []; // No changes in this subtree
  }
  // Recurse into children...
}
```

---

## 5. Implementation Language: Node.js/JavaScript

### Decision

**Selected:** Node.js with CommonJS modules (.cjs)

### Alternatives Considered

| Option | Ecosystem Fit | Performance | Tooling | Maintenance |
|--------|---------------|-------------|---------|-------------|
| **Node.js/JavaScript** | Native | Good | Excellent | Same as codebase |
| **Python** | Separate | Better for ML | Good | Separate runtime |
| **Rust** | Separate | Best | Moderate | Different expertise |
| **Go** | Separate | Good | Good | Different expertise |

### Rationale

Node.js is the obvious choice:

1. **Ecosystem Alignment:** Agent-Studio is JavaScript/Node.js based. All existing infrastructure is in .cjs/.mjs.

2. **No New Runtime:** No additional runtime dependencies. No Python, no Rust toolchain.

3. **Developer Familiarity:** The team knows JavaScript. No learning curve.

4. **Tool Compatibility:** Integrates naturally with existing CLI tools, skills, and hooks.

5. **ONNX Runtime:** @xenova/transformers brings ML capabilities to Node.js via ONNX, eliminating the need for Python.

### Trade-offs Accepted

- **Slower than Rust/Go:** Node.js is slower for CPU-bound tasks.
  - Mitigation: Most time is in I/O (file reads) and embedding generation (ONNX), not JavaScript. Parallelization via worker threads if needed.

- **No native ML ecosystem:** Python has more ML libraries.
  - Mitigation: @xenova/transformers covers our embedding needs. ChromaDB has a JS client.

### Implementation Notes

```javascript
// CommonJS for Node.js compatibility
// .cjs extension for clarity in mixed ES/CJS environment

// Consistent with existing infrastructure
const { ChromaClient } = require('chromadb');
const Parser = require('tree-sitter');

// Export pattern
module.exports = { CodeParser, SemanticChunker, ... };
```

---

## 6. Skill Integration: Native Skill

### Decision

**Selected:** Native Skill (`.claude/skills/code-semantic-search/SKILL.md`)

### Alternatives Considered

| Option | Integration | Complexity | Discoverability | Flexibility |
|--------|-------------|------------|-----------------|-------------|
| **Native Skill** | Seamless | Low | Via SkillCatalog | High |
| **MCP Server** | Separate process | High | Via MCP tools | Medium |
| **Hook** | Automatic | Medium | Hidden | Low |
| **CLI Tool** | Manual | Low | Via docs | Low |

### Rationale

A native Skill is the best fit for agent integration:

1. **Agent-Native:** Agents already use Skill() to invoke capabilities. Code search fits this pattern.

2. **Discoverability:** The skill appears in SkillCatalog, making it discoverable by agents.

3. **Flexibility:** Agents can choose when to use semantic search vs. grep/glob.

4. **No Infrastructure:** Unlike MCP servers, skills don't require separate processes.

5. **Consistency:** Follows the same pattern as other search-related skills (tool-search, ripgrep).

### Trade-offs Accepted

- **Not automatic:** Agents must explicitly invoke the skill.
  - Mitigation: Router can recommend the skill for code exploration tasks

- **In-process:** Search runs in the agent's context.
  - Mitigation: Search is fast (<500ms), doesn't block significantly

### Implementation Notes

```javascript
// Skill handler
// .claude/skills/code-semantic-search/search-handler.cjs

async function handleSearch(query, options = {}) {
  const processor = new QueryProcessor();
  await processor.initialize();

  try {
    return await processor.query(query, options);
  } catch (error) {
    // Fallback to grep
    console.warn('Semantic search unavailable, falling back to grep');
    return fallbackToGrep(query, options);
  }
}

module.exports = { handleSearch };
```

---

## Summary

| Component | Selected | Primary Reason |
|-----------|----------|----------------|
| Code Parser | tree-sitter | 40+ languages, battle-tested |
| Embedding Model | all-MiniLM-L6-v2 (local) | Free, private, offline |
| Vector Database | ChromaDB | Existing infrastructure |
| Change Detection | Merkle trees | O(log n) diffing, Cursor precedent |
| Language | Node.js/JavaScript | Ecosystem alignment |
| Integration | Native Skill | Agent-native, discoverable |

### Technology Stack Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Code Indexing System                         │
├─────────────────────────────────────────────────────────────────┤
│  Integration Layer                                               │
│  ├── Native Skill (code-semantic-search)                        │
│  └── CLI Tools (index-codebase.cjs, search-code.cjs)           │
├─────────────────────────────────────────────────────────────────┤
│  Processing Layer                                                │
│  ├── tree-sitter (code parsing, 40+ languages)                  │
│  ├── Semantic Chunker (AST → meaningful units)                  │
│  ├── @xenova/transformers (all-MiniLM-L6-v2 embeddings)        │
│  └── Query Processor (expansion, ranking, context)              │
├─────────────────────────────────────────────────────────────────┤
│  Storage Layer                                                   │
│  ├── ChromaDB (vector storage, HNSW index)                      │
│  └── Merkle Tree (change detection, JSON persistence)          │
├─────────────────────────────────────────────────────────────────┤
│  Runtime: Node.js (CommonJS)                                     │
│  Dependencies: chromadb, tree-sitter, @xenova/transformers      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Future Considerations

### Phase 4+ Enhancements

1. **Code-Specific Embeddings:** Evaluate Voyage AI voyage-code-2 for better code understanding.

2. **Hybrid Search:** Combine vector search with BM25 for keyword matching.

3. **Cross-File Context:** Build a call graph to understand relationships between files.

4. **IDE Integration:** VSCode extension using the same infrastructure.

5. **Distributed Mode:** If needed, migrate from ChromaDB to Qdrant for horizontal scaling.
