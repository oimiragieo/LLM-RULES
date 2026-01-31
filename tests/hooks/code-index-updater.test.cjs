/**
 * Code Index Updater Hook Tests
 *
 * Tests hook triggers on Write/Edit, file type detection, exclude patterns,
 * lock creation/release, debouncing, and incremental update integration.
 *
 * Test execution: node --test tests/hooks/code-index-updater.test.cjs
 */

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs').promises;

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures', 'code-indexing');
const HOOK_TEST_DIR = path.join(FIXTURES_DIR, 'hook-test');

describe('code-index-updater hook', () => {
  let originalCwd;
  let hookModule;

  before(async () => {
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
});
