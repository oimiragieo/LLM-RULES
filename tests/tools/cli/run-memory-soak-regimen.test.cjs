'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  runNodeTest,
} = require('../../../.claude/tools/cli/run-memory-soak-regimen.cjs');

test('parseArgs defaults', () => {
  const parsed = parseArgs(['node', 'run-memory-soak-regimen.cjs']);
  assert.equal(parsed.json, false);
  assert.equal(parsed.writeReport, true);
});

test('parseArgs reads flags', () => {
  const parsed = parseArgs([
    'node',
    'run-memory-soak-regimen.cjs',
    '--json',
    'true',
    '--write-report',
    'false',
  ]);
  assert.equal(parsed.json, true);
  assert.equal(parsed.writeReport, false);
});

test('runNodeTest returns non-zero for missing test file', () => {
  const run = runNodeTest('tests/does-not-exist.test.cjs');
  assert.notEqual(run.status, 0);
  assert.equal(typeof run.durationMs, 'number');
});
