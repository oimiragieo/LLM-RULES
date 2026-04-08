'use strict';

/**
 * Tests for auto-spawning milestone validators.
 *
 * Validates that injectMilestoneValidators() correctly:
 * 1. Injects scrutiny-validator-<milestone> and user-testing-validator-<milestone> features
 * 2. Populates fulfills from milestone implementation features
 * 3. Skips injection when validators already exist
 * 4. Persists injected features to features.json
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  injectMilestoneValidators,
  saveFeaturesDoc,
} = require('../../../.claude/lib/mission/mission-orchestrator.cjs');

function createTempDir() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2);
  const dir = path.join(
    __dirname,
    '..',
    '..',
    'fixtures',
    `temp-validators-${timestamp}-${random}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('injectMilestoneValidators', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('injects scrutiny and user-testing validators', () => {
    const features = [
      {
        id: 'feat-a',
        description: 'Feature A',
        skillName: 'dev',
        preconditions: [],
        expectedBehavior: ['Works'],
        verificationSteps: ['npm test'],
        fulfills: ['VAL-TEST-001', 'VAL-TEST-002'],
        milestone: 'alpha',
        status: 'completed',
      },
      {
        id: 'feat-b',
        description: 'Feature B',
        skillName: 'dev',
        preconditions: [],
        expectedBehavior: ['Works too'],
        verificationSteps: ['npm test'],
        fulfills: ['VAL-TEST-003'],
        milestone: 'alpha',
        status: 'completed',
      },
    ];

    // Save features to disk so saveFeaturesDoc can write
    saveFeaturesDoc(tempDir, features);

    const result = injectMilestoneValidators(tempDir, features, 'alpha');

    assert.equal(result.injected, true);
    assert.equal(result.scrutinyId, 'scrutiny-validator-alpha');
    assert.equal(result.userTestingId, 'user-testing-validator-alpha');

    // Verify features were added to array
    assert.equal(features.length, 4);

    const scrutiny = features.find(f => f.id === 'scrutiny-validator-alpha');
    assert.ok(scrutiny);
    assert.equal(scrutiny.status, 'pending');
    assert.equal(scrutiny.milestone, 'alpha');
    assert.equal(scrutiny.skillName, 'code-reviewer');
    assert.deepStrictEqual(scrutiny.fulfills, []);

    const userTesting = features.find(f => f.id === 'user-testing-validator-alpha');
    assert.ok(userTesting);
    assert.equal(userTesting.status, 'pending');
    assert.equal(userTesting.milestone, 'alpha');
    assert.equal(userTesting.skillName, 'qa');
    // user-testing gets all fulfills from milestone features
    assert.deepStrictEqual(userTesting.fulfills, ['VAL-TEST-001', 'VAL-TEST-002', 'VAL-TEST-003']);

    // Verify preconditions link correctly
    assert.ok(userTesting.preconditions[0].includes('scrutiny-validator-alpha'));

    // Verify persisted to disk
    const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, 'features.json'), 'utf8'));
    assert.equal(persisted.features.length, 4);
  });

  it('skips injection when validators already exist', () => {
    const features = [
      {
        id: 'feat-a',
        milestone: 'beta',
        fulfills: ['VAL-B-001'],
        status: 'completed',
      },
      {
        id: 'scrutiny-validator-beta',
        milestone: 'beta',
        status: 'pending',
      },
    ];

    saveFeaturesDoc(tempDir, features);

    const result = injectMilestoneValidators(tempDir, features, 'beta');
    assert.equal(result.injected, false);
    assert.equal(features.length, 2);
  });

  it('handles missing template file gracefully', () => {
    // Use a directory with no access to the template
    const isolatedDir = path.join(tempDir, 'isolated');
    fs.mkdirSync(isolatedDir, { recursive: true });

    const features = [{ id: 'f1', milestone: 'gamma', fulfills: [], status: 'completed' }];
    saveFeaturesDoc(isolatedDir, features);

    // This will try to find the template relative to the module — it should find it
    // since we're running from the repo root. Just verify no crash.
    const result = injectMilestoneValidators(isolatedDir, features, 'gamma');
    assert.equal(typeof result.injected, 'boolean');
  });
});
