'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const MODULE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '.claude',
  'lib',
  'mission',
  'features-state-machine.cjs'
);

function clearModuleCache() {
  // Clear the target module and AJV from require cache
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes('features-state-machine') ||
      key.includes('ajv') ||
      key.includes('ajv-formats')
    ) {
      delete require.cache[key];
    }
  }
}

describe('features-state-machine lazy AJV loading', () => {
  beforeEach(() => {
    clearModuleCache();
  });

  it('does not load AJV on bare require (non-validation imports)', () => {
    clearModuleCache();
    const mod = require(MODULE_PATH);

    // VALID_TRANSITIONS and detectCircularDependencies should be usable
    assert.ok(mod.VALID_TRANSITIONS, 'VALID_TRANSITIONS should be exported');
    assert.ok(mod.detectCircularDependencies, 'detectCircularDependencies should be exported');

    // AJV should NOT be in require.cache yet
    const ajvKeys = Object.keys(require.cache).filter(
      k => k.includes('ajv') && !k.includes('features-state-machine')
    );
    assert.equal(ajvKeys.length, 0, 'AJV should not be loaded on bare require');
  });

  it('VALID_TRANSITIONS and detectCircularDependencies work without AJV', () => {
    clearModuleCache();
    const mod = require(MODULE_PATH);

    // VALID_TRANSITIONS should have expected states
    assert.deepEqual(Object.keys(mod.VALID_TRANSITIONS).sort(), [
      'cancelled',
      'completed',
      'failed',
      'in_progress',
      'pending',
      'validating',
    ]);

    // detectCircularDependencies returns null for acyclic graphs
    const features = [
      { id: 'a', preconditions: [] },
      { id: 'b', preconditions: ['a'] },
    ];
    const result = mod.detectCircularDependencies(features);
    assert.equal(result, null, 'No cycles should return null');
  });

  it('loadFeatures triggers AJV loading and validates correctly', () => {
    clearModuleCache();
    const mod = require(MODULE_PATH);

    // Create valid features.json
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-lazy-'));
    const featuresPath = path.join(tmpDir, 'features.json');
    fs.writeFileSync(
      featuresPath,
      JSON.stringify({
        features: [
          {
            id: 'test-feature',
            description: 'A test feature',
            status: 'pending',
          },
        ],
      }),
      'utf8'
    );

    try {
      const machine = mod.loadFeatures(featuresPath);
      assert.ok(machine, 'loadFeatures should return a machine');

      // AJV should NOW be loaded
      const ajvKeys = Object.keys(require.cache).filter(
        k => k.includes('ajv') && !k.includes('features-state-machine')
      );
      assert.ok(ajvKeys.length > 0, 'AJV should be loaded after validation');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loadFeatures rejects invalid features.json with SCHEMA_VALIDATION_ERROR', () => {
    clearModuleCache();
    const mod = require(MODULE_PATH);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsm-lazy-'));
    const featuresPath = path.join(tmpDir, 'features.json');
    fs.writeFileSync(featuresPath, JSON.stringify({ features: [{ bad: true }] }), 'utf8');

    try {
      assert.throws(
        () => mod.loadFeatures(featuresPath),
        err => {
          assert.ok(
            err.code === 'SCHEMA_VALIDATION_ERROR' || err.message.includes('validation'),
            `Expected schema error, got: ${err.message}`
          );
          return true;
        }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
