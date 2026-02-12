'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  evaluate,
} = require('../../../.claude/tools/cli/open-findings-trend-summary.cjs');

test('parseArgs reads trend summary flags', () => {
  const opts = parseArgs([
    'node',
    'open-findings-trend-summary.cjs',
    '--json',
    '--days',
    '14',
    '--require-data',
    'true',
    '--assert-max-open-delta',
    '2',
  ]);

  assert.equal(opts.json, true);
  assert.equal(opts.days, 14);
  assert.equal(opts.requireData, true);
  assert.equal(opts.assertMaxOpenDelta, 2);
});

test('evaluate returns failures when trend thresholds are exceeded', () => {
  const summary = {
    sampleCount: 3,
    openDelta: 5,
  };

  const failures = evaluate(summary, {
    requireData: true,
    assertMaxOpenDelta: 2,
  });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].includes('delta'), true);
});

test('evaluate passes when trend is within limits', () => {
  const summary = {
    sampleCount: 4,
    openDelta: -1,
  };

  const failures = evaluate(summary, {
    requireData: true,
    assertMaxOpenDelta: 0,
  });

  assert.deepEqual(failures, []);
});
