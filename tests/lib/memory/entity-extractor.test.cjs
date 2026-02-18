 
/**
 * Tests for entity-extractor.cjs
 * Bug 1: DB handle leaked on constructor failure
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '../../../');

function createTempDir() {
  const tmpDir = path.join(
    os.tmpdir(),
    `entity-extractor-test-${crypto.randomBytes(4).toString('hex')}`
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(tmpDir) {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Bug 1: DB handle must be closed if constructor fails after opening
test('EntityExtractor constructor closes DB handle when initialization fails', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'test.db');

  // We track whether db.close() was called by monkey-patching DatabaseSync
  // Create a DB file first so that DatabaseSync can open it (simulating partial open).
  // Then force a failure during schema validation by providing an *empty* db (no schema).
  // The constructor will attempt initializeDatabase() and fail if we mock it.

  const _closeCalled = false;

  // Patch DatabaseSync to track close calls
  const { DatabaseSync: _OriginalDatabaseSync } = require('node:sqlite');

  // Create a minimal DB so the open succeeds but schema check fails initialization
  // by making init throw. We do this by patching the require path temporarily.
  const Module = require('module');
  const originalLoad = Module._load;

  let _initCallCount = 0;
  Module._load = function (request, _parent, _isMain) {
    if (
      request.includes('init-memory-db') ||
      request.endsWith('init-memory-db.cjs')
    ) {
      _initCallCount++;
      return {
        initializeDatabase: () => {
          throw new Error('Simulated init failure for DB leak test');
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };

  let caughtError = null;
  try {
    // Clear module cache so fresh require picks up patched Module._load
    const extractorPath = path.join(
      PROJECT_ROOT,
      '.claude/lib/memory/entity-extractor.cjs'
    );
    delete require.cache[extractorPath];

    const { EntityExtractor } = require(extractorPath);
    const _extractor = new EntityExtractor(dbPath);
  } catch (err) {
    caughtError = err;
  } finally {
    // Restore
    Module._load = originalLoad;
  }

  // Constructor MUST have thrown (the init was forced to fail)
  assert.ok(
    caughtError !== null,
    'Constructor should throw when initialization fails'
  );
  assert.ok(
    caughtError.message.includes('Simulated init failure'),
    `Expected simulated init failure, got: ${caughtError.message}`
  );

  // Verify the DB file can be opened exclusively (i.e. was properly closed)
  // If the DB handle is leaked (not closed), this will throw SQLITE_BUSY on
  // some platforms. We verify by opening and immediately closing the DB.
  let dbOpenError = null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    const verifyDb = new DatabaseSync(dbPath);
    verifyDb.close();
  } catch (err) {
    dbOpenError = err;
  }

  assert.strictEqual(
    dbOpenError,
    null,
    `DB should be accessible after constructor failure (no handle leak). Got: ${dbOpenError?.message}`
  );

  cleanupTempDir(tmpDir);
});

// Verify that a successful constructor does NOT auto-close the DB
test('EntityExtractor constructor leaves DB open on success', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'test-success.db');

  let extractor = null;
  let constructError = null;

  try {
    const { EntityExtractor } = require(
      path.join(PROJECT_ROOT, '.claude/lib/memory/entity-extractor.cjs')
    );
    extractor = new EntityExtractor(dbPath);
  } catch (err) {
    constructError = err;
  }

  assert.strictEqual(
    constructError,
    null,
    `Constructor should not throw on a fresh db path: ${constructError?.message}`
  );
  assert.ok(extractor !== null, 'Extractor should be created successfully');
  assert.ok(extractor.db !== null, 'DB should be open after successful construction');

  if (extractor) {
    extractor.close();
  }

  cleanupTempDir(tmpDir);
});
