#!/usr/bin/env node
/**
 * Memory Search Utility
 * Provides semantic search across memory using ContextualMemory.
 */

'use strict';

const memoryManager = require('./memory-manager.cjs');
const { SEMANTIC_SEARCH_DEFAULT_THRESHOLD } = require('./memory-constants.cjs');

async function main() {
  const query = process.argv.slice(2).join(' ').trim();

  if (!query) {
    console.error('Usage: node .claude/lib/memory/memory-search.cjs "search query"');
    return 1;
  }

  try {
    const results = await memoryManager.searchMemory(query, {
      limit: 10,
      threshold: SEMANTIC_SEARCH_DEFAULT_THRESHOLD,
    });

    console.log(`Found ${results.length} results for: "${query}"\n`);

    for (const result of results) {
      const src = result?.source || 'unknown';
      const sim = typeof result?.similarity === 'number' ? result.similarity : null;
      const prefix = sim === null ? `[${src}]` : `[${src}] Similarity: ${(sim * 100).toFixed(1)}%`;

      console.log(prefix);
      if (result?.content) {
        console.log(String(result.content).slice(0, 200) + '...\n');
      } else {
        console.log('(no content)\n');
      }
    }
  } catch (err) {
    console.error('Search failed:', err.message);
    return 1;
  }

  return 0;
}

if (require.main === module) {
  main()
    .then(code => {
      if (typeof code === 'number' && code !== 0) {
        process.exitCode = code;
      }
    })
    .catch(err => {
      console.error('Search failed:', err?.message || err);
      process.exitCode = 1;
    });
}

module.exports = { main };
