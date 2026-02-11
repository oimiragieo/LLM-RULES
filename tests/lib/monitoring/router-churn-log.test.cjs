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
  delete require.cache[modulePath];
  const { logRouterChurnEvent } = require(modulePath);

  try {
    if (fs.existsSync(metricsPath)) fs.unlinkSync(metricsPath);

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
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.equal(row.event, 'router_guard_decision');
    assert.equal(row.result, 'block');
    assert.equal(row.check, 'planner-first-guard');
    assert.equal(row.dedupe_count, 2);
  } finally {
    if (fs.existsSync(metricsPath)) fs.unlinkSync(metricsPath);
  }
});
