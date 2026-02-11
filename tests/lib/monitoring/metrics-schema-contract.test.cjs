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

test('monitoring JSONL outputs satisfy metric schema contracts', () => {
  const projectRoot = getProjectRoot();
  const metricsDir = path.join(projectRoot, '.claude', 'context', 'metrics');
  const marker = `schema-contract-${Date.now()}`;
  const paths = {
    spawn: path.join(metricsDir, 'spawn-log.jsonl'),
    token: path.join(metricsDir, 'token-burn-metrics.jsonl'),
    churn: path.join(metricsDir, 'router-churn-metrics.jsonl'),
    runtime: path.join(metricsDir, 'runtime-health-metrics.jsonl'),
    violations: path.join(metricsDir, 'router-violations.jsonl'),
  };

  const spawnLogPath = path.join(projectRoot, '.claude', 'lib', 'monitoring', 'spawn-log.cjs');
  const routerChurnPath = path.join(
    projectRoot,
    '.claude',
    'lib',
    'monitoring',
    'router-churn-log.cjs'
  );
  const runtimePath = path.join(projectRoot, '.claude', 'lib', 'monitoring', 'runtime-health-log.cjs');
  const violationPath = path.join(
    projectRoot,
    '.claude',
    'lib',
    'monitoring',
    'violation-tracker.cjs'
  );
  const schemaPath = path.join(projectRoot, '.claude', 'lib', 'monitoring', 'metrics-schema.cjs');

  delete require.cache[spawnLogPath];
  delete require.cache[routerChurnPath];
  delete require.cache[runtimePath];
  delete require.cache[violationPath];
  delete require.cache[schemaPath];

  const { logSpawnStart, logSpawnEnd, logTokenBurnMetric } = require(spawnLogPath);
  const { logRouterChurnEvent, logRouterCostRiskEvent, logRouterSloAlert } = require(routerChurnPath);
  const { logRuntimeHealth } = require(runtimePath);
  const { recordViolation, _resetForTesting } = require(violationPath);
  const { validateMetricRow } = require(schemaPath);

  logSpawnStart({ taskId: marker, agentType: 'developer', promptLength: 1234, sessionId: marker });
  logSpawnEnd({ taskId: marker, success: true, sessionId: marker });
    logTokenBurnMetric({
      taskId: marker,
      agentType: 'developer',
      sessionId: marker,
      inputChars: 200,
      outputChars: 400,
      elapsedMs: 25,
    });
    logRouterChurnEvent({
      sessionId: marker,
      toolName: 'Task',
      checkName: 'router-self-check',
      result: 'allow',
      durationMs: 1.2,
      dedupeCount: 0,
      messageLength: 12,
    });
    logRouterCostRiskEvent({
      sessionId: marker,
      score: 33.3,
      level: 'low',
      factors: { tokenPercentUsed: 21 },
    });
    logRouterSloAlert({
      sessionId: marker,
      severity: 'warning',
      sloName: 'token_utilization',
      value: 0.85,
      threshold: 0.8,
      downgraded: false,
      breachCount: 1,
    });
  logRuntimeHealth({ component: 'schema-contract', status: 'ok', durationMs: 3.4, sessionId: marker });
    _resetForTesting();
    recordViolation({
      timestamp: new Date().toISOString(),
      tool: 'Grep',
      action: 'warn',
      checkName: 'routerSelfCheck',
      routerMode: 'router',
      taskSpawned: false,
    sessionId: marker,
    });

  const parseRows = filePath => {
    if (!fs.existsSync(filePath)) return [];
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  };

  const selectedRows = [
    ...parseRows(paths.spawn).filter(row => row.task_id === marker),
    ...parseRows(paths.token).filter(row => row.task_id === marker),
    ...parseRows(paths.churn).filter(row => row.session_id === marker),
    ...parseRows(paths.runtime).filter(row => row.session_id === marker),
    ...parseRows(paths.violations).filter(row => row.sessionId === marker),
  ];

  assert.ok(selectedRows.length >= 7, 'expected emitted monitoring rows for marker');
  selectedRows.forEach(row => {
    const validation = validateMetricRow(row);
    assert.equal(validation.valid, true, `schema validation failed: ${validation.errors.join(', ')}`);
  });
});
