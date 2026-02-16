'use strict';

const path = require('path');
const fs = require('fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');

function getProjectRoot() {
  const rootPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'lib',
    'utils',
    'project-root.cjs'
  );
  return require(rootPath).PROJECT_ROOT;
}

test('router-churn-log writes metrics row', () => {
  const projectRoot = getProjectRoot();
  const metricsPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'metrics',
    'router-churn-metrics.jsonl'
  );
  const modulePath = path.join(projectRoot, '.claude', 'lib', 'monitoring', 'router-churn-log.cjs');
  const hadExistingMetrics = fs.existsSync(metricsPath);
  const existingMetricsContent = hadExistingMetrics ? fs.readFileSync(metricsPath, 'utf8') : null;
  fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
  fs.writeFileSync(metricsPath, '', 'utf8');

  try {
    delete require.cache[modulePath];
    const { logRouterChurnEvent, logRouterCostRiskEvent, logRouterSloAlert } = require(modulePath);

    logRouterChurnEvent({
      sessionId: 's1',
      toolName: 'Task',
      checkName: 'planner-first-guard',
      result: 'block',
      durationMs: 12.4,
      dedupeCount: 2,
      messageLength: 33,
    });

    const lines = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    const rows = lines.map(line => JSON.parse(line));
    const row = rows.find(
      entry => entry.event === 'router_guard_decision' && entry.session_id === 's1'
    );
    assert.ok(row, 'router_guard_decision row should exist for session s1');
    assert.equal(row.event, 'router_guard_decision');
    assert.equal(row.result, 'block');
    assert.equal(row.check, 'planner-first-guard');
    assert.equal(row.dedupe_count, 2);

    logRouterCostRiskEvent({
      sessionId: 's1',
      score: 67.12,
      level: 'high',
      factors: { tokenPercentUsed: 92.1, complexity: 'high' },
    });
    logRouterSloAlert({
      sessionId: 's1',
      severity: 'critical',
      sloName: 'token_utilization',
      value: 0.99,
      threshold: 0.95,
      downgraded: true,
      breachCount: 4,
    });

    const linesAfter = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    const rowsAfter = linesAfter.map(line => JSON.parse(line));
    const riskRow = rowsAfter.find(
      entry => entry.event === 'router_cost_risk' && entry.session_id === 's1'
    );
    const sloRow = rowsAfter.find(
      entry => entry.event === 'router_slo_alert' && entry.session_id === 's1'
    );
    assert.ok(riskRow, 'router_cost_risk row should exist for session s1');
    assert.ok(sloRow, 'router_slo_alert row should exist for session s1');
    assert.equal(riskRow.event, 'router_cost_risk');
    assert.equal(riskRow.level, 'high');
    assert.equal(sloRow.event, 'router_slo_alert');
    assert.equal(sloRow.downgraded, true);
  } finally {
    if (hadExistingMetrics) {
      fs.writeFileSync(metricsPath, existingMetricsContent, 'utf8');
    } else if (fs.existsSync(metricsPath)) {
      fs.unlinkSync(metricsPath);
    }
  }
});
