---
name: token-saver-memory-dedup
description: Helper skill that deduplicates token-saver memory records before persistence.
version: 1.0.0
category: helper
invoked_by: skill
user_invocable: false
agents: [context-compressor]
tags: [token-saver, memory, deduplication, helper]
source: builtin
trust_score: 100
provenance_sha: 323f2531fc4f8d0f
---

# Token Saver Memory Dedup

Deduplicates memory records against existing memory files to prevent duplicate entries.

## Purpose

This skill provides the `deduplicateAgainstMemory` function that filters out memory records that already exist in the memory system:

- Compares incoming records against `patterns.json` and `gotchas.json`
- Case-insensitive matching for deduplication
- Returns statistics about total, kept, and filtered records
- Handles corrupt or missing memory files gracefully

## Usage

```javascript
const { deduplicateAgainstMemory } = require('./scripts/main.cjs');

const records = {
  patterns: [{ text: 'Use canonical transitions', timestamp: '2026-01-01', source: 'test' }],
  gotchas: [{ text: 'Avoid shell: true for spawn', timestamp: '2026-01-01', source: 'test' }],
  issues: [],
  decisions: [],
};

const { dedupedRecords, stats } = deduplicateAgainstMemory(records, '/path/to/memory');
```

## When to Use

- Before persisting memory records to avoid duplicates
- As part of the token-saver-context-compression workflow
- When syncing memory records between sessions

## Implementation

Re-exports the `deduplicateAgainstMemory` function from `token-saver-context-compression` for module resolution and testing purposes.
