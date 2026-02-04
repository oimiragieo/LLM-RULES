'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { recordMemory } = require('../../../.claude/tools/cli/memory-record.cjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('recordMemory writes pattern entry', () => {
  const baseTmp = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(baseTmp, 'memory-record-'));
  const result = recordMemory({
    type: 'pattern',
    text: 'Use async/await for API calls',
    projectRoot: tmpRoot,
  });

  assert.equal(result.type, 'pattern');
  assert.equal(result.added, true);
  assert.ok(fs.existsSync(result.file));
  const data = readJson(result.file);
  assert.equal(data.length, 1);
  assert.equal(data[0].text, 'Use async/await for API calls');
});

test('recordMemory writes gotcha entry', () => {
  const baseTmp = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(baseTmp, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(baseTmp, 'memory-record-'));
  const result = recordMemory({
    type: 'gotcha',
    text: 'Avoid sync fs in hooks',
    projectRoot: tmpRoot,
  });

  assert.equal(result.type, 'gotcha');
  assert.equal(result.added, true);
  assert.ok(fs.existsSync(result.file));
  const data = readJson(result.file);
  assert.equal(data.length, 1);
  assert.equal(data[0].text, 'Avoid sync fs in hooks');
});

test('recordMemory rejects missing text', () => {
  assert.throws(() => {
    recordMemory({ type: 'pattern', text: '', projectRoot: os.tmpdir() });
  }, /Text is required/);
});
