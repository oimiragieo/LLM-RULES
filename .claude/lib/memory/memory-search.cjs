#!/usr/bin/env node
/**
 * Memory Search Utility
 * Provides semantic search across memory using ContextualMemory.
 */

'use strict';

const { ContextualMemory } = require('./contextual-memory.cjs');

async function main() {
  const query = process.argv.slice(2).join(' ').trim();

  if (!query) {
    console.error('Usage: node .claude/lib/memory/memory-search.cjs "search query"');
    process.exit(1);
  }

  try {
    const memory = new ContextualMemory();
    const results = await memory.search(query, { limit: 10 });

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

    memory.close();
  } catch (err) {
    console.error('Search failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

