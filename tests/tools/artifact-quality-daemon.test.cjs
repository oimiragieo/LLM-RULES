#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const daemon = require('../../.claude/tools/cli/artifact-quality-daemon.cjs');

function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-quality-daemon-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), { recursive: true });
  return root;
}

test('parseArgs supports mode/project-root/interval/json', () => {
  const parsed = daemon.parseArgs(['--mode', 'once', '--project-root', 'C:\\tmp', '--interval-ms', '5000', '--json']);
  assert.equal(parsed.mode, 'once');
  assert.equal(parsed.intervalMs, 5000);
  assert.equal(parsed.json, true);
});

test('runOnce writes state heartbeat', async () => {
  const root = mkRoot();
  const result = await daemon.runOnce({
    mode: 'once',
    projectRoot: root,
    intervalMs: 2000,
    json: true,
  });
  assert.equal(result.gate.ok, true);
  assert.ok(result.state.heartbeatAt);
  assert.equal(result.state.lastCycleOk, true);

  const statePath = daemon.getDaemonPaths(root).statePath;
  assert.equal(fs.existsSync(statePath), true);
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.lastCycleOk, true);
});
