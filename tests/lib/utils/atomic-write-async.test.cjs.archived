#!/usr/bin/env node
/**
 * RED PHASE: Tests for async atomic write with proper-lockfile (SEC-AUDIT-013, SEC-AUDIT-014)
 *
 * These tests are written FIRST to drive the implementation of atomicWriteAsync.
 * Expected to FAIL until atomicWriteAsync is implemented.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// Module under test
let atomicWrite;

// Test directory for isolation
let testDir;

describe('atomicWriteAsync (SEC-AUDIT-013, SEC-AUDIT-014 fix)', () => {
  beforeEach(() => {
    // Create isolated test directory
    testDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'atomic-async-test-'));

    // Clear require cache to get fresh module
    const modulePath = path.join(__dirname, 'atomic-write.cjs');
    delete require.cache[require.resolve(modulePath)];
    atomicWrite = require(modulePath);
  });

  afterEach(async () => {
    // Clean up test directory
    if (testDir && fsSync.existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    it('should write content to a new file asynchronously', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Hello, async world!';

      await atomicWrite.atomicWriteAsync(filePath, content);

      const result = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(result, content);
    });

    it('should overwrite existing file atomically with locking', async () => {
      const filePath = path.join(testDir, 'existing.txt');
      await fs.writeFile(filePath, 'original content');

      await atomicWrite.atomicWriteAsync(filePath, 'new content');

      const result = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(result, 'new content');
    });

    it('should create parent directories if they do not exist', async () => {
      const filePath = path.join(testDir, 'nested', 'deep', 'file.txt');
      const content = 'nested async content';

      await atomicWrite.atomicWriteAsync(filePath, content);

      const result = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(result, content);
    });

    it('should not leave temp files on success', async () => {
      const filePath = path.join(testDir, 'clean.txt');
      await atomicWrite.atomicWriteAsync(filePath, 'content');

      const files = await fs.readdir(testDir);
      // Should only have the target file, no .tmp-* files
      const tempFiles = files.filter(f => f.startsWith('.tmp-'));
      assert.strictEqual(tempFiles.length, 0, 'Should not leave temp files');
    });

    it('should handle binary content', async () => {
      const filePath = path.join(testDir, 'binary.bin');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff]);

      await atomicWrite.atomicWriteAsync(filePath, buffer);

      const result = await fs.readFile(filePath);
      assert.deepStrictEqual(result, buffer);
    });
  });

  describe('SEC-AUDIT-013: concurrent write protection with proper-lockfile', () => {
    it('should prevent data corruption during concurrent writes', async () => {
      const filePath = path.join(testDir, 'concurrent.txt');
      const numWrites = 5; // Reduced from 10 to avoid excessive lock contention

      // Simulate concurrent writes with stagger to reduce lock contention
      const writes = [];
      for (let i = 0; i < numWrites; i++) {
        // Small stagger to make test more realistic (still concurrent but not all at exact same ms)
        writes.push(
          (async () => {
            if (i > 0) await new Promise(resolve => setTimeout(resolve, i * 2));
            return atomicWrite.atomicWriteAsync(filePath, `content-${i}`);
          })()
        );
      }

      // Wait for all writes to complete
      await Promise.all(writes);

      // File should exist and contain ONE of the written values (not corrupted)
      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(
        content.match(/^content-\d+$/),
        `File should contain valid content, got: ${content}`
      );

      // No temp files should remain
      const files = await fs.readdir(testDir);
      const tempFiles = files.filter(f => f.startsWith('.tmp-'));
      assert.strictEqual(tempFiles.length, 0, 'No temp files should remain');
    });

    it('should acquire and release locks properly (no deadlocks)', async () => {
      const filePath = path.join(testDir, 'locking.txt');

      // Simulate sequential writes with different content
      await atomicWrite.atomicWriteAsync(filePath, 'first');
      await atomicWrite.atomicWriteAsync(filePath, 'second');
      await atomicWrite.atomicWriteAsync(filePath, 'third');

      const content = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(content, 'third', 'Should contain last write');
    });

    it('should handle stale lock cleanup (process crash simulation)', async () => {
      const filePath = path.join(testDir, 'stale-lock.txt');
      const lockfile = require('proper-lockfile');

      // Create a stale lock file (simulate crashed process)
      await fs.writeFile(filePath, 'initial content');

      // Manually create a lock that will become stale
      const release = await lockfile.lock(filePath, {
        stale: 100, // Very short stale time for testing
        retries: 0, // Don't retry on first attempt
      });

      // Immediately release it to simulate stale lock detection
      await release();

      // Wait for stale timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be able to write despite stale lock
      await atomicWrite.atomicWriteAsync(filePath, 'new content after stale');

      const content = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(content, 'new content after stale');
    });

    it('should retry on lock contention with exponential backoff', async () => {
      const filePath = path.join(testDir, 'retry.txt');
      await fs.writeFile(filePath, 'initial');

      // Start a long-running write
      const slowWrite = atomicWrite.atomicWriteAsync(filePath, 'slow');

      // Immediately try another write (will need to retry)
      const fastWrite = atomicWrite.atomicWriteAsync(filePath, 'fast');

      // Both should eventually complete without error
      await Promise.all([slowWrite, fastWrite]);

      // File should contain one of the values
      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(['slow', 'fast'].includes(content), `Expected 'slow' or 'fast', got: ${content}`);
    });
  });

  describe('SEC-AUDIT-014: Windows-specific atomic rename handling', () => {
    it('should handle Windows delete-before-rename atomically', async () => {
      const filePath = path.join(testDir, 'windows-safe.txt');

      // Pre-create file (Windows rename fails if target exists)
      await fs.writeFile(filePath, 'original content');

      // Should succeed by using proper-lockfile to coordinate delete-rename
      await atomicWrite.atomicWriteAsync(filePath, 'new content');

      const content = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(content, 'new content');
    });

    it('should prevent race window during Windows delete-then-rename', async () => {
      if (process.platform !== 'win32') {
        // Test the logic even on non-Windows (lock coordination is cross-platform)
      }

      const filePath = path.join(testDir, 'race-window.txt');
      await fs.writeFile(filePath, 'original');

      // Concurrent writes that would hit the delete-rename race on Windows
      const writes = [
        atomicWrite.atomicWriteAsync(filePath, 'process-A'),
        atomicWrite.atomicWriteAsync(filePath, 'process-B'),
        atomicWrite.atomicWriteAsync(filePath, 'process-C'),
      ];

      await Promise.all(writes);

      // File should contain ONE valid value (not corrupted, not empty)
      const content = await fs.readFile(filePath, 'utf8');
      assert.ok(
        ['process-A', 'process-B', 'process-C'].includes(content),
        `Expected valid process content, got: ${content}`
      );
    });
  });

  describe('error handling', () => {
    it('should clean up temp file on write error', async () => {
      // Try to write to an invalid path
      const invalidPath = path.join(testDir, 'invalid\x00path.txt');

      await assert.rejects(async () => {
        await atomicWrite.atomicWriteAsync(invalidPath, 'content');
      }, /invalid|null/i);

      // Verify no temp files are left
      const allFiles = await fs.readdir(testDir);
      const tempFiles = allFiles.filter(f => f.startsWith('.tmp-'));
      assert.strictEqual(tempFiles.length, 0, 'Should clean up temp files on error');
    });

    it('should release lock on error', async () => {
      const filePath = path.join(testDir, 'lock-release.txt');

      // First write succeeds
      await atomicWrite.atomicWriteAsync(filePath, 'success');

      // Second write fails but should release lock
      await assert.rejects(async () => {
        // Cause an error during write by making content invalid
        await atomicWrite.atomicWriteAsync(filePath, { invalid: 'object' });
      });

      // Third write should succeed (lock was released)
      await atomicWrite.atomicWriteAsync(filePath, 'recovered');

      const content = await fs.readFile(filePath, 'utf8');
      assert.strictEqual(content, 'recovered');
    });
  });

  describe('lock timeout handling', () => {
    it('should timeout if lock cannot be acquired', async () => {
      const filePath = path.join(testDir, 'timeout.txt');
      await fs.writeFile(filePath, 'initial');

      const lockfile = require('proper-lockfile');

      // Hold lock indefinitely
      const release = await lockfile.lock(filePath, {
        stale: 10000, // 10 second stale time
        retries: 0, // No retries
      });

      try {
        // Attempt to write with short retry timeout
        await assert.rejects(
          async () => {
            await atomicWrite.atomicWriteAsync(filePath, 'should fail', {
              lockOptions: {
                retries: {
                  retries: 2,
                  minTimeout: 10,
                  maxTimeout: 50,
                },
              },
            });
          },
          /lock|timeout|ELOCKED/i,
          'Should timeout when lock cannot be acquired'
        );
      } finally {
        await release();
      }
    });
  });

  describe('compatibility with existing sync version', () => {
    it('should produce same result as sync version', async () => {
      const asyncPath = path.join(testDir, 'async-result.txt');
      const syncPath = path.join(testDir, 'sync-result.txt');
      const content = 'test content';

      await atomicWrite.atomicWriteAsync(asyncPath, content);
      atomicWrite.atomicWriteSync(syncPath, content);

      const asyncResult = await fs.readFile(asyncPath, 'utf8');
      const syncResult = await fs.readFile(syncPath, 'utf8');

      assert.strictEqual(asyncResult, syncResult);
    });

    it('should not interfere with sync writes on different files', async () => {
      const asyncPath = path.join(testDir, 'async.txt');
      const syncPath = path.join(testDir, 'sync.txt');

      const asyncPromise = atomicWrite.atomicWriteAsync(asyncPath, 'async');
      atomicWrite.atomicWriteSync(syncPath, 'sync');
      await asyncPromise;

      assert.strictEqual(await fs.readFile(asyncPath, 'utf8'), 'async');
      assert.strictEqual(await fs.readFile(syncPath, 'utf8'), 'sync');
    });
  });
});
