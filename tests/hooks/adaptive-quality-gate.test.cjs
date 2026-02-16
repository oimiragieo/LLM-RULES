#!/usr/bin/env node
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'hooks',
  'session',
  'adaptive-quality-gate.cjs'
);

test('adaptive-quality-gate tolerates malformed counter/metrics JSON and exits 0', () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adaptive-quality-gate-'));
  try {
    fs.writeFileSync(path.join(runtimeDir, 'edit-counter.json'), '{bad json', 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'session-metrics.json'), '{bad json', 'utf8');

    const result = spawnSync(process.execPath, [HOOK_PATH], {
      input: '{"tool_name":"Edit"}',
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, CLAUDE_RUNTIME_DIR: runtimeDir },
    });

    assert.strictEqual(result.status, 0);

    const counter = JSON.parse(fs.readFileSync(path.join(runtimeDir, 'edit-counter.json'), 'utf8'));
    assert.strictEqual(counter.count, 1);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});
