/**
 * Test for Error Writer Retry Logic
 * =================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeError, getErrorReportsDir } = require('../../.claude/lib/error-writer.cjs');

test('Error Writer - should retry on transient failures (simulated EBUSY)', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-writer-test-'));
  process.env.ERROR_REPORTS_DIR = tmpDir;

  // Mock fs.appendFileSync to throw EBUSY twice, then succeed
  const originalAppend = fs.appendFileSync;
  let attempts = 0;
  
  // We need to override it on the fs module because error-writer requires it
  fs.appendFileSync = (path, data, options) => {
    attempts++;
    if (attempts <= 2) {
      const err = new Error('Resource busy');
      err.code = 'EBUSY';
      throw err;
    }
    return originalAppend(path, data, options);
  };

  try {
    const success = writeError({ message: 'Test error', errorId: 'test-1' });
    assert.strictEqual(success, true, 'Should eventually succeed');
    assert.strictEqual(attempts, 3, 'Should have attempted 3 times');
    
    // Verify file content
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 1);
    const content = fs.readFileSync(path.join(tmpDir, files[0]), 'utf8');
    assert.ok(content.includes('test-1'));
  } finally {
    // Restore and cleanup
    fs.appendFileSync = originalAppend;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ERROR_REPORTS_DIR;
  }
});
