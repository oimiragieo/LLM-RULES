#!/usr/bin/env node
/**
 * Tests for hook-exit-dispatcher.cjs
 *
 * Covers exit codes 0/1/2 (unchanged), 3 (escalate), 4 (retry-degraded),
 * malformed trailers, retry counter exhaustion, and unknown codes.
 *
 * ADR: .claude/context/artifacts/analysis/hook-exit-code-contract-2026-04-21.md
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DISPATCHER_PATH = path.resolve(
  __dirname,
  '../../.claude/lib/routing/hook-exit-dispatcher.cjs'
);

// ---------------------------------------------------------------------------
// Helper: create a temp directory for counter file isolation
// ---------------------------------------------------------------------------
let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatcher-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeDispatcher() {
  // Reload fresh module each time so state is clean
  // Node caches modules — use delete to force reload
  Object.keys(require.cache).forEach(k => {
    if (k.includes('hook-exit-dispatcher')) delete require.cache[k];
  });
  const dispatcher = require(DISPATCHER_PATH);
  return dispatcher;
}

function counterFile(dir) {
  return path.join(dir, 'degrade-retries.json');
}

// ---------------------------------------------------------------------------
// Test 1: exit 3 with valid ESCALATE trailer → TaskUpdate(blocked) args
// ---------------------------------------------------------------------------
describe('hook-exit-dispatcher', () => {
  it('exit 3 with ESCALATE trailer → escalate action with parsed fields', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      {
        code: 3,
        stderr: 'ESCALATE: blockerType=safety needsFrom=user blocker=description-text',
        hookName: 'test-hook',
      },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );

    assert.strictEqual(result.action, 'escalate');
    assert.ok(result.update, 'should have update object');
    assert.strictEqual(result.update.status, 'blocked');
    assert.strictEqual(result.update.metadata.blockerType, 'safety');
    assert.strictEqual(result.update.metadata.needsFrom, 'user');
    assert.strictEqual(result.update.metadata.blocker, 'description-text');
  });

  // -------------------------------------------------------------------------
  // Test 2: exit 3 malformed stderr → safe defaults
  // -------------------------------------------------------------------------
  it('exit 3 malformed stderr → safe defaults (blockerType=safety, blocker=unspecified)', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      {
        code: 3,
        stderr: 'some random text with no trailer',
        hookName: 'test-hook',
      },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );

    assert.strictEqual(result.action, 'escalate');
    assert.strictEqual(result.update.metadata.blockerType, 'safety');
    assert.strictEqual(result.update.metadata.needsFrom, 'user');
    assert.strictEqual(result.update.metadata.blocker, 'unspecified');
  });

  // -------------------------------------------------------------------------
  // Test 3: exit 4 first attempt → degrade with haiku model + counter=1
  // -------------------------------------------------------------------------
  it('exit 4 with DEGRADE trailer → degrade action, model=haiku, counter incremented', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      {
        code: 4,
        stderr: 'DEGRADE: reason=budget attempt=1',
        hookName: 'test-hook',
      },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );

    assert.strictEqual(result.action, 'degrade');
    assert.ok(result.respawn, 'should have respawn object');
    assert.strictEqual(result.respawn.model, 'haiku');
    assert.ok(result.respawn.reason, 'should have reason');

    // Counter should be 1 after first degrade
    const counter = JSON.parse(fs.readFileSync(counterFile(tmpDir), 'utf8'));
    assert.strictEqual(counter['task-42'], 1);
  });

  // -------------------------------------------------------------------------
  // Test 4: exit 4 when count >= MAX_DEGRADE_RETRIES → escalate instead
  // -------------------------------------------------------------------------
  it('exit 4 when retries >= MAX_DEGRADE_RETRIES → escalate (not degrade)', () => {
    // Pre-seed counter at MAX (2)
    const cf = counterFile(tmpDir);
    fs.writeFileSync(cf, JSON.stringify({ 'task-42': 2 }));

    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      {
        code: 4,
        stderr: 'DEGRADE: reason=budget',
        hookName: 'test-hook',
      },
      { taskId: 'task-42', counterFile: cf }
    );

    assert.strictEqual(result.action, 'escalate', 'exhausted retries should escalate');
    assert.ok(result.update, 'should have update object');
    assert.strictEqual(result.update.status, 'blocked');
  });

  // -------------------------------------------------------------------------
  // Test 5: exit 0/1/2 → noop (no dispatcher action)
  // -------------------------------------------------------------------------
  it('exit 0 → noop action', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      { code: 0, stderr: '', hookName: 'test-hook' },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );
    assert.strictEqual(result.action, 'noop');
    assert.strictEqual(result.anomaly, undefined);
  });

  it('exit 1 → noop action', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      { code: 1, stderr: '', hookName: 'test-hook' },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );
    assert.strictEqual(result.action, 'noop');
  });

  it('exit 2 → noop action', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      { code: 2, stderr: '', hookName: 'test-hook' },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );
    assert.strictEqual(result.action, 'noop');
  });

  // -------------------------------------------------------------------------
  // Test 6: unknown exit code (e.g., 5) → fail-open noop with anomaly logged
  // -------------------------------------------------------------------------
  it('unknown exit code 5 → fail-open noop with anomaly', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatchExitCode(
      { code: 5, stderr: 'something weird', hookName: 'test-hook' },
      { taskId: 'task-42', counterFile: counterFile(tmpDir) }
    );
    assert.strictEqual(result.action, 'noop');
    assert.ok(result.anomaly, 'unknown exit code should populate anomaly');
    assert.strictEqual(result.anomaly.code, 5);
    assert.strictEqual(result.anomaly.hookName, 'test-hook');
  });
});
