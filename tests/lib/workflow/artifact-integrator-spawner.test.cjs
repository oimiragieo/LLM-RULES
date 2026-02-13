'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

test('C-003: artifact-integrator-spawner exports spawnArtifactIntegrator', () => {
  const spawner = require('../../../.claude/lib/workflow/artifact-integrator-spawner.cjs');
  assert.ok(typeof spawner.spawnArtifactIntegrator === 'function');
  assert.ok(typeof spawner.getQueueSize === 'function');
});

test('C-003: getQueueSize returns 0 for missing file', () => {
  const spawner = require('../../../.claude/lib/workflow/artifact-integrator-spawner.cjs');
  // getQueueSize should handle nonexistent file gracefully
  const size = spawner.getQueueSize('/nonexistent/path');
  assert.strictEqual(size, 0);
});

test('C-003: getQueueSize counts lines correctly', () => {
  const spawner = require('../../../.claude/lib/workflow/artifact-integrator-spawner.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c003-'));
  const queueFile = path.join(tmpDir, 'test-queue.jsonl');

  fs.writeFileSync(
    queueFile,
    [
      '{"type":"skill","id":"test-1"}',
      '{"type":"agent","id":"test-2"}',
      '{"type":"hook","id":"test-3"}',
    ].join('\n')
  );

  const size = spawner.getQueueSize(queueFile);
  assert.strictEqual(size, 3);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('C-003: getQueueSize handles empty file', () => {
  const spawner = require('../../../.claude/lib/workflow/artifact-integrator-spawner.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c003-'));
  const queueFile = path.join(tmpDir, 'empty-queue.jsonl');

  fs.writeFileSync(queueFile, '');

  const size = spawner.getQueueSize(queueFile);
  assert.strictEqual(size, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('C-003: post-creation-integration hook detects queue threshold', () => {
  // Verify the hook source contains the threshold logic after fix
  const hookPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '.claude',
    'hooks',
    'workflow',
    'post-creation-integration.cjs'
  );
  const source = fs.readFileSync(hookPath, 'utf8');
  assert.ok(
    source.includes('INTEGRATION_BATCH_SIZE') || source.includes('getQueueSize'),
    'Hook must contain queue threshold logic'
  );
});
