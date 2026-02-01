#!/usr/bin/env node
'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { MemoryVectorStore } = require('../.claude/lib/memory/lancedb-client.cjs');

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (_err) {
    // ignore
  }
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-lancedb-integration-'));
  const persistDirectory = path.join(tempRoot, 'lancedb');

  const store = new MemoryVectorStore({
    persistDirectory,
    collectionName: 'integration_test',
    // Prefer local embeddings, but allow the client to fall back to mock if deps are missing.
    embeddingMode: 'transformers',
  });

  try {
    await store.initialize();

    const usingMock =
      typeof store.embedder === 'function' && store.embedder.toString().includes('Math.random');

    console.log(`[LanceDB integration] persistDirectory=${persistDirectory}`);
    console.log(
      `[LanceDB integration] embeddingMode=requested(transformers) active(${usingMock ? 'mock' : 'transformers'})`
    );

    await store.upsertDocuments([
      {
        id: 'doc1',
        content: 'JWT authentication flow and refresh tokens',
        metadata: { type: 'security' },
      },
      {
        id: 'doc2',
        content: 'SQLite schema initialization and migrations',
        metadata: { type: 'db' },
      },
      {
        id: 'doc3',
        content: 'Prompt engineering and tool usage patterns',
        metadata: { type: 'prompt' },
      },
    ]);

    const results = await store.search('authentication tokens', {
      limit: 5,
    });

    if (!Array.isArray(results)) {
      throw new Error('Expected search() to return an array');
    }

    console.log(`[LanceDB integration] search results=${results.length}`);
    if (results[0]) {
      console.log(`[LanceDB integration] top=${JSON.stringify(results[0])}`);
    }
  } finally {
    await store.close();
    rmrf(tempRoot);
  }
}

main().catch(err => {
  console.error('[LanceDB integration] FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
