#!/usr/bin/env node
'use strict';

// Preload the LanceDB client and the embedder dependencies in the background.
// This allows the OS to cache binary dependencies in memory and pre-download
// any missing models, making the first ACTUAL semantic search in the host
// process dramatically faster.

const { MemoryVectorStore } = require('../../lib/memory/lancedb-client-impl.cjs');
const { createLogger } = require('../../lib/utils/logger.cjs');

async function main() {
  const logger = createLogger('vector-db-warmstart');
  try {
    const start = Date.now();
    const store = new MemoryVectorStore();

    // Background initialization -> downloads models, compiles native code, primes OS cache
    await store.initialize();

    // Request a dummy embedding to ensure the pipeline is fully compiled
    await store.generateEmbedding('hello world');

    logger.debug(
      `[Background] LanceDB and Embedder pipeline pre-compiled in ${Date.now() - start}ms.`
    );

    // Graceful cleanup
    if (typeof store.close === 'function') {
      await store.close();
    }
    process.exit(0);
  } catch (err) {
    logger.warn(`[Background] Embedder preload failed: ${err.message}`);
    process.exit(0);
  }
}

if (require.main === module) {
  main().catch(() => process.exit(0));
}
