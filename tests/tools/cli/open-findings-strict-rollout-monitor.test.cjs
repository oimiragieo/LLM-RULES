'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  evaluate,
} = require('../../../.claude/tools/cli/open-findings-strict-rollout-monitor.cjs');

test('parseArgs returns strict rollout defaults', () => {
  const parsed = parseArgs(['node', 'open-findings-strict-rollout-monitor.cjs']);
  assert.equal(parsed.days, 7);
  assert.equal(parsed.staleDays, 3);
  assert.equal(parsed.assertMaxOpenDelta, 0);
  assert.equal(parsed.assertMaxStaleOpen, 0);
});

test('evaluate reports failures for delta/stale/critical thresholds', () => {
  const failures = evaluate(
    { bySeverity: { critical: { open: 1 } } },
    { openDelta: 3 },
    2,
    { assertMaxOpenDelta: 0, assertMaxStaleOpen: 0 }
  );

  assert.equal(failures.length, 3);
  assert.match(failures.join('\n'), /delta/i);
  assert.match(failures.join('\n'), /stale/i);
  assert.match(failures.join('\n'), /Critical/i);
});
