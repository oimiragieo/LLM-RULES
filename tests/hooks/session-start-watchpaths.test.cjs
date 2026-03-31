#!/usr/bin/env node
/**
 * session-start-watchpaths.test.cjs
 *
 * Tests for .claude/hooks/lifecycle/session-start-watchpaths.cjs
 *
 * Verifies:
 *   - Hook file exists and exports expected API
 *   - Valid paths are returned in watchPaths array
 *   - Missing / non-existent paths are omitted with a stderr warning
 *   - Crash safety: any error returns {allow:true, watchPaths:[]} and exits 0
 *   - Windows path handling: consistent forward-slash separators
 *   - Deduplication: duplicate paths appear only once in result
 *   - Process-level: exits 0 and emits valid JSON on stdout
 *
 * Fulfills: VAL-NE-005, VAL-NE-006
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
  '../../.claude/hooks/lifecycle/session-start-watchpaths.cjs'
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
 * Spawn the hook as a subprocess, piping optional JSON to stdin.
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

describe('session-start-watchpaths hook', () => {
  let hook;
  let tmpDir;

  before(() => {
    hook = loadHook();
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-start-watchpaths-test-'));
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

    it('exports buildWatchPaths function', () => {
      assert.strictEqual(typeof hook.buildWatchPaths, 'function');
    });

    it('exports normalizeSep function', () => {
      assert.strictEqual(typeof hook.normalizeSep, 'function');
    });

    it('exports HOOK_NAME string', () => {
      assert.strictEqual(typeof hook.HOOK_NAME, 'string');
      assert.ok(hook.HOOK_NAME.length > 0);
    });

    it('exports WATCH_PATHS_RELATIVE array', () => {
      assert.ok(Array.isArray(hook.WATCH_PATHS_RELATIVE));
      assert.ok(hook.WATCH_PATHS_RELATIVE.length > 0);
    });
  });

  // ─── Valid Paths Returned ─────────────────────────────────────────────────

  describe('valid paths returned', () => {
    it('returns only existing paths when all target files exist', () => {
      // Create a temp project root with all expected files/dirs
      const fakeRoot = tmpDir;
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'config'), { recursive: true });
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'context', 'runtime'), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'config', 'agent-registry.json'), '{}');
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'settings.json'), '{}');

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      assert.ok(Array.isArray(watchPaths), 'watchPaths must be an array');
      assert.ok(watchPaths.length >= 3, 'Must return at least 3 paths when all files exist');
    });

    it('all returned paths are absolute', () => {
      const fakeRoot = tmpDir;
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'config'), { recursive: true });
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'context', 'runtime'), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'config', 'agent-registry.json'), '{}');
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'settings.json'), '{}');

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      for (const p of watchPaths) {
        assert.ok(path.isAbsolute(p), `Path must be absolute: ${p}`);
      }
    });

    it('returns empty array when no target paths exist', () => {
      const emptyRoot = tmpDir;
      // No files created — emptyRoot has no .claude subdirectory

      const watchPaths = hook.buildWatchPaths(emptyRoot);

      assert.ok(Array.isArray(watchPaths), 'Must return an array');
      assert.strictEqual(watchPaths.length, 0, 'Must return empty array when nothing exists');
    });
  });

  // ─── Missing Files Omitted ────────────────────────────────────────────────

  describe('missing files omitted with warning', () => {
    it('omits non-existent agent-registry.json from watchPaths', () => {
      const fakeRoot = tmpDir;
      // Only create settings.json, skip agent-registry.json
      fs.mkdirSync(path.join(fakeRoot, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'settings.json'), '{}');

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      const hasAgentRegistry = watchPaths.some(p => p.includes('agent-registry.json'));
      assert.strictEqual(
        hasAgentRegistry,
        false,
        'agent-registry.json must be omitted when missing'
      );
    });

    it('includes settings.json when it exists', () => {
      const fakeRoot = tmpDir;
      fs.mkdirSync(path.join(fakeRoot, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'settings.json'), '{}');

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      const hasSettings = watchPaths.some(p => p.includes('settings.json'));
      assert.ok(hasSettings, 'settings.json must be included when it exists');
    });

    it('includes runtime directory when it exists', () => {
      const fakeRoot = tmpDir;
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'context', 'runtime'), { recursive: true });

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      const hasRuntime = watchPaths.some(p => p.includes('runtime'));
      assert.ok(hasRuntime, 'runtime directory must be included when it exists');
    });

    it('emits stderr warning when a path does not exist', () => {
      const fakeRoot = tmpDir;
      // No files created

      const stderrMessages = [];
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = (msg, ...rest) => {
        if (typeof msg === 'string') stderrMessages.push(msg);
        return origWrite(msg, ...rest);
      };

      try {
        hook.buildWatchPaths(fakeRoot);
      } finally {
        process.stderr.write = origWrite;
      }

      const hasWarning = stderrMessages.some(
        m => m.includes('Warning') || m.includes('omitting') || m.includes('does not exist')
      );
      assert.ok(hasWarning, 'Must emit a warning to stderr for missing paths');
    });

    it('partial existence: only existing paths are returned', () => {
      const fakeRoot = tmpDir;
      // Only create runtime directory
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'context', 'runtime'), { recursive: true });

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      // Runtime should be included, others should not
      const hasRuntime = watchPaths.some(p => p.includes('runtime'));
      const hasAgentRegistry = watchPaths.some(p => p.includes('agent-registry.json'));
      const hasSettings = watchPaths.some(p => p.includes('settings.json'));

      assert.ok(hasRuntime, 'runtime must be included when it exists');
      assert.strictEqual(hasAgentRegistry, false, 'agent-registry must be absent when missing');
      assert.strictEqual(hasSettings, false, 'settings.json must be absent when missing');
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('returned paths have no duplicates', () => {
      const fakeRoot = tmpDir;
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'config'), { recursive: true });
      fs.mkdirSync(path.join(fakeRoot, '.claude', 'context', 'runtime'), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'config', 'agent-registry.json'), '{}');
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'settings.json'), '{}');

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      const uniquePaths = [...new Set(watchPaths)];
      assert.strictEqual(
        watchPaths.length,
        uniquePaths.length,
        'watchPaths must contain no duplicate entries'
      );
    });
  });

  // ─── Windows Path Handling ────────────────────────────────────────────────

  describe('Windows path handling', () => {
    it('normalizeSep converts backslashes to forward slashes', () => {
      const normalized = hook.normalizeSep('C:\\Users\\test\\project\\.claude\\settings.json');
      assert.ok(!normalized.includes('\\'), 'Normalized path must not contain backslashes');
      assert.ok(normalized.includes('/'), 'Normalized path must use forward slashes');
    });

    it('normalizeSep is a no-op for already-normalized paths', () => {
      const p = '/home/user/project/.claude/settings.json';
      assert.strictEqual(hook.normalizeSep(p), p);
    });

    it('normalizeSep handles empty string', () => {
      assert.strictEqual(hook.normalizeSep(''), '');
    });

    it('returned watch paths use forward slashes', () => {
      const fakeRoot = tmpDir;
      fs.mkdirSync(path.join(fakeRoot, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(fakeRoot, '.claude', 'settings.json'), '{}');

      const watchPaths = hook.buildWatchPaths(fakeRoot);

      for (const p of watchPaths) {
        assert.ok(!p.includes('\\'), `Path must use forward slashes: ${p}`);
      }
    });
  });

  // ─── Crash Safety ─────────────────────────────────────────────────────────

  describe('crash safety', () => {
    it('buildWatchPaths does not throw on a non-existent root', () => {
      const nonExistentRoot = path.join(os.tmpdir(), 'definitely-does-not-exist-xyz-123');

      let result;
      assert.doesNotThrow(() => {
        result = hook.buildWatchPaths(nonExistentRoot);
      }, 'buildWatchPaths must not throw on non-existent root');

      assert.ok(Array.isArray(result), 'Must return an array even on bad root');
    });

    it('buildWatchPaths returns an array even when projectRoot is null', () => {
      // Should fall back to PROJECT_ROOT without throwing
      let result;
      assert.doesNotThrow(() => {
        result = hook.buildWatchPaths(null);
      });
      assert.ok(Array.isArray(result));
    });
  });

  // ─── Process-Level Behaviour ──────────────────────────────────────────────

  describe('process-level behaviour', () => {
    it('exits 0 when run as a process with empty stdin', () => {
      const result = runHookProcess(null);
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('exits 0 when run as a process with valid JSON stdin', () => {
      const result = runHookProcess(JSON.stringify({ session_id: 'test-sess' }));
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('exits 0 when run as a process with invalid JSON stdin', () => {
      const result = runHookProcess('NOT_VALID_JSON');
      assert.strictEqual(result.status, 0, `Expected exit 0, stderr: ${result.stderr}`);
    });

    it('stdout is valid JSON', () => {
      const result = runHookProcess(null);
      assert.strictEqual(result.status, 0);

      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result.stdout.trim());
      }, `stdout must be valid JSON, got: ${result.stdout}`);

      assert.ok(parsed !== null && typeof parsed === 'object', 'Parsed output must be an object');
    });

    it('stdout contains permissionDecision: allow', () => {
      const result = runHookProcess(null);
      assert.strictEqual(result.status, 0);

      const parsed = JSON.parse(result.stdout.trim());
      assert.strictEqual(parsed.permissionDecision, 'allow');
    });

    it('stdout contains a watchPaths array', () => {
      const result = runHookProcess(null);
      assert.strictEqual(result.status, 0);

      const parsed = JSON.parse(result.stdout.trim());
      assert.ok(Array.isArray(parsed.watchPaths), 'Output must contain watchPaths array');
    });

    it('watchPaths in real run contains only existing file system entries', () => {
      const result = runHookProcess(null);
      assert.strictEqual(result.status, 0);

      const parsed = JSON.parse(result.stdout.trim());
      for (const p of parsed.watchPaths) {
        assert.ok(fs.existsSync(p), `watchPath must point to an existing file/directory: ${p}`);
      }
    });

    it('exits 0 when run with invalid CLAUDE_PROJECT_DIR (crash safety)', () => {
      const result = runHookProcess(null, {
        CLAUDE_PROJECT_DIR: '/this/path/absolutely/does/not/exist/at/all',
      });
      assert.strictEqual(result.status, 0, `Must exit 0 even with invalid project dir`);

      // Output should still be valid JSON with allow:true, watchPaths:[]
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(result.stdout.trim());
      });
      assert.strictEqual(parsed.permissionDecision, 'allow');
      assert.ok(Array.isArray(parsed.watchPaths));
    });
  });

  // ─── Security Compliance ──────────────────────────────────────────────────

  describe('security compliance (VAL-NE-008)', () => {
    it('hook file does not contain process.cwd() call', () => {
      const source = fs.readFileSync(HOOK_PATH, 'utf8');
      assert.ok(
        !source.includes('process.cwd()'),
        'Hook must use project-root.cjs, not process.cwd()'
      );
    });

    it('hook file starts with use strict', () => {
      const source = fs.readFileSync(HOOK_PATH, 'utf8');
      assert.ok(source.includes("'use strict';"), "Hook must have 'use strict' at top");
    });

    it('hook file uses formatResult', () => {
      const source = fs.readFileSync(HOOK_PATH, 'utf8');
      assert.ok(source.includes('formatResult'), 'Hook must use formatResult()');
    });

    it('hook file uses project-root.cjs', () => {
      const source = fs.readFileSync(HOOK_PATH, 'utf8');
      assert.ok(source.includes('project-root.cjs'), 'Hook must use project-root.cjs');
    });
  });
});
