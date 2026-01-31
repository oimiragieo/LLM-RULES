#!/usr/bin/env node
/**
 * Tests for atomic file write utility
 *
 * Prevents data corruption by writing to temp file first, then renaming.
 * This is a critical utility for state files that must not be corrupted
 * if the process crashes mid-write.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Module under test (will be created after tests)
let atomicWrite;

// Test directory for isolation
let testDir;

describe('atomic-write', () => {
  beforeEach(() => {
    // Create isolated test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-test-'));

    // Clear require cache to get fresh module
    const modulePath = path.join(__dirname, 'atomic-write.cjs');
    delete require.cache[require.resolve(modulePath)];
    atomicWrite = require(modulePath);
  });

  afterEach(() => {
    // Clean up test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('atomicWriteSync', () => {
    it('should write content to a new file', () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Hello, World!';

      atomicWrite.atomicWriteSync(filePath, content);

      assert.strictEqual(fs.readFileSync(filePath, 'utf8'), content);
    });

    it('should overwrite existing file atomically', () => {
      const filePath = path.join(testDir, 'existing.txt');
      fs.writeFileSync(filePath, 'original content');

      atomicWrite.atomicWriteSync(filePath, 'new content');

      assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'new content');
    });

    it('should create parent directories if they do not exist', () => {
      const filePath = path.join(testDir, 'nested', 'deep', 'file.txt');
      const content = 'nested content';

      atomicWrite.atomicWriteSync(filePath, content);

      assert.strictEqual(fs.readFileSync(filePath, 'utf8'), content);
    });

    it('should not leave temp files on success', () => {
      const filePath = path.join(testDir, 'clean.txt');
      atomicWrite.atomicWriteSync(filePath, 'content');

      const files = fs.readdirSync(testDir);
      // Should only have the target file, no .tmp-* files
      const tempFiles = files.filter(f => f.startsWith('.tmp-'));
      assert.strictEqual(tempFiles.length, 0, 'Should not leave temp files');
    });

    it('should handle binary content with encoding option', () => {
      const filePath = path.join(testDir, 'binary.bin');
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff]);

      atomicWrite.atomicWriteSync(filePath, buffer);

      const result = fs.readFileSync(filePath);
      assert.deepStrictEqual(result, buffer);
    });
  });

  describe('atomicWriteJSONSync', () => {
    it('should write JSON with pretty printing', () => {
      const filePath = path.join(testDir, 'data.json');
      const data = { name: 'test', value: 42 };

      atomicWrite.atomicWriteJSONSync(filePath, data);

      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.deepStrictEqual(result, data);

      // Verify pretty printing (should have newlines)
      const rawContent = fs.readFileSync(filePath, 'utf8');
      assert.ok(rawContent.includes('\n'), 'Should be pretty printed');
    });

    it('should handle complex nested objects', () => {
      const filePath = path.join(testDir, 'complex.json');
      const data = {
        mode: 'agent',
        taskSpawned: true,
        details: {
          nested: {
            deeply: true,
          },
          array: [1, 2, 3],
        },
      };

      atomicWrite.atomicWriteJSONSync(filePath, data);

      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.deepStrictEqual(result, data);
    });

    it('should overwrite existing JSON files', () => {
      const filePath = path.join(testDir, 'overwrite.json');
      fs.writeFileSync(filePath, JSON.stringify({ old: 'data' }));

      atomicWrite.atomicWriteJSONSync(filePath, { new: 'data' });

      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.deepStrictEqual(result, { new: 'data' });
    });

    it('should handle arrays as root element', () => {
      const filePath = path.join(testDir, 'array.json');
      const data = [1, 2, { three: 3 }];

      atomicWrite.atomicWriteJSONSync(filePath, data);

      const result = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.deepStrictEqual(result, data);
    });

    it('should handle null and empty objects', () => {
      const nullPath = path.join(testDir, 'null.json');
      const emptyPath = path.join(testDir, 'empty.json');

      atomicWrite.atomicWriteJSONSync(nullPath, null);
      atomicWrite.atomicWriteJSONSync(emptyPath, {});

      assert.strictEqual(JSON.parse(fs.readFileSync(nullPath, 'utf8')), null);
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(emptyPath, 'utf8')), {});
    });
  });

  describe('error handling', () => {
    it('should clean up temp file on write error', () => {
      // Try to write to an invalid path (directory as file)
      const dirPath = path.join(testDir, 'is-a-dir');
      fs.mkdirSync(dirPath);
      const filePath = path.join(dirPath, '..', 'is-a-dir'); // Points to the directory

      assert.throws(() => {
        atomicWrite.atomicWriteSync(filePath, 'content');
      });

      // Verify no temp files are left
      const allFiles = fs.readdirSync(testDir);
      const tempFiles = allFiles.filter(f => f.startsWith('.tmp-'));
      assert.strictEqual(tempFiles.length, 0, 'Should clean up temp files on error');
    });

    it('should throw on invalid JSON serialization', () => {
      const filePath = path.join(testDir, 'invalid.json');
      const circular = {};
      circular.self = circular;

      assert.throws(() => {
        atomicWrite.atomicWriteJSONSync(filePath, circular);
      }, /circular|convert/i);
    });
  });

  describe('SEC-AUDIT-013: Windows atomic write race conditions', () => {
    it('should handle overwriting existing file on Windows', () => {
      const filePath = path.join(testDir, 'existing.txt');

      // Pre-create file
      fs.writeFileSync(filePath, 'original content');

      // Should succeed even on Windows where renameSync can fail if target exists
      atomicWrite.atomicWriteSync(filePath, 'new content');

      assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'new content');
    });

    it('should clean up temp file on failure', () => {
      const filePath = path.join(testDir, 'fail-test.txt');

      // Mock fs.writeFileSync to fail
      const original = fs.writeFileSync;
      fs.writeFileSync = (path, content, options) => {
        if (path.includes('.tmp-')) {
          throw new Error('Simulated write failure');
        }
        return original(path, content, options);
      };

      try {
        assert.throws(() => {
          atomicWrite.atomicWriteSync(filePath, 'content');
        }, /Simulated write failure/);

        // Verify no temp files remain
        const files = fs.readdirSync(testDir);
        const tempFiles = files.filter(f => f.includes('.tmp-'));
        assert.strictEqual(tempFiles.length, 0, 'Temp files should be cleaned up on failure');
      } finally {
        fs.writeFileSync = original;
      }
    });

    it('should handle rapid overwrites without corruption', () => {
      const filePath = path.join(testDir, 'rapid.txt');

      // Rapidly overwrite the same file
      for (let i = 0; i < 20; i++) {
        atomicWrite.atomicWriteSync(filePath, `content-${i}`);
      }

      // Should contain last write
      assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'content-19');

      // No temp files should remain
      const files = fs.readdirSync(testDir);
      const tempFiles = files.filter(f => f.includes('.tmp-'));
      assert.strictEqual(tempFiles.length, 0);
    });

    it('should retry on EBUSY/EPERM errors on Windows', function () {
      if (process.platform !== 'win32') {
        this.skip(); // Skip on non-Windows
        return;
      }

      const filePath = path.join(testDir, 'busy.txt');
      fs.writeFileSync(filePath, 'original');

      // Try to trigger EBUSY by having file open
      // This is best-effort as it's hard to reliably trigger
      const fd = fs.openSync(filePath, 'r');

      try {
        atomicWrite.atomicWriteSync(filePath, 'new content');
        const content = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(content, 'new content');
      } finally {
        fs.closeSync(fd);
      }
    });
  });

  describe('HOOK-006: State file backup functionality', () => {
    describe('createBackup', () => {
      it('should create a .bak file from existing file', () => {
        const filePath = path.join(testDir, 'state.json');
        const originalContent = JSON.stringify({ mode: 'router' });
        fs.writeFileSync(filePath, originalContent);

        const backupPath = atomicWrite.createBackup(filePath);

        assert.ok(backupPath, 'Should return backup path');
        assert.strictEqual(backupPath, `${filePath}.bak`);
        assert.ok(fs.existsSync(backupPath), 'Backup file should exist');
        assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), originalContent);
      });

      it('should return null if file does not exist', () => {
        const filePath = path.join(testDir, 'nonexistent.json');

        const backupPath = atomicWrite.createBackup(filePath);

        assert.strictEqual(backupPath, null);
      });

      it('should create timestamped backup when keepMultiple is true', () => {
        const filePath = path.join(testDir, 'multi.json');
        fs.writeFileSync(filePath, 'content1');

        const backupPath1 = atomicWrite.createBackup(filePath, { keepMultiple: true });

        assert.ok(backupPath1, 'Should return backup path');
        assert.ok(backupPath1.includes('.bak.'), 'Should have timestamp in name');
        assert.ok(fs.existsSync(backupPath1), 'First backup should exist');

        // Slight delay to ensure different timestamp
        const start = Date.now();
        while (Date.now() - start < 5) {
          /* busy wait for 5ms */
        }

        fs.writeFileSync(filePath, 'content2');
        const backupPath2 = atomicWrite.createBackup(filePath, { keepMultiple: true });

        assert.ok(backupPath2, 'Should return second backup path');
        assert.notStrictEqual(backupPath1, backupPath2, 'Should have different paths');
        assert.ok(fs.existsSync(backupPath1), 'First backup should still exist');
        assert.ok(fs.existsSync(backupPath2), 'Second backup should exist');
      });

      it('should overwrite single backup by default', () => {
        const filePath = path.join(testDir, 'single.json');
        fs.writeFileSync(filePath, 'content1');

        atomicWrite.createBackup(filePath);

        fs.writeFileSync(filePath, 'content2');
        const backupPath = atomicWrite.createBackup(filePath);

        assert.strictEqual(backupPath, `${filePath}.bak`);
        assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'content2');
      });
    });

    describe('restoreFromBackup', () => {
      it('should restore file from backup', () => {
        const filePath = path.join(testDir, 'restore.json');
        const originalContent = JSON.stringify({ mode: 'original' });
        fs.writeFileSync(filePath, originalContent);

        // Create backup
        atomicWrite.createBackup(filePath);

        // Modify original
        fs.writeFileSync(filePath, JSON.stringify({ mode: 'modified' }));

        // Restore
        const result = atomicWrite.restoreFromBackup(filePath);

        assert.strictEqual(result, true, 'Should return true on success');
        assert.strictEqual(fs.readFileSync(filePath, 'utf8'), originalContent);
      });

      it('should return false if no backup exists', () => {
        const filePath = path.join(testDir, 'nobackup.json');

        const result = atomicWrite.restoreFromBackup(filePath);

        assert.strictEqual(result, false);
      });

      it('should restore from custom backup path', () => {
        const filePath = path.join(testDir, 'custom.json');
        const customBackup = path.join(testDir, 'my-backup.json');
        const content = 'custom content';

        fs.writeFileSync(customBackup, content);

        const result = atomicWrite.restoreFromBackup(filePath, customBackup);

        assert.strictEqual(result, true);
        assert.ok(fs.existsSync(filePath), 'Restored file should exist');
        assert.strictEqual(fs.readFileSync(filePath, 'utf8'), content);
      });
    });

    describe('atomicWriteJSONSyncWithBackup', () => {
      it('should create backup before writing by default', () => {
        const filePath = path.join(testDir, 'with-backup.json');
        const originalData = { mode: 'original' };
        fs.writeFileSync(filePath, JSON.stringify(originalData));

        const newData = { mode: 'new' };
        atomicWrite.atomicWriteJSONSyncWithBackup(filePath, newData);

        // Check new content
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), newData);

        // Check backup exists with old content
        const backupPath = `${filePath}.bak`;
        assert.ok(fs.existsSync(backupPath), 'Backup should exist');
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(backupPath, 'utf8')), originalData);
      });

      it('should skip backup when backup option is false', () => {
        const filePath = path.join(testDir, 'no-backup.json');
        fs.writeFileSync(filePath, JSON.stringify({ old: true }));

        atomicWrite.atomicWriteJSONSyncWithBackup(filePath, { new: true }, { backup: false });

        const backupPath = `${filePath}.bak`;
        assert.ok(!fs.existsSync(backupPath), 'Backup should not exist');
      });

      it('should work when no existing file (no backup created)', () => {
        const filePath = path.join(testDir, 'new-file.json');
        const data = { created: true };

        atomicWrite.atomicWriteJSONSyncWithBackup(filePath, data);

        assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), data);
        // No backup since file didn't exist
        assert.ok(!fs.existsSync(`${filePath}.bak`));
      });
    });
  });
});
