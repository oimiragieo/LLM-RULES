'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set environment variables for testing
process.env.READ_CHUNK_GUARD_BYTES = '60000';
process.env.READ_CHUNK_GUARD_TOKENS = '12000';
process.env.READ_ESTIMATED_CHARS_PER_TOKEN = '5';

const { checkReadSafety } = require('../../.claude/hooks/routing/pre-tool-unified.read-safety.cjs');

test('Read Safety Hook: blocks large files based on new strict thresholds', async (_t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-safety-test-'));
  const largeFile = path.join(tempDir, 'large.txt');
  
  // Create a 70KB file (exceeds 60KB threshold)
  const content = 'A'.repeat(70000);
  fs.writeFileSync(largeFile, content);

  try {
    const result = checkReadSafety('Read', { file_path: largeFile }, { 
      session_id: 'test-session',
      permission_mode: 'bypassPermissions'
    });
    
    assert.strictEqual(result.checked, true);
    // Should be a rewrite if auto-windowing is on (default)
    assert.strictEqual(result.action, 'rewrite');
    assert.strictEqual(result.rewrittenToolInput.offset, 0);
    assert.strictEqual(result.rewrittenToolInput.limit, 4000);
    assert.ok(result.bypassWarning.toLowerCase().includes('large file'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Read Safety Hook: blocks files based on token estimate', async (_t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-safety-token-test-'));
  const denseFile = path.join(tempDir, 'dense.txt');
  
  // 50KB file with estimated 5 chars/token = 10,000 tokens (allowed if threshold is 12,000)
  // But if we use 4 chars/token (old default) = 12,500 tokens (blocked)
  // Let's test with 65KB file = 13,000 tokens (blocked)
  const content = 'A'.repeat(65000);
  fs.writeFileSync(denseFile, content);

  try {
    const result = checkReadSafety('Read', { file_path: denseFile }, { 
      session_id: 'test-session',
      permission_mode: 'bypassPermissions'
    });
    
    assert.strictEqual(result.checked, true);
    assert.strictEqual(result.action, 'rewrite');
    assert.ok(result.bypassWarning.toLowerCase().includes('large file'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
