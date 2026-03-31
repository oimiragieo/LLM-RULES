#!/usr/bin/env node
/**
 * permission-denied-logger.test.cjs
 *
 * Tests for .claude/hooks/lifecycle/permission-denied-logger.cjs
 *
 * Verifies:
 *   - Hook file exists and is loadable
 *   - Entry creation with valid input
 *   - Field validation (tool, reason, timestamp, session_id)
 *   - Bounded growth (overflow trims oldest entries)
 *   - Corruption recovery (resets to [] on bad JSON or non-array)
 *   - Fail-open behaviour (empty/missing/invalid input → exit 0)
 *
 * Fulfills: VAL-NE-003, VAL-NE-004
 */

'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/lifecycle/permission-denied-logger.cjs'
);

// ─── Module helpers ───────────────────────────────────────────────────────────

/**
 * Load (or reload) the hook module with a fresh require cache entry.
 * @returns {Object} Hook module exports
 */
function loadHook() {
  const resolved = require.resolve(HOOK_PATH);
  delete require.cache[resolved];
  return require(HOOK_PATH);
}

/**
 * Spawn the hook as a subprocess, piping JSON to stdin.
 * Returns { status, stdout, stderr }.
 *
 * @param {string|null} stdinData - JSON string to pipe (or null for empty)
 * @param {Object} [env] - Extra environment variables
 */
