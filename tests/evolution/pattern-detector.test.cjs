'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { SkillUsageTracker } = require('../../.claude/lib/evolution/skill-usage-tracker.cjs');
const { PatternDetector } = require('../../.claude/lib/evolution/pattern-detector.cjs');

describe('PatternDetector', () => {
  let rootTempDir;

  before(() => {
    rootTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-detector-test-'));
  });

  after(() => {
    if (fs.existsSync(rootTempDir)) {
      fs.rmSync(rootTempDir, { recursive: true, force: true });
    }
  });

  let testDir;
  let tracker;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(rootTempDir, 'test-'));
    tracker = new SkillUsageTracker(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('empty data returns empty patterns', () => {
    it('returns {patterns: []} when tracker has no data', () => {
      const detector = new PatternDetector();
      const result = detector.detect(tracker);
      assert.deepEqual(result, { patterns: [] });
    });
  });

  describe('VAL-SE-003: frequently-failing detection', () => {
    it('detects skills with successRate < 0.5 and invocations > 10', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordInvocation('bad-skill', { success: false, durationMs: 100 });
      }
      tracker.recordInvocation('bad-skill', { success: true, durationMs: 100 });
      // 11 invocations, 10/11 failures, successRate ~ 0.091

      const detector = new PatternDetector();
      const { patterns } = detector.detect(tracker);

      const failing = patterns.filter(p => p.type === 'frequently-failing');
      assert.equal(failing.length, 1);
      assert.deepEqual(failing[0].skillNames, ['bad-skill']);
      assert.equal(failing[0].type, 'frequently-failing');
      assert.ok(typeof failing[0].description === 'string');
      assert.ok(typeof failing[0].severity === 'string');
      assert.ok(typeof failing[0].data === 'object');
    });

    it('does not detect skills with invocations <= 10', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordInvocation('bad-skill', { success: false, durationMs: 100 });
      }
      // exactly 10 invocations — not strictly > 10
      const detector = new PatternDetector();
      const { patterns } = detector.detect(tracker);
      const failing = patterns.filter(p => p.type === 'frequently-failing');
      assert.equal(failing.length, 0);
    });

    it('does not detect skills with successRate >= 0.5', () => {
      for (let i = 0; i < 11; i++) {
        tracker.recordInvocation('good-skill', { success: true, durationMs: 100 });
      }
      const detector = new PatternDetector();
      const { patterns } = detector.detect(tracker);
      const failing = patterns.filter(p => p.type === 'frequently-failing');
      assert.equal(failing.length, 0);
    });

    it('uses configurable failingMinInvocations threshold', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordInvocation('borderline-skill', { success: false, durationMs: 100 });
      }
      tracker.recordInvocation('borderline-skill', { success: true, durationMs: 100 });
      // 6 invocations, successRate ~ 0.167 — below 0.5

      // Default minInvocations=10: not detected (only 6 invocations)
      const defaultDetector = new PatternDetector();
      const { patterns: p1 } = defaultDetector.detect(tracker);
      assert.equal(p1.filter(p => p.type === 'frequently-failing').length, 0);

      // Custom minInvocations=5: detected (6 > 5)
      const customDetector = new PatternDetector({ failingMinInvocations: 5 });
      const { patterns: p2 } = customDetector.detect(tracker);
      assert.equal(p2.filter(p => p.type === 'frequently-failing').length, 1);
    });

    it('uses configurable failingSuccessRateThreshold', () => {
      for (let i = 0; i < 11; i++) {
        tracker.recordInvocation('borderline-skill', { success: false, durationMs: 100 });
      }
      tracker.recordInvocation('borderline-skill', { success: true, durationMs: 100 });
      tracker.recordInvocation('borderline-skill', { success: true, durationMs: 100 });
      // 13 invocations, 11 failures, successRate ~ 0.154

      // successRate ~ 0.154 < 0.5 (default): detected
      const defaultDetector = new PatternDetector();
      const { patterns: p1 } = defaultDetector.detect(tracker);
      assert.equal(p1.filter(p => p.type === 'frequently-failing').length, 1);

      // Custom threshold 0.1: successRate 0.154 >= 0.1, not detected
      const customDetector = new PatternDetector({ failingSuccessRateThreshold: 0.1 });
      const { patterns: p2 } = customDetector.detect(tracker);
      assert.equal(p2.filter(p => p.type === 'frequently-failing').length, 0);
    });
  });

  describe('VAL-SE-003: underutilized detection', () => {
    it('detects skills with lastUsed older than configured period', () => {
      const dataFile = path.join(testDir, 'skill-usage.jsonl');
      const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(
        dataFile,
        JSON.stringify({
          skillName: 'old-skill',
          success: true,
          durationMs: 100,
          timestamp: oldTimestamp,
        }) + '\n',
        'utf8'
      );

      const detector = new PatternDetector({
        underutilizedPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });
      const { patterns } = detector.detect(tracker);

      const underutilized = patterns.filter(p => p.type === 'underutilized');
      assert.equal(underutilized.length, 1);
      assert.deepEqual(underutilized[0].skillNames, ['old-skill']);
      assert.equal(underutilized[0].type, 'underutilized');
      assert.ok(typeof underutilized[0].description === 'string');
      assert.ok(typeof underutilized[0].data === 'object');
    });

    it('does not flag recently used skills', () => {
      tracker.recordInvocation('recent-skill', { success: true, durationMs: 100 });

      const detector = new PatternDetector({
        underutilizedPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });
      const { patterns } = detector.detect(tracker);

      const underutilized = patterns.filter(p => p.type === 'underutilized');
      assert.equal(underutilized.length, 0);
    });

    it('uses configurable underutilizedPeriodMs', () => {
      // Record with a timestamp 2 days ago
      const dataFile = path.join(testDir, 'skill-usage.jsonl');
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(
        dataFile,
        JSON.stringify({
          skillName: 'old-skill',
          success: true,
          durationMs: 100,
          timestamp: twoDaysAgo,
        }) + '\n',
        'utf8'
      );

      // 7-day period: not underutilized (only 2 days old)
      const longPeriodDetector = new PatternDetector({
        underutilizedPeriodMs: 7 * 24 * 60 * 60 * 1000,
      });
      const { patterns: p1 } = longPeriodDetector.detect(tracker);
      assert.equal(p1.filter(p => p.type === 'underutilized').length, 0);

      // 1-day period: underutilized (2 days > 1 day)
      const shortPeriodDetector = new PatternDetector({
        underutilizedPeriodMs: 1 * 24 * 60 * 60 * 1000,
      });
      const { patterns: p2 } = shortPeriodDetector.detect(tracker);
      assert.equal(p2.filter(p => p.type === 'underutilized').length, 1);
    });
  });

  describe('VAL-SE-003: high-latency detection', () => {
    it('detects skills with avgDurationMs > threshold', () => {
      tracker.recordInvocation('slow-skill', { success: true, durationMs: 6000 });
      tracker.recordInvocation('slow-skill', { success: true, durationMs: 7000 });

      const detector = new PatternDetector({ highLatencyThresholdMs: 5000 });
      const { patterns } = detector.detect(tracker);

      const highLatency = patterns.filter(p => p.type === 'high-latency');
      assert.equal(highLatency.length, 1);
      assert.deepEqual(highLatency[0].skillNames, ['slow-skill']);
      assert.equal(highLatency[0].type, 'high-latency');
      assert.ok(typeof highLatency[0].description === 'string');
      assert.ok(typeof highLatency[0].data === 'object');
    });

    it('does not detect skills at or below the threshold', () => {
      tracker.recordInvocation('fast-skill', { success: true, durationMs: 100 });
      tracker.recordInvocation('edge-skill', { success: true, durationMs: 5000 });
      // edge-skill avgDuration = 5000, threshold = 5000 → NOT > threshold

      const detector = new PatternDetector({ highLatencyThresholdMs: 5000 });
      const { patterns } = detector.detect(tracker);

      const highLatency = patterns.filter(p => p.type === 'high-latency');
      assert.equal(highLatency.length, 0);
    });

    it('uses configurable highLatencyThresholdMs', () => {
      tracker.recordInvocation('medium-skill', { success: true, durationMs: 2000 });

      // Default threshold (5000ms): not detected
      const defaultDetector = new PatternDetector();
      const { patterns: p1 } = defaultDetector.detect(tracker);
      assert.equal(p1.filter(p => p.type === 'high-latency').length, 0);

      // Custom threshold (1000ms): detected
      const customDetector = new PatternDetector({ highLatencyThresholdMs: 1000 });
      const { patterns: p2 } = customDetector.detect(tracker);
      assert.equal(p2.filter(p => p.type === 'high-latency').length, 1);
    });
  });

  describe('VAL-SE-003: co-occurring detection', () => {
    it('detects skills that frequently co-occur within time window', () => {
      for (let i = 0; i < 5; i++) {
        tracker.recordInvocation('skill-A', { success: true, durationMs: 100 });
        tracker.recordInvocation('skill-B', { success: true, durationMs: 100 });
      }

      const detector = new PatternDetector({
        coOccurrenceWindowMs: 5000,
        coOccurrenceMinCount: 3,
      });
      const { patterns } = detector.detect(tracker);

      const coOccurring = patterns.filter(p => p.type === 'co-occurring');
      assert.equal(coOccurring.length, 1);
      assert.ok(coOccurring[0].skillNames.includes('skill-A'));
      assert.ok(coOccurring[0].skillNames.includes('skill-B'));
      assert.equal(coOccurring[0].type, 'co-occurring');
      assert.ok(typeof coOccurring[0].description === 'string');
      assert.ok(typeof coOccurring[0].data === 'object');
    });

    it('does not detect co-occurring if count is below minimum', () => {
      tracker.recordInvocation('skill-A', { success: true, durationMs: 100 });
      tracker.recordInvocation('skill-B', { success: true, durationMs: 100 });
      // Only 1 co-occurrence

      const detector = new PatternDetector({
        coOccurrenceWindowMs: 5000,
        coOccurrenceMinCount: 3,
      });
      const { patterns } = detector.detect(tracker);

      const coOccurring = patterns.filter(p => p.type === 'co-occurring');
      assert.equal(coOccurring.length, 0);
    });

    it('does not detect co-occurring for same-skill records', () => {
      for (let i = 0; i < 10; i++) {
        tracker.recordInvocation('solo-skill', { success: true, durationMs: 100 });
      }

      const detector = new PatternDetector({
        coOccurrenceWindowMs: 5000,
        coOccurrenceMinCount: 3,
      });
      const { patterns } = detector.detect(tracker);

      const coOccurring = patterns.filter(p => p.type === 'co-occurring');
      assert.equal(coOccurring.length, 0);
    });

    it('uses configurable coOccurrenceWindowMs and coOccurrenceMinCount', () => {
      // 2 iterations of (X, Y) produces 4 records.
      // The sliding-window algorithm counts all cross-skill pairs within the window.
      // With 2 X records and 2 Y records all within a few ms: 4 unique pair combinations.
      for (let i = 0; i < 2; i++) {
        tracker.recordInvocation('skill-X', { success: true, durationMs: 100 });
        tracker.recordInvocation('skill-Y', { success: true, durationMs: 100 });
      }

      // minCount=5: not detected (4 pairs < 5)
      const strictDetector = new PatternDetector({
        coOccurrenceWindowMs: 5000,
        coOccurrenceMinCount: 5,
      });
      const { patterns: p1 } = strictDetector.detect(tracker);
      assert.equal(p1.filter(p => p.type === 'co-occurring').length, 0);

      // minCount=3: detected (4 pairs >= 3)
      const lenientDetector = new PatternDetector({
        coOccurrenceWindowMs: 5000,
        coOccurrenceMinCount: 3,
      });
      const { patterns: p2 } = lenientDetector.detect(tracker);
      assert.equal(p2.filter(p => p.type === 'co-occurring').length, 1);
    });
  });

  describe('pattern structure validation', () => {
    it('each pattern has required fields: type, skillNames, description, severity, data', () => {
      for (let i = 0; i < 11; i++) {
        tracker.recordInvocation('failing-skill', { success: false, durationMs: 100 });
      }

      const detector = new PatternDetector();
      const { patterns } = detector.detect(tracker);

      assert.ok(patterns.length > 0, 'should have at least one pattern');
      for (const pattern of patterns) {
        assert.ok('type' in pattern, 'pattern must have type');
        assert.ok(typeof pattern.type === 'string', 'type must be a string');
        assert.ok('skillNames' in pattern, 'pattern must have skillNames');
        assert.ok(Array.isArray(pattern.skillNames), 'skillNames must be an array');
        assert.ok(pattern.skillNames.length > 0, 'skillNames must not be empty');
        assert.ok('description' in pattern, 'pattern must have description');
        assert.ok(typeof pattern.description === 'string', 'description must be a string');
        assert.ok('severity' in pattern, 'pattern must have severity');
        assert.ok(typeof pattern.severity === 'string', 'severity must be a string');
        assert.ok('data' in pattern, 'pattern must have data');
        assert.ok(
          pattern.data !== null && typeof pattern.data === 'object',
          'data must be an object'
        );
      }
    });

    it('detect() returns an object with a patterns array', () => {
      const detector = new PatternDetector();
      const result = detector.detect(tracker);
      assert.ok('patterns' in result, 'result must have patterns field');
      assert.ok(Array.isArray(result.patterns), 'patterns must be an array');
    });
  });

  describe('multiple patterns from single detect() call', () => {
    it('can return multiple pattern types simultaneously', () => {
      // Add a failing skill
      for (let i = 0; i < 11; i++) {
        tracker.recordInvocation('bad-skill', { success: false, durationMs: 100 });
      }
      // Add a slow skill
      tracker.recordInvocation('slow-skill', { success: true, durationMs: 6000 });

      const detector = new PatternDetector({ highLatencyThresholdMs: 5000 });
      const { patterns } = detector.detect(tracker);

      const types = new Set(patterns.map(p => p.type));
      assert.ok(types.has('frequently-failing'), 'should detect frequently-failing');
      assert.ok(types.has('high-latency'), 'should detect high-latency');
    });
  });
});
