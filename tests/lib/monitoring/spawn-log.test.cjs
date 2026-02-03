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

test('spawn-log appends entries and trims to max lines', () => {
  const projectRoot = getProjectRoot();
  const logPath = getSpawnLogPath(projectRoot);

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
  const { logSpawnStart, logSpawnEnd, logMemoryFailure } = require(spawnLogPath);

  try {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }

    logSpawnStart({ taskId: 'task-1', agentType: 'developer', promptLength: 42 });
    logSpawnEnd({ taskId: 'task-1', success: true });
    logMemoryFailure({ taskId: 'task-1', error: 'boom' });

    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
  } finally {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    if (prevMax === undefined) {
      delete process.env.SPAWN_LOG_MAX_LINES;
    } else {
      process.env.SPAWN_LOG_MAX_LINES = prevMax;
    }
  }
});
