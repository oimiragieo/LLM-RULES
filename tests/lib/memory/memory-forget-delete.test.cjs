'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_PROJECT_ROOT = path.join(__dirname, '.test-memory', '.test-forget');
const MEMORY_DIR = path.join(TEST_PROJECT_ROOT, '.claude', 'context', 'memory');

function setup() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function cleanup() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true, force: true });
  }
}

function buildId(entry) {
  const text = entry?.text || '';
  const ts = entry?.timestamp || '';
  const category = entry?.category || '';
  const area = entry?.area || '';
  const base = `${text}\n${ts}\n${category}\n${area}`;
  return crypto.createHash('sha1').update(base).digest('hex');
}

test('recordGotcha/recordPattern add area and id', () => {
  setup();
  try {
    delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
    const memory = require('../../../.claude/lib/memory/memory-manager.cjs');
    const okGotcha = memory.recordGotcha('Always close DB connections', TEST_PROJECT_ROOT);
    const okPattern = memory.recordPattern('Use async/await', TEST_PROJECT_ROOT);
    assert.strictEqual(okGotcha, true);
    assert.strictEqual(okPattern, true);

    const gotchas = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'gotchas.json'), 'utf8'));
    const patterns = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'patterns.json'), 'utf8'));

    assert.ok(gotchas[0].id, 'Gotcha should have id');
    assert.strictEqual(gotchas[0].area, 'main');
    assert.ok(patterns[0].id, 'Pattern should have id');
    assert.strictEqual(patterns[0].area, 'main');
  } finally {
    cleanup();
  }
});

test('deleteMemoryByIds removes entries across gotchas and patterns', () => {
  setup();
  try {
    const gotchaEntry = {
      text: 'Avoid sync fs',
      timestamp: new Date().toISOString(),
      accessCount: 0,
      lastAccessed: null,
      area: 'main',
    };
    gotchaEntry.id = buildId(gotchaEntry);

    const patternEntry = {
      text: 'Use parameter validation',
      timestamp: new Date().toISOString(),
      accessCount: 0,
      lastAccessed: null,
      area: 'main',
    };
    patternEntry.id = buildId(patternEntry);

    fs.writeFileSync(path.join(MEMORY_DIR, 'gotchas.json'), JSON.stringify([gotchaEntry], null, 2));
    fs.writeFileSync(
      path.join(MEMORY_DIR, 'patterns.json'),
      JSON.stringify([patternEntry], null, 2)
    );

    delete require.cache[require.resolve('../../../.claude/lib/memory/memory-manager.cjs')];
    const memory = require('../../../.claude/lib/memory/memory-manager.cjs');
    const result = memory.deleteMemoryByIds([gotchaEntry.id, patternEntry.id], TEST_PROJECT_ROOT);

    assert.strictEqual(result.deleted, 2);

    const gotchas = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'gotchas.json'), 'utf8'));
    const patterns = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'patterns.json'), 'utf8'));
    assert.strictEqual(gotchas.length, 0);
    assert.strictEqual(patterns.length, 0);
  } finally {
    cleanup();
  }
});
