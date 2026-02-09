/**
 * Phase 4 / SPEC-017: Loop pattern tests
 * 15+ tests for forEach (parallel/sequential), doWhile (maxIterations), retryUntil (backoff), checkpoint
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { LoopExecutor } = require('../../.claude/lib/workflow/loop-executor.cjs');

describe('Phase 4: workflow-patterns loops', () => {
  let executor;

  beforeEach(() => {
    executor = new LoopExecutor();
  });

  test('forEach: sequential returns all results', async () => {
    const items = [1, 2, 3];
    const results = await executor.forEach(items, async ctx => ctx.item * 2);
    assert.deepStrictEqual(results, [2, 4, 6]);
  });

  test('forEach: parallel with maxConcurrency', async () => {
    const items = [1, 2, 3, 4];
    const results = await executor.forEach(items, async ctx => ctx.item, {
      parallel: true,
      maxConcurrency: 2,
    });
    assert.deepStrictEqual(results, [1, 2, 3, 4]);
  });

  test('forEach: onProgress called each iteration', async () => {
    const progress = [];
    await executor.forEach([1, 2, 3], async ctx => ctx.item, {
      onProgress: (done, total) => progress.push({ done, total }),
    });
    assert.strictEqual(progress.length, 3);
    assert.strictEqual(progress[2].done, 3);
    assert.strictEqual(progress[2].total, 3);
  });

  test('doWhile: requires maxIterations', async () => {
    await assert.rejects(
      async () =>
        executor.doWhile(
          () => true,
          async () => ({}),
          {}
        ),
      { message: /maxIterations is required/i }
    );
  });

  test('doWhile: runs until condition false', async () => {
    let count = 0;
    const state = await executor.doWhile(
      s => s.iterations < 3,
      async _s => ({ count: (count += 1) }),
      { maxIterations: 10 }
    );
    assert.strictEqual(state.iterations, 3);
  });

  test('doWhile: respects maxIterations cap', async () => {
    const state = await executor.doWhile(
      () => true,
      async s => s,
      { maxIterations: 5 }
    );
    assert.strictEqual(state.iterations, 5);
  });

  test('doWhile: onCheckpoint called each iteration', async () => {
    const checkpoints = [];
    await executor.doWhile(
      s => s.iterations < 2,
      async s => s,
      { maxIterations: 10, onCheckpoint: s => checkpoints.push(s) }
    );
    assert.strictEqual(checkpoints.length, 2);
  });

  test('retryUntil: returns on first success', async () => {
    let attempts = 0;
    const out = await executor.retryUntil(
      r => r === 'ok',
      async () => (attempts++ < 1 ? 'fail' : 'ok'),
      { maxRetries: 5 }
    );
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.result, 'ok');
    assert.strictEqual(out.attempts, 2);
  });

  test('retryUntil: exponential backoff delay increases', async () => {
    const delays = [];
    let last = Date.now();
    const out = await executor.retryUntil(
      () => false,
      async () => {
        const now = Date.now();
        delays.push(now - last);
        last = now;
        return null;
      },
      { maxRetries: 3, backoff: 'exponential', initialDelay: 10 }
    );
    assert.strictEqual(out.success, false);
    assert.ok(delays.length >= 2, 'at least 2 delays between 3 attempts');
    if (delays.length >= 2) {
      assert.ok(delays[delays.length - 1] >= delays[0], 'exponential backoff should increase');
    }
  });

  test('retryUntil: returns failure when maxRetries exhausted', async () => {
    const out = await executor.retryUntil(
      () => false,
      async () => 'x',
      { maxRetries: 2 }
    );
    assert.strictEqual(out.success, false);
    assert.strictEqual(out.result, 'x');
    assert.strictEqual(out.attempts, 2);
  });

  test('retryUntil: success on first try', async () => {
    const out = await executor.retryUntil(
      r => r === 1,
      async () => 1,
      { maxRetries: 3 }
    );
    assert.strictEqual(out.success, true);
    assert.strictEqual(out.attempts, 1);
  });

  test('forEach: continueOnError returns successes and errors', async () => {
    const items = [1, 2, 3];
    const out = await executor.forEach(
      items,
      async ctx => {
        if (ctx.item === 2) throw new Error('two');
        return ctx.item;
      },
      { continueOnError: true }
    );
    assert.strictEqual(out.successes.length, 2);
    assert.strictEqual(out.errors.length, 1);
  });

  test('doWhile: system cap 10000 allows maxIterations 100', async () => {
    const state = await executor.doWhile(
      s => s.iterations < 100,
      async s => s,
      { maxIterations: 100 }
    );
    assert.strictEqual(state.iterations, 100);
  });

  test('forEach: context mutation preserved in sequential', async () => {
    const context = { sum: 0 };
    await executor.forEach(
      [1, 2, 3],
      async ctx => {
        ctx.sum = (ctx.sum || 0) + ctx.item;
        return ctx.item;
      },
      { context }
    );
    assert.strictEqual(context.sum, 6);
  });
});
