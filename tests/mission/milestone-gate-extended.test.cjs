'use strict';

/**
 * Tests for Milestone Gate - Extended tests (structure, class, error handling)
 *
 * Additional tests for the MilestoneGate class beyond core assertions.
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateMilestoneGate,
  MilestoneGate,
} = require('../../.claude/lib/mission/milestone-gate.cjs');

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'milestone-gate-ext');

function createTempDir() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2);
  const tempDir = path.join(FIXTURES_DIR, `temp-${timestamp}-${random}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeFeatures(dir, features) {
  fs.writeFileSync(path.join(dir, 'features.json'), JSON.stringify({ features }, null, 2), 'utf8');
}

function writeValidationState(dir, assertions) {
  fs.writeFileSync(
    path.join(dir, 'validation-state.json'),
    JSON.stringify({ assertions }, null, 2),
    'utf8'
  );
}

// ========================================
// Dynamic feature list read
// ========================================
describe('Dynamic feature list read', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('reads features at invocation time (no caching)', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'pending',
        fulfills: [],
      },
    ]);
    writeValidationState(tempDir, {});

    const result1 = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result1.passed, false);

    // Update features.json externally
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: [],
      },
    ]);

    const result2 = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result2.passed, true, 'Should read fresh feature data');
  });
});

// ========================================
// Return structure
// ========================================
describe('Return structure', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('returns correct structure with passed=true', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(typeof result.passed, 'boolean');
    assert.ok(Array.isArray(result.blocking));
    assert.equal(typeof result.scrutiny, 'object');
    assert.equal(typeof result.userTesting, 'object');
  });

  it('returns correct structure with passed=false', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'pending',
        fulfills: [],
      },
    ]);
    writeValidationState(tempDir, {});

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(typeof result.passed, 'boolean');
    assert.ok(Array.isArray(result.blocking));
    assert.ok(result.blocking.length > 0);

    const blocker = result.blocking[0];
    assert.ok('featureId' in blocker || 'assertionId' in blocker);
    assert.ok('reason' in blocker);
  });

  it('includes scrutiny and userTesting verdicts in result', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.ok('verdict' in result.scrutiny);
    assert.ok(['approved', 'rejected', 'skipped', 'not_run'].includes(result.scrutiny.verdict));
    assert.ok('verdict' in result.userTesting);
    assert.ok(['approved', 'rejected', 'skipped', 'not_run'].includes(result.userTesting.verdict));
  });
});

// ========================================
// MilestoneGate class
// ========================================
describe('MilestoneGate class', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('can be instantiated with options', () => {
    const gate = new MilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(gate.milestone, 'validation-gates');
  });

  it('evaluate() method works correctly', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const gate = new MilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    const result = await gate.evaluate();

    assert.equal(result.passed, true);
  });
});

// ========================================
// Error handling
// ========================================
describe('Error handling', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('handles missing features.json', async () => {
    writeValidationState(tempDir, {});

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(result.blocking.find(b => b.reason === 'features_file_error') || result.error);
  });

  it('handles missing validation-state.json by creating it', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
    ]);

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(result.blocking.find(b => b.assertionId === 'VAL-A-001'));
  });

  it('handles malformed features.json', async () => {
    fs.writeFileSync(path.join(tempDir, 'features.json'), 'not valid json', 'utf8');
    writeValidationState(tempDir, {});

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(result.error || result.blocking.find(b => b.reason === 'features_parse_error'));
  });
});
