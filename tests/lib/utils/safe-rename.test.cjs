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

  // Bug 3: Deterministic temp file name causes collisions on concurrent renames
  it('uses non-deterministic (random) temp file name to avoid concurrent collision', () => {
    const srcPath1 = path.join(testDir, 'source1.txt');
    const srcPath2 = path.join(testDir, 'source2.txt');
    const destPath = path.join(testDir, 'destination.txt');

    fs.writeFileSync(srcPath1, 'content1', 'utf8');
    fs.writeFileSync(srcPath2, 'content2', 'utf8');

    // Intercept copyFileSync to record temp file names used
    const originalCopyFile = fs.copyFileSync;
    const originalRename = fs.renameSync;
    const tempNames = [];

    let exdevCallCount = 0;
    fs.renameSync = (src, _dest) => {
      // First call per invocation (src->dest direct rename): throw EXDEV
      // to force copy+delete fallback
      exdevCallCount++;
      if (exdevCallCount <= 2) {
        const err = new Error('EXDEV');
        err.code = 'EXDEV';
        throw err;
      }
      // Subsequent calls (temp->dest): succeed
      return originalRename(src, _dest);
    };

    fs.copyFileSync = (src, dest) => {
      // Record temp file paths used
      if (dest.includes('.tmp')) {
        tempNames.push(path.basename(dest));
      }
      return originalCopyFile(src, dest);
    };

    try {
      // Simulate two concurrent renames to the same dest by calling them
      // sequentially — temp names should differ
      safeRenameSync(srcPath1, destPath);
    } catch (_e) {
      // may fail due to rename mock — that's ok for this test
    } finally {
      exdevCallCount = 0; // reset for second call
    }

    try {
      safeRenameSync(srcPath2, destPath);
    } catch (_e) {
      // may fail — ok
    } finally {
      fs.copyFileSync = originalCopyFile;
      fs.renameSync = originalRename;
    }

    // Verify: if both calls produced temp names, they should be different
    if (tempNames.length >= 2) {
      assert.notStrictEqual(
        tempNames[0],
        tempNames[1],
        'Concurrent renames must use different temp file names to avoid collision'
      );
    }
  });

  it('temp file names contain random component', () => {
    // RED: Bug 3 — deterministic temp name. After fix, name includes random hex.
    // Run copyAndDeleteFallback 5 times and collect temp names.
    const originalCopyFile = fs.copyFileSync;
    const originalRename = fs.renameSync;
    const tempNames = [];
    let callCount = 0;

    fs.renameSync = (...args) => {
      callCount++;
      // Throw EXDEV to force fallback for first rename (src->dest)
      // Allow subsequent renames (temp->dest) to succeed
      if (callCount % 2 !== 0) {
        const err = new Error('EXDEV');
        err.code = 'EXDEV';
        throw err;
      }
      // Even calls are temp->dest renames, let them succeed
      return originalRename(...args);
    };

    fs.copyFileSync = (src, dest) => {
      if (dest.includes('.tmp')) {
        tempNames.push(path.basename(dest));
      }
      return originalCopyFile(src, dest);
    };

    const results = [];
    for (let i = 0; i < 5; i++) {
      const srcPath = path.join(testDir, `source-${i}.txt`);
      const destPath = path.join(testDir, `dest-${i}.txt`);
      fs.writeFileSync(srcPath, `content ${i}`, 'utf8');
      try {
        callCount = 0;
        safeRenameSync(srcPath, destPath);
        results.push('ok');
      } catch (_e) {
        results.push('err');
      }
    }

    fs.copyFileSync = originalCopyFile;
    fs.renameSync = originalRename;

    // After fix: all temp names should be unique (random suffix)
    if (tempNames.length >= 2) {
      const uniqueNames = new Set(tempNames);
      assert.equal(
        uniqueNames.size,
        tempNames.length,
        `Temp file names must be unique across calls. Got: ${tempNames.join(', ')}`
      );
    }
  });

  // Bug 4: Source not cleaned up on partial failure — dest should be cleaned up
  it('cleans up dest file when source unlink fails after successful copy', () => {
    // RED: Bug 4 — when copy succeeds but unlinkSync(srcPath) fails,
    // the error handler should also try to unlink destPath to leave clean state.
    const srcPath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'destination.txt');

    fs.writeFileSync(srcPath, 'important content', 'utf8');

    const originalRename = fs.renameSync;
    const originalUnlink = fs.unlinkSync;
    const unlinkCalls = [];

    // Force EXDEV to trigger copy+delete fallback
    let renameCallCount = 0;
    fs.renameSync = function (src, dst) {
      renameCallCount++;
      if (renameCallCount === 1) {
        // First call: src->dest direct rename, throw EXDEV
        const err = new Error('EXDEV');
        err.code = 'EXDEV';
        throw err;
      }
      // Second call: temp->dest rename, succeed
      return originalRename(src, dst);
    };

    // Make unlinkSync fail for srcPath (simulating "file locked") but succeed for others
    fs.unlinkSync = filePath => {
      unlinkCalls.push(filePath);
      if (filePath === srcPath) {
        const err = new Error('EPERM: operation not permitted');
        err.code = 'EPERM';
        throw err;
      }
      return originalUnlink(filePath);
    };

    try {
      safeRenameSync(srcPath, destPath);
    } catch (_err) {
      // Expected: unlink of src failed → function throws
    } finally {
      fs.renameSync = originalRename;
      fs.unlinkSync = originalUnlink;
    }

    // After fix: dest file should be cleaned up (unlinkSync called on destPath)
    // because we don't want data at both src and dest
    const destUnlinkAttempted = unlinkCalls.includes(destPath);
    assert.ok(
      destUnlinkAttempted,
      `After partial failure, should attempt to clean up dest file. unlinkCalls: ${JSON.stringify(unlinkCalls)}`
    );
  });

  it('dest file is removed when partial failure leaves data at both src and dest', () => {
    // RED: Bug 4 — after fix, dest should NOT exist when src unlink fails
    // (clean state: either src exists or dest exists, not both)
    const srcPath = path.join(testDir, 'source.txt');
    const destPath = path.join(testDir, 'destination.txt');

    fs.writeFileSync(srcPath, 'important content', 'utf8');

    const originalRename = fs.renameSync;
    const originalUnlink = fs.unlinkSync;

    let renameCallCount = 0;
    fs.renameSync = function (src, dst) {
      renameCallCount++;
      if (renameCallCount === 1) {
        const err = new Error('EXDEV');
        err.code = 'EXDEV';
        throw err;
      }
      return originalRename(src, dst);
    };

    fs.unlinkSync = function (filePath) {
      if (filePath === srcPath) {
        const err = new Error('EPERM');
        err.code = 'EPERM';
        throw err;
      }
      return originalUnlink(filePath);
    };

    let thrown = false;
    try {
      safeRenameSync(srcPath, destPath);
    } catch (_err) {
      thrown = true;
    } finally {
      fs.renameSync = originalRename;
      fs.unlinkSync = originalUnlink;
    }

    assert.ok(thrown, 'Should throw when src unlink fails');
    // After fix: dest should be cleaned up (not exist), restoring clean state
    assert.strictEqual(
      fs.existsSync(destPath),
      false,
      'After partial failure, dest file should be cleaned up to leave clean state'
    );
    // Src should still exist (was not deleted)
    assert.strictEqual(fs.existsSync(srcPath), true, 'Source file should still exist');
  });
});
