'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const {
  loadContext,
  loadMode,
  listContextNames,
  listModeNames,
} = require(path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'lib',
  'config',
  'context-mode-loader.cjs'
));

const CONFIG_DIR = path.join(__dirname, '..', '..', '..', '.claude', 'config');

test('loadContext loads default claude-code context', () => {
  const context = loadContext('claude-code');
  assert.ok(context, 'context should load');
  assert.strictEqual(context.name, 'claude-code');
  assert.ok(context.prompt && context.prompt.length > 0);
});

test('loadMode loads default planning mode', () => {
  const mode = loadMode('planning');
  assert.ok(mode, 'mode should load');
  assert.strictEqual(mode.name, 'planning');
  assert.ok(mode.prompt && mode.prompt.length > 0);
});

test('listContextNames and listModeNames include defaults', () => {
  const contexts = listContextNames();
  const modes = listModeNames();
  assert.ok(contexts.includes('claude-code'));
  assert.ok(modes.includes('planning'));
  assert.ok(modes.includes('editing'));
});

test('loadMode returns null for invalid yaml', () => {
  const invalidPath = path.join(CONFIG_DIR, 'modes', 'invalid-test.yml');
  fs.writeFileSync(invalidPath, 'name: invalid\nprompt: [', 'utf8');
  try {
    const mode = loadMode('invalid-test');
    assert.strictEqual(mode, null);
  } finally {
    fs.unlinkSync(invalidPath);
  }
});
