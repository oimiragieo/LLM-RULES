'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { calculateRouterRollups } = require('../../../.claude/lib/monitoring/metrics-reader.cjs');

test('calculateRouterRollups computes p50/p95 token usage and reject rates', () => {
  const rollups = calculateRouterRollups({
    spawnRows: [
      { event: 'spawn_start', prompt_length: 1200 },
      { event: 'spawn_start', prompt_length: 1800 },
      { event: 'spawn_end', success: true },
      { event: 'spawn_end', success: false },
      { event: 'spawn_end', success: true },
    ],
    tokenRows: [
      { output_tokens_est: 100 },
      { output_tokens_est: 200 },
      { output_tokens_est: 500 },
      { output_tokens_est: 800 },
    ],
    churnRows: [
      { event: 'router_guard_decision', result: 'allow' },
      { event: 'router_guard_decision', result: 'block' },
      { event: 'router_guard_decision', result: 'block' },
    ],
    violationRows: [
      { checkName: 'routerSelfCheck' },
      { checkName: 'routerSelfCheck' },
      { checkName: 'routerBashCheck' },
    ],
    hours: 6,
  });

  assert.equal(rollups.spawns.total, 3);
  assert.equal(rollups.spawns.rejected, 1);
  assert.ok(rollups.spawns.rejectRate > 0.3 && rollups.spawns.rejectRate < 0.34);
  assert.equal(rollups.tokenUsage.p50, 500);
  assert.equal(rollups.tokenUsage.p95, 800);
  assert.equal(rollups.violations.total, 3);
  assert.ok(Array.isArray(rollups.violations.byRuleTop));
  assert.equal(rollups.violations.byRuleTop[0].rule, 'routerSelfCheck');
});
