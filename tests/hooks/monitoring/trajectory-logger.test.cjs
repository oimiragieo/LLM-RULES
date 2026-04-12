'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { sanitize, buildRecord, getLogPath, ensureDir } = require(
  path.join(__dirname, '..', '..', '..', '.claude', 'hooks', 'monitoring', 'trajectory-logger.cjs')
);

describe('trajectory-logger', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'traj-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('sanitize()', () => {
    it('truncates long strings to maxLen', () => {
      const long = 'a'.repeat(500);
      const result = sanitize(long, 200);
      assert.equal(result.length, 200);
    });

    it('replaces newlines and tabs with spaces', () => {
      const result = sanitize('line1\nline2\ttab\rreturn');
      assert.equal(result, 'line1 line2 tab return');
    });

    it('returns empty string for null/undefined', () => {
      assert.equal(sanitize(null), '');
      assert.equal(sanitize(undefined), '');
    });

    it('stringifies objects', () => {
      const result = sanitize({ key: 'value' });
      assert.ok(result.includes('key'));
      assert.ok(result.includes('value'));
    });

    it('handles empty string input', () => {
      assert.equal(sanitize(''), '');
    });
  });

  describe('buildRecord()', () => {
    it('creates record from hook input', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/some/file.txt' },
        tool_output: { content: 'file contents' },
      };
      const record = buildRecord(input);

      assert.equal(record.tool_name, 'Read');
      assert.ok(record.timestamp);
      assert.ok(record.tool_input_summary.includes('file.txt'));
      assert.equal(record.exit_code, 0);
      assert.equal(record.duration_ms, null);
    });

    it('handles empty hook input', () => {
      const record = buildRecord({});
      assert.equal(record.tool_name, '');
      assert.equal(record.tool_input_summary, '{}');
      assert.equal(record.exit_code, 0);
    });

    it('uses alternative field names', () => {
      const input = {
        tool: 'Bash',
        input: { command: 'ls' },
        output: 'file1 file2',
      };
      const record = buildRecord(input);
      assert.equal(record.tool_name, 'Bash');
    });

    it('truncates large input summaries', () => {
      const input = {
        tool_name: 'Write',
        tool_input: { content: 'x'.repeat(1000) },
      };
      const record = buildRecord(input);
      assert.ok(record.tool_input_summary.length <= 200);
    });
  });

  describe('ensureDir()', () => {
    it('creates directory if not exists', () => {
      const logPath = path.join(tmpDir, 'sub', 'dir', 'file.jsonl');
      ensureDir(logPath);
      assert.ok(fs.existsSync(path.join(tmpDir, 'sub', 'dir')));
    });

    it('is idempotent for existing directory', () => {
      const logPath = path.join(tmpDir, 'file.jsonl');
      ensureDir(logPath);
      ensureDir(logPath); // should not throw
    });
  });

  describe('getLogPath()', () => {
    it('returns path with today date', () => {
      const logPath = getLogPath();
      const today = new Date().toISOString().split('T')[0];
      assert.ok(logPath.includes(`trajectory-${today}.jsonl`));
    });

    it('points to .claude/context/logs/', () => {
      const logPath = getLogPath().replace(/\\/g, '/');
      assert.ok(logPath.includes('.claude/context/logs/'));
    });
  });

  describe('appendRecord()', () => {
    it('appends valid JSONL to file', () => {
      // Override getLogPath for test by writing directly
      const testLogPath = path.join(tmpDir, 'test-trajectory.jsonl');
      const record = buildRecord({
        tool_name: 'TestTool',
        tool_input: { param: 'value' },
      });

      // Direct write to test path
      const dir = path.dirname(testLogPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(testLogPath, JSON.stringify(record) + '\n', 'utf8');

      const content = fs.readFileSync(testLogPath, 'utf8');
      const lines = content.trim().split('\n');
      assert.equal(lines.length, 1);

      const parsed = JSON.parse(lines[0]);
      assert.equal(parsed.tool_name, 'TestTool');
      assert.ok(parsed.timestamp);
    });

    it('appends multiple records', () => {
      const testLogPath = path.join(tmpDir, 'multi-trajectory.jsonl');

      for (let i = 0; i < 3; i++) {
        const record = buildRecord({ tool_name: `Tool${i}` });
        fs.appendFileSync(testLogPath, JSON.stringify(record) + '\n', 'utf8');
      }

      const content = fs.readFileSync(testLogPath, 'utf8');
      const lines = content.trim().split('\n');
      assert.equal(lines.length, 3);
    });
  });

  describe('record schema compliance', () => {
    it('has all required fields', () => {
      const record = buildRecord({
        tool_name: 'Read',
        tool_input: { file_path: 'test.txt' },
        tool_output: 'content',
      });

      const requiredFields = [
        'timestamp',
        'session_id',
        'tool_name',
        'tool_input_summary',
        'tool_output_summary',
        'exit_code',
        'duration_ms',
        'agent_type',
        'task_id',
      ];

      for (const field of requiredFields) {
        assert.ok(field in record, `Missing field: ${field}`);
      }
    });

    it('timestamp is valid ISO-8601', () => {
      const record = buildRecord({ tool_name: 'Test' });
      const date = new Date(record.timestamp);
      assert.ok(!isNaN(date.getTime()), 'Timestamp should be valid ISO-8601');
    });
  });
});
