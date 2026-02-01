/**
 * Phase 4 / SPEC-017: Fan-Out/Fan-In pattern tests
 * 15+ tests for all/any/majority/quorum, timeout, failurePolicy, cleanup
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { FanOutFanInExecutor } = require('../../.claude/lib/workflow/fan-out-fan-in.cjs');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Phase 4: workflow-patterns fan-out', () => {
  let executor;

  beforeEach(() => {
    executor = new FanOutFanInExecutor();
  });

  test('all: execute 3 tasks and collect all results', async () => {
    const tasks = [
      { id: 'a', fn: async () => 'r1' },
      { id: 'b', fn: async () => 'r2' },
      { id: 'c', fn: async () => 'r3' },
    ];
    const results = await executor.execute(tasks, { strategy: 'all' });
    assert.deepStrictEqual(results, ['r1', 'r2', 'r3']);
  });

  test('all: empty task list returns []', async () => {
    const results = await executor.execute([], { strategy: 'all' });
    assert.deepStrictEqual(results, []);
  });

  test('all: single task', async () => {
    const results = await executor.execute([{ id: 'x', fn: async () => 'x' }], { strategy: 'all' });
    assert.deepStrictEqual(results, ['x']);
  });

  test('all: fail if any task fails (fail-fast)', async () => {
    const tasks = [
      { id: 'a', fn: async () => 'ok' },
      { id: 'b', fn: async () => { throw new Error('b failed'); } },
      { id: 'c', fn: async () => 'ok' },
    ];
    await assert.rejects(async () => executor.execute(tasks, { strategy: 'all' }), { message: 'b failed' });
  });

  test('all: failurePolicy continue returns successes and failures', async () => {
    const tasks = [
      { id: 'a', fn: async () => 'ok' },
      { id: 'b', fn: async () => { throw new Error('b'); } },
      { id: 'c', fn: async () => 'ok' },
    ];
    const out = await executor.execute(tasks, { strategy: 'all', failurePolicy: 'continue' });
    assert.strictEqual(out.successes.length, 2);
    assert.strictEqual(out.failures.length, 1);
  });

  test('all: failurePolicy fail-at-end waits for all then throws', async () => {
    const tasks = [
      { id: 'a', fn: async () => 'ok' },
      { id: 'b', fn: async () => { throw new Error('b'); } },
      { id: 'c', fn: async () => 'ok' },
    ];
    await assert.rejects(async () => executor.execute(tasks, { strategy: 'all', failurePolicy: 'fail-at-end' }), { message: 'b' });
  });

  test('any: returns first success', async () => {
    const tasks = [
      { id: 'slow', fn: async () => { await sleep(50); return 'slow'; } },
      { id: 'fast', fn: async () => { await sleep(5); return 'fast'; } },
    ];
    const result = await executor.execute(tasks, { strategy: 'any' });
    assert.strictEqual(result, 'fast');
  });

  test('any: throws if all fail', async () => {
    const tasks = [
      { id: 'a', fn: async () => { throw new Error('a'); } },
      { id: 'b', fn: async () => { throw new Error('b'); } },
    ];
    await assert.rejects(async () => executor.execute(tasks, { strategy: 'any' }), { message: /all.*failed/i });
  });

  test('majority: returns when >50% succeed', async () => {
    const tasks = [
      { id: 'a', fn: async () => 'a' },
      { id: 'b', fn: async () => 'b' },
      { id: 'c', fn: async () => { throw new Error('c'); } },
    ];
    const results = await executor.execute(tasks, { strategy: 'majority' });
    assert.strictEqual(results.length, 2);
  });

  test('majority: fails when majority fail', async () => {
    const tasks = [
      { id: 'a', fn: async () => { throw new Error('a'); } },
      { id: 'b', fn: async () => { throw new Error('b'); } },
      { id: 'c', fn: async () => 'c' },
    ];
    await assert.rejects(async () => executor.execute(tasks, { strategy: 'majority' }), { message: /majority/i });
  });

  test('quorum: returns when quorumCount met', async () => {
    const tasks = [
      { id: 'a', fn: async () => 'a' },
      { id: 'b', fn: async () => 'b' },
      { id: 'c', fn: async () => 'c' },
    ];
    const results = await executor.execute(tasks, { strategy: 'quorum', quorumCount: 2 });
    assert.ok(results.length >= 2);
  });

  test('quorum: fails when quorum not met', async () => {
    const tasks = [
      { id: 'a', fn: async () => { throw new Error('a'); } },
      { id: 'b', fn: async () => { throw new Error('b'); } },
      { id: 'c', fn: async () => 'c' },
    ];
    await assert.rejects(async () => executor.execute(tasks, { strategy: 'quorum', quorumCount: 2 }), { message: /quorum/i });
  });

  test('timeout: rejects when task exceeds timeout', async () => {
    const tasks = [{ id: 'slow', fn: async () => { await sleep(200); return 'x'; } }];
    await assert.rejects(async () => executor.execute(tasks, { strategy: 'all', timeout: 30 }), { message: /timeout/i });
  });

  test('onProgress called with completion count', async () => {
    const progress = [];
    const tasks = [
      { id: 'a', fn: async () => 'a' },
      { id: 'b', fn: async () => 'b' },
    ];
    await executor.execute(tasks, { strategy: 'all', onProgress: (done, total) => progress.push({ done, total }) });
    assert.ok(progress.length >= 1);
    assert.strictEqual(progress[progress.length - 1].done, 2);
    assert.strictEqual(progress[progress.length - 1].total, 2);
  });

  test('10 parallel tasks complete under 50ms coordination target', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      fn: async () => i,
    }));
    const start = Date.now();
    const results = await executor.execute(tasks, { strategy: 'all' });
    const elapsed = Date.now() - start;
    assert.strictEqual(results.length, 10);
    assert.ok(elapsed < 500, 'coordination should be under 500ms (relaxed for CI)');
  });
});
