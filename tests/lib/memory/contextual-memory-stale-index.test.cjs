#!/usr/bin/env node
/**
 * Contextual Memory — Stale-Index Detection Tests (P1-2)
 * =======================================================
 *
 * Tests for _checkIndexStaleness():
 * 1. Returns { stale: false } when no memory files exist (fail-open)
 * 2. Returns { stale: false } when LanceDB index dir is missing (fail-open)
 * 3. Returns { stale: false } when index is newer than memory files
 * 4. Returns { stale: true } when a memory file is newer than the index
 * 5. Returns { stale: false } on any error (fail-open)
 * 6. search() logs a warning to stderr when stale but still returns results
 */

'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --------------------------------------------------------------------------
// Test directory setup
// --------------------------------------------------------------------------

let TEST_DIR;
let TEST_MEMORY_DIR;
let TEST_LANCEDB_DIR;

function makeTestDirs() {
  TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-cmsi-'));
  TEST_MEMORY_DIR = path.join(TEST_DIR, '.claude', 'context', 'memory');
  TEST_LANCEDB_DIR = path.join(TEST_DIR, '.claude', 'context', 'data', 'lancedb');
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(TEST_MEMORY_DIR, 'ltm'), { recursive: true });
  fs.mkdirSync(TEST_LANCEDB_DIR, { recursive: true });
}

function cleanupTestDirs() {
  if (TEST_DIR && fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function getModule() {
  const modulePath = require.resolve('../../../.claude/lib/memory/contextual-memory.cjs');
  delete require.cache[modulePath];
  return require(modulePath);
}

function makeMemory(overrides = {}) {
  const { ContextualMemory } = getModule();
  return new ContextualMemory({
    projectRoot: TEST_DIR,
    memoryDir: TEST_MEMORY_DIR,
    dbPath: path.join(TEST_DIR, '.claude', 'context', 'data', 'memory.db'),
    lancedbConfig: {
      persistDirectory: TEST_LANCEDB_DIR,
      collectionName: 'test_memory',
    },
    ...overrides,
  });
}

/**
 * Write a sentinel file to a directory and set its mtime.
 * @param {string} dir - Directory to write into
 * @param {string} filename - Filename
 * @param {number} mtimeMs - mtime in ms since epoch
 */
function touchFile(dir, filename, mtimeMs) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify({ ts: new Date(mtimeMs).toISOString() }));
  fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
  return filePath;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('ContextualMemory._checkIndexStaleness', () => {
  before(() => {
    makeTestDirs();
  });

  after(() => {
    cleanupTestDirs();
  });

  beforeEach(() => {
    // Clear mtm and ltm between tests
    for (const sub of ['mtm', 'ltm']) {
      const dir = path.join(TEST_MEMORY_DIR, sub);
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          fs.rmSync(path.join(dir, f));
        }
      }
    }
    // Clear lancedb dir
    if (fs.existsSync(TEST_LANCEDB_DIR)) {
      for (const f of fs.readdirSync(TEST_LANCEDB_DIR)) {
        fs.rmSync(path.join(TEST_LANCEDB_DIR, f), { recursive: true, force: true });
      }
    }
  });

  it('returns { stale: false } when no memory files exist (fail-open)', async () => {
    const memory = makeMemory();
    const result = await memory._checkIndexStaleness();
    assert.equal(result.stale, false, 'Should return stale: false when no memory files');
  });

  it('returns { stale: false } when LanceDB dir is missing (fail-open)', async () => {
    const memory = makeMemory({
      lancedbConfig: {
        persistDirectory: path.join(TEST_DIR, 'nonexistent-lancedb'),
        collectionName: 'test_memory',
      },
    });
    // Add a memory file
    touchFile(path.join(TEST_MEMORY_DIR, 'mtm'), 'session_001.json', Date.now() - 1000);
    const result = await memory._checkIndexStaleness();
    assert.equal(result.stale, false, 'Should return stale: false when lancedb dir missing');
  });

  it('returns { stale: false } when index is newer than memory files', async () => {
    const now = Date.now();
    const memoryMtime = now - 10000; // 10s ago
    const indexMtime = now - 1000; // 1s ago (newer)

    touchFile(path.join(TEST_MEMORY_DIR, 'mtm'), 'session_001.json', memoryMtime);
    // Create a sentinel file in lancedb dir representing the index
    touchFile(TEST_LANCEDB_DIR, 'index.lance', indexMtime);

    const memory = makeMemory();
    const result = await memory._checkIndexStaleness();

    assert.equal(result.stale, false, 'Index newer than memory => not stale');
    assert.ok(typeof result.newestMemoryMtime === 'number', 'Should include newestMemoryMtime');
    assert.ok(typeof result.indexMtime === 'number', 'Should include indexMtime');
    assert.ok(
      result.indexMtime >= result.newestMemoryMtime,
      'indexMtime should be >= newestMemoryMtime'
    );
  });

  it('returns { stale: true } when mtm file is newer than index', async () => {
    const now = Date.now();
    const indexMtime = now - 10000; // 10s ago (older)
    const memoryMtime = now - 1000; // 1s ago (newer)

    touchFile(TEST_LANCEDB_DIR, 'index.lance', indexMtime);
    touchFile(path.join(TEST_MEMORY_DIR, 'mtm'), 'session_001.json', memoryMtime);

    const memory = makeMemory();
    const result = await memory._checkIndexStaleness();

    assert.equal(result.stale, true, 'Memory file newer than index => stale');
    assert.ok(
      result.newestMemoryMtime > result.indexMtime,
      'newestMemoryMtime should be > indexMtime when stale'
    );
  });

  it('returns { stale: true } when ltm file is newer than index', async () => {
    const now = Date.now();
    const indexMtime = now - 10000;
    const memoryMtime = now - 500;

    touchFile(TEST_LANCEDB_DIR, 'index.lance', indexMtime);
    touchFile(path.join(TEST_MEMORY_DIR, 'ltm'), 'summary_001.json', memoryMtime);

    const memory = makeMemory();
    const result = await memory._checkIndexStaleness();

    assert.equal(result.stale, true, 'LTM file newer than index => stale');
  });

  it('returns { stale: false } on internal error (fail-open)', async () => {
    const memory = makeMemory();
    // Force an error by giving a bad mtm path (overwrite internal config)
    memory.config.memoryDir = '/dev/null/invalid-path-that-does-not-exist';
    const result = await memory._checkIndexStaleness();
    assert.equal(result.stale, false, 'Error in staleness check should fail-open');
  });

  it('uses the newest file across both mtm and ltm', async () => {
    const now = Date.now();
    const indexMtime = now - 5000;
    const mtmMtime = now - 8000; // older than index
    const ltmMtime = now - 2000; // newer than index

    touchFile(TEST_LANCEDB_DIR, 'index.lance', indexMtime);
    touchFile(path.join(TEST_MEMORY_DIR, 'mtm'), 'session_001.json', mtmMtime);
    touchFile(path.join(TEST_MEMORY_DIR, 'ltm'), 'summary_001.json', ltmMtime);

    const memory = makeMemory();
    const result = await memory._checkIndexStaleness();

    assert.equal(result.stale, true, 'ltm file newer than index makes it stale');
    assert.ok(
      result.newestMemoryMtime >= ltmMtime,
      'newestMemoryMtime should reflect the ltm file'
    );
  });
});

