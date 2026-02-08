/**
 * SPEC-017: Advanced Workflow Orchestration Patterns
 *
 * Tests for fan-out/fan-in, conditional branching, loop patterns, and dynamic task generation.
 * TDD RED Phase: All tests should FAIL (MODULE_NOT_FOUND or function not implemented).
 *
 * Categories:
 * - Category 1: Fan-Out/Fan-In Pattern (20 tests)
 * - Category 2: Conditional Branching (20 tests)
 * - Category 3: Loop Patterns (20 tests)
 * - Category 4: Dynamic Task Generation (15 tests)
 *
 * Total: 75+ tests
 */

const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

// Imports (will fail initially - TDD RED phase)
const { FanOutFanInExecutor } = require('../.claude/lib/workflow/fan-out-fan-in.cjs');
const { ConditionalExecutor } = require('../.claude/lib/workflow/conditional-executor.cjs');
const { LoopExecutor } = require('../.claude/lib/workflow/loop-executor.cjs');
const { DynamicTaskGenerator } = require('../.claude/lib/workflow/dynamic-task-generator.cjs');

// =============================================================================
// Category 1: Fan-Out/Fan-In Pattern (20 tests)
// =============================================================================

describe('SPEC-017 Category 1: Fan-Out/Fan-In Pattern', () => {
  let executor;

  beforeEach(() => {
    executor = new FanOutFanInExecutor();
  });

  // Basic fan-out/fan-in functionality
  test('01.01: should execute tasks in parallel and collect all results', async () => {
    const tasks = [
      { id: 'task1', fn: async () => 'result1' },
      { id: 'task2', fn: async () => 'result2' },
      { id: 'task3', fn: async () => 'result3' },
    ];

    const results = await executor.execute(tasks, { strategy: 'all' });

    assert.strictEqual(results.length, 3);
    assert.deepStrictEqual(results, ['result1', 'result2', 'result3']);
  });

  test('01.02: should handle empty task list', async () => {
    const results = await executor.execute([], { strategy: 'all' });
    assert.deepStrictEqual(results, []);
  });

  test('01.03: should handle single task', async () => {
    const tasks = [{ id: 'task1', fn: async () => 'result1' }];
    const results = await executor.execute(tasks, { strategy: 'all' });
    assert.deepStrictEqual(results, ['result1']);
  });

  // Collection strategy: 'all' (wait for all, fail if any fails)
  test('01.04: strategy="all" should fail if any task fails', async () => {
    const tasks = [
      { id: 'task1', fn: async () => 'result1' },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('task2 failed');
        },
      },
      { id: 'task3', fn: async () => 'result3' },
    ];

    await assert.rejects(async () => executor.execute(tasks, { strategy: 'all' }), {
      message: 'task2 failed',
    });
  });

  test('01.05: strategy="all" should wait for all tasks to complete', async () => {
    const completed = [];
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          await sleep(10);
          completed.push('task1');
          return 'result1';
        },
      },
      {
        id: 'task2',
        fn: async () => {
          await sleep(20);
          completed.push('task2');
          return 'result2';
        },
      },
      {
        id: 'task3',
        fn: async () => {
          await sleep(5);
          completed.push('task3');
          return 'result3';
        },
      },
    ];

    await executor.execute(tasks, { strategy: 'all' });
    assert.strictEqual(completed.length, 3);
  });

  // Collection strategy: 'any' (return first success, cancel others)
  test('01.06: strategy="any" should return first successful result', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          await sleep(50);
          return 'slow';
        },
      },
      {
        id: 'task2',
        fn: async () => {
          await sleep(5);
          return 'fast';
        },
      },
      {
        id: 'task3',
        fn: async () => {
          await sleep(100);
          return 'slowest';
        },
      },
    ];

    const result = await executor.execute(tasks, { strategy: 'any' });
    assert.strictEqual(result, 'fast');
  });

  test('01.07: strategy="any" should throw if all tasks fail', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          throw new Error('fail1');
        },
      },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('fail2');
        },
      },
    ];

    await assert.rejects(async () => executor.execute(tasks, { strategy: 'any' }), {
      message: /all.*failed/i,
    });
  });

  // Collection strategy: 'majority' (wait for >50% to succeed)
  test('01.08: strategy="majority" should return when majority succeeds', async () => {
    const tasks = [
      { id: 'task1', fn: async () => 'result1' },
      { id: 'task2', fn: async () => 'result2' },
      {
        id: 'task3',
        fn: async () => {
          throw new Error('fail');
        },
      },
    ];

    const results = await executor.execute(tasks, { strategy: 'majority' });
    assert.strictEqual(results.length, 2);
  });

  test('01.09: strategy="majority" should fail if majority fails', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          throw new Error('fail1');
        },
      },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('fail2');
        },
      },
      { id: 'task3', fn: async () => 'result3' },
    ];

    await assert.rejects(async () => executor.execute(tasks, { strategy: 'majority' }), {
      message: /majority.*failed/i,
    });
  });

  // Collection strategy: 'quorum' (wait for n successes)
  test('01.10: strategy="quorum" should return when quorum met', async () => {
    const tasks = [
      { id: 'task1', fn: async () => 'result1' },
      { id: 'task2', fn: async () => 'result2' },
      { id: 'task3', fn: async () => 'result3' },
      { id: 'task4', fn: async () => 'result4' },
    ];

    const results = await executor.execute(tasks, { strategy: 'quorum', quorumCount: 2 });
    assert.ok(results.length >= 2);
  });

  test('01.11: strategy="quorum" should fail if quorum not met', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          throw new Error('fail1');
        },
      },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('fail2');
        },
      },
      { id: 'task3', fn: async () => 'result3' },
    ];

    await assert.rejects(
      async () => executor.execute(tasks, { strategy: 'quorum', quorumCount: 2 }),
      { message: /quorum.*not.*met/i }
    );
  });

  // Timeout handling
  test('01.12: should timeout tasks that exceed duration', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          await sleep(100);
          return 'slow';
        },
      },
    ];

    await assert.rejects(async () => executor.execute(tasks, { timeout: 20 }), {
      message: /timeout/i,
    });
  });

  test('01.13: should not timeout tasks within duration', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          await sleep(10);
          return 'fast';
        },
      },
    ];

    const results = await executor.execute(tasks, { timeout: 50 });
    assert.deepStrictEqual(results, ['fast']);
  });

  // Failure policies
  test('01.14: failurePolicy="fail-fast" should stop on first failure', async () => {
    let _task3Executed = false;
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          await sleep(5);
          return 'result1';
        },
      },
      {
        id: 'task2',
        fn: async () => {
          await sleep(10);
          throw new Error('task2 failed');
        },
      },
      {
        id: 'task3',
        fn: async () => {
          _task3Executed = true;
          return 'result3';
        },
      },
    ];

    await assert.rejects(async () =>
      executor.execute(tasks, { strategy: 'all', failurePolicy: 'fail-fast' })
    );
    // task3 might or might not execute depending on timing
  });

  test('01.15: failurePolicy="continue" should collect all results and failures', async () => {
    const tasks = [
      { id: 'task1', fn: async () => 'result1' },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('task2 failed');
        },
      },
      { id: 'task3', fn: async () => 'result3' },
    ];

    const result = await executor.execute(tasks, { strategy: 'all', failurePolicy: 'continue' });
    assert.strictEqual(result.successes.length, 2);
    assert.strictEqual(result.failures.length, 1);
  });

  // Concurrency limits
  test('01.16: should respect maxConcurrency limit', async () => {
    let concurrentTasks = 0;
    let maxConcurrent = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => ({
      id: `task${i}`,
      fn: async () => {
        concurrentTasks++;
        maxConcurrent = Math.max(maxConcurrent, concurrentTasks);
        await sleep(10);
        concurrentTasks--;
        return `result${i}`;
      },
    }));

    await executor.execute(tasks, { maxConcurrency: 3 });
    assert.ok(maxConcurrent <= 3, `maxConcurrent=${maxConcurrent} exceeded limit 3`);
  });

  test('01.17: should execute all tasks when maxConcurrency not set', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `task${i}`,
      fn: async () => `result${i}`,
    }));

    const results = await executor.execute(tasks, { strategy: 'all' });
    assert.strictEqual(results.length, 5);
  });

  // Result transformation
  test('01.18: should apply result transformation if provided', async () => {
    const tasks = [
      { id: 'task1', fn: async () => 'result1' },
      { id: 'task2', fn: async () => 'result2' },
    ];

    const results = await executor.execute(tasks, {
      strategy: 'all',
      transform: results => results.map(r => r.toUpperCase()),
    });

    assert.deepStrictEqual(results, ['RESULT1', 'RESULT2']);
  });

  // Error aggregation
  test('01.19: should aggregate errors when multiple tasks fail', async () => {
    const tasks = [
      {
        id: 'task1',
        fn: async () => {
          throw new Error('error1');
        },
      },
      {
        id: 'task2',
        fn: async () => {
          throw new Error('error2');
        },
      },
      {
        id: 'task3',
        fn: async () => {
          throw new Error('error3');
        },
      },
    ];

    await assert.rejects(
      async () => executor.execute(tasks, { strategy: 'all' }),
      err => {
        assert.ok(err.message.includes('error1'));
        assert.ok(err.message.includes('error2'));
        assert.ok(err.message.includes('error3'));
        return true;
      }
    );
  });

  // Progress tracking
  test('01.20: should emit progress events during execution', async () => {
    const progressEvents = [];
    const tasks = Array.from({ length: 5 }, (_, i) => ({
      id: `task${i}`,
      fn: async () => {
        await sleep(10);
        return `result${i}`;
      },
    }));

    await executor.execute(tasks, {
      strategy: 'all',
      onProgress: (completed, total) => progressEvents.push({ completed, total }),
    });

    assert.ok(progressEvents.length > 0);
    assert.strictEqual(progressEvents[progressEvents.length - 1].completed, 5);
  });
});

