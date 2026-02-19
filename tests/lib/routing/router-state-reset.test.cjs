'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const MODULE_PATH = '../../../.claude/lib/routing/router-state.cjs';

test('resetToRouterMode preserves unknown fields via merge-based save', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-state-reset-'));
  const stateFile = path.join(tmpDir, 'router-state.json');

  process.env.ROUTER_STATE_FILE = stateFile;

  const seededState = {
    mode: 'agent',
    taskSpawned: true,
    version: 3,
    customMarker: 'preserve-me',
  };
  fs.writeFileSync(stateFile, JSON.stringify(seededState, null, 2), 'utf8');

  delete require.cache[require.resolve(MODULE_PATH)];
  const routerState = require(MODULE_PATH);

  const resetState = routerState.resetToRouterMode();

  assert.equal(resetState.mode, 'router');
  assert.equal(resetState.taskSpawned, false);
  assert.equal(resetState.customMarker, 'preserve-me');
  assert.equal(resetState.version, 4);

  const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(persisted.customMarker, 'preserve-me');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.ROUTER_STATE_FILE;
});
