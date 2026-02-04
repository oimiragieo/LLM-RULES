# Text Processing

## Sentence Chunker

Use .claude/lib/text-processing/sentence-chunker.cjs for non-code documents and long prose. It splits text into sentence-aware chunks with character interval metadata.

**Why:** Keeps chunks aligned with sentence boundaries to reduce semantic drift when indexing or analyzing prose.

**Usage:**

```js
const { chunkBySentences } = require('./.claude/lib/text-processing/sentence-chunker.cjs');
const chunks = chunkBySentences(text, { maxCharBuffer: 1000, includeTokenCount: true });
```

Each chunk includes `content`, `startIndex`, and `endIndex` (and optional `tokenCount`).
