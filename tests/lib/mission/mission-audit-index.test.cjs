'use strict';

/**
 * Tests for Mission Audit Index
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  createAuditIndex,
  AUDIT_EVENT_TYPES,
} = require('../../../.claude/lib/mission/mission-audit-index.cjs');

function createTempDir() {
  const dir = path.join(
    __dirname,
    '..',
    '..',
    'fixtures',
    `temp-audit-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

describe('Mission Audit Index', () => {
  let tempDir;
  let audit;

  beforeEach(() => {
    tempDir = createTempDir();
    audit = createAuditIndex(tempDir, 'mis_test');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('emits and queries events', () => {
    audit.emitFeatureSelected('feat-a', 'worker-1');
    audit.emitFeatureStarted('feat-a', 'worker-1');
    audit.emitFeatureCompleted('feat-a', 'abc1234');

    const trail = audit.getAuditTrail('feat-a');
    assert.equal(trail.length, 3);
    assert.equal(trail[0].eventType, AUDIT_EVENT_TYPES.FEATURE_SELECTED);
    assert.equal(trail[1].eventType, AUDIT_EVENT_TYPES.FEATURE_STARTED);
    assert.equal(trail[2].eventType, AUDIT_EVENT_TYPES.FEATURE_COMPLETED);

    // All entries have missionId
    assert.ok(trail.every(e => e.missionId === 'mis_test'));
  });

  it('filters by eventType', () => {
    audit.emitFeatureStarted('feat-a', 'w1');
    audit.emitFeatureCompleted('feat-a', 'c1');
    audit.emitFeatureStarted('feat-b', 'w2');

    const starts = audit.query({ eventType: AUDIT_EVENT_TYPES.FEATURE_STARTED });
    assert.equal(starts.length, 2);
  });

  it('tracks handoff and evidence events', () => {
    audit.emitHandoffReceived('feat-a', 'handoffs/h1.json', 'success');
    audit.emitEvidenceCaptured('feat-a', 'VAL-TEST-001', 'evidence/ms/VAL-TEST-001.txt');
    audit.emitAssertionUpdated('feat-a', 'VAL-TEST-001', 'passed');

    const trail = audit.getAuditTrail('feat-a');
    assert.equal(trail.length, 3);
    assert.equal(trail[0].artifactPath, 'handoffs/h1.json');
    assert.equal(trail[1].metadata.assertionId, 'VAL-TEST-001');
    assert.equal(trail[2].metadata.status, 'passed');
  });

  it('tracks milestone and grading events', () => {
    audit.emitMilestoneTriggered('alpha');
    audit.emitValidatorsInjected(
      'alpha',
      'scrutiny-validator-alpha',
      'user-testing-validator-alpha'
    );
    audit.emitGradingCompleted('feat-a', 92, 'excellent', true);

    const all = audit.query();
    assert.equal(all.length, 3);
    assert.equal(all[2].metadata.score, 92);
    assert.equal(all[2].metadata.gradeBand, 'excellent');
  });

  it('produces correct summary', () => {
    audit.emitFeatureStarted('feat-a', 'w1');
    audit.emitFeatureCompleted('feat-a', 'c1');
    audit.emitFeatureStarted('feat-b', 'w2');
    audit.emitFeatureFailed('feat-b', 'timeout');

    const summary = audit.getSummary();
    assert.equal(summary.totalEvents, 4);
    assert.equal(summary.featuresTracked, 2);
    assert.equal(summary.eventsByType[AUDIT_EVENT_TYPES.FEATURE_STARTED], 2);
  });

  it('returns empty array for missing index', () => {
    const emptyDir = createTempDir();
    const emptyAudit = createAuditIndex(emptyDir, 'mis_empty');
    const result = emptyAudit.query();
    assert.deepStrictEqual(result, []);
    cleanupTempDir(emptyDir);
  });

  it('each entry has correlationId and timestamp', () => {
    const entry = audit.emitFeatureSelected('feat-x', 'w1');
    assert.ok(entry.correlationId);
    assert.ok(entry.timestamp);
    assert.equal(entry.featureId, 'feat-x');
  });
});
