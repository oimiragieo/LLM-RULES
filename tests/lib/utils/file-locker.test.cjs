'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('P0-006: file-locker exports acquireLock, withLock, isLocked', () => {
  const locker = require('../../../.claude/lib/utils/file-locker.cjs');
  assert.ok(typeof locker.acquireLock === 'function');
  assert.ok(typeof locker.withLock === 'function');
  assert.ok(typeof locker.isLocked === 'function');
});

test('P0-006: acquireLock and release work', async () => {
  const { acquireLock } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-'));
  const testFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(testFile, 'initial');

  const release = await acquireLock(testFile);
  assert.ok(typeof release === 'function', 'acquireLock must return release function');

  await release();
  // No error means success
  assert.ok(true, 'Lock released successfully');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-006: withLock executes function and auto-releases', async () => {
  const { withLock } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-'));
  const testFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(testFile, 'initial');

  let executed = false;
  const result = await withLock(testFile, async () => {
    executed = true;
    return 42;
  });

  assert.strictEqual(executed, true, 'Function should have executed');
  assert.strictEqual(result, 42, 'Should return function result');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-006: withLock releases on error', async () => {
  const { withLock, isLocked } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-'));
  const testFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(testFile, 'initial');

  await assert.rejects(async () => {
    await withLock(testFile, async () => {
      throw new Error('test error');
    });
  }, /test error/);

  // Lock should be released after error
  const locked = await isLocked(testFile);
  assert.strictEqual(locked, false, 'Lock should be released after error');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-006: isLocked returns correct status', async () => {
  const { acquireLock, isLocked } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-'));
  const testFile = path.join(tmpDir, 'test.txt');
  fs.writeFileSync(testFile, 'initial');

  assert.strictEqual(await isLocked(testFile), false, 'Should not be locked initially');

  const release = await acquireLock(testFile);
  assert.strictEqual(await isLocked(testFile), true, 'Should be locked after acquire');

  await release();
  assert.strictEqual(await isLocked(testFile), false, 'Should not be locked after release');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-006: concurrent withLock calls are serialized', async () => {
  const { withLock } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-'));
  const testFile = path.join(tmpDir, 'concurrent.txt');
  fs.writeFileSync(testFile, '');

  const order = [];

  // Launch 3 concurrent lock operations
  await Promise.all([
    withLock(testFile, async () => {
      order.push('A-start');
      await new Promise(r => setTimeout(r, 50));
      order.push('A-end');
    }),
    withLock(testFile, async () => {
      order.push('B-start');
      await new Promise(r => setTimeout(r, 50));
      order.push('B-end');
    }),
    withLock(testFile, async () => {
      order.push('C-start');
      await new Promise(r => setTimeout(r, 50));
      order.push('C-end');
    }),
  ]);

  // Each operation should complete before next starts
  // Verify no interleaving: each X-start must be immediately followed by X-end
  for (let i = 0; i < order.length; i += 2) {
    const startLabel = order[i];
    const endLabel = order[i + 1];
    const prefix = startLabel.split('-')[0];
    assert.strictEqual(
      endLabel,
      `${prefix}-end`,
      `Expected ${prefix}-end after ${prefix}-start, got ${endLabel}. Full order: ${order.join(', ')}`
    );
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-006: stale lock is recovered automatically', async () => {
  const { withLock } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-stale-'));
  const testFile = path.join(tmpDir, 'stale.txt');
  fs.writeFileSync(testFile, 'initial');

  // Simulate an orphaned stale lock directory.
  const staleLockDir = `${testFile}.lock`;
  fs.mkdirSync(staleLockDir, { recursive: true });
  const staleTime = new Date(Date.now() - 5000);
  fs.utimesSync(staleLockDir, staleTime, staleTime);

  const result = await withLock(testFile, async () => 'recovered', {
    stale: 100,
    retries: { retries: 2, minTimeout: 10, maxTimeout: 20 },
  });

  assert.equal(result, 'recovered');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('P0-006: high contention (20 callers) serializes without corruption', async () => {
  const { withLock } = require('../../../.claude/lib/utils/file-locker.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p006-20-'));
  const testFile = path.join(tmpDir, 'contention.json');
  fs.writeFileSync(testFile, JSON.stringify({ hits: 0 }), 'utf8');

  await Promise.all(
    Array.from({ length: 20 }, () =>
      withLock(
        testFile,
        async () => {
          const current = JSON.parse(fs.readFileSync(testFile, 'utf8'));
          current.hits += 1;
          fs.writeFileSync(testFile, JSON.stringify(current), 'utf8');
        },
        {
          retries: { retries: 40, minTimeout: 10, maxTimeout: 100 },
        }
      )
    )
  );

  const finalValue = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  assert.equal(finalValue.hits, 20);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
