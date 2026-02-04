'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSwitchModes } = require('../../../.claude/tools/cli/switch-modes.cjs');

function writeMode(projectRoot, name) {
  const modesDir = path.join(projectRoot, '.claude', 'config', 'modes');
  fs.mkdirSync(modesDir, { recursive: true });
  const filePath = path.join(modesDir, name + '.yml');
  fs.writeFileSync(filePath, 'name: ' + name + '\n' + 'prompt: test\n');
}

test('runSwitchModes writes current-modes.json for valid modes', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-modes-'));
  writeMode(tmpRoot, 'planning');

  const result = runSwitchModes({ projectRoot: tmpRoot, modeNames: ['planning'] });
  assert.equal(result.ok, true);

  const modesPath = path.join(tmpRoot, '.claude', 'context', 'runtime', 'current-modes.json');
  assert.ok(fs.existsSync(modesPath));
  const stored = JSON.parse(fs.readFileSync(modesPath, 'utf8'));
  assert.deepEqual(stored.modes, ['planning']);
});

test('runSwitchModes fails for invalid modes without writing', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-studio-modes-'));
  writeMode(tmpRoot, 'planning');

  const result = runSwitchModes({ projectRoot: tmpRoot, modeNames: ['unknown'] });
  assert.equal(result.ok, false);

  const modesPath = path.join(tmpRoot, '.claude', 'context', 'runtime', 'current-modes.json');
  assert.equal(fs.existsSync(modesPath), false);
});
