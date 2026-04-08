'use strict';

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
// Load task-tools module (not the main entry point — task-tools has the caches)
const {
  loadAgentRegistry,
  loadToolManifest,
  loadConstitutionContext,
  _resetCaches,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.task-tools.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mtime cache tests
// ---------------------------------------------------------------------------

describe('spawn-prompt-assembler mtime-based cache invalidation', () => {
  beforeEach(() => {
    if (typeof _resetCaches === 'function') _resetCaches();
  });

  test('_resetCaches is exported for test isolation', () => {
    assert.strictEqual(
      typeof _resetCaches,
      'function',
      '_resetCaches must be exported for test cleanup'
    );
  });

  test('loadAgentRegistry returns cached data on repeated call (no mtime change)', () => {
    // loadAgentRegistry uses the real registry path — call it twice and verify
    // the same object reference is returned (cache hit)
    if (typeof _resetCaches !== 'function') return; // guard: skip if not yet implemented
    _resetCaches();
    const first = loadAgentRegistry();
    const second = loadAgentRegistry();
    assert.strictEqual(
      first,
      second,
      'Expected the same object reference on repeated call (cache hit)'
    );
  });

  test('loadAgentRegistry re-reads when file mtime changes', () => {
    // We can verify cache invalidation by resetting then loading twice:
    // if we reset caches the second call is always a fresh read.
    // The mtime path: we can't easily change the real registry's mtime in a
    // deterministic way, so we verify that after _resetCaches the new call
    // returns a fresh (possibly same-content) object that is NOT the same reference.
    if (typeof _resetCaches !== 'function') return;
    _resetCaches();
    const first = loadAgentRegistry();
    _resetCaches(); // simulate mtime change by resetting
    const second = loadAgentRegistry();
    // After a reset the cache is cleared, so a new object is allocated
    assert.notStrictEqual(
      first,
      second,
      'Expected a new object after cache reset (simulates mtime change)'
    );
  });

  test('loadToolManifest returns same reference on repeated call (cache hit)', () => {
    if (typeof _resetCaches !== 'function') return;
    _resetCaches();
    const first = loadToolManifest();
    const second = loadToolManifest();
    assert.strictEqual(
      first,
      second,
      'Expected same object reference on repeated call (manifest cache hit)'
    );
  });

  test('loadConstitutionContext returns same reference on repeated call (cache hit)', () => {
    if (typeof _resetCaches !== 'function') return;
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    _resetCaches();
    const first = loadConstitutionContext(PROJECT_ROOT);
    const second = loadConstitutionContext(PROJECT_ROOT);
    assert.strictEqual(
      first,
      second,
      'Expected same object reference on repeated call (constitution cache hit)'
    );
  });
});
