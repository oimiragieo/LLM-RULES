/**
 * Unit tests for semantic search API (LanceDB embedded)
 *
 * Uses embeddingMode=test to avoid model downloads.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const { MemoryVectorStore } = await import(
  `file:///${path.join(PROJECT_ROOT, '.claude/lib/memory/lancedb-client.cjs').replace(/\\/g, '/')}`
);

describe('Semantic Search API Unit Tests (LanceDB)', () => {
  let vectorStore;
  let persistDirectory;

  beforeEach(async () => {
    persistDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-lancedb-unit-'));
    vectorStore = new MemoryVectorStore({
      persistDirectory,
      collectionName: 'unit-semantic-search',
      embeddingMode: 'test',
    });

    const available = await vectorStore.isAvailable();
    assert.ok(available, 'LanceDB should be available');

    await vectorStore.upsertDocuments([
      {
        id: 'doc-1',
        text: 'Vector databases store embeddings for similarity search',
        metadata: { type: 'learning' },
      },
      {
        id: 'doc-2',
        text: 'Relational databases store structured tables',
        metadata: { type: 'decision' },
      },
    ]);
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

  it('should return results with correct structure', async () => {
    const results = await vectorStore.search(
      'Vector databases store embeddings for similarity search',
      {
        limit: 2,
      }
    );

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0);

    const r = results[0];
    assert.ok(r.id);
    assert.ok(r.content);
    assert.ok(r.metadata && typeof r.metadata === 'object');
    assert.ok(typeof r.similarity === 'number');
  });

  it('should enforce minScore filtering', async () => {
    const results = await vectorStore.search(
      'Vector databases store embeddings for similarity search',
      {
        limit: 10,
        minScore: 0.95,
      }
    );

    // Exact match should survive minScore threshold in embeddingMode=test
    assert.ok(results.length >= 1);
    assert.ok(results.every(r => r.similarity >= 0.95));
  });

  it('should support metadata filters (object form)', async () => {
    const results = await vectorStore.search('Relational databases store structured tables', {
      limit: 10,
      filters: { type: 'decision' },
    });

    assert.ok(results.length >= 1);
    assert.ok(results.every(r => r.metadata.type === 'decision'));
  });
});
