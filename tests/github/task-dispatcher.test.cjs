'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { TaskDispatcher } = require('../../.claude/lib/github/task-dispatcher.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a sample parsed mention object (as returned by MentionParser.parse()).
 * @param {string} [instruction='review this PR']
 * @param {number} [position=0]
 * @returns {{mention: string, instruction: string, position: number}}
 */
function makeMention(instruction = 'review this PR', position = 0) {
  return { mention: '@agent-studio', instruction, position };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TaskDispatcher', () => {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('instantiates without arguments', () => {
      assert.doesNotThrow(() => new TaskDispatcher());
    });

    it('instantiates with empty options object', () => {
      assert.doesNotThrow(() => new TaskDispatcher({}));
    });

    it('instantiates with workerPool option', () => {
      const workerPool = { assign: () => {} };
      assert.doesNotThrow(() => new TaskDispatcher({ workerPool }));
    });

    it('instantiates with _dispatch option', () => {
      const _dispatch = () => {};
      assert.doesNotThrow(() => new TaskDispatcher({ _dispatch }));
    });

    it('instantiates with both workerPool and _dispatch options', () => {
      const workerPool = { assign: () => {} };
      const _dispatch = () => {};
      assert.doesNotThrow(() => new TaskDispatcher({ workerPool, _dispatch }));
    });
  });

  // -------------------------------------------------------------------------
  // dispatch — return shape
  // -------------------------------------------------------------------------
  describe('dispatch (return shape)', () => {
    it('returns an object with taskId field', () => {
      const dispatcher = new TaskDispatcher();
      const result = dispatcher.dispatch(makeMention());
      assert.ok('taskId' in result, 'result must have taskId');
    });

    it('returns an object with status field', () => {
      const dispatcher = new TaskDispatcher();
      const result = dispatcher.dispatch(makeMention());
      assert.ok('status' in result, 'result must have status');
    });

    it('status is always "queued"', () => {
      const dispatcher = new TaskDispatcher();
      const result = dispatcher.dispatch(makeMention());
      assert.equal(result.status, 'queued');
    });

    it('taskId is a non-empty string', () => {
      const dispatcher = new TaskDispatcher();
      const result = dispatcher.dispatch(makeMention());
      assert.equal(typeof result.taskId, 'string');
      assert.ok(result.taskId.length > 0, 'taskId must not be empty');
    });

    it('return value has exactly taskId and status fields', () => {
      const dispatcher = new TaskDispatcher();
      const result = dispatcher.dispatch(makeMention());
      const keys = Object.keys(result).sort();
      assert.deepEqual(keys, ['status', 'taskId']);
    });
  });

  // -------------------------------------------------------------------------
  // dispatch — unique taskIds
  // -------------------------------------------------------------------------
  describe('dispatch (unique taskIds)', () => {
    it('generates unique taskIds for two consecutive dispatches', () => {
      const dispatcher = new TaskDispatcher();
      const r1 = dispatcher.dispatch(makeMention('task one'));
      const r2 = dispatcher.dispatch(makeMention('task two'));
      assert.notEqual(r1.taskId, r2.taskId, 'taskIds must be unique');
    });

    it('generates unique taskIds across multiple dispatches', () => {
      const dispatcher = new TaskDispatcher();
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        const { taskId } = dispatcher.dispatch(makeMention(`task ${i}`, i));
        ids.add(taskId);
      }
      assert.equal(ids.size, 10, 'all 10 taskIds must be unique');
    });
  });

  // -------------------------------------------------------------------------
  // dispatch — injection
  // -------------------------------------------------------------------------
  describe('dispatch (injection)', () => {
    it('calls injected _dispatch with the task object', () => {
      const calls = [];
      const _dispatch = (task) => calls.push(task);
      const dispatcher = new TaskDispatcher({ _dispatch });

      dispatcher.dispatch(makeMention('review this'));

      assert.equal(calls.length, 1, '_dispatch should be called once');
    });

    it('dispatched task object has taskId field', () => {
      const calls = [];
      const dispatcher = new TaskDispatcher({ _dispatch: (t) => calls.push(t) });

      dispatcher.dispatch(makeMention());

      assert.ok('taskId' in calls[0], 'task passed to _dispatch must have taskId');
    });

    it('dispatched task object has status field', () => {
      const calls = [];
      const dispatcher = new TaskDispatcher({ _dispatch: (t) => calls.push(t) });

      dispatcher.dispatch(makeMention());

      assert.ok('status' in calls[0], 'task passed to _dispatch must have status');
    });

    it('calls workerPool.assign when _dispatch is not provided', () => {
      const assigned = [];
      const workerPool = { assign: (task) => assigned.push(task) };
      const dispatcher = new TaskDispatcher({ workerPool });

      dispatcher.dispatch(makeMention('assign me'));

      assert.equal(assigned.length, 1, 'workerPool.assign should be called once');
    });

    it('prioritizes _dispatch over workerPool when both provided', () => {
      const dispatchCalls = [];
      const poolCalls = [];
      const _dispatch = (task) => dispatchCalls.push(task);
      const workerPool = { assign: (task) => poolCalls.push(task) };
      const dispatcher = new TaskDispatcher({ _dispatch, workerPool });

      dispatcher.dispatch(makeMention());

      assert.equal(dispatchCalls.length, 1, '_dispatch should be called');
      assert.equal(poolCalls.length, 0, 'workerPool.assign should NOT be called');
    });

    it('does not throw when no pool or dispatch function provided (no-op)', () => {
      const dispatcher = new TaskDispatcher();
      assert.doesNotThrow(() => dispatcher.dispatch(makeMention()));
    });

    it('passes context to the dispatch function', () => {
      const calls = [];
      const dispatcher = new TaskDispatcher({ _dispatch: (t) => calls.push(t) });

      const context = { prNumber: 42, repo: 'owner/repo' };
      dispatcher.dispatch(makeMention(), context);

      assert.ok(calls[0].context !== null && calls[0].context !== undefined);
      assert.equal(calls[0].context.prNumber, 42);
      assert.equal(calls[0].context.repo, 'owner/repo');
    });

    it('dispatches multiple tasks correctly', () => {
      const calls = [];
      const dispatcher = new TaskDispatcher({ _dispatch: (t) => calls.push(t) });

      dispatcher.dispatch(makeMention('task 1'));
      dispatcher.dispatch(makeMention('task 2'));
      dispatcher.dispatch(makeMention('task 3'));

      assert.equal(calls.length, 3, '_dispatch should be called three times');
    });
  });

  // -------------------------------------------------------------------------
  // getTaskStatus
  // -------------------------------------------------------------------------
  describe('getTaskStatus', () => {
    it('returns "queued" for a just-dispatched task', () => {
      const dispatcher = new TaskDispatcher();
      const { taskId } = dispatcher.dispatch(makeMention());
      assert.equal(dispatcher.getTaskStatus(taskId), 'queued');
    });

    it('returns null for an unknown taskId', () => {
      const dispatcher = new TaskDispatcher();
      assert.equal(dispatcher.getTaskStatus('nonexistent-task-id-xyz'), null);
    });

    it('returns null for empty string taskId', () => {
      const dispatcher = new TaskDispatcher();
      assert.equal(dispatcher.getTaskStatus(''), null);
    });

    it('tracks status for multiple dispatched tasks independently', () => {
      const dispatcher = new TaskDispatcher();
      const r1 = dispatcher.dispatch(makeMention('task 1', 0));
      const r2 = dispatcher.dispatch(makeMention('task 2', 20));

      assert.equal(dispatcher.getTaskStatus(r1.taskId), 'queued');
      assert.equal(dispatcher.getTaskStatus(r2.taskId), 'queued');
    });

    it('returns the correct taskId from dispatch in getTaskStatus', () => {
      const dispatcher = new TaskDispatcher();
      const { taskId, status } = dispatcher.dispatch(makeMention());
      const retrievedStatus = dispatcher.getTaskStatus(taskId);
      assert.equal(retrievedStatus, status);
    });

    it('returns null for taskId from a different dispatcher instance', () => {
      const d1 = new TaskDispatcher();
      const d2 = new TaskDispatcher();
      const { taskId } = d1.dispatch(makeMention());
      // d2 doesn't know about d1's tasks
      assert.equal(d2.getTaskStatus(taskId), null);
    });
  });
});
