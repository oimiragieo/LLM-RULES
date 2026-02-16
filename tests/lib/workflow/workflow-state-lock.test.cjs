'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lockfile = require('proper-lockfile');

const {
  getWorkflowStateLockPath,
  withWorkflowStateLock,
} = require('../../../.claude/lib/workflow/workflow-state-lock.cjs');

test('withWorkflowStateLock serializes access and executes callback', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-lock-test-'));
  try {
    let called = false;
    const result = await withWorkflowStateLock(async () => {
      called = true;
      return 7;
    }, tmpRoot);

    assert.equal(called, true);
    assert.equal(result, 7);
    assert.equal(fs.existsSync(getWorkflowStateLockPath(tmpRoot)), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('withWorkflowStateLock fails when lock is held and retries exhausted', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-lock-held-'));
  const lockPath = getWorkflowStateLockPath(tmpRoot);
  const release = lockfile.lockSync(lockPath, { stale: 60_000, retries: { retries: 0 } });

  const prevRetries = process.env.WORKFLOW_STATE_LOCK_RETRIES;
  process.env.WORKFLOW_STATE_LOCK_RETRIES = '0';

  try {
    await assert.rejects(
      withWorkflowStateLock(async () => 'nope', tmpRoot),
      /lock/i
    );
  } finally {
    if (prevRetries === undefined) delete process.env.WORKFLOW_STATE_LOCK_RETRIES;
    else process.env.WORKFLOW_STATE_LOCK_RETRIES = prevRetries;
    release();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
