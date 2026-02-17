/**
 * Tests for safe-rename.cjs
 * Atomic file rename with cross-drive fallback
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test (will fail until implemented)
const { safeRenameSync } = require('../../../.claude/lib/utils/safe-rename.cjs');

describe('safeRenameSync', () => {
  let testDir;

  beforeEach(() => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-rename-test-'));
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('renames file on same drive', () => {
    const srcPath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'destination.txt');

    fs.writeFileSync(srcPath, 'test content', 'utf8');

    safeRenameSync(srcPath, destPath);

    assert.strictEqual(fs.existsSync(srcPath), false, 'Source should not exist');
    assert.strictEqual(fs.existsSync(destPath), true, 'Destination should exist');
    assert.strictEqual(fs.readFileSync(destPath, 'utf8'), 'test content');
  });

  it('falls back to copy+delete on EXDEV error', () => {
    const srcPath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'destination.txt');

    fs.writeFileSync(srcPath, 'test content for EXDEV', 'utf8');

    // Mock fs.renameSync to throw EXDEV error
    const originalRename = fs.renameSync;
    fs.renameSync = () => {
      const err = new Error('EXDEV: cross-device link not permitted');
      err.code = 'EXDEV';
      throw err;
    };

    try {
      safeRenameSync(srcPath, destPath);

      assert.strictEqual(fs.existsSync(srcPath), false, 'Source should not exist after fallback');
      assert.strictEqual(fs.existsSync(destPath), true, 'Destination should exist after fallback');
      assert.strictEqual(fs.readFileSync(destPath, 'utf8'), 'test content for EXDEV');
    } finally {
      fs.renameSync = originalRename;
    }
  });

  it('preserves file content after cross-drive rename', () => {
    const srcPath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'destination.txt');
    const testContent =
      'important data that must be preserved\nwith multiple lines\nand special chars: !@#$%';

    fs.writeFileSync(srcPath, testContent, 'utf8');

    // Force copy+delete path
    const originalRename = fs.renameSync;
    fs.renameSync = () => {
      const err = new Error('EXDEV: cross-device link not permitted');
      err.code = 'EXDEV';
      throw err;
    };

    try {
      safeRenameSync(srcPath, destPath);

      const resultContent = fs.readFileSync(destPath, 'utf8');
      assert.strictEqual(resultContent, testContent, 'Content must be identical');
    } finally {
      fs.renameSync = originalRename;
    }
  });

  it('handles missing source file gracefully', () => {
    const srcPath = path.join(testDir, 'nonexistent.txt');
    const destPath = path.join(testDir, 'destination.txt');

    assert.throws(
      () => safeRenameSync(srcPath, destPath),
      err => {
        return err.code === 'ENOENT' || err.message.includes('no such file');
      },
      'Should throw ENOENT error for missing source'
    );
  });

  it('uses temp file for atomic copy', () => {
    const srcPath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'destination.txt');

    fs.writeFileSync(srcPath, 'test content', 'utf8');

    // Force copy+delete path
    const originalRename = fs.renameSync;
    let tempFileDetected = false;
    const originalCopyFile = fs.copyFileSync;

    fs.renameSync = (src, dest) => {
      if (dest.includes('.tmp')) {
        tempFileDetected = true;
      }
      const err = new Error('EXDEV: cross-device link not permitted');
      err.code = 'EXDEV';
      throw err;
    };

    fs.copyFileSync = (src, dest) => {
      if (dest.includes('.tmp')) {
        tempFileDetected = true;
      }
      return originalCopyFile(src, dest);
    };

    try {
      safeRenameSync(srcPath, destPath);
      assert.strictEqual(tempFileDetected, true, 'Should use temp file for atomic operation');
    } finally {
      fs.renameSync = originalRename;
      fs.copyFileSync = originalCopyFile;
    }
  });
});