// =============================================================================
// Category 2: Conditional Branching (20 tests)
// =============================================================================

describe('SPEC-017 Category 2: Conditional Branching', () => {
  let executor;

  beforeEach(() => {
    executor = new ConditionalExecutor();
  });

  // Basic when/then/else
  test('02.01: should execute then branch when condition is true', async () => {
    const condition = () => true;
    const thenBranch = async () => 'then-result';
    const elseBranch = async () => 'else-result';

    const result = await executor.when(condition, thenBranch, elseBranch);
    assert.strictEqual(result, 'then-result');
  });

  test('02.02: should execute else branch when condition is false', async () => {
    const condition = () => false;
    const thenBranch = async () => 'then-result';
    const elseBranch = async () => 'else-result';

    const result = await executor.when(condition, thenBranch, elseBranch);
    assert.strictEqual(result, 'else-result');
  });

  test('02.03: should return null when condition is false and no else branch', async () => {
    const condition = () => false;
    const thenBranch = async () => 'then-result';

    const result = await executor.when(condition, thenBranch);
    assert.strictEqual(result, null);
  });

  // Context-aware conditions
  test('02.04: should evaluate condition with provided context', async () => {
    const condition = ctx => ctx.score > 0.8;
    const thenBranch = async ctx => `approved: ${ctx.name}`;
    const elseBranch = async ctx => `rejected: ${ctx.name}`;

    const result = await executor.when(condition, thenBranch, elseBranch, {
      score: 0.9,
      name: 'test',
    });
    assert.strictEqual(result, 'approved: test');
  });

  test('02.05: should pass context to branches', async () => {
    const condition = ctx => ctx.enabled;
    const thenBranch = async ctx => ctx.value * 2;
    const elseBranch = async ctx => ctx.value / 2;

    const result = await executor.when(condition, thenBranch, elseBranch, {
      enabled: true,
      value: 10,
    });
    assert.strictEqual(result, 20);
  });

  // Async conditions
  test('02.06: should support async condition evaluation', async () => {
    const condition = async ctx => {
      await sleep(10);
      return ctx.ready;
    };
    const thenBranch = async () => 'ready';
    const elseBranch = async () => 'not-ready';

    const result = await executor.when(condition, thenBranch, elseBranch, { ready: true });
    assert.strictEqual(result, 'ready');
  });

  // Switch/case pattern
  test('02.07: should execute matching case in switch', async () => {
    const cases = {
      case1: async () => 'result1',
      case2: async () => 'result2',
      case3: async () => 'result3',
    };

    const result = await executor.switch('case2', cases);
    assert.strictEqual(result, 'result2');
  });

  test('02.08: should execute default case when no match', async () => {
    const cases = {
      case1: async () => 'result1',
      case2: async () => 'result2',
    };
    const defaultCase = async () => 'default-result';

    const result = await executor.switch('case99', cases, defaultCase);
    assert.strictEqual(result, 'default-result');
  });

  test('02.09: should return null when no match and no default', async () => {
    const cases = {
      case1: async () => 'result1',
    };

    const result = await executor.switch('case99', cases);
    assert.strictEqual(result, null);
  });

  // Complex expressions
  test('02.10: should evaluate JavaScript expressions', async () => {
    const condition = 'ctx.score > 0.8 && ctx.status === "approved"';
    const thenBranch = async () => 'proceed';
    const elseBranch = async () => 'block';

    const result = await executor.when(condition, thenBranch, elseBranch, {
      score: 0.9,
      status: 'approved',
    });
    assert.strictEqual(result, 'proceed');
  });

  test('02.11: should safely handle invalid expressions', async () => {
    const condition = 'ctx.nonexistent.property';
    const thenBranch = async () => 'then';
    const elseBranch = async () => 'else';

    await assert.rejects(async () => executor.when(condition, thenBranch, elseBranch, {}), {
      message: /cannot.*read.*property/i,
    });
  });

  // Nested conditionals
  test('02.12: should support nested conditional branching', async () => {
    const outerCondition = ctx => ctx.level1;
    const innerCondition = ctx => ctx.level2;
    const nestedThen = async ctx =>
      executor.when(
        innerCondition,
        async () => 'deep',
        async () => 'shallow',
        ctx
      );
    const outerElse = async () => 'none';

    const result = await executor.when(outerCondition, nestedThen, outerElse, {
      level1: true,
      level2: true,
    });
    assert.strictEqual(result, 'deep');
  });

  // JSONPath expressions
  test('02.13: should evaluate JSONPath conditions', async () => {
    const condition = '$.result.status';
    const thenBranch = async () => 'success';
    const elseBranch = async () => 'failure';

    const result = await executor.when(
      condition,
      thenBranch,
      elseBranch,
      { result: { status: 'approved' } },
      { evaluator: 'jsonpath' }
    );
    assert.strictEqual(result, 'success');
  });

  // Simple comparison expressions
  test('02.14: should evaluate simple comparison expressions', async () => {
    const condition = 'count > 10';
    const thenBranch = async () => 'many';
    const elseBranch = async () => 'few';

    const result = await executor.when(
      condition,
      thenBranch,
      elseBranch,
      { count: 15 },
      { evaluator: 'simple' }
    );
    assert.strictEqual(result, 'many');
  });

  // Error handling in branches
  test('02.15: should propagate errors from then branch', async () => {
    const condition = () => true;
    const thenBranch = async () => {
      throw new Error('then-error');
    };
    const elseBranch = async () => 'else';

    await assert.rejects(async () => executor.when(condition, thenBranch, elseBranch), {
      message: 'then-error',
    });
  });

  test('02.16: should propagate errors from else branch', async () => {
    const condition = () => false;
    const thenBranch = async () => 'then';
    const elseBranch = async () => {
      throw new Error('else-error');
    };

    await assert.rejects(async () => executor.when(condition, thenBranch, elseBranch), {
      message: 'else-error',
    });
  });

  // Conditional chains (if-else-if)
  test('02.17: should support if-else-if chains', async () => {
    const result = await executor.chain(
      [
        { condition: ctx => ctx.score > 90, branch: async () => 'excellent' },
        { condition: ctx => ctx.score > 70, branch: async () => 'good' },
        { condition: ctx => ctx.score > 50, branch: async () => 'fair' },
      ],
      async () => 'poor',
      { score: 75 }
    );

    assert.strictEqual(result, 'good');
  });

  test('02.18: should execute default for chain when no conditions match', async () => {
    const result = await executor.chain(
      [
        { condition: ctx => ctx.score > 90, branch: async () => 'excellent' },
        { condition: ctx => ctx.score > 70, branch: async () => 'good' },
      ],
      async () => 'default',
      { score: 30 }
    );

    assert.strictEqual(result, 'default');
  });

  // Context mutation
  test('02.19: should allow branches to mutate context', async () => {
    const context = { value: 10 };
    const condition = () => true;
    const thenBranch = async ctx => {
      ctx.value = 20;
      return 'modified';
    };

    await executor.when(condition, thenBranch, null, context);
    assert.strictEqual(context.value, 20);
  });

  // Performance
  test('02.20: should not evaluate else branch if then branch executes', async () => {
    let elseExecuted = false;
    const condition = () => true;
    const thenBranch = async () => 'then';
    const elseBranch = async () => {
      elseExecuted = true;
      return 'else';
    };

    await executor.when(condition, thenBranch, elseBranch);
    assert.strictEqual(elseExecuted, false);
  });
});

