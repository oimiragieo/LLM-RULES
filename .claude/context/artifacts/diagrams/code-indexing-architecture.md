# Code Indexing Architecture Diagrams

**Version:** 1.0
**Author:** Architect Agent (Task #35)
**Date:** 2026-01-31
**Related:** CODE_INDEXING_DESIGN.md

---

## 1. System Overview

```mermaid
graph TB
    subgraph "Agent Layer"
        A[Developer Agent]
        B[Researcher Agent]
        C[Code-Reviewer Agent]
    end

    subgraph "Skill Layer"
        SK[code-semantic-search Skill]
    end

    subgraph "Query Pipeline"
        QP[Query Processor]
        QE[Query Expander]
        RR[Re-Ranker]
    end

    subgraph "Index Pipeline"
        CP[Code Parser<br/>tree-sitter]
        SC[Semantic Chunker]
        EG[Embedding Generator<br/>all-MiniLM-L6-v2]
        ME[Metadata Enricher]
    end

    subgraph "Storage Layer"
        CD[(ChromaDB<br/>Vector Store)]
        MT[(Merkle Tree<br/>Change Detection)]
    end

    subgraph "Source"
        SRC[Source Code<br/>JS/TS/Python/Go/Rust]
    end

    A --> SK
    B --> SK
    C --> SK

    SK --> QP
    QP --> QE
    QE --> CD
    CD --> RR
    RR --> SK

    SRC --> CP
    CP --> SC
    SC --> EG
    EG --> ME
    ME --> CD

    SRC --> MT
    MT --> CP
```

---

## 2. Indexing Pipeline (7-Step)

```mermaid
flowchart TD
    subgraph "Step 1: Code Parsing"
        A1[Source File] --> A2[tree-sitter Parser]
        A2 --> A3[Abstract Syntax Tree]
    end

    subgraph "Step 2: Semantic Chunking"
        A3 --> B1[Extract Functions]
        A3 --> B2[Extract Classes]
        A3 --> B3[Extract Types]
        B1 & B2 & B3 --> B4[Code Chunks<br/>50-2048 tokens]
    end

    subgraph "Step 3: Embedding Generation"
        B4 --> C1[Batch Texts]
        C1 --> C2[all-MiniLM-L6-v2]
        C2 --> C3[384-dim Vectors]
    end

    subgraph "Step 4: Metadata Enrichment"
        B4 --> D1[Extract Imports]
        B4 --> D2[Extract Signatures]
        B4 --> D3[Extract Docstrings]
        D1 & D2 & D3 --> D4[Rich Metadata]
    end

    subgraph "Step 5: Vector Storage"
        C3 --> E1[(ChromaDB)]
        D4 --> E1
    end

    subgraph "Step 6: Query Processing"
        E1 --> F1[Semantic Search]
        F1 --> F2[Metadata Filtering]
        F2 --> F3[Result Ranking]
    end

    subgraph "Step 7: Index Maintenance"
        G1[File Watcher] --> G2[Merkle Tree Diff]
        G2 --> G3[Incremental Update]
        G3 --> A1
    end
```

---

## 3. Query Flow

```mermaid
sequenceDiagram
    participant Agent
    participant Skill as code-semantic-search
    participant QP as QueryProcessor
    participant EG as EmbeddingGenerator
    participant VS as VectorStore
    participant RR as Re-Ranker

    Agent->>Skill: query("find auth middleware")
    Skill->>QP: process(query, options)

    Note over QP: Query Expansion
    QP->>QP: expand("auth middleware")<br/>→ "authentication authorization middleware handler"

    QP->>EG: embed(expandedQuery)
    EG-->>QP: [0.12, -0.34, ...]

    QP->>VS: search(embedding, filters)
    VS-->>QP: [{chunk, score}, ...]

    QP->>RR: rerank(results, query)
    Note over RR: Keyword boost<br/>Recency boost<br/>Diversity

    RR-->>QP: rankedResults
    QP-->>Skill: QueryResult
    Skill-->>Agent: [{code, path, lines, score}]
```

---

## 4. Merkle Tree Change Detection

```mermaid
graph TD
    subgraph "Initial State"
        A1[Root: abc123]
        A1 --> B1[src/: def456]
        A1 --> B2[lib/: ghi789]
        B1 --> C1[auth.ts: jkl012]
        B1 --> C2[api.ts: mno345]
        B2 --> C3[utils.ts: pqr678]
    end

    subgraph "After Edit"
        A2[Root: xyz789]
        A2 --> B3[src/: stu123]
        A2 --> B4[lib/: ghi789]
        B3 --> C4["auth.ts: CHANGED"]
        B3 --> C5[api.ts: mno345]
        B4 --> C6[utils.ts: pqr678]

        style C4 fill:#ff6b6b
        style B3 fill:#ffe066
        style A2 fill:#ffe066
    end

    subgraph "Diff Result"
        D1["Changed: src/auth.ts<br/>Unchanged: src/api.ts<br/>Unchanged: lib/utils.ts"]
    end

    A1 -.->|Compare Hashes| A2
    A2 --> D1
```

---

## 5. Component Architecture

```mermaid
classDiagram
    class CodeParser {
        -grammars: Map
        +parse(filePath): SyntaxTree
        +detectLanguage(path): string
        +isSupported(lang): boolean
    }

    class SemanticChunker {
        -config: ChunkConfig
        +chunk(ast): CodeChunk[]
        +splitLargeNode(node): CodeChunk[]
    }

    class EmbeddingGenerator {
        -model: Pipeline
        -cache: LRUCache
        +embed(text): number[]
        +batchEmbed(texts): number[][]
    }

    class MetadataEnricher {
        +enrich(chunk, ast): ChunkMetadata
        -extractImports(node): string[]
        -extractSignature(node): string
    }

    class CodeVectorStore {
        -client: ChromaClient
        -collection: Collection
        +addChunks(chunks, embeddings)
        +search(embedding, options): SearchResult[]
        +deleteByPath(path)
    }

    class QueryProcessor {
        -embedder: EmbeddingGenerator
        -store: CodeVectorStore
        +query(text, options): QueryResult
        +expandQuery(text): string
        +rerank(results): SearchResult[]
    }

    class IndexMaintainer {
        -parser: CodeParser
        -chunker: SemanticChunker
        -embedder: EmbeddingGenerator
        -store: CodeVectorStore
        -merkleTree: MerkleTree
        +fullIndex(): IndexResult
        +incrementalUpdate(): UpdateResult
        +startWatcher()
    }

    class MerkleTree {
        -root: MerkleNode
        +build(directory): void
        +diff(oldTree): ChangeSet
        +serialize(): JSON
        +deserialize(json): MerkleTree
    }

    CodeParser --> SemanticChunker
    SemanticChunker --> EmbeddingGenerator
    SemanticChunker --> MetadataEnricher
    EmbeddingGenerator --> CodeVectorStore
    MetadataEnricher --> CodeVectorStore

    QueryProcessor --> EmbeddingGenerator
    QueryProcessor --> CodeVectorStore

    IndexMaintainer --> CodeParser
    IndexMaintainer --> SemanticChunker
    IndexMaintainer --> EmbeddingGenerator
    IndexMaintainer --> CodeVectorStore
    IndexMaintainer --> MerkleTree
```

---

## 6. Data Flow

```mermaid
flowchart LR
    subgraph Input
        F1[.js files]
        F2[.ts files]
        F3[.py files]
        F4[.go files]
    end

    subgraph Parsing
        P1[tree-sitter-javascript]
        P2[tree-sitter-typescript]
        P3[tree-sitter-python]
        P4[tree-sitter-go]
    end

    subgraph Processing
        AST[AST Nodes]
        CHK[Code Chunks]
        EMB[Embeddings]
        META[Metadata]
    end

    subgraph Storage
        DB[(ChromaDB)]
    end

    F1 --> P1
    F2 --> P2
    F3 --> P3
    F4 --> P4

    P1 & P2 & P3 & P4 --> AST
    AST --> CHK
    CHK --> EMB
    CHK --> META

    EMB --> DB
    META --> DB
```

---

## 7. Skill Integration

```mermaid
graph LR
    subgraph "Agent Context"
        A[Developer Agent]
        S[Skill Invocation]
    end

    subgraph "Skill: code-semantic-search"
        SK[SKILL.md<br/>Documentation]
        SH[search-handler.cjs<br/>Implementation]
    end

    subgraph "Query System"
        QP[QueryProcessor]
        FB[Grep Fallback]
    end

    subgraph "Results"
        R1[Code Snippet]
        R2[File Path]
        R3[Line Numbers]
        R4[Relevance Score]
    end

    A -->|Skill| S
    S -->|skill: code-semantic-search| SK
    SK --> SH
    SH --> QP
    QP -->|success| R1 & R2 & R3 & R4
    QP -->|index unavailable| FB
    FB --> R1 & R2 & R3 & R4
```

---

## 8. File Structure

```
.claude/
├── lib/
│   └── code-indexing/
│       ├── code-parser.cjs          # tree-sitter wrapper
│       ├── semantic-chunker.cjs     # AST → chunks
│       ├── embedding-generator.cjs  # local embeddings
│       ├── metadata-enricher.cjs    # metadata extraction
│       ├── vector-store.cjs         # ChromaDB wrapper
│       ├── query-processor.cjs      # search pipeline
│       ├── index-maintainer.cjs     # sync + updates
│       ├── merkle-tree.cjs          # change detection
│       └── index.cjs                # exports
│
├── skills/
│   └── code-semantic-search/
│       ├── SKILL.md                 # agent docs
│       └── search-handler.cjs       # skill impl
│
├── tools/cli/
│   ├── index-codebase.cjs           # CLI: index
│   └── search-code.cjs              # CLI: search
│
├── data/
│   └── code-index/
│       ├── chromadb/                # vector storage
│       ├── merkle-tree.json         # tree state
│       └── index-metadata.json      # statistics
│
└── config/
    └── code-index-config.json       # configuration
```

---

## 9. Performance Targets

```mermaid
gantt
    title Query Latency Breakdown (Target: <500ms)
    dateFormat X
    axisFormat %L ms

    section Query Processing
    Query Expansion           :0, 20
    Query Embedding          :20, 50

    section Vector Search
    ChromaDB HNSW Search     :50, 100

    section Post-Processing
    Metadata Filtering       :100, 120
    Re-ranking               :120, 150
    Context Assembly         :150, 200

    section Buffer
    Safety Margin            :200, 500
```

---

## 10. Comparison: Before vs After

```mermaid
graph TB
    subgraph "Before: Grep/Glob"
        B1[User Query:<br/>'find auth middleware'] --> B2[Manual Translation:<br/>grep -r 'auth.*middleware']
        B2 --> B3[Pattern Matching:<br/>Line-by-line scan]
        B3 --> B4[Results:<br/>Many false positives<br/>2-5 seconds]
    end

    subgraph "After: Semantic Search"
        A1[User Query:<br/>'find auth middleware'] --> A2[Query Understanding:<br/>Intent + entities]
        A2 --> A3[Vector Search:<br/>Cosine similarity]
        A3 --> A4[Results:<br/>Relevant functions<br/><500ms]
    end

    B4 -.->|40% accuracy| X1[Miss: 'verifyToken'<br/>Miss: 'checkAuthorization']
    A4 -.->|80%+ accuracy| X2[Hit: authMiddleware<br/>Hit: verifyToken<br/>Hit: checkAuth]

    style A4 fill:#90EE90
    style B4 fill:#FFB6C1
```

---

## 11. Incremental Update Flow

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> Detecting: File Change Event
    Detecting --> Computing: Merkle Tree Diff

    Computing --> NoChanges: Hash Match
    NoChanges --> Idle

    Computing --> HasChanges: Hash Mismatch
    HasChanges --> Parsing: Changed Files

    Parsing --> Chunking: New AST
    Chunking --> Embedding: New Chunks
    Embedding --> Storing: New Vectors

    Storing --> Deleting: Remove Old Chunks
    Deleting --> Idle: Update Complete

    note right of Detecting: O(log n) comparison
    note right of Embedding: Batch processing
    note right of Storing: ChromaDB upsert
```

---

## 12. Error Handling

```mermaid
flowchart TD
    subgraph "Graceful Degradation"
        E1[Index Unavailable] --> F1[Fallback to Grep]
        E2[Embedding Failed] --> F2[Skip Chunk, Log Warning]
        E3[Parse Error] --> F3[Skip File, Continue]
        E4[ChromaDB Error] --> F4[Retry with Backoff]
    end

    subgraph "Fatal Errors"
        E5[Config Invalid] --> F5[Exit with Error]
        E6[No Permissions] --> F6[Exit with Error]
    end

    F1 --> R1[Partial Results]
    F2 --> R1
    F3 --> R1
    F4 --> R2[Eventual Success]
    F5 --> R3[Process Exit]
    F6 --> R3
```

---

## Summary

These diagrams illustrate:

1. **System Overview:** High-level architecture showing all components
2. **Indexing Pipeline:** The 7-step process from source to storage
3. **Query Flow:** Sequence diagram of search request handling
4. **Merkle Tree:** Change detection mechanism
5. **Component Architecture:** Class relationships
6. **Data Flow:** How code transforms through the pipeline
7. **Skill Integration:** Agent-to-skill communication
8. **File Structure:** Directory organization
9. **Performance Targets:** Latency breakdown
10. **Comparison:** Before/after semantic search
11. **Incremental Updates:** State machine for change handling
12. **Error Handling:** Graceful degradation paths
