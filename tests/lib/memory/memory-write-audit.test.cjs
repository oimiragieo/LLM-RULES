const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let auditMemoryWriteSources;
let migrateMemoryWriteSources;

const TEST_ROOT = path.resolve(__dirname, '..', 'context', 'memory', '.test-memory-write-audit');
const MEMORY_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory');

function resetFixture() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

beforeEach(() => {
  resetFixture();
});

after(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

beforeEach(async () => {
  if (!auditMemoryWriteSources || !migrateMemoryWriteSources) {
    const mod = await import('../../../.claude/tools/maintenance/memory-write-audit.mjs');
    auditMemoryWriteSources = mod.auditMemoryWriteSources;
    migrateMemoryWriteSources = mod.migrateMemoryWriteSources;
  }
});

describe('memory write audit and migration (S15-S16)', () => {
  test('S15: audit reports violations for missing/direct_write sources', () => {
    writeJson(path.join(MEMORY_DIR, 'gotchas.json'), [
      { text: 'missing source field' },
      { text: 'direct write source', writeSource: 'direct_write' },
    ]);
    writeJson(path.join(MEMORY_DIR, 'patterns.json'), [
      { text: 'valid', writeSource: 'memory_api' },
    ]);

    const result = auditMemoryWriteSources(TEST_ROOT);
    assert.equal(result.violationCount, 2);
    assert.equal(result.ok, false);
  });

  test('S16: migration backfills writeSource and audit passes after apply', () => {
    writeJson(path.join(MEMORY_DIR, 'gotchas.json'), [{ text: 'old entry no source' }]);
    writeJson(path.join(MEMORY_DIR, 'patterns.json'), [{ text: 'old pattern no source' }]);

    const migration = migrateMemoryWriteSources(TEST_ROOT, { apply: true, source: 'memory_api' });
    assert.equal(migration.updatedEntries, 2);

    const result = auditMemoryWriteSources(TEST_ROOT);
    assert.equal(result.violationCount, 0);
    assert.equal(result.ok, true);
  });

  test('S16b: migration rewrites direct_write entries to the configured source', () => {
    writeJson(path.join(MEMORY_DIR, 'gotchas.json'), [
      { text: 'legacy direct write', writeSource: 'direct_write' },
    ]);
    writeJson(path.join(MEMORY_DIR, 'patterns.json'), [
      { text: 'valid', writeSource: 'memory_api' },
    ]);

    const migration = migrateMemoryWriteSources(TEST_ROOT, { apply: true, source: 'memory_api' });
    assert.equal(migration.updatedEntries, 1);

    const gotchas = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'gotchas.json'), 'utf8'));
    assert.equal(gotchas[0].writeSource, 'memory_api');

    const result = auditMemoryWriteSources(TEST_ROOT);
    assert.equal(result.violationCount, 0);
    assert.equal(result.ok, true);
  });
});
