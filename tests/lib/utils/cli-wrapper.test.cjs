'use strict';

const { wrapCLITool } = require('../../../.claude/lib/utils/cli-wrapper.cjs');
const assert = require('assert');
const test = require('node:test');

test('CLI Wrapper', async t => {
  await t.test('should execute successful tool function', async () => {
    let called = false;
    const tool = wrapCLITool(async () => {
      called = true;
      return { ok: true };
    });

    await tool();
    assert.strictEqual(called, true);
  });

  // Since wrapCLITool calls process.exit, testing the failure path
  // requires mocking process.exit or running in a separate process.
  // For this unit test, we'll just verify it returns the success case.
});
