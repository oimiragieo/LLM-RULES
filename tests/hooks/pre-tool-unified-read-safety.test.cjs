const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  checkReadSafety,
  hasReadWindow,
  resolveReadPath,
  cleanupMemoryTempFiles,
} = require('../../.claude/hooks/routing/pre-tool-unified.cjs');

describe('pre-tool-unified read safety', () => {
  test('hasReadWindow detects offset/limit windows', () => {
    assert.strictEqual(hasReadWindow({}), false);
    assert.strictEqual(hasReadWindow({ offset: 0 }), true);
    assert.strictEqual(hasReadWindow({ limit: 2000 }), true);
    assert.strictEqual(hasReadWindow({ start_line: 1, end_line: 120 }), true);
  });

  test('resolveReadPath resolves relative project paths', () => {
    const resolved = resolveReadPath({ file_path: '.claude/README.md' });
    assert.ok(path.isAbsolute(resolved));
    assert.ok(resolved.endsWith(path.join('.claude', 'README.md')));
  });

  test('checkReadSafety blocks reading a directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-dir-'));
    try {
      const result = checkReadSafety('Read', { file_path: tempDir });
      assert.strictEqual(result.action, 'block');
      assert.ok(result.message.includes('is a directory'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety blocks large file without read window', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-file-'));
    const filePath = path.join(tempDir, 'large.txt');
    try {
      fs.writeFileSync(filePath, 'a'.repeat(130000), 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath });
      assert.strictEqual(result.action, 'block');
      assert.ok(result.message.includes('requires chunked Read'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkReadSafety allows large file with read window', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-guard-file-window-'));
    const filePath = path.join(tempDir, 'large.txt');
    try {
      fs.writeFileSync(filePath, 'b'.repeat(130000), 'utf8');
      const result = checkReadSafety('Read', { file_path: filePath, offset: 0, limit: 4000 });
      assert.strictEqual(result.action, 'allow');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('cleanupMemoryTempFiles removes stale .tmp artifacts but keeps normal files', () => {
    const memoryDir = path.join(__dirname, '..', '..', '.claude', 'context', 'memory', 'named');
    fs.mkdirSync(memoryDir, { recursive: true });

    const staleTmp = path.join(memoryDir, `cleanup-test-${Date.now()}.jsonl.tmp`);
    const keepFile = path.join(memoryDir, `cleanup-test-${Date.now()}.md`);
    fs.writeFileSync(staleTmp, 'temp', 'utf8');
    fs.writeFileSync(keepFile, 'keep', 'utf8');

    const oldMs = Date.now() - 26 * 60 * 60 * 1000;
    fs.utimesSync(staleTmp, oldMs / 1000, oldMs / 1000);

    try {
      const result = cleanupMemoryTempFiles();
      assert.ok(result.deleted >= 1);
      assert.ok(!fs.existsSync(staleTmp));
      assert.ok(fs.existsSync(keepFile));
    } finally {
      try {
        fs.unlinkSync(staleTmp);
      } catch (_e) {
        // ignore if already removed
      }
      try {
        fs.unlinkSync(keepFile);
      } catch (_e) {
        // ignore if already removed
      }
    }
  });
});