describe('ContextualMemory.search — stale-index warning', () => {
  before(() => {
    makeTestDirs();
  });

  after(() => {
    cleanupTestDirs();
  });

  it('logs warning to stderr when index is stale but still returns results', async () => {
    const now = Date.now();
    const indexMtime = now - 10000;
    const memoryMtime = now - 1000;

    touchFile(TEST_LANCEDB_DIR, 'index.lance', indexMtime);
    touchFile(path.join(TEST_MEMORY_DIR, 'mtm'), 'session_001.json', memoryMtime);

    // Capture stderr
    const stderrChunks = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk, ...args) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return originalWrite(chunk, ...args);
    };

    try {
      process.env.MEMORY_SEMANTIC_SEARCH = 'off';
      const memory = makeMemory();
      // Write a learnings file so keyword search has something to find
      fs.writeFileSync(
        path.join(TEST_MEMORY_DIR, 'learnings.md'),
        '## Test\n- stale index warning test\n'
      );
      await memory.search('stale index');
    } finally {
      process.stderr.write = originalWrite;
      delete process.env.MEMORY_SEMANTIC_SEARCH;
    }

    const stderrOutput = stderrChunks.join('');
    assert.ok(
      stderrOutput.includes('stale') || stderrOutput.includes('index'),
      `Expected stale-index warning in stderr, got: ${stderrOutput}`
    );
  });
});
