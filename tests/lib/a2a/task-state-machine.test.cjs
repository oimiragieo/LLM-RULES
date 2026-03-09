'use strict';

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { TaskStateMachine } = require('../../../.claude/lib/a2a/task-state-machine.cjs');

describe('TaskStateMachine', () => {
  let sm;

  beforeEach(() => {
    sm = new TaskStateMachine();
  });

  describe('createTask()', () => {
    it('returns a task with submitted status and an id', () => {
      const task = sm.createTask({ input: 'hello' });
      assert.ok(typeof task.id === 'string');
      assert.ok(task.id.length > 0);
      assert.equal(task.status, 'submitted');
      assert.ok(task.createdAt);
      assert.deepEqual(task.params, { input: 'hello' });
    });

    it('returns unique ids for each task', () => {
      const a = sm.createTask();
      const b = sm.createTask();
      assert.notEqual(a.id, b.id);
    });

    it('defaults params to empty object when not provided', () => {
      const task = sm.createTask();
      assert.deepEqual(task.params, {});
    });
  });

  describe('transition()', () => {
    it('succeeds for submitted → working', () => {
      const task = sm.createTask();
      const updated = sm.transition(task.id, 'working');
      assert.equal(updated.status, 'working');
    });

    it('succeeds for working → completed', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      const updated = sm.transition(task.id, 'completed');
      assert.equal(updated.status, 'completed');
    });

    it('succeeds for working → failed', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      const updated = sm.transition(task.id, 'failed');
      assert.equal(updated.status, 'failed');
    });

    it('succeeds for working → input-required → working', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      sm.transition(task.id, 'input-required');
      const updated = sm.transition(task.id, 'working');
      assert.equal(updated.status, 'working');
    });

    it('throws for invalid transition submitted → completed', () => {
      const task = sm.createTask();
      assert.throws(
        () => sm.transition(task.id, 'completed'),
        /Invalid transition from 'submitted' to 'completed'/
      );
    });

    it('throws for transition from terminal state', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      sm.transition(task.id, 'completed');
      assert.throws(
        () => sm.transition(task.id, 'working'),
        /Invalid transition from 'completed' to 'working'/
      );
    });

    it('throws for unknown task id', () => {
      assert.throws(() => sm.transition('no-such-id', 'working'), /Task not found/);
    });
  });

  describe('getTask()', () => {
    it('returns the task snapshot for a known id', () => {
      const task = sm.createTask({ x: 1 });
      const retrieved = sm.getTask(task.id);
      assert.equal(retrieved.id, task.id);
      assert.equal(retrieved.status, 'submitted');
    });

    it('returns null for an unknown id', () => {
      const result = sm.getTask('unknown-id');
      assert.equal(result, null);
    });

    it('returns a copy (mutation does not affect stored task)', () => {
      const task = sm.createTask();
      const snapshot = sm.getTask(task.id);
      snapshot.status = 'hacked';
      const snapshot2 = sm.getTask(task.id);
      assert.equal(snapshot2.status, 'submitted');
    });
  });

  describe('cancelTask()', () => {
    it('cancels a task in submitted state', () => {
      const task = sm.createTask();
      const canceled = sm.cancelTask(task.id);
      assert.equal(canceled.status, 'canceled');
    });

    it('cancels a task in working state', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      const canceled = sm.cancelTask(task.id);
      assert.equal(canceled.status, 'canceled');
    });

    it('throws when task is already in a terminal state', () => {
      const task = sm.createTask();
      sm.transition(task.id, 'working');
      sm.transition(task.id, 'completed');
      assert.throws(() => sm.cancelTask(task.id), /already in terminal state/);
    });

    it('throws for unknown task id', () => {
      assert.throws(() => sm.cancelTask('unknown-id'), /Task not found/);
    });
  });
});
