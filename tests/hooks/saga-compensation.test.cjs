#!/usr/bin/env node
'use strict';

/**
 * Tests for saga-compensation.cjs
 * Validates SagaLLM pattern (ArXiv 2503.11951) compensating actions on TaskUpdate(failed).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SAGA_MODULE = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'hooks',
  'saga-compensation.cjs'
);

/**
 * Helper: create an isolated temp runtime dir for saga state files
 */
function makeTempRuntime() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'saga-comp-'));
}

/**
 * Helper: write saga state with blockedBy tracking
 */
function writeSagaState(runtimeDir, state) {
  const sagaStatePath = path.join(runtimeDir, 'saga-state.json');
  fs.writeFileSync(sagaStatePath, JSON.stringify(state), 'utf8');
}

/**
 * Helper: read saga log entries
 */
function readSagaLog(runtimeDir) {
  const logPath = path.join(runtimeDir, 'saga-log.jsonl');
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

describe('saga-compensation.cjs', () => {
  let compensation;

  before(() => {
    compensation = require(SAGA_MODULE);
  });

  describe('Test 1: failed task with blocked-by dependents reopens them to pending', () => {
    it('removes failed taskId from blockedBy and reverts dependent tasks to pending', async () => {
      const runtimeDir = makeTempRuntime();
      try {
        // Y is blocked by X; X fails -> Y should reopen to pending
        writeSagaState(runtimeDir, {
          tasks: {
            X: { status: 'in_progress', blockedBy: [] },
            Y: { status: 'blocked', blockedBy: ['X'] },
          },
        });

        const result = await compensation.compensateFailedTask('X', {}, runtimeDir);

        // Y's blockedBy should have X removed and status reverted to pending
        const sagaStatePath = path.join(runtimeDir, 'saga-state.json');
        const updatedState = JSON.parse(fs.readFileSync(sagaStatePath, 'utf8'));
        assert.deepStrictEqual(updatedState.tasks.Y.blockedBy, []);
        assert.strictEqual(updatedState.tasks.Y.status, 'pending');

        // result should indicate tasks reopened
        assert.ok(Array.isArray(result.reopened), 'result.reopened should be array');
        assert.ok(result.reopened.includes('Y'), 'Y should be in reopened list');
      } finally {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    });
  });

  describe('Test 2: failed task with filesStaged=true triggers git stash', () => {
    it('shells out to git stash push with saga-compensation label when filesStaged is true', async () => {
      const runtimeDir = makeTempRuntime();
      try {
        writeSagaState(runtimeDir, { tasks: {} });

        // We test that the module invokes git stash correctly by inspecting the
        // saga log entry which records the stash action attempted
        const result = await compensation.compensateFailedTask(
          'task-abc',
          { filesStaged: true },
          runtimeDir,
          /* dryRun */ true // dryRun mode skips real git but records intent
        );

        assert.strictEqual(result.stashAttempted, true, 'stashAttempted should be true');
        assert.ok(
          result.stashLabel.includes('saga-compensation-task-abc'),
          `stashLabel should contain saga-compensation-task-abc, got: ${result.stashLabel}`
        );
      } finally {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    });
  });

  describe('Test 3: failed task with no staged changes → no stash action', () => {
    it('does not attempt stash when filesStaged is absent or false', async () => {
      const runtimeDir = makeTempRuntime();
      try {
        writeSagaState(runtimeDir, { tasks: {} });

        const resultNoMeta = await compensation.compensateFailedTask(
          'task-xyz',
          {},
          runtimeDir,
          true
        );
        assert.strictEqual(
          resultNoMeta.stashAttempted,
          false,
          'stashAttempted should be false when no filesStaged'
        );

        const resultFalseMeta = await compensation.compensateFailedTask(
          'task-xyz',
          { filesStaged: false },
          runtimeDir,
          true
        );
        assert.strictEqual(
          resultFalseMeta.stashAttempted,
          false,
          'stashAttempted should be false when filesStaged=false'
        );
      } finally {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    });
  });

  describe('Test 4: completed tasks do NOT trigger compensation', () => {
    it('compensateFailedTask is only called for failed status; success path is a no-op', async () => {
      const runtimeDir = makeTempRuntime();
      try {
        writeSagaState(runtimeDir, {
          tasks: {
            X: { status: 'completed', blockedBy: [] },
            Y: { status: 'blocked', blockedBy: ['X'] },
          },
        });

        // The hook wiring only calls compensateFailedTask on status=failed.
        // This test verifies the function itself is a no-op when called with
        // the completed status guard that the hook passes.
        const result = await compensation.compensateFailedTask(
          'X',
          { status: 'completed' }, // metadata including status
          runtimeDir,
          true
        );

        // No tasks should be reopened on the success path
        assert.deepStrictEqual(result.reopened, [], 'no tasks should be reopened on success');
        assert.strictEqual(result.stashAttempted, false, 'no stash on success');

        // Y should remain blocked (not touched)
        const sagaStatePath = path.join(runtimeDir, 'saga-state.json');
        const state = JSON.parse(fs.readFileSync(sagaStatePath, 'utf8'));
        assert.deepStrictEqual(state.tasks.Y.blockedBy, ['X'], 'Y blockedBy untouched on success');
      } finally {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    });
  });

  describe('Test 5: compensation errors are logged but do not re-fail the task', () => {
    it('logs errors to saga-log.jsonl and returns without throwing when stash fails', async () => {
      const runtimeDir = makeTempRuntime();
      try {
        // Corrupt saga-state.json to simulate a read error for reopening
        // but compensation should still complete gracefully
        const sagaStatePath = path.join(runtimeDir, 'saga-state.json');
        fs.writeFileSync(sagaStatePath, '{ bad json {{', 'utf8');

        // Should not throw
        let threw = false;
        let result;
        try {
          result = await compensation.compensateFailedTask(
            'task-err',
            { filesStaged: true },
            runtimeDir,
            true
          );
        } catch (_err) {
          threw = true;
        }

        assert.strictEqual(threw, false, 'compensateFailedTask must not throw on errors');
        assert.ok(result, 'result must be returned even on error');

        // Should have logged to saga-log
        const logs = readSagaLog(runtimeDir);
        const errLog = logs.find(l => l.taskId === 'task-err');
        assert.ok(errLog, 'saga-log should contain an entry for the failed task');
        assert.ok(errLog.timestamp, 'log entry must have timestamp');
      } finally {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    });
  });

  describe('Edge: multiple dependents all reopened', () => {
    it('reopens all tasks that have failed taskId in their blockedBy', async () => {
      const runtimeDir = makeTempRuntime();
      try {
        writeSagaState(runtimeDir, {
          tasks: {
            A: { status: 'in_progress', blockedBy: [] },
            B: { status: 'blocked', blockedBy: ['A'] },
            C: { status: 'blocked', blockedBy: ['A', 'D'] },
            D: { status: 'completed', blockedBy: [] },
          },
        });

        const result = await compensation.compensateFailedTask('A', {}, runtimeDir);

        const sagaStatePath = path.join(runtimeDir, 'saga-state.json');
        const state = JSON.parse(fs.readFileSync(sagaStatePath, 'utf8'));

        // B should be fully pending (A removed, blockedBy empty)
        assert.strictEqual(state.tasks.B.status, 'pending');
        assert.deepStrictEqual(state.tasks.B.blockedBy, []);

        // C should still be blocked by D (A removed but D remains)
        assert.strictEqual(state.tasks.C.status, 'blocked');
        assert.deepStrictEqual(state.tasks.C.blockedBy, ['D']);

        assert.ok(result.reopened.includes('B'));
        assert.ok(!result.reopened.includes('C'), 'C still has D blocker, not fully reopened');
      } finally {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      }
    });
  });
});
