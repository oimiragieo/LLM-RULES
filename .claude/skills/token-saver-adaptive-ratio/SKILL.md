---
source: builtin
trust_score: 100
provenance_sha: 31cd24bf51f50786
---

# Token Saver Adaptive Ratio

Computes adaptive skeleton ratio based on corpus token count for context compression.

## Purpose

This skill provides the `computeAdaptiveRatio` function that determines the optimal compression ratio based on the size of the context corpus:

- **<8K tokens**: Returns 0.8 (keep 80% of content)
- **8-32K tokens**: Returns 0.5 (keep 50% of content)
- **32-100K tokens**: Returns 0.2 (keep 20% of content)
- **>100K tokens**: Returns 0.1 (keep 10% of content)

## Usage

```javascript
const { computeAdaptiveRatio } = require('./scripts/main.cjs');

const ratio = computeAdaptiveRatio(50000); // Returns 0.2
```

## When to Use

- Before running context compression to determine the target compression ratio
- When estimating token budget for large file reads
- As part of the token-saver-context-compression workflow

## Implementation

Re-exports the `computeAdaptiveRatio` function from `token-saver-context-compression` for module resolution and testing purposes.
