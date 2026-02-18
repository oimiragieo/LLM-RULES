const { describe, test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const memoryManager = require('../../../.claude/lib/memory/memory-manager.cjs');

const TEST_ROOT = path.resolve(__dirname, '..', 'context', 'memory', '.test-memory-dedup');
const MEMORY_DIR = path.join(TEST_ROOT, '.claude', 'context', 'memory');
const GOTCHAS_FILE = path.join(MEMORY_DIR, 'gotchas.json');

function resetFixture() {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function readGotchas() {
  if (!fs.existsSync(GOTCHAS_FILE)) return [];
  return JSON.parse(fs.readFileSync(GOTCHAS_FILE, 'utf8'));
}

function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value == null) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (prev == null) delete process.env[name];
    else process.env[name] = prev;
  }
}

beforeEach(() => {
  resetFixture();
});

after(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('memory dedup integration (S9-S11)', () => {
  test('S9: identical gotcha is skipped and file length remains unchanged', () => {
    withEnv('MEMORY_DEDUP_ENABLED', 'on', () => {
      const first = memoryManager.recordGotcha('Avoid raw JSON.parse in hooks', TEST_ROOT);
      const second = memoryManager.recordGotcha('Avoid raw JSON.parse in hooks', TEST_ROOT);

      assert.equal(first, true);
      assert.equal(second, false);
      const gotchas = readGotchas();
      assert.equal(gotchas.length, 1);
    });
  });

  test('S10: similar-but-not-duplicate gotcha is created', () => {
    withEnv('MEMORY_DEDUP_ENABLED', 'on', () => {
      const first = memoryManager.recordGotcha(
        'Block direct writes to structured memory files by default',
        TEST_ROOT
      );
      const second = memoryManager.recordGotcha(
        'Route reflection memory updates through MemoryRecord with source metadata',
        TEST_ROOT
      );

      assert.equal(first, true);
      assert.equal(second, true);
      const gotchas = readGotchas();
      assert.equal(gotchas.length, 2);
    });
  });

  test('S11: dedup failure falls back to create and tags entry with error_fallback_create', () => {
    withEnv('MEMORY_DEDUP_ENABLED', 'on', () => {
      withEnv('MEMORY_DEDUP_FORCE_ERROR', '1', () => {
        const wrote = memoryManager.recordGotcha(
          'Fallback write when dedup service is unavailable',
          TEST_ROOT
        );
        assert.equal(wrote, true);
      });
    });

    const gotchas = readGotchas();
    assert.equal(gotchas.length, 1);
    assert.equal(gotchas[0].dedupStatus, 'error_fallback_create');
  });
});
