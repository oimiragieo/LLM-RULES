'use strict';

/**
 * Tests for detectSearchLikeGrep() in post-tool-metrics-unified.cjs
 *
 * Covers the four canonical scenarios from the task spec plus edge cases.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const {
  detectSearchLikeGrep,
  recordSearchTelemetry,
  SEARCH_TELEMETRY_LOG,
  setSearchTelemetryLog,
} = require(
  path.join(
    PROJECT_ROOT,
    '.claude',
    'hooks',
    'metrics',
    'post-tool-metrics-unified.cjs'
  )
);

// ---------------------------------------------------------------------------
// detectSearchLikeGrep — unit tests
// ---------------------------------------------------------------------------

describe('detectSearchLikeGrep', () => {
  describe('broad search (search-like = true)', () => {
    it('returns true when no path is provided (pattern only)', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'function foo' }), true);
    });

    it('returns true when path is empty string', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: '' }), true);
    });

    it('returns true when path is "." (current directory)', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: '.' }), true);
    });

    it('returns true when path ends with "/" (directory path)', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'src/' }), true);
    });

    it('returns true when path is a bare directory name without extension', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'src' }), true);
    });

    it('returns true when path contains "**" glob', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: '**/*.ts' }), true);
    });

    it('returns true when path contains "*" glob', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'src/*.js' }), true);
    });

    it('returns true when path contains "?" glob', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'src/file?.ts' }), true);
    });

    it('returns true when include field is used with glob instead of path', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', include: '**/*.ts' }), true);
    });
  });

  describe('targeted search (search-like = false)', () => {
    it('returns false when path is a specific .js file', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'src/app.js' }), false);
    });

    it('returns false when path is a specific .ts file', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'lib/utils.ts' }), false);
    });

    it('returns false when path is a specific .cjs file', () => {
      assert.equal(
        detectSearchLikeGrep({ pattern: 'foo', path: '.claude/hooks/routing/routing-guard.cjs' }),
        false
      );
    });

    it('returns false when path is a deeply nested specific file', () => {
      assert.equal(
        detectSearchLikeGrep({ pattern: 'TaskUpdate', path: 'tests/hooks/my-hook.test.cjs' }),
        false
      );
    });

    it('returns false when path is a .json config file', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'name', path: 'package.json' }), false);
    });
  });

  describe('edge cases', () => {
    it('returns false when toolInput is null', () => {
      assert.equal(detectSearchLikeGrep(null), false);
    });

    it('returns false when toolInput is undefined', () => {
      assert.equal(detectSearchLikeGrep(undefined), false);
    });

    it('returns false when toolInput is not an object', () => {
      assert.equal(detectSearchLikeGrep('string'), false);
    });

    it('returns true when path is ".." (parent directory)', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: '..' }), true);
    });

    it('returns true when path ends with backslash (Windows directory)', () => {
      assert.equal(detectSearchLikeGrep({ pattern: 'foo', path: 'src\\' }), true);
    });
  });
});

// ---------------------------------------------------------------------------
// recordSearchTelemetry — integration tests
// ---------------------------------------------------------------------------

describe('recordSearchTelemetry', () => {
  let tmpTelemetryLog;
  let originalLog;

  before(() => {
    // Redirect to temp file for test isolation
    originalLog = SEARCH_TELEMETRY_LOG;
    tmpTelemetryLog = path.join(os.tmpdir(), `search-telemetry-test-${Date.now()}.jsonl`);
    if (typeof setSearchTelemetryLog === 'function') {
      setSearchTelemetryLog(tmpTelemetryLog);
    }
  });

  after(() => {
    // Restore original log path
    if (typeof setSearchTelemetryLog === 'function') {
      setSearchTelemetryLog(originalLog);
    }
    // Clean up temp file
    if (fs.existsSync(tmpTelemetryLog)) {
      fs.unlinkSync(tmpTelemetryLog);
    }
  });

  it('does not throw for a non-Grep tool', () => {
    const hookInput = {
      tool_name: 'Read',
      tool_input: { file_path: 'src/app.js' },
    };
    assert.doesNotThrow(() => recordSearchTelemetry(hookInput));
  });

  it('does not throw for a targeted Grep (no telemetry expected)', () => {
    const hookInput = {
      tool_name: 'Grep',
      tool_input: { pattern: 'function foo', path: 'src/app.js' },
    };
    assert.doesNotThrow(() => recordSearchTelemetry(hookInput));
  });

  it('does not throw for a broad Grep and writes to the telemetry log', () => {
    // Use redirected tmpTelemetryLog for isolation
    const logFile = tmpTelemetryLog;

    // Capture the file size before the call
    const sizeBefore = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;

    const hookInput = {
      tool_name: 'Grep',
      tool_input: { pattern: 'TaskUpdate', path: 'src/' },
    };

    assert.doesNotThrow(() => recordSearchTelemetry(hookInput));

    // The telemetry log should have grown
    const sizeAfter = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    assert.ok(sizeAfter > sizeBefore, 'Telemetry log should have grown after broad Grep');

    // Validate the written entry is valid JSON with expected shape
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const entry = JSON.parse(lastLine);
    assert.equal(entry.toolName, 'Grep');
    assert.equal(entry.searchLike, true);
    assert.equal(entry.pattern, 'TaskUpdate');
    assert.ok(entry.timestamp, 'entry should have a timestamp');
    assert.ok(typeof entry.note === 'string', 'entry should have a note string');
  });

  it('does not throw when hookInput is empty object', () => {
    assert.doesNotThrow(() => recordSearchTelemetry({}));
  });
});