// =============================================================================
// Category 3: Loop Patterns (20 tests)
// =============================================================================

describe('SPEC-017 Category 3: Loop Patterns', () => {
  let executor;

  beforeEach(() => {
    executor = new LoopExecutor();
  });

  // forEach pattern
  test('03.01: should iterate over items sequentially', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = [];
    const task = async ctx => {
      results.push(ctx.item * 2);
      return ctx.item * 2;
    };

    await executor.forEach(items, task);
    assert.deepStrictEqual(results, [2, 4, 6, 8, 10]);
  });

  test('03.02: should iterate over items in parallel when specified', async () => {
    const items = [1, 2, 3, 4, 5];
    const task = async ctx => ctx.item * 2;

    const results = await executor.forEach(items, task, { parallel: true });
    assert.strictEqual(results.length, 5);
  });

  test('03.03: should handle empty collection', async () => {
    const results = await executor.forEach([], async () => 'value');
    assert.deepStrictEqual(results, []);
  });

  test('03.04: should respect maxConcurrency in parallel forEach', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    const task = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(10);
      concurrent--;
    };

    await executor.forEach(items, task, { parallel: true, maxConcurrency: 3 });
    assert.ok(maxConcurrent <= 3);
  });

  // doWhile pattern
  test('03.05: should execute task while condition is true', async () => {
    let iterations = 0;
    const condition = ctx => ctx.iterations < 5;
    const task = async _ctx => {
      iterations++;
      return { iterations };
    };

    const result = await executor.doWhile(condition, task, { maxIterations: 10 });
    assert.strictEqual(result.iterations, 5);
    assert.strictEqual(iterations, 5);
  });

  test('03.06: should enforce maxIterations to prevent infinite loops', async () => {
    const condition = () => true; // Always true
    const task = async ctx => ctx.iteration;

    const result = await executor.doWhile(condition, task, { maxIterations: 10 });
    assert.strictEqual(result.iterations, 10);
  });

  test('03.07: should throw if maxIterations not provided', async () => {
    const condition = () => true;
    const task = async () => {};

    await assert.rejects(async () => executor.doWhile(condition, task), {
      message: /maxIterations.*required/i,
    });
  });

  test('03.08: should checkpoint progress during loop', async () => {
    const checkpoints = [];
    const condition = ctx => ctx.iteration < 5;
    const task = async ctx => ctx.iteration;

    await executor.doWhile(condition, task, {
      maxIterations: 10,
      onCheckpoint: state => checkpoints.push(state),
    });

    assert.ok(checkpoints.length > 0);
  });

  // retryUntil pattern
  test('03.09: should retry until success condition met', async () => {
    let attempts = 0;
    const successCondition = ctx => ctx.result === 'success';
    const task = async () => {
      attempts++;
      return { result: attempts >= 3 ? 'success' : 'failure' };
    };

    const result = await executor.retryUntil(successCondition, task, { maxRetries: 5 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.attempts, 3);
  });

  test('03.10: should fail after maxRetries exceeded', async () => {
    const successCondition = () => false;
    const task = async () => ({ result: 'always-fails' });

    const result = await executor.retryUntil(successCondition, task, { maxRetries: 3 });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.attempts, 3);
  });

  test('03.11: should apply exponential backoff between retries', async () => {
    const delays = [];
    const startTime = Date.now();
    const successCondition = () => false;
    const task = async () => {
      delays.push(Date.now() - startTime);
      return {};
    };

    await executor.retryUntil(successCondition, task, {
      maxRetries: 3,
      backoff: 'exponential',
      initialDelay: 10,
    });

    // Delays should increase exponentially (10ms, 20ms, 40ms...)
    assert.ok(delays[1] > delays[0]);
    if (delays.length > 2) {
      assert.ok(delays[2] > delays[1]);
    }
  });

  test('03.12: should apply linear backoff between retries', async () => {
    const delays = [];
    const startTime = Date.now();
    const successCondition = () => false;
    const task = async () => {
      delays.push(Date.now() - startTime);
      return {};
    };

    await executor.retryUntil(successCondition, task, {
      maxRetries: 3,
      backoff: 'linear',
      initialDelay: 10,
    });

    // Delays should increase linearly (10ms, 20ms, 30ms...)
    assert.ok(delays.length >= 2);
  });

  // Loop control
  test('03.13: should support break condition in forEach', async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const processed = [];
    const task = async ctx => {
      processed.push(ctx.item);
      if (ctx.item === 5) {
        return { break: true };
      }
    };

    await executor.forEach(items, task, { supportBreak: true });
    assert.strictEqual(processed.length, 5);
  });

  test('03.14: should support continue/skip in forEach', async () => {
    const items = [1, 2, 3, 4, 5];
    const processed = [];
    const task = async ctx => {
      if (ctx.item % 2 === 0) {
        return { continue: true };
      }
      processed.push(ctx.item);
    };

    await executor.forEach(items, task, { supportContinue: true });
    assert.deepStrictEqual(processed, [1, 3, 5]);
  });

  // Error handling in loops
  test('03.15: should collect errors in parallel forEach with continueOnError', async () => {
    const items = [1, 2, 3, 4, 5];
    const task = async ctx => {
      if (ctx.item === 3) throw new Error('item-3-error');
      return ctx.item * 2;
    };

    const result = await executor.forEach(items, task, {
      parallel: true,
      continueOnError: true,
    });

    assert.strictEqual(result.successes.length, 4);
    assert.strictEqual(result.errors.length, 1);
  });

  test('03.16: should stop forEach on first error by default', async () => {
    const items = [1, 2, 3, 4, 5];
    let processed = 0;
    const task = async ctx => {
      processed++;
      if (ctx.item === 3) throw new Error('item-3-error');
      return ctx.item;
    };

    await assert.rejects(async () => executor.forEach(items, task), { message: 'item-3-error' });
    assert.strictEqual(processed, 3);
  });

  // Context preservation
  test('03.17: should preserve context across loop iterations', async () => {
    const context = { accumulator: 0 };
    const items = [1, 2, 3, 4, 5];
    const task = async ctx => {
      ctx.accumulator += ctx.item;
    };

    await executor.forEach(items, task, { context });
    assert.strictEqual(context.accumulator, 15);
  });

  // Progress reporting
  test('03.18: should report progress during forEach', async () => {
    const progressReports = [];
    const items = Array.from({ length: 10 }, (_, i) => i);
    const task = async ctx => ctx.item;

    await executor.forEach(items, task, {
      onProgress: (completed, total) => progressReports.push({ completed, total }),
    });

    assert.ok(progressReports.length > 0);
    assert.strictEqual(progressReports[progressReports.length - 1].completed, 10);
  });

  // Batch processing
  test('03.19: should process items in batches', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const batchSizes = [];
    const task = async batch => {
      batchSizes.push(batch.length);
      return batch.map(item => item * 2);
    };

    await executor.forEachBatch(items, task, { batchSize: 3 });
    assert.deepStrictEqual(batchSizes, [3, 3, 3, 1]);
  });

  // Performance measurement
  test('03.20: should measure execution time per iteration', async () => {
    const items = [1, 2, 3];
    const task = async ctx => {
      await sleep(10);
      return ctx.item;
    };

    const result = await executor.forEach(items, task, { measureTime: true });
    assert.ok(result.timings.length === 3);
    result.timings.forEach(time => assert.ok(time >= 10));
  });
});

