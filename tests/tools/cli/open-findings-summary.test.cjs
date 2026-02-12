'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  evaluate,
} = require('../../../.claude/tools/cli/open-findings-summary.cjs');

test('parseArgs reads json and threshold flags', () => {
  const opts = parseArgs([
    'node',
    'open-findings-summary.cjs',
    '--json',
    '--assert-max-open-critical',
    '0',
    '--assert-max-open-high',
    '2',
    '--assert-max-open-total',
    '3',
    '--require-data',
    'true',
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.assertMaxOpenCritical, 0);
  assert.equal(opts.assertMaxOpenHigh, 2);
  assert.equal(opts.assertMaxOpenTotal, 3);
  assert.equal(opts.requireData, true);
});

test('evaluate returns failures when thresholds are exceeded', () => {
  const summary = {
    total: 5,
    open: 4,
    resolved: 1,
    bySeverity: {
      critical: { open: 1 },
      high: { open: 3 },
    },
  };

  const failures = evaluate(summary, {
    requireData: true,
    assertMaxOpenCritical: 0,
    assertMaxOpenHigh: 2,
    assertMaxOpenTotal: 3,
  });

  assert.equal(failures.length, 3);
  assert.equal(failures.some(f => f.includes('critical')), true);
  assert.equal(failures.some(f => f.includes('high')), true);
  assert.equal(failures.some(f => f.includes('total')), true);
});

test('evaluate passes when findings are within thresholds', () => {
  const summary = {
    total: 2,
    open: 1,
    resolved: 1,
    bySeverity: {
      critical: { open: 0 },
      high: { open: 1 },
    },
  };

  const failures = evaluate(summary, {
    requireData: true,
    assertMaxOpenCritical: 0,
    assertMaxOpenHigh: 1,
    assertMaxOpenTotal: 1,
  });

  assert.deepEqual(failures, []);
});
