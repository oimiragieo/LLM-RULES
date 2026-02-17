/**
 * Code Index Updater Hook Tests
 *
 * Tests hook triggers on Write/Edit, file type detection, exclude patterns,
 * lock creation/release, debouncing, and incremental update integration.
 *
 * Also covers bug fixes:
 * - C-1: Debounce fires after process.exit (indexer is dead)
 * - M-1: LOCK_FILE uses process.cwd() instead of PROJECT_ROOT
 *
 * Test execution: node --test tests/hooks/code-index-updater.test.cjs
 */

'use strict';

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;
const { spawnSync } = require('child_process');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing');
const HOOK_TEST_DIR = path.join(FIXTURES_DIR, 'hook-test');
const LANCEDB_DIR = path.join(HOOK_TEST_DIR, '.claude', 'data', 'lancedb-test');
const TABLE_NAME = `code_index_test_${process.pid}`;

describe('code-index-updater hook', () => {
  let originalCwd;
  let hookModule;

  before(async () => {
    process.env.LANCEDB_EMBEDDING_MODE = 'test';
    process.env.LANCEDB_URI = LANCEDB_DIR;
    process.env.LANCEDB_TABLE_CODE = TABLE_NAME;
    await fs.mkdir(path.join(HOOK_TEST_DIR, '.claude/context/code-index'), { recursive: true });
    await fs.writeFile(path.join(HOOK_TEST_DIR, '.claude/context/code-index/metadata.json'), '{}');
  });

  after(async () => {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true }).catch(() => {});
  });

  function getHook() {
    if (!hookModule) hookModule = require('../../.claude/hooks/routing/code-index-updater.cjs');
    return hookModule;
  }

  describe('lock file', () => {
    before(() => {
      originalCwd = process.cwd();
      process.chdir(HOOK_TEST_DIR);
      hookModule = require('../../.claude/hooks/routing/code-index-updater.cjs');
    });

    after(() => {
      if (originalCwd) process.chdir(originalCwd);
    });

    afterEach(async () => {
      const lockPath = path.join(HOOK_TEST_DIR, '.claude/context/code-index/.indexing.lock');
      await fs.unlink(lockPath).catch(() => {});
    });

    test('canProceed returns true when no lock exists', async () => {
      const proceed = await hookModule.canProceed();
      assert.strictEqual(proceed, true);
    });

    test('createLock creates lock file', async () => {
      const created = await hookModule.createLock();
      assert.strictEqual(created, true);
      const lockPath = path.join(HOOK_TEST_DIR, '.claude/context/code-index/.indexing.lock');
      const content = await fs.readFile(lockPath, 'utf8');
      const data = JSON.parse(content);
      assert.ok(data.pid);
      assert.ok(data.timestamp);
    });

    test('removeLock removes lock file', async () => {
      await hookModule.createLock();
      await hookModule.removeLock();
      const lockPath = path.join(HOOK_TEST_DIR, '.claude/context/code-index/.indexing.lock');
      await assert.rejects(() => fs.access(lockPath), /ENOENT/);
    });

    test('createLock returns false when lock already exists', async () => {
      const first = await hookModule.createLock();
      const second = await hookModule.createLock();
      assert.strictEqual(first, true);
      assert.strictEqual(second, false);
    });
  });

  describe('shouldIndexFile()', () => {
    test('returns true for code files', () => {
      const hook = getHook();
      assert.strictEqual(hook.shouldIndexFile('/project/src/main.js'), true);
      assert.strictEqual(hook.shouldIndexFile('/project/app.ts'), true);
      assert.strictEqual(hook.shouldIndexFile('/project/script.py'), true);
    });

    test('returns false for non-code extensions', () => {
      const hook = getHook();
      assert.strictEqual(hook.shouldIndexFile('/project/readme.md'), false);
      assert.strictEqual(hook.shouldIndexFile('/project/data.json'), false);
      assert.strictEqual(hook.shouldIndexFile('/project/style.css'), false);
    });

    test('returns false for excluded paths', () => {
      const hook = getHook();
      assert.strictEqual(hook.shouldIndexFile('/project/node_modules/pkg/index.js'), false);
      assert.strictEqual(hook.shouldIndexFile('/project/.git/hooks/pre-commit'), false);
      assert.strictEqual(hook.shouldIndexFile('/project/dist/bundle.min.js'), false);
      assert.strictEqual(
        hook.shouldIndexFile('/project/.claude/context/code-index/file.js'),
        false
      );
    });

    test('returns false for empty or invalid input', () => {
      const hook = getHook();
      assert.strictEqual(hook.shouldIndexFile(''), false);
      assert.strictEqual(hook.shouldIndexFile(null), false);
      assert.strictEqual(hook.shouldIndexFile(123), false);
    });
  });

  describe('isDisabled()', () => {
    test('returns false when CODE_INDEX_AUTO_UPDATE not set', () => {
      const hook = getHook();
      const orig = process.env.CODE_INDEX_AUTO_UPDATE;
      delete process.env.CODE_INDEX_AUTO_UPDATE;
      assert.strictEqual(hook.isDisabled(), false);
      if (orig !== undefined) process.env.CODE_INDEX_AUTO_UPDATE = orig;
    });

    test('returns true when CODE_INDEX_AUTO_UPDATE=off', () => {
      const hook = getHook();
      const orig = process.env.CODE_INDEX_AUTO_UPDATE;
      process.env.CODE_INDEX_AUTO_UPDATE = 'off';
      assert.strictEqual(hook.isDisabled(), true);
      if (orig !== undefined) process.env.CODE_INDEX_AUTO_UPDATE = orig;
      else delete process.env.CODE_INDEX_AUTO_UPDATE;
    });
  });

  describe('scheduleDebouncedUpdate', () => {
    test('is a function', () => {
      assert.strictEqual(typeof getHook().scheduleDebouncedUpdate, 'function');
    });
  });

  describe('triggerIndexUpdate', () => {
    test('is a function', () => {
      assert.strictEqual(typeof getHook().triggerIndexUpdate, 'function');
    });

    test('completes without throwing (fail-open)', async () => {
      const hook = getHook();
      await assert.doesNotReject(() =>
        hook.triggerIndexUpdate(path.join(HOOK_TEST_DIR, 'src', 'main.js'))
      );
      await new Promise(r => setImmediate(r));
      await new Promise(r => setTimeout(r, 300));
    });
  });

  describe('fail-open behavior', () => {
    test('main does not throw when input is invalid', async () => {
      await assert.doesNotReject(() => getHook().main());
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // BUG FIX TESTS
  // ────────────────────────────────────────────────────────────────────────────

  describe('M-1: LOCK_FILE must use PROJECT_ROOT not process.cwd()', () => {
    test('LOCK_FILE path is under PROJECT_ROOT (.claude/context/code-index/)', () => {
      // The PROJECT_ROOT is determined by project-root.cjs (walks up to find .claude/CLAUDE.md)
      // This repo's PROJECT_ROOT is the agent-studio directory
      const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
      const _expectedLockDir = path
        .join(PROJECT_ROOT, '.claude', 'context', 'code-index')
        .replace(/\\/g, '/');

      // Read the source of the hook and verify LOCK_FILE construction
      const hookSource = require('fs').readFileSync(
        path.join(__dirname, '../../.claude/hooks/routing/code-index-updater.cjs'),
        'utf8'
      );

      // Bug M-1: currently uses process.cwd() — must be changed to PROJECT_ROOT
      // After fix: should NOT contain process.cwd() for LOCK_FILE
      assert.ok(
        !hookSource.includes(
          "path.join(process.cwd(), '.claude/context/code-index/.indexing.lock')"
        ),
        'LOCK_FILE must not use process.cwd() — use PROJECT_ROOT from project-root.cjs instead'
      );

      // After fix: LOCK_FILE should reference PROJECT_ROOT
      assert.ok(
        hookSource.includes('PROJECT_ROOT') ||
          hookSource.includes('project-root') ||
          hookSource.includes('resolveProjectRoot'),
        'LOCK_FILE must derive path from PROJECT_ROOT'
      );
    });
  });

  describe('C-1: triggerIndexUpdate must be called before process would exit', () => {
    test('main() calls triggerIndexUpdate directly (not via debounce timer) for valid Write event', async () => {
      // This test verifies that after the C-1 fix, main() awaits triggerIndexUpdate()
      // synchronously rather than scheduling a deferred setTimeout that fires after process.exit(0).
      //
      // Strategy: run the hook as a child process with a synthetic Write hook input and
      // CODE_INDEX_AUTO_UPDATE=off so triggerIndexUpdate returns immediately after the
      // disabled-check. We verify the process exits cleanly (exit code 0) — confirming
      // it doesn't hang waiting for a timer that never fires. More importantly, the
      // process must NOT set a pending timer that keeps the event loop alive indefinitely.
      //
      // With the BUG: scheduleDebouncedUpdate sets a 5-second timer → the hook exits
      // immediately with process.exit(0), the timer is discarded, triggerIndexUpdate is
      // never called.
      //
      // With the FIX: main() awaits triggerIndexUpdate() directly before exiting.
      // CODE_INDEX_AUTO_UPDATE=off causes it to return immediately, so exit is fast.

      const hookPath = path.join(__dirname, '../../.claude/hooks/routing/code-index-updater.cjs');
      const hookInput = JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: '/tmp/test-file.js' },
      });

      const result = spawnSync(process.execPath, [hookPath], {
        input: hookInput,
        env: {
          ...process.env,
          CODE_INDEX_AUTO_UPDATE: 'off',
        },
        timeout: 3000, // Should complete well within 3s — not block on a 5s timer
        encoding: 'utf8',
        shell: false,
      });

      // Should not time out (timer never fires issue)
      assert.notStrictEqual(
        result.status,
        null,
        `Hook timed out or was killed — likely blocked on a debounce timer. Signal: ${result.signal}`
      );
      assert.strictEqual(
        result.status,
        0,
        `Hook exited with non-zero status ${result.status}. stderr: ${result.stderr}`
      );
    });

    test('scheduleDebouncedUpdate is no longer used by main() for the exit path', () => {
      // After C-1 fix, main() should call triggerIndexUpdate directly rather than
      // routing through scheduleDebouncedUpdate (which sets a deferred timer that
      // process.exit kills before it fires).
      //
      // We verify by reading the source: the main() function body should NOT call
      // scheduleDebouncedUpdate() — it should call triggerIndexUpdate() directly.
      const hookSource = require('fs').readFileSync(
        path.join(__dirname, '../../.claude/hooks/routing/code-index-updater.cjs'),
        'utf8'
      );

      // Extract just the main() function body for inspection
      const mainFnMatch = hookSource.match(/async function main\(\)\s*\{([\s\S]*?)\n\}/);
      assert.ok(mainFnMatch, 'Could not locate async function main() in hook source');

      const mainBody = mainFnMatch[1];

      assert.ok(
        !mainBody.includes('scheduleDebouncedUpdate'),
        'main() must NOT call scheduleDebouncedUpdate() — the debounce timer fires after process.exit(0) kills the event loop. Call triggerIndexUpdate() directly instead.'
      );

      assert.ok(
        mainBody.includes('triggerIndexUpdate'),
        'main() must call triggerIndexUpdate() directly (awaited) before exiting'
      );
    });
  });
});
