#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  setTaskOutput,
  getTaskOutput,
  getTaskOutputs,
  resolveOutputRef,
  resolveAllRefs,
  clearOutputs,
  OUTPUTS_FILE,
} = require('../../.claude/lib/orchestration/task-output-chain.cjs');

describe('task-output-chain', () => {
  beforeEach(() => {
    clearOutputs();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(OUTPUTS_FILE);
    } catch {
      // ignore
    }
  });

  describe('setTaskOutput / getTaskOutput', () => {
    it('stores and retrieves a string value', () => {
      setTaskOutput('task-1', 'plan_file', '/path/to/plan.md');
      assert.equal(getTaskOutput('task-1', 'plan_file'), '/path/to/plan.md');
    });

    it('stores and retrieves complex values', () => {
      setTaskOutput('task-2', 'files', ['a.js', 'b.js']);
      assert.deepEqual(getTaskOutput('task-2', 'files'), ['a.js', 'b.js']);
    });

    it('returns undefined for missing task', () => {
      assert.equal(getTaskOutput('nonexistent', 'key'), undefined);
    });

    it('returns undefined for missing key', () => {
      setTaskOutput('task-1', 'a', 1);
      assert.equal(getTaskOutput('task-1', 'b'), undefined);
    });

    it('overwrites existing keys', () => {
      setTaskOutput('task-1', 'status', 'pending');
      setTaskOutput('task-1', 'status', 'done');
      assert.equal(getTaskOutput('task-1', 'status'), 'done');
    });

    it('throws on invalid taskId', () => {
      assert.throws(() => setTaskOutput('', 'key', 'val'), /taskId must be/);
      assert.throws(() => setTaskOutput(null, 'key', 'val'), /taskId must be/);
    });

    it('throws on invalid key', () => {
      assert.throws(() => setTaskOutput('task-1', '', 'val'), /key must be/);
    });
  });

  describe('getTaskOutputs', () => {
    it('returns all outputs for a task', () => {
      setTaskOutput('task-1', 'a', 1);
      setTaskOutput('task-1', 'b', 2);
      const outputs = getTaskOutputs('task-1');
      // getTaskOutputs returns a null-prototype object from safe-json
      // Compare values explicitly rather than using deepStrictEqual
      assert.strictEqual(outputs.a, 1);
      assert.strictEqual(outputs.b, 2);
      assert.strictEqual(Object.keys(outputs).length, 2);
    });

    it('returns empty object for missing task', () => {
      const outputs = getTaskOutputs('nonexistent');
      assert.strictEqual(Object.keys(outputs).length, 0);
    });
  });

  describe('resolveOutputRef', () => {
    it('resolves $task-N.key format', () => {
      setTaskOutput('task-1', 'plan_file', '/plan.md');
      assert.equal(resolveOutputRef('$task-1.plan_file'), '/plan.md');
    });

    it('resolves $N.key shorthand', () => {
      setTaskOutput('task-5', 'result', 'ok');
      assert.equal(resolveOutputRef('$5.result'), 'ok');
    });

    it('returns undefined for invalid refs', () => {
      assert.equal(resolveOutputRef(''), undefined);
      assert.equal(resolveOutputRef('no-dollar'), undefined);
      assert.equal(resolveOutputRef('$'), undefined);
      assert.equal(resolveOutputRef(null), undefined);
    });

    it('returns undefined for missing refs', () => {
      assert.equal(resolveOutputRef('$task-99.missing'), undefined);
    });
  });

  describe('resolveAllRefs', () => {
    it('resolves multiple refs in a string', () => {
      setTaskOutput('task-1', 'file', 'auth.md');
      setTaskOutput('task-2', 'count', 5);
      const result = resolveAllRefs('Plan: $task-1.file, Items: $task-2.count');
      assert.equal(result, 'Plan: auth.md, Items: 5');
    });

    it('leaves unresolvable refs unchanged', () => {
      const result = resolveAllRefs('See $task-99.missing for details');
      assert.equal(result, 'See $task-99.missing for details');
    });

    it('handles non-string input', () => {
      assert.equal(resolveAllRefs(null), null);
      assert.equal(resolveAllRefs(undefined), undefined);
    });
  });

  describe('clearOutputs', () => {
    it('removes all stored outputs', () => {
      setTaskOutput('task-1', 'a', 1);
      setTaskOutput('task-2', 'b', 2);
      clearOutputs();
      assert.equal(getTaskOutput('task-1', 'a'), undefined);
      assert.equal(getTaskOutput('task-2', 'b'), undefined);
    });
  });
});
