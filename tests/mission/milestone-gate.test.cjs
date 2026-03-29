'use strict';

/**
 * Tests for Milestone Gate - Core assertions
 *
 * Milestone gate evaluates whether a milestone is ready to complete.
 * Checks:
 * 1. All features in milestone have status 'completed'
 * 2. All validation assertions for milestone features are 'passed' in validation-state.json
 * 3. Infrastructure features (empty fulfills array) exempt from assertion checks
 * 4. Features with status 'cancelled' excluded from gate evaluation
 *
 * Validates: VAL-MG-001, VAL-MG-002, VAL-MG-003, VAL-MG-004
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateMilestoneGate } = require('../../.claude/lib/mission/milestone-gate.cjs');

// Test fixtures directory
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'milestone-gate-core');

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
  const filePath = path.join(dir, 'features.json');
  fs.writeFileSync(filePath, JSON.stringify({ features }, null, 2), 'utf8');
  return filePath;
}

function writeValidationState(dir, assertions) {
  const filePath = path.join(dir, 'validation-state.json');
  fs.writeFileSync(filePath, JSON.stringify({ assertions }, null, 2), 'utf8');
  return filePath;
}

// ========================================
// VAL-MG-001: All features must be completed
// ========================================
describe('VAL-MG-001: All features must be completed', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('gate passes when all features in milestone are completed', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
      {
        id: 'feature-b',
        description: 'Feature B',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-B-001'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
      'VAL-B-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, true);
    assert.equal(result.blocking.length, 0);
  });

  it('gate fails if any feature in milestone is not completed', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
      {
        id: 'feature-b',
        description: 'Feature B',
        milestone: 'validation-gates',
        status: 'in_progress',
        fulfills: ['VAL-B-001'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
      'VAL-B-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    const incompleteBlocker = result.blocking.find(b => b.featureId === 'feature-b');
    assert.ok(incompleteBlocker, 'Should block on incomplete feature');
    assert.equal(incompleteBlocker.reason, 'feature_not_completed');
  });

  it('gate fails if a feature is pending', async () => {
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

    assert.equal(result.passed, false);
    assert.ok(
      result.blocking.find(b => b.featureId === 'feature-a' && b.reason === 'feature_not_completed')
    );
  });

  it('gate fails if a feature is failed', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'failed',
        fulfills: [],
      },
    ]);
    writeValidationState(tempDir, {});

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(
      result.blocking.find(b => b.featureId === 'feature-a' && b.reason === 'feature_not_completed')
    );
  });

  it('gate passes with empty milestone (no features)', async () => {
    writeFeatures(tempDir, []);
    writeValidationState(tempDir, {});

    const result = await evaluateMilestoneGate({
      milestone: 'empty-milestone',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, true);
    assert.equal(result.blocking.length, 0);
  });

  it('only evaluates features in the specified milestone', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001'],
      },
      {
        id: 'feature-b',
        description: 'Feature B',
        milestone: 'other-milestone',
        status: 'pending',
        fulfills: ['VAL-B-001'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
      'VAL-B-001': { status: 'pending', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, true);
    assert.equal(result.blocking.length, 0);
  });
});

// ========================================
// VAL-MG-002: All assertions must be passed
// ========================================
describe('VAL-MG-002: All assertions must be passed', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('gate fails when a feature has assertion not passed', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001', 'VAL-A-002'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
      'VAL-A-002': { status: 'failed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(
      result.blocking.find(
        b => b.assertionId === 'VAL-A-002' && b.reason === 'assertion_not_passed'
      )
    );
  });

  it('gate fails when assertion is pending', async () => {
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
      'VAL-A-001': { status: 'pending', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(
      result.blocking.find(
        b => b.assertionId === 'VAL-A-001' && b.reason === 'assertion_not_passed'
      )
    );
  });

  it('gate fails when assertion is blocked', async () => {
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
      'VAL-A-001': { status: 'blocked', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(
      result.blocking.find(
        b => b.assertionId === 'VAL-A-001' && b.reason === 'assertion_not_passed'
      )
    );
  });

  it('gate passes when all assertions are passed', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-A-001', 'VAL-A-002', 'VAL-A-003'],
      },
    ]);
    writeValidationState(tempDir, {
      'VAL-A-001': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
      'VAL-A-002': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
      'VAL-A-003': { status: 'passed', updatedAt: '2024-01-01T00:00:00Z' },
    });

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, true);
    assert.equal(result.blocking.length, 0);
  });

  it('gate fails when assertion does not exist in validation state', async () => {
    writeFeatures(tempDir, [
      {
        id: 'feature-a',
        description: 'Feature A',
        milestone: 'validation-gates',
        status: 'completed',
        fulfills: ['VAL-UNKNOWN'],
      },
    ]);
    writeValidationState(tempDir, {});

    const result = await evaluateMilestoneGate({
      milestone: 'validation-gates',
      featuresPath: path.join(tempDir, 'features.json'),
      statePath: path.join(tempDir, 'validation-state.json'),
    });

    assert.equal(result.passed, false);
    assert.ok(
      result.blocking.find(
        b => b.assertionId === 'VAL-UNKNOWN' && b.reason === 'assertion_not_found'
      )
    );
  });
});

// Ensure fixtures directory exists
before(() => {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
});

// Cleanup after all tests
after(() => {
  if (fs.existsSync(FIXTURES_DIR)) {
    const entries = fs.readdirSync(FIXTURES_DIR);
    for (const entry of entries) {
      if (entry.startsWith('temp-')) {
        fs.rmSync(path.join(FIXTURES_DIR, entry), { recursive: true, force: true });
      }
    }
  }
});
