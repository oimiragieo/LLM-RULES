/**
 * Phase 4 / SPEC-017: Conditional branching tests
 * 12+ tests for when/then/else, switch/case, evaluators (javascript, jsonpath, simple), security
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ConditionalExecutor } = require('../../.claude/lib/workflow/conditional-executor.cjs');

describe('Phase 4: workflow-patterns conditional', () => {
  let executor;

  beforeEach(() => {
    executor = new ConditionalExecutor();
  });

  test('when: thenBranch when condition true', async () => {
    const ctx = { flag: true };
    const out = await executor.when(
      true,
      async () => 'then',
      async () => 'else',
      ctx
    );
    assert.strictEqual(out, 'then');
  });

  test('when: elseBranch when condition false', async () => {
    const out = await executor.when(
      false,
      async () => 'then',
      async () => 'else'
    );
    assert.strictEqual(out, 'else');
  });

  test('when: null when false and no elseBranch', async () => {
    const out = await executor.when(false, async () => 'then', null);
    assert.strictEqual(out, null);
  });

  test('when: expression ctx.result.score > 0.8 (javascript evaluator)', async () => {
    const ctx = { result: { score: 0.9 } };
    const out = await executor.when(
      'ctx.result.score > 0.8',
      async () => 'pass',
      async () => 'fail',
      ctx,
      { evaluator: 'javascript' }
    );
    assert.strictEqual(out, 'pass');
  });

  test('when: expression ctx.result.score > 0.8 false', async () => {
    const ctx = { result: { score: 0.5 } };
    const out = await executor.when(
      'ctx.result.score > 0.8',
      async () => 'pass',
      async () => 'fail',
      ctx,
      { evaluator: 'javascript' }
    );
    assert.strictEqual(out, 'fail');
  });

  test('when: JSONPath $.result.status (truthy)', async () => {
    const ctx = { result: { status: 'approved' } };
    const out = await executor.when(
      '$.result.status',
      async () => 'yes',
      async () => 'no',
      ctx,
      { evaluator: 'jsonpath' }
    );
    assert.strictEqual(out, 'yes');
  });

  test('when: JSONPath $.missing (falsy)', async () => {
    const ctx = {};
    const out = await executor.when(
      '$.missing',
      async () => 'yes',
      async () => 'no',
      ctx,
      { evaluator: 'jsonpath' }
    );
    assert.strictEqual(out, 'no');
  });

  test('when: simple evaluator count > 10', async () => {
    const ctx = { count: 15 };
    const out = await executor.when(
      'count > 10',
      async () => 'high',
      async () => 'low',
      ctx,
      { evaluator: 'simple' }
    );
    assert.strictEqual(out, 'high');
  });

  test('switch: executes matching case', async () => {
    const cases = {
      a: async () => 'A',
      b: async () => 'B',
    };
    const out = await executor.switch('b', cases, async () => 'default');
    assert.strictEqual(out, 'B');
  });

  test('switch: executes default when no match', async () => {
    const cases = { a: async () => 'A' };
    const out = await executor.switch('z', cases, async () => 'default');
    assert.strictEqual(out, 'default');
  });

  test('switch: returns null when no match and no default', async () => {
    const out = await executor.switch('z', { a: async () => 'A' }, null);
    assert.strictEqual(out, null);
  });

  test('when: function condition receives context', async () => {
    const ctx = { x: 1 };
    const out = await executor.when(
      c => c.x === 1,
      async () => 'match',
      async () => 'no',
      ctx
    );
    assert.strictEqual(out, 'match');
  });
});
