/**
 * Integration Tests for Semantic Search with LanceDB (embedded)
 *
 * Validates MemoryVectorStore.search() behavior without requiring Docker/server.
 *
 * Related: Core Fundamentals Remediation (ChromaDB -> LanceDB)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

const { MemoryVectorStore } = require(
  path.join(PROJECT_ROOT, '.claude/lib/memory/lancedb-client.cjs')
);

describe('Semantic Search Integration Tests (LanceDB)', () => {
  let vectorStore;
  let persistDirectory;

  beforeEach(async () => {
    persistDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-lancedb-it-'));
    vectorStore = new MemoryVectorStore({
      persistDirectory,
      collectionName: 'test_semantic_search_integration',
      embeddingMode: 'test',
    });

    const available = await vectorStore.isAvailable();
    if (!available) {
      throw new Error('LanceDB unavailable. Cannot run semantic search integration tests.');
    }
  });

  afterEach(async () => {
    try {
      await vectorStore?.close?.();
    } catch {
      // ignore
    }
    if (persistDirectory && fs.existsSync(persistDirectory)) {
      fs.rmSync(persistDirectory, { recursive: true, force: true });
    }
  });

  it('should perform basic search and return best match first', async () => {
    await vectorStore.upsertDocuments([
      {
        id: 'doc-1',
        text: 'LanceDB is an embedded vector database for AI applications',
        metadata: { type: 'learning', source: 'learnings.md', line: 10 },
      },
      {
        id: 'doc-2',
        text: 'SQLite is a relational database for structured data',
        metadata: { type: 'learning', source: 'learnings.md', line: 20 },
      },
    ]);

    const results = await vectorStore.search(
      'LanceDB is an embedded vector database for AI applications',
      {
        limit: 5,
      }
    );

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].id, 'doc-1');
    assert.ok(typeof results[0].similarity === 'number');
  });

  it('should return results with correct structure', async () => {
    await vectorStore.upsertDocuments([
      {
        id: 'test-1',
        text: 'Test document for structure validation',
        metadata: { type: 'learning', tag: 'test' },
      },
    ]);

    const results = await vectorStore.search('Test document for structure validation', {
      limit: 1,
    });
    assert.strictEqual(results.length, 1);

    const r = results[0];
    assert.ok(r.id);
    assert.ok(r.content);
    assert.ok(r.metadata && typeof r.metadata === 'object');
    assert.ok(typeof r.similarity === 'number');
  });

  it('should support metadata filters (object form)', async () => {
    await vectorStore.upsertDocuments([
      {
        id: 'learning-1',
        text: 'A learning about embeddings',
        metadata: { type: 'learning', source: 'learnings.md' },
      },
      {
        id: 'decision-1',
        text: 'A decision about architecture',
        metadata: { type: 'decision', source: 'decisions.md' },
      },
    ]);

    const results = await vectorStore.search('A decision about architecture', {
      limit: 10,
      filters: { type: 'decision' },
    });

    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.metadata.type === 'decision'));
  });
});
