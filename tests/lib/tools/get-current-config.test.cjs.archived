'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runGetCurrentConfig } = require('../../../.claude/tools/cli/get-current-config.cjs');

test('runGetCurrentConfig returns active/inactive tool lists', () => {
  const result = runGetCurrentConfig({
    contextName: 'claude-code',
    modeNames: ['planning'],
    role: 'developer',
    quiet: true,
  });

  assert.ok(Array.isArray(result.activeTools));
  assert.ok(Array.isArray(result.inactiveTools));
  assert.equal(result.contextName, 'claude-code');
  assert.deepEqual(result.modeNames, ['planning']);

  const activeSet = new Set(result.activeTools);
  assert.equal(activeSet.has('Write'), false);
  assert.equal(activeSet.has('Edit'), false);
  assert.equal(activeSet.has('Bash'), false);
  assert.equal(activeSet.has('NotebookEdit'), false);

  assert.ok(result.inactiveTools.includes('Write'));
});
