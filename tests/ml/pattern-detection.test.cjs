/**
 * SPEC-023: Pattern Detection Engine Tests
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const PatternDetector = require('../../.claude/lib/ml/pattern-detector.cjs');
const FeatureEngineer = require('../../.claude/lib/ml/feature-engineer.cjs');
const KMeans = require('../../.claude/lib/ml/models/clustering.cjs');

// Synthetic Data Generators
function generateSession(type) {
  if (type === 'quick-fix') {
    return {
      history: [{ agent: 'developer' }, { agent: 'qa' }],
      metrics: { totalDuration: 5000, errorCount: 0, tokenUsage: 1000, peakMemoryMB: 50 },
      trace: {},
    };
  } else if (type === 'architectural') {
    return {
      history: [
        { agent: 'architect' },
        { agent: 'planner' },
        { agent: 'developer' },
        { agent: 'security' },
      ],
      metrics: { totalDuration: 300000, errorCount: 2, tokenUsage: 50000, peakMemoryMB: 500 },
      trace: {},
    };
  }
}

describe('SPEC-023: Pattern Detection Engine', () => {
  describe('FeatureEngineer', () => {
    it('normalizes metrics correctly', () => {
      const engineer = new FeatureEngineer();
      const session = generateSession('quick-fix');
      const features = engineer.extractFeatures(session);

      assert.ok(
        features.totalDuration > 0 && features.totalDuration < 1,
        'Duration should be normalized'
      );
      assert.ok(
        features.totalTokens > 0 && features.totalTokens < 1,
        'Tokens should be normalized'
      );
      assert.ok(
        features.sequenceLength >= 0 && features.sequenceLength <= 1,
        'sequenceLength should be normalized 0-1'
      );
      assert.equal(features.sequenceLength, 2 / 500, 'sequenceLength = history.length / 500 cap');
    });

    it('encodes agent sequences', () => {
      const engineer = new FeatureEngineer();
      const s1 = generateSession('quick-fix');
      const f1 = engineer.extractFeatures(s1);

      assert.deepEqual(f1.agentSequence, [1, 2]); // First seen agents get IDs 1, 2
    });
  });

  describe('KMeans Clustering', () => {
    it('groups identical points together', () => {
      const kmeans = new KMeans(2);
      const data = [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.1 }, // Cluster A
        { x: 10, y: 10 },
        { x: 9.9, y: 9.9 }, // Cluster B
      ];

      const result = kmeans.fit(data);
      assert.ok(result.iterations > 0);

      const p1 = kmeans.predict({ x: 0.05, y: 0.05 });
      const p2 = kmeans.predict({ x: 9.95, y: 9.95 });

      assert.notEqual(
        p1.clusterId,
        p2.clusterId,
        'Should assign different clusters to distant points'
      );
      assert.ok(p1.distance < 1, 'Distance should be small for nearby point');
    });
  });

  describe('PatternDetector (Integration)', () => {
    it('identifies distinct workflow patterns', () => {
      const detector = new PatternDetector({ k: 2 });

      // Train on distinct types
      for (let i = 0; i < 5; i++) detector.ingest(generateSession('quick-fix'));
      for (let i = 0; i < 5; i++) detector.ingest(generateSession('architectural'));

      detector.train();

      const analysisQuick = detector.analyze(generateSession('quick-fix'));
      const analysisArch = detector.analyze(generateSession('architectural'));

      assert.notEqual(
        analysisQuick.patternId,
        analysisArch.patternId,
        'Should distinguish workflow types'
      );
    });

    it('handles untrained state gracefully', () => {
      const detector = new PatternDetector();
      const result = detector.analyze(generateSession('quick-fix'));
      assert.equal(result.confidence, 0);
    });
  });
});
