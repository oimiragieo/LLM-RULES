'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConditionalExecutor } = require('../../../.claude/lib/workflow/conditional-executor.cjs');

test('ConditionalExecutor javascript evaluator supports basic boolean expressions', async () => {
  const executor = new ConditionalExecutor();

  const result = await executor.when(
    'ctx.count >= 2 && ctx.enabled === true',
    async () => 'then',
    async () => 'else',
    { count: 3, enabled: true },
    { evaluator: 'javascript' }
  );

  assert.equal(result, 'then');
});

test('ConditionalExecutor javascript evaluator blocks code injection expressions', async () => {
  const executor = new ConditionalExecutor();

  await assert.rejects(
    executor.when(
      'this.constructor.constructor("return process")()',
      async () => 'then',
      async () => 'else',
      {},
      { evaluator: 'javascript' }
    ),
    /unsafe|blocked|Cannot read property on undefined/i
  );
});