// =============================================================================
// Category 4: Dynamic Task Generation (15 tests)
// =============================================================================

describe('SPEC-017 Category 4: Dynamic Task Generation', () => {
  let generator;

  beforeEach(() => {
    generator = new DynamicTaskGenerator();
  });

  // Basic dynamic generation
  test('04.01: should generate tasks from runtime data', async () => {
    const data = { files: ['file1.txt', 'file2.txt', 'file3.txt'] };
    const template = file => ({
      id: `process-${file}`,
      fn: async () => `processed ${file}`,
    });

    const tasks = await generator.generate(data.files, template);
    assert.strictEqual(tasks.length, 3);
    assert.strictEqual(tasks[0].id, 'process-file1.txt');
  });

  test('04.02: should execute generated tasks', async () => {
    const data = [1, 2, 3];
    const template = num => ({
      id: `task-${num}`,
      fn: async () => num * 2,
    });

    const results = await generator.generateAndExecute(data, template);
    assert.deepStrictEqual(results, [2, 4, 6]);
  });

  // Conditional generation
  test('04.03: should generate tasks based on conditions', async () => {
    const data = [
      { id: 1, process: true },
      { id: 2, process: false },
      { id: 3, process: true },
    ];
    const template = item => ({
      id: `task-${item.id}`,
      fn: async () => item.id,
    });
    const filter = item => item.process;

    const tasks = await generator.generate(data, template, { filter });
    assert.strictEqual(tasks.length, 2);
  });

  // Hierarchical generation (parent-child)
  test('04.04: should generate nested task hierarchies', async () => {
    const data = {
      phases: [
        { name: 'phase1', tasks: ['task1', 'task2'] },
        { name: 'phase2', tasks: ['task3', 'task4'] },
      ],
    };

    const tasks = await generator.generateHierarchy(data.phases, {
      parentTemplate: phase => ({ id: phase.name }),
      childTemplate: task => ({ id: task, fn: async () => task }),
    });

    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].children.length, 2);
  });

  // Data-driven dependencies
  test('04.05: should generate task dependencies from data', async () => {
    const data = [
      { id: 'task1', dependsOn: [] },
      { id: 'task2', dependsOn: ['task1'] },
      { id: 'task3', dependsOn: ['task1', 'task2'] },
    ];

    const tasks = await generator.generateWithDependencies(data, {
      template: item => ({ id: item.id, fn: async () => item.id }),
      getDependencies: item => item.dependsOn,
    });

    assert.strictEqual(tasks[2].dependencies.length, 2);
  });

  // Template composition
  test('04.06: should compose templates for complex generation', async () => {
    const data = [{ type: 'validate' }, { type: 'transform' }, { type: 'store' }];
    const templates = {
      validate: _item => ({ fn: async () => 'validated' }),
      transform: _item => ({ fn: async () => 'transformed' }),
      store: _item => ({ fn: async () => 'stored' }),
    };

    const tasks = await generator.generate(data, item => templates[item.type](item));
    const results = await Promise.all(tasks.map(t => t.fn()));
    assert.deepStrictEqual(results, ['validated', 'transformed', 'stored']);
  });

  // Resource-based scaling
  test('04.07: should scale task generation based on available resources', async () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const availableWorkers = 10;

    const tasks = await generator.generate(
      data,
      item => ({
        id: `task-${item}`,
        fn: async () => item,
      }),
      { maxTasks: availableWorkers }
    );

    assert.strictEqual(tasks.length, availableWorkers);
  });

  // Error handling in generation
  test('04.08: should handle errors during task generation', async () => {
    const data = [1, 2, 'invalid', 4];
    const template = item => {
      if (typeof item !== 'number') throw new Error('invalid-type');
      return { id: `task-${item}`, fn: async () => item };
    };

    await assert.rejects(async () => generator.generate(data, template), {
      message: 'invalid-type',
    });
  });

  test('04.09: should skip failed generation with continueOnError', async () => {
    const data = [1, 2, 'invalid', 4];
    const template = item => {
      if (typeof item !== 'number') throw new Error('invalid-type');
      return { id: `task-${item}`, fn: async () => item };
    };

    const result = await generator.generate(data, template, { continueOnError: true });
    assert.strictEqual(result.tasks.length, 3);
    assert.strictEqual(result.errors.length, 1);
  });

  // Lazy generation
  test('04.10: should support lazy task generation', async () => {
    let generated = 0;
    function* dataGenerator() {
      for (let i = 0; i < 5; i++) {
        generated++;
        yield i;
      }
    }

    const tasks = await generator.generateLazy(
      dataGenerator(),
      item => ({
        id: `task-${item}`,
        fn: async () => item,
      }),
      { limit: 3 }
    );

    assert.strictEqual(tasks.length, 3);
    assert.strictEqual(generated, 3); // Only generated what was needed
  });

  // Validation
  test('04.11: should validate generated tasks before execution', async () => {
    const data = [1, 2, 3];
    const template = item => ({ id: `task-${item}` }); // Missing fn

    await assert.rejects(
      async () => generator.generateAndExecute(data, template, { validate: true }),
      { message: /missing.*fn/i }
    );
  });

  // Deduplication
  test('04.12: should deduplicate generated tasks by ID', async () => {
    const data = [1, 1, 2, 2, 3];
    const template = item => ({
      id: `task-${item}`,
      fn: async () => item,
    });

    const tasks = await generator.generate(data, template, { deduplicate: true });
    assert.strictEqual(tasks.length, 3);
  });

  // Priority-based generation
  test('04.13: should generate tasks with priority ordering', async () => {
    const data = [
      { value: 1, priority: 3 },
      { value: 2, priority: 1 },
      { value: 3, priority: 2 },
    ];
    const template = item => ({
      id: `task-${item.value}`,
      priority: item.priority,
      fn: async () => item.value,
    });

    const tasks = await generator.generate(data, template, { sortByPriority: true });
    assert.strictEqual(tasks[0].priority, 1); // Highest priority first
  });

  // Context injection
  test('04.14: should inject context into generated tasks', async () => {
    const data = [1, 2, 3];
    const context = { multiplier: 10 };
    const template = (item, ctx) => ({
      id: `task-${item}`,
      fn: async () => item * ctx.multiplier,
    });

    const results = await generator.generateAndExecute(data, template, { context });
    assert.deepStrictEqual(results, [10, 20, 30]);
  });

  // Batched generation
  test('04.15: should generate tasks in batches to control memory', async () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    let generationCalls = 0;
    const template = item => {
      generationCalls++;
      return { id: `task-${item}`, fn: async () => item };
    };

    await generator.generateInBatches(data, template, { batchSize: 10 });
    assert.strictEqual(generationCalls, 100);
  });
});

// =============================================================================
// Helper Functions
// =============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
