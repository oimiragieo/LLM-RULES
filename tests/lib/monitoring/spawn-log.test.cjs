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

function getSpawnLogPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'metrics', 'spawn-log.jsonl');
}

function getAssemblyMetricsPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'metrics', 'spawn-assembly-metrics.jsonl');
}

function getTokenBurnPath(projectRoot) {
  return path.join(projectRoot, '.claude', 'context', 'metrics', 'token-burn-metrics.jsonl');
}

test('spawn-log appends entries and trims to max lines', () => {
  const projectRoot = getProjectRoot();
  const logPath = getSpawnLogPath(projectRoot);
  const assemblyPath = getAssemblyMetricsPath(projectRoot);
  const tokenPath = getTokenBurnPath(projectRoot);

  const prevMax = process.env.SPAWN_LOG_MAX_LINES;
  process.env.SPAWN_LOG_MAX_LINES = '2';

  const spawnLogPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'lib',
    'monitoring',
    'spawn-log.cjs'
  );
  delete require.cache[spawnLogPath];
  const {
    logSpawnStart,
    logSpawnEnd,
    logMemoryFailure,
    logSpawnAssemblyMetric,
    logTokenBurnMetric,
    estimateTokensFromChars,
  } = require(spawnLogPath);

  try {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    if (fs.existsSync(assemblyPath)) {
      fs.unlinkSync(assemblyPath);
    }
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }

    logSpawnStart({ taskId: 'task-1', agentType: 'developer', promptLength: 42 });
    logSpawnEnd({ taskId: 'task-1', success: true });
    logMemoryFailure({ taskId: 'task-1', error: 'boom' });
    logSpawnAssemblyMetric({
      taskId: 'task-1',
      agentType: 'developer',
      totalMs: 12.345,
      phases: { assemble_ms: 5.5 },
      inputChars: 100,
      outputChars: 140,
    });
    logTokenBurnMetric({
      taskId: 'task-1',
      agentType: 'developer',
      inputChars: 100,
      outputChars: 140,
      elapsedMs: 20,
    });

    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);

    const assemblyLines = fs.readFileSync(assemblyPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(assemblyLines.length, 1);
    const assemblyRow = JSON.parse(assemblyLines[0]);
    assert.equal(assemblyRow.event, 'spawn_assembly');
    assert.equal(assemblyRow.total_ms, 12.345);

    const tokenLines = fs.readFileSync(tokenPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(tokenLines.length, 1);
    const tokenRow = JSON.parse(tokenLines[0]);
    assert.equal(tokenRow.event, 'token_burn');
    assert.equal(tokenRow.output_tokens_est, estimateTokensFromChars(140));
  } finally {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    if (fs.existsSync(assemblyPath)) {
      fs.unlinkSync(assemblyPath);
    }
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    if (prevMax === undefined) {
      delete process.env.SPAWN_LOG_MAX_LINES;
    } else {
      process.env.SPAWN_LOG_MAX_LINES = prevMax;
    }
  }
});
