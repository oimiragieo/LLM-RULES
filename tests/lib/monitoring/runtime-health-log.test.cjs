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

test('runtime-health-log writes runtime row', () => {
  const projectRoot = getProjectRoot();
  const metricsPath = path.join(
    projectRoot,
    '.claude',
    'context',
    'metrics',
    'runtime-health-metrics.jsonl'
  );
  const modulePath = path.join(
    projectRoot,
    '.claude',
    'lib',
    'monitoring',
    'runtime-health-log.cjs'
  );
  delete require.cache[modulePath];
  const { logRuntimeHealth } = require(modulePath);

  try {
    if (fs.existsSync(metricsPath)) fs.unlinkSync(metricsPath);

    logRuntimeHealth({
      component: 'spawn-prompt-assembler',
      status: 'ok',
      durationMs: 22.5,
      sessionId: 's1',
      extra: { task_id: 'task-1' },
    });

    const lines = fs.readFileSync(metricsPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.equal(row.event, 'runtime_health');
    assert.equal(row.component, 'spawn-prompt-assembler');
    assert.equal(row.status, 'ok');
    assert.ok(Number.isFinite(row.heap_used_mb));
  } finally {
    if (fs.existsSync(metricsPath)) fs.unlinkSync(metricsPath);
  }
});