function runHookProcess(stdinData, env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: stdinData === null ? '' : stdinData,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('permission-denied-logger hook', () => {
  let hook;
  let tmpDir;

  before(() => {
    hook = loadHook();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'denial-log-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Existence & Exports ──────────────────────────────────────────────────

  describe('module exports', () => {
    it('hook file exists and is loadable', () => {
      assert.ok(fs.existsSync(HOOK_PATH), `Hook must exist at ${HOOK_PATH}`);
      assert.ok(hook !== null && hook !== undefined, 'Hook module must load without error');
    });

    it('exports buildEntry function', () => {
      assert.strictEqual(typeof hook.buildEntry, 'function');
    });

    it('exports readLog function', () => {
      assert.strictEqual(typeof hook.readLog, 'function');
    });

    it('exports writeLog function', () => {
      assert.strictEqual(typeof hook.writeLog, 'function');
    });

    it('exports appendEntry function', () => {
      assert.strictEqual(typeof hook.appendEntry, 'function');
    });

    it('exports getMaxEntries function', () => {
      assert.strictEqual(typeof hook.getMaxEntries, 'function');
    });

    it('exports HOOK_NAME string', () => {
      assert.strictEqual(typeof hook.HOOK_NAME, 'string');
      assert.ok(hook.HOOK_NAME.length > 0);
    });

    it('exports DEFAULT_LOG_FILE string', () => {
      assert.strictEqual(typeof hook.DEFAULT_LOG_FILE, 'string');
      assert.ok(hook.DEFAULT_LOG_FILE.includes('denial-log.json'));
    });

    it('exports DEFAULT_MAX_ENTRIES number', () => {
      assert.strictEqual(typeof hook.DEFAULT_MAX_ENTRIES, 'number');
      assert.strictEqual(hook.DEFAULT_MAX_ENTRIES, 500);
    });
  });

  // ─── Entry Creation ───────────────────────────────────────────────────────

  describe('entry creation', () => {
    it('appends an entry to a new log file', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      const input = { tool_name: 'Bash', reason: 'Forbidden command', session_id: 'sess-001' };

      hook.appendEntry(input, logFile);

      assert.ok(fs.existsSync(logFile), 'Log file must be created');
      const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      assert.strictEqual(entries.length, 1);
    });

    it('appends multiple entries to an existing log file', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');

      hook.appendEntry({ tool_name: 'Edit', session_id: 's1' }, logFile);
      hook.appendEntry({ tool_name: 'Write', session_id: 's2' }, logFile);
      hook.appendEntry({ tool_name: 'Grep', session_id: 's3' }, logFile);

      const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      assert.strictEqual(entries.length, 3);
    });

    it('creates runtime directory if it does not exist', () => {
      const nestedDir = path.join(tmpDir, 'context', 'runtime');
      const logFile = path.join(nestedDir, 'denial-log.json');

      assert.ok(!fs.existsSync(nestedDir), 'Directory must not exist before hook runs');
      hook.appendEntry({ tool_name: 'Read', session_id: 's1' }, logFile);
      assert.ok(fs.existsSync(nestedDir), 'Directory must be created by the hook');
      assert.ok(fs.existsSync(logFile), 'Log file must be created inside the new directory');
    });
  });

  // ─── Field Validation ─────────────────────────────────────────────────────

  describe('field validation', () => {
    it('entry contains tool field matching tool_name', () => {
      const entry = hook.buildEntry({ tool_name: 'WebSearch', session_id: 'abc' });
      assert.strictEqual(entry.tool, 'WebSearch');
    });

    it('entry falls back to tool field when tool_name is absent', () => {
      const entry = hook.buildEntry({ tool: 'Bash', session_id: 'abc' });
      assert.strictEqual(entry.tool, 'Bash');
    });

    it('entry tool defaults to "unknown" when both tool_name and tool are absent', () => {
      const entry = hook.buildEntry({ session_id: 'abc' });
      assert.strictEqual(entry.tool, 'unknown');
    });

    it('entry contains reason from reason field', () => {
      const entry = hook.buildEntry({ tool_name: 'Edit', reason: 'Not allowed', session_id: 's' });
      assert.strictEqual(entry.reason, 'Not allowed');
    });

    it('entry falls back to message field for reason', () => {
      const entry = hook.buildEntry({ tool_name: 'Edit', message: 'Blocked', session_id: 's' });
      assert.strictEqual(entry.reason, 'Blocked');
    });

    it('entry falls back to description field for reason', () => {
      const entry = hook.buildEntry({ tool_name: 'Edit', description: 'Desc', session_id: 's' });
      assert.strictEqual(entry.reason, 'Desc');
    });

    it('entry reason defaults to "unknown" when all reason fields absent', () => {
      const entry = hook.buildEntry({ tool_name: 'Edit', session_id: 's' });
      assert.strictEqual(entry.reason, 'unknown');
    });

    it('entry contains session_id field', () => {
      const entry = hook.buildEntry({ tool_name: 'Read', session_id: 'session-xyz' });
      assert.strictEqual(entry.session_id, 'session-xyz');
    });

    it('entry session_id defaults to empty string when absent', () => {
      const entry = hook.buildEntry({ tool_name: 'Read' });
      assert.strictEqual(entry.session_id, '');
    });

    it('entry contains a valid ISO 8601 timestamp', () => {
      const before = new Date();
      const entry = hook.buildEntry({ tool_name: 'Bash', session_id: 's' });
      const after = new Date();

      const ts = new Date(entry.timestamp);
      assert.ok(!isNaN(ts.getTime()), 'timestamp must be a valid date');
      assert.ok(ts >= before && ts <= after, 'timestamp must be within test window');
    });

    it('entry has exactly the four required fields', () => {
      const entry = hook.buildEntry({ tool_name: 'Edit', reason: 'r', session_id: 's' });
      const keys = Object.keys(entry).sort();
      assert.deepStrictEqual(keys, ['reason', 'session_id', 'timestamp', 'tool']);
    });

    it('handles null hookInput gracefully (uses defaults)', () => {
      const entry = hook.buildEntry(null);
      assert.strictEqual(entry.tool, 'unknown');
      assert.strictEqual(entry.reason, 'unknown');
      assert.strictEqual(entry.session_id, '');
      assert.strictEqual(typeof entry.timestamp, 'string');
    });
  });

  // ─── Bounded Growth ───────────────────────────────────────────────────────

  describe('bounded growth', () => {
    it('does not exceed the max entries limit (default 500)', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      const max = hook.DEFAULT_MAX_ENTRIES;

      // Pre-fill log with exactly max entries
      const existing = Array.from({ length: max }, (_, i) => ({
        tool: `tool-${i}`,
        reason: 'r',
        timestamp: new Date().toISOString(),
        session_id: `s-${i}`,
      }));
      hook.writeLog(existing, logFile);

      // Append one more
      hook.appendEntry({ tool_name: 'NewTool', reason: 'overflow', session_id: 'new' }, logFile);

      const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      assert.strictEqual(entries.length, max, `Must stay at ${max} entries after overflow`);
    });

    it('trims the oldest entries on overflow', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      const max = 5;

      // Fill with 5 entries
      for (let i = 0; i < max; i++) {
        hook.appendEntry({ tool_name: `tool-${i}`, session_id: `s-${i}` }, logFile, max);
      }

      // Append one more — oldest (tool-0) should be removed
      hook.appendEntry({ tool_name: 'newest', session_id: 'sN' }, logFile, max);

      const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      assert.strictEqual(entries.length, max);
      assert.strictEqual(
        entries[0].tool,
        'tool-1',
        'First entry should be tool-1 (oldest trimmed)'
      );
      assert.strictEqual(entries[max - 1].tool, 'newest', 'Last entry should be newest');
    });

    it('configurable max via DENIAL_LOG_MAX_ENTRIES env var', () => {
      const saved = process.env.DENIAL_LOG_MAX_ENTRIES;
      try {
        process.env.DENIAL_LOG_MAX_ENTRIES = '10';
        // Reload to pick up env change
        const freshHook = loadHook();
        assert.strictEqual(freshHook.getMaxEntries(), 10);
      } finally {
        if (saved === undefined) {
          delete process.env.DENIAL_LOG_MAX_ENTRIES;
        } else {
          process.env.DENIAL_LOG_MAX_ENTRIES = saved;
        }
      }
    });

    it('getMaxEntries returns DEFAULT_MAX_ENTRIES when env var is absent', () => {
      const saved = process.env.DENIAL_LOG_MAX_ENTRIES;
      try {
        delete process.env.DENIAL_LOG_MAX_ENTRIES;
        const freshHook = loadHook();
        assert.strictEqual(freshHook.getMaxEntries(), freshHook.DEFAULT_MAX_ENTRIES);
      } finally {
        if (saved !== undefined) {
          process.env.DENIAL_LOG_MAX_ENTRIES = saved;
        }
      }
    });

    it('getMaxEntries ignores non-positive env values and uses default', () => {
      const saved = process.env.DENIAL_LOG_MAX_ENTRIES;
      try {
        process.env.DENIAL_LOG_MAX_ENTRIES = '0';
        const freshHook = loadHook();
        assert.strictEqual(freshHook.getMaxEntries(), freshHook.DEFAULT_MAX_ENTRIES);
      } finally {
        if (saved === undefined) {
          delete process.env.DENIAL_LOG_MAX_ENTRIES;
        } else {
          process.env.DENIAL_LOG_MAX_ENTRIES = saved;
        }
      }
    });
  });

  // ─── Corruption Recovery ──────────────────────────────────────────────────

  describe('corruption recovery', () => {
    it('resets to [] when log file contains invalid JSON', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      fs.writeFileSync(logFile, 'NOT_VALID_JSON', 'utf8');

      const entries = hook.readLog(logFile);
      assert.deepStrictEqual(entries, []);
    });

    it('resets to [] when log file contains a JSON object (non-array)', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      fs.writeFileSync(logFile, JSON.stringify({ entries: [] }), 'utf8');

      const entries = hook.readLog(logFile);
      assert.deepStrictEqual(entries, []);
    });

    it('resets to [] when log file contains a JSON null', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      fs.writeFileSync(logFile, 'null', 'utf8');

      const entries = hook.readLog(logFile);
      assert.deepStrictEqual(entries, []);
    });

    it('resets to [] when log file contains a JSON string', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      fs.writeFileSync(logFile, '"corrupted"', 'utf8');

      const entries = hook.readLog(logFile);
      assert.deepStrictEqual(entries, []);
    });

    it('appends entry after corruption recovery without crashing', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      fs.writeFileSync(logFile, 'CORRUPTED!', 'utf8');

      // Should not throw — appends entry after reset
      hook.appendEntry({ tool_name: 'Edit', reason: 'test', session_id: 's1' }, logFile);

      const entries = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].tool, 'Edit');
    });

    it('returns [] when log file does not exist', () => {
      const logFile = path.join(tmpDir, 'nonexistent.json');
      const entries = hook.readLog(logFile);
      assert.deepStrictEqual(entries, []);
    });

    it('returns [] when log file is empty', () => {
      const logFile = path.join(tmpDir, 'denial-log.json');
      fs.writeFileSync(logFile, '', 'utf8');

      const entries = hook.readLog(logFile);
      assert.deepStrictEqual(entries, []);
    });
  });

  // ─── Fail-Open Behaviour (subprocess) ────────────────────────────────────

  describe('fail-open behaviour', () => {
    it('exits 0 when stdin is empty', () => {
      const result = runHookProcess(null, {
        DENIAL_LOG_FILE_OVERRIDE: path.join(tmpDir, 'denial-log.json'),
      });
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('exits 0 when stdin is invalid JSON', () => {
      const result = runHookProcess('NOT_JSON');
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('exits 0 when stdin is valid JSON with a tool_name', () => {
      const input = JSON.stringify({
        tool_name: 'Bash',
        reason: 'Forbidden',
        session_id: 'sess-abc',
      });
      const result = runHookProcess(input);
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('exits 0 when stdin is empty JSON object {}', () => {
      const result = runHookProcess('{}');
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('exits 0 when stdin is null JSON', () => {
      const result = runHookProcess('null');
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('stdout contains allow decision on successful run', () => {
      const input = JSON.stringify({
        tool_name: 'Edit',
        reason: 'blocked',
        session_id: 'test-session',
      });
      const result = runHookProcess(input);
      assert.strictEqual(result.status, 0);

      // Output should contain a JSON object with permissionDecision: allow
      let parsed;
      try {
        parsed = JSON.parse(result.stdout.trim());
      } catch (_e) {
        assert.fail(`stdout is not valid JSON: ${result.stdout}`);
      }
      assert.strictEqual(parsed.permissionDecision, 'allow');
    });
  });

  // ─── readLog / writeLog round-trip ───────────────────────────────────────

  describe('readLog / writeLog round-trip', () => {
    it('writeLog + readLog preserves all entries', () => {
      const logFile = path.join(tmpDir, 'round-trip.json');
      const entries = [
        { tool: 'Edit', reason: 'test', timestamp: '2026-01-01T00:00:00.000Z', session_id: 's1' },
        { tool: 'Write', reason: 'test2', timestamp: '2026-01-02T00:00:00.000Z', session_id: 's2' },
      ];

      hook.writeLog(entries, logFile);
      const read = hook.readLog(logFile);

      assert.strictEqual(read.length, 2);
      assert.strictEqual(read[0].tool, 'Edit');
      assert.strictEqual(read[1].tool, 'Write');
    });

    it('writeLog creates parent directories recursively', () => {
      const deepDir = path.join(tmpDir, 'a', 'b', 'c');
      const logFile = path.join(deepDir, 'denial-log.json');

      hook.writeLog([], logFile);

      assert.ok(fs.existsSync(logFile), 'File must be created with parent dirs');
    });
  });
});
