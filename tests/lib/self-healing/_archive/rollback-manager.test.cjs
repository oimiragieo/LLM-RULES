#!/usr/bin/env node
/**
 * Rollback Manager Tests
 * ======================
 * Tests for path validation in rollback operations.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test utilities
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    failCount++;
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

// Create temp directory for tests
const TEMP_DIR = path.join(os.tmpdir(), 'rollback-manager-test-' + Date.now());
const CHECKPOINT_DIR = path.join(TEMP_DIR, 'checkpoints');
const LOG_FILE = path.join(TEMP_DIR, 'rollback-log.jsonl');
const TEST_FILES_DIR = path.join(TEMP_DIR, 'test-files');

function setup() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.mkdirSync(TEST_FILES_DIR, { recursive: true });
}

function cleanup() {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (_e) {
    // Ignore cleanup errors
  }
}

// Main test runner
async function runTests() {
  console.log('Rollback Manager Tests');
  console.log('======================');

  setup();

  try {
    const {
      RollbackManager,
      validatePathWithinRoot,
      validateCheckpointId,
    } = require('../../../.claude/lib/self-healing/rollback-manager.cjs');

    // SEC-006: Test validatePathWithinRoot function
    await describe('validatePathWithinRoot() SEC-006', async () => {
      await test('should accept path within project root', () => {
        const result = validatePathWithinRoot(
          path.join(TEST_FILES_DIR, 'file.txt'),
          TEST_FILES_DIR
        );
        assert(result.startsWith(TEST_FILES_DIR), 'Should return resolved path within root');
      });

      await test('should accept path equal to project root', () => {
        const result = validatePathWithinRoot(TEST_FILES_DIR, TEST_FILES_DIR);
        assertEqual(result, path.resolve(TEST_FILES_DIR), 'Should accept root itself');
      });

      await test('should reject path traversal with ../', () => {
        let errorThrown = false;
        try {
          validatePathWithinRoot(path.join(TEST_FILES_DIR, '..', 'outside.txt'), TEST_FILES_DIR);
        } catch (error) {
          errorThrown = true;
          assert(error.message.includes('SEC-006'), 'Should include SEC-006 in error message');
        }
        assert(errorThrown, 'Should throw error for path traversal');
      });
    });

    // SEC-006: Test validateCheckpointId function
    await describe('validateCheckpointId() SEC-006', async () => {
      await test('should accept valid checkpoint ID', () => {
        const id = 'cp-2024-01-25T10-00-00-abc123';
        const result = validateCheckpointId(id);
        assertEqual(result, id, 'Should return the ID');
      });

      await test('should accept simple alphanumeric ID', () => {
        const id = 'abc123';
        const result = validateCheckpointId(id);
        assertEqual(result, id, 'Should return the ID');
      });

      await test('should reject ID with path separators', () => {
        let errorThrown = false;
        try {
          validateCheckpointId('../malicious/path');
        } catch (error) {
          errorThrown = true;
          assert(error.message.includes('SEC-006'), 'Should include SEC-006 in error message');
        }
        assert(errorThrown, 'Should throw error for path separators in ID');
      });

      await test('should reject empty ID', () => {
        let errorThrown = false;
        try {
          validateCheckpointId('');
        } catch (error) {
          errorThrown = true;
          assert(error.message.includes('SEC-006'), 'Should include SEC-006 in error message');
        }
        assert(errorThrown, 'Should throw error for empty ID');
      });
    });

    await describe('createCheckpoint() path validation', async () => {
      await test('should reject path traversal attempts (..)', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        const maliciousPath = path.join(TEST_FILES_DIR, '..', '..', '..', 'etc', 'passwd');

        let errorThrown = false;
        try {
          await manager.createCheckpoint('test-checkpoint', [maliciousPath], {}, TEST_FILES_DIR);
        } catch (error) {
          errorThrown = true;
          assert(
            error.message.includes('Invalid path'),
            'Error message should mention invalid path'
          );
        }

        assert(errorThrown, 'Should throw an error for path traversal attempt');
      });

      await test('should reject paths with null bytes', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        const maliciousPath = path.join(TEST_FILES_DIR, 'file\x00.txt');

        let errorThrown = false;
        try {
          await manager.createCheckpoint('test-checkpoint', [maliciousPath], {}, TEST_FILES_DIR);
        } catch (error) {
          errorThrown = true;
          assert(
            error.message.includes('Invalid path'),
            'Error message should mention invalid path'
          );
        }

        assert(errorThrown, 'Should throw an error for null byte in path');
      });

      await test('should accept valid paths within project', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        // Create a valid test file
        const validPath = path.join(TEST_FILES_DIR, 'valid-file.txt');
        fs.writeFileSync(validPath, 'test content');

        // This should not throw
        const checkpointId = await manager.createCheckpoint(
          'test-valid',
          [validPath],
          {},
          TEST_FILES_DIR
        );

        assert(checkpointId.startsWith('cp-'), 'Should return valid checkpoint ID');
      });
    });

    await describe('rollback() path validation', async () => {
      await test('should validate paths before restoring files', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        // Create a valid file and checkpoint
        const validPath = path.join(TEST_FILES_DIR, 'rollback-test.txt');
        fs.writeFileSync(validPath, 'original content');

        const checkpointId = await manager.createCheckpoint(
          'rollback-test',
          [validPath],
          {},
          TEST_FILES_DIR
        );

        // Modify the file
        fs.writeFileSync(validPath, 'modified content');

        // Rollback should succeed for valid path
        const result = await manager.rollback(checkpointId, TEST_FILES_DIR);
        assert(result.success, 'Rollback should succeed for valid paths');

        // Verify content was restored
        const content = fs.readFileSync(validPath, 'utf-8');
        assertEqual(content, 'original content', 'File content should be restored');
      });

      await test('should reject rollback with tampered manifest paths', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        // Create a valid checkpoint
        const validPath = path.join(TEST_FILES_DIR, 'tamper-test.txt');
        fs.writeFileSync(validPath, 'content');

        const checkpointId = await manager.createCheckpoint(
          'tamper-test',
          [validPath],
          {},
          TEST_FILES_DIR
        );

        // Tamper with the manifest to include a path traversal
        const manifestPath = path.join(CHECKPOINT_DIR, checkpointId, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        manifest.files[0].path = path.join(TEST_FILES_DIR, '..', '..', 'etc', 'passwd');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // Rollback should fail for tampered path
        let errorThrown = false;
        try {
          await manager.rollback(checkpointId, TEST_FILES_DIR);
        } catch (error) {
          errorThrown = true;
          assert(error.message.includes('Invalid path'), 'Error should mention invalid path');
        }

        assert(errorThrown, 'Should throw error for tampered manifest with path traversal');
      });
    });

    await describe('selectiveRollback() path validation', async () => {
      await test('should validate paths in selective rollback', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        // Create valid file and checkpoint
        const validPath = path.join(TEST_FILES_DIR, 'selective-test.txt');
        fs.writeFileSync(validPath, 'selective content');

        const checkpointId = await manager.createCheckpoint(
          'selective-test',
          [validPath],
          {},
          TEST_FILES_DIR
        );

        // Modify file
        fs.writeFileSync(validPath, 'modified selective');

        // Selective rollback should work for valid paths
        const result = await manager.selectiveRollback(checkpointId, [validPath], TEST_FILES_DIR);
        assert(result.success, 'Selective rollback should succeed');
        assert(result.restored.includes(validPath), 'Valid path should be restored');
      });

      await test('should reject path traversal in selective rollback', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        // Create valid checkpoint
        const validPath = path.join(TEST_FILES_DIR, 'selective-valid.txt');
        fs.writeFileSync(validPath, 'valid content');

        const checkpointId = await manager.createCheckpoint(
          'selective-traversal',
          [validPath],
          {},
          TEST_FILES_DIR
        );

        // Try to rollback with path traversal
        const maliciousPath = path.join(TEST_FILES_DIR, '..', '..', 'etc', 'passwd');

        let errorThrown = false;
        try {
          await manager.selectiveRollback(checkpointId, [maliciousPath], TEST_FILES_DIR);
        } catch (error) {
          errorThrown = true;
          assert(error.message.includes('Invalid path'), 'Error should mention invalid path');
        }

        assert(errorThrown, 'Should throw error for path traversal in selective rollback');
      });
    });

    // SEC-006: Test _deleteCheckpoint validation
    await describe('_deleteCheckpoint() SEC-006 validation', async () => {
      await test('should reject malicious checkpoint ID', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        let errorThrown = false;
        try {
          await manager._deleteCheckpoint('../../../etc');
        } catch (error) {
          errorThrown = true;
          assert(error.message.includes('SEC-006'), 'Error should mention SEC-006');
        }

        assert(errorThrown, 'Should throw error for malicious checkpoint ID');
      });

      await test('should accept valid checkpoint ID in delete', async () => {
        const manager = new RollbackManager({
          checkpointDir: CHECKPOINT_DIR,
          logFile: LOG_FILE,
        });

        // Create a valid checkpoint
        const validPath = path.join(TEST_FILES_DIR, 'delete-test.txt');
        fs.writeFileSync(validPath, 'content');
        const checkpointId = await manager.createCheckpoint(
          'delete-test',
          [validPath],
          {},
          TEST_FILES_DIR
        );

        // Delete should succeed
        const result = await manager._deleteCheckpoint(checkpointId);
        assert(result === true, 'Should successfully delete valid checkpoint');
      });
    });
  } finally {
    cleanup();
  }

  // Summary
  console.log('\n======================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
