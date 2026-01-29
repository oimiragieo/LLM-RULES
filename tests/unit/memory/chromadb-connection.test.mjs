/**
 * ChromaDB Connection Smoke Test
 *
 * Tests basic ChromaDB connection and collection creation.
 * This is the first test for Task #22 (P1-1.1).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// Dynamically import the ChromaDB client (will be created)
let MemoryVectorStore;

describe('ChromaDB Connection', () => {
  const testPersistDir = join(PROJECT_ROOT, '.claude', 'data', 'chromadb-test');

  before(async () => {
    // Ensure test directory exists
    if (!existsSync(testPersistDir)) {
      mkdirSync(testPersistDir, { recursive: true });
    }

    // Import the client (use file:// URL for Windows compatibility)
    const clientPath = join(PROJECT_ROOT, '.claude', 'lib', 'memory', 'chromadb-client.cjs');
    const clientModule = await import(`file:///${clientPath.replace(/\\/g, '/')}`);
    MemoryVectorStore = clientModule.MemoryVectorStore;
  });

  it('should create MemoryVectorStore instance', () => {
    const store = new MemoryVectorStore({
      persistDirectory: testPersistDir,
      collectionName: 'test-collection',
    });

    assert.ok(store, 'MemoryVectorStore instance should be created');
    assert.strictEqual(typeof store.initialize, 'function', 'Should have initialize method');
  });

  it('should initialize ChromaDB connection', async () => {
    const store = new MemoryVectorStore({
      persistDirectory: testPersistDir,
      collectionName: 'test-init-collection',
    });

    await store.initialize();
    assert.ok(store.isInitialized, 'Store should be initialized');
  });

  it('should verify configuration is set correctly', () => {
    const store = new MemoryVectorStore({
      persistDirectory: testPersistDir,
      collectionName: 'test-config-collection',
      host: 'localhost',
      port: 8000,
    });

    assert.strictEqual(
      store.config.persistDirectory,
      testPersistDir,
      'Persist directory should be set'
    );
    assert.strictEqual(
      store.config.collectionName,
      'test-config-collection',
      'Collection name should be set'
    );
    assert.strictEqual(store.config.host, 'localhost', 'Host should be set');
    assert.strictEqual(store.config.port, 8000, 'Port should be set');
  });

  after(async () => {
    // Cleanup is optional for smoke tests
    // Test directory can remain for inspection
  });
});
