'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const lockfile = require('proper-lockfile');

const tiers = require('../../../.claude/lib/memory/memory-tiers.cjs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-lock-enforce-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'context', 'runtime'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('withFileLock fails closed when lock cannot be acquired', async () => {
  const lockPath = path.join(tmpDir, '.claude', 'context', 'runtime', 'memory-tiers.lock');
  fs.writeFileSync(lockPath, '', 'utf8');

  const release = lockfile.lockSync(lockPath, {
    stale: 60_000,
    retries: { retries: 0 },
  });

  let invoked = false;
  try {
    await assert.rejects(
      tiers.withFileLock(async () => {
        invoked = true;
        return 'unexpected';
      }, tmpDir),
      /lock/i
    );
    assert.equal(invoked, false, 'callback must not run when lock acquisition fails');
  } finally {
    release();
  }
});
