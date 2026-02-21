'use strict';

/**
 * TDD Concurrency Tests for BUG-E: TOCTOU Race in spawn-request-contract.cjs
 *
 * Root cause: acknowledgeRequests() and removeRequests() perform a
 * read-modify-write cycle where the READ happens WITHOUT a lock and the
 * WRITE acquires a lock. Two concurrent callers both read the same state,
 * compute independently, and the slower writer silently overwrites the
 * first's changes — losing processedReflectionIds.
 *
 * Fix: Wrap the ENTIRE read-modify-write cycle inside a single lockfile
 * acquisition so no other caller can read or write during the operation.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const CONTRACT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'reflection',
  'spawn-request-contract.cjs'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-contract-concurrency-'));
}

function makeSpawnRequest(id, overrides = {}) {
  return {
    id,
    status: 'pending',
    subagent_type: 'reflection-agent',
    description: `Test reflection request ${id}`,
    prompt: `Reflect on session for ${id}`,
    source: {
      trigger: 'test',
      timestamp: new Date().toISOString(),
      taskId: null,
      context: null,
      priority: 'medium',
    },
    ...overrides,
  };
}

function writeRequests(filePath, requests) {
  fs.writeFileSync(filePath, JSON.stringify(requests, null, 2) + '\n', 'utf8');
}

function readRequests(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function loadContract() {
  // Clear require cache to get fresh module
  delete require.cache[require.resolve(CONTRACT_PATH)];
  return require(CONTRACT_PATH);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('spawn-request-contract concurrency safety', () => {
  let tmpDir;
  let filePath;

  beforeEach(() => {
    tmpDir = makeTempDir();
    filePath = path.join(tmpDir, 'reflection-spawn-request.json');
  });

  afterEach(() => {
    // Clean up temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
  });

  // Test 1: Concurrent acknowledge — both updates must survive
  test('concurrent acknowledgeRequests: both IDs are acknowledged without data loss', () => {
    const { acknowledgeRequests } = loadContract();

    // Set up file with two pending requests
    writeRequests(filePath, [makeSpawnRequest('req-A'), makeSpawnRequest('req-B')]);

    // Simulate concurrent calls by calling acknowledgeRequests twice
    // in rapid succession. With the TOCTOU race, the second call could read
    // the original file (before first write completes), compute its own
    // update, and overwrite — losing req-A's acknowledgement.
    //
    // After the fix (outer lock wrapping full read-modify-write), the second
    // call must wait for the first to complete, so both updates survive.
    acknowledgeRequests(filePath, ['req-A']);
    acknowledgeRequests(filePath, ['req-B']);

    const result = readRequests(filePath);
    assert.equal(result.length, 2, 'Both requests must still be present');
    const statuses = Object.fromEntries(result.map(r => [r.id, r.status]));
    assert.equal(statuses['req-A'], 'acknowledged', 'req-A must be acknowledged');
    assert.equal(statuses['req-B'], 'acknowledged', 'req-B must be acknowledged');
  });

  // Test 2: Concurrent remove — both removals must take effect
  test('concurrent removeRequests: both IDs are removed without data loss', () => {
    const { removeRequests } = loadContract();

    // Set up file with three requests
    writeRequests(filePath, [
      makeSpawnRequest('req-X'),
      makeSpawnRequest('req-Y'),
      makeSpawnRequest('req-Z'),
    ]);

    // Two concurrent remove calls — each removing a different ID
    removeRequests(filePath, ['req-X']);
    removeRequests(filePath, ['req-Y']);

    const result = readRequests(filePath);
    assert.equal(result.length, 1, 'Only req-Z should remain');
    assert.equal(result[0].id, 'req-Z', 'Remaining entry must be req-Z');
  });

  // Test 3: Read-then-write integrity with artificial interleaving
  test('read-modify-write integrity: interleaved write does not cause data loss', () => {
    const { acknowledgeRequests } = loadContract();

    // Start with two requests
    writeRequests(filePath, [makeSpawnRequest('req-1'), makeSpawnRequest('req-2')]);

    // First acknowledge req-1
    acknowledgeRequests(filePath, ['req-1']);

    // Now externally write a new version of the file to simulate interleaving
    // (as if another process wrote between the first call's read and write).
    // Then acknowledge req-2 — it should still see the current file state
    // (which already has req-1 acknowledged) and apply req-2's acknowledgement
    // on top of that.
    const currentState = readRequests(filePath);
    assert.equal(currentState.length, 2, 'File must still have 2 entries after first acknowledge');
    assert.equal(currentState.find(r => r.id === 'req-1').status, 'acknowledged');

    acknowledgeRequests(filePath, ['req-2']);
    const finalState = readRequests(filePath);
    assert.equal(finalState.length, 2, 'Both entries must be present');
    const finalStatuses = Object.fromEntries(finalState.map(r => [r.id, r.status]));
    assert.equal(finalStatuses['req-1'], 'acknowledged', 'req-1 must remain acknowledged');
    assert.equal(finalStatuses['req-2'], 'acknowledged', 'req-2 must be acknowledged');
  });

  // Test 4: Graceful handling on non-existent file (removeRequests)
  test('removeRequests on non-existent file returns without error', () => {
    const { removeRequests } = loadContract();
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.json');

    // Should not throw
    assert.doesNotThrow(() => {
      removeRequests(nonExistentPath, ['req-A']);
    });

    // File should still not exist
    assert.equal(fs.existsSync(nonExistentPath), false, 'File must not be created');
  });

  // Test 5: Graceful handling on non-existent file (acknowledgeRequests)
  test('acknowledgeRequests on non-existent file returns without error', () => {
    const { acknowledgeRequests } = loadContract();
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.json');

    // Should not throw
    assert.doesNotThrow(() => {
      acknowledgeRequests(nonExistentPath, ['req-A']);
    });

    // File should still not exist (or should not corrupt anything)
    assert.equal(fs.existsSync(nonExistentPath), false, 'File must not be created');
  });

  // Test 6: removeRequests on empty file returns gracefully
  test('removeRequests on empty array file returns without error', () => {
    const { removeRequests } = loadContract();

    // Write an empty array
    writeRequests(filePath, []);

    assert.doesNotThrow(() => {
      removeRequests(filePath, ['req-A']);
    });

    const result = readRequests(filePath);
    assert.equal(result.length, 0, 'File must remain empty');
  });

  // Test 7: acknowledgeRequests with empty ids array is a no-op
  test('acknowledgeRequests with empty ids array is a no-op', () => {
    const { acknowledgeRequests } = loadContract();

    writeRequests(filePath, [makeSpawnRequest('req-A')]);
    const before = fs.statSync(filePath).mtimeMs;

    acknowledgeRequests(filePath, []);

    // File should be unchanged (no write performed)
    const after = fs.statSync(filePath).mtimeMs;
    assert.equal(before, after, 'File must not be modified for empty ids');
  });

  // Test 8: removeRequests with empty ids array is a no-op
  test('removeRequests with empty ids array is a no-op', () => {
    const { removeRequests } = loadContract();

    writeRequests(filePath, [makeSpawnRequest('req-A')]);
    const before = fs.statSync(filePath).mtimeMs;

    removeRequests(filePath, []);

    const after = fs.statSync(filePath).mtimeMs;
    assert.equal(before, after, 'File must not be modified for empty ids');
  });

  // Test 9: removeStaleRequests — entries older than maxAge are pruned
  test('removeStaleRequests prunes old entries and keeps fresh entries', () => {
    const { removeStaleRequests } = loadContract();

    const ONE_HOUR_MS = 3600000;
    const TWO_HOURS_AGO = new Date(Date.now() - 2 * ONE_HOUR_MS).toISOString();
    const NOW = new Date().toISOString();

    writeRequests(filePath, [
      makeSpawnRequest('stale-req', {
        source: {
          trigger: 'test',
          timestamp: TWO_HOURS_AGO,
          taskId: null,
          context: null,
          priority: 'medium',
        },
      }),
      makeSpawnRequest('fresh-req', {
        source: {
          trigger: 'test',
          timestamp: NOW,
          taskId: null,
          context: null,
          priority: 'medium',
        },
      }),
    ]);

    const removed = removeStaleRequests(filePath, ONE_HOUR_MS);
    assert.equal(removed, 1, 'Exactly 1 stale entry must be removed');

    const result = readRequests(filePath);
    assert.equal(result.length, 1, 'Only fresh entry must remain');
    assert.equal(result[0].id, 'fresh-req', 'Fresh entry must be preserved');
  });

  // Test 10: removeStaleRequests on non-existent file returns 0
  test('removeStaleRequests on non-existent file returns 0 gracefully', () => {
    const { removeStaleRequests } = loadContract();
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.json');

    const removed = removeStaleRequests(nonExistentPath, 3600000);
    assert.equal(removed, 0, 'Must return 0 for non-existent file');
  });
});
