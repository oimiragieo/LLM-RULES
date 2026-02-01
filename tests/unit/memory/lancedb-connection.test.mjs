/**
 * LanceDB Connection Smoke Test
 *
 * Tests basic LanceDB initialization and search wiring without requiring Docker/server.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

let MemoryVectorStore;

describe('LanceDB Connection', () => {
  const testPersistDir = join(PROJECT_ROOT, '.claude', 'data', 'lancedb-test');

  before(async () => {
    if (!existsSync(testPersistDir)) {
      mkdirSync(testPersistDir, { recursive: true });
    }

    const clientPath = join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'lancedb-client.cjs');
    const clientModule = await import(`file:///${clientPath.replace(/\\/g, '/')}`);
    MemoryVectorStore = clientModule.MemoryVectorStore;
  });

  it('should create MemoryVectorStore instance', () => {
    const store = new MemoryVectorStore({
      persistDirectory: testPersistDir,
      collectionName: 'test-table',
      embeddingMode: 'test',
    });

    assert.ok(store);
    assert.strictEqual(typeof store.initialize, 'function');
    assert.strictEqual(typeof store.search, 'function');
  });

  it('should report availability', async () => {
    const store = new MemoryVectorStore({
      persistDirectory: testPersistDir,
      collectionName: 'test-available',
      embeddingMode: 'test',
    });

    const available = await store.isAvailable();
    assert.strictEqual(available, true);
  });
});
