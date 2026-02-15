const assert = require('node:assert');
const { describe, it, before } = require('node:test');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, '.claude', 'schemas', 'track-metadata.schema.json');
const ANALYTICS_LIB_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'lib',
  'utils',
  'track-analytics.cjs'
);

let trackAnalytics;
let validate;

before(() => {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(schemaContent);
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  validate = ajv.compile(schema);

  try {
    trackAnalytics = require(ANALYTICS_LIB_PATH);
  } catch (_err) {
    trackAnalytics = null;
  }
});

describe('Track Metadata Analytics Reporting and Edge Cases', () => {
  const sampleTracks = [
    {
      trackId: 'track1_20260129',
      type: 'feature',
      status: 'completed',
      phaseState: 'deployed',
      description: 'Implement user auth',
      estimatedEffort: { days: 5 },
      actualEffort: { days: 3.5 },
      created_at: '2026-01-25T10:00:00Z',
      updated_at: '2026-01-29T15:00:00Z',
    },
    {
      trackId: 'track2_20260129',
      type: 'bug',
      status: 'in_progress',
      phaseState: 'implementation',
      description: 'Fix login crash',
      estimatedEffort: { days: 2 },
      priority: 'critical',
    },
  ];

  describe('Reporting Generation', () => {
    it('should generate markdown report', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const report = trackAnalytics.generateReport(sampleTracks);
      assert.ok(typeof report === 'string');
      assert.ok(report.includes('# Track Analytics Report'));
    });

    it('should include major report sections and metrics', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const report = trackAnalytics.generateReport(sampleTracks);
      assert.ok(report.includes('Generated:'));
      assert.ok(report.includes('## Project Metrics'));
      assert.ok(report.includes('## Phase Breakdown'));
      assert.ok(report.includes('## Priority Breakdown'));
      assert.ok(report.includes('## Insights'));
      assert.ok(report.includes('### Completed Tasks'));
      assert.ok(report.includes('### In Progress Tasks'));
      assert.ok(report.includes('track1_20260129'));
      assert.ok(report.includes('Implement user auth'));
    });

    it('should include agent metrics when assignee data exists', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const report = trackAnalytics.generateReport(
        sampleTracks.map(t => ({ ...t, assignee: 'developer' }))
      );
      assert.ok(report.includes('## Agent Metrics'));
    });

    it('should handle empty tracks array', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const report = trackAnalytics.generateReport([]);
      assert.ok(report.includes('No tracks'));
    });

    it('should render valid markdown structure', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const report = trackAnalytics.generateReport(sampleTracks);
      assert.ok(/^#\s/.test(report));
      assert.ok(/##\s/.test(report));
      assert.ok(/\n-\s/.test(report) || /\|\s/.test(report));
      assert.ok(!report.includes('ERROR'));
    });
  });

  describe('Edge Cases', () => {
    it('should validate/reject edge schema combinations', () => {
      assert.ok(
        !validate({ trackId: 'test_20260129', type: 'feature', status: 'new', metrics: null })
      );
      assert.ok(
        validate({
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          estimatedEffort: { days: 0 },
        })
      );
      assert.ok(
        validate({
          trackId: 'test_20260129',
          type: 'feature',
          status: 'in_progress',
          estimatedEffort: { days: 365 },
        })
      );
      assert.ok(
        validate({
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          estimatedEffort: { days: 2.5 },
          actualEffort: { days: 1.75 },
        })
      );
      assert.ok(
        validate({
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          reporting: { generatedAt: '2026-01-29T10:00:00Z', insights: [] },
        })
      );
      assert.ok(
        !validate({
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          reporting: { generatedAt: '2026-01-29' },
        })
      );
      assert.ok(
        !validate({ trackId: 'test_20260129', type: 'feature', status: 'new', description: '' })
      );
      assert.ok(!validate({ trackId: 'test_20260129', type: 'FEATURE', status: 'new' }));
      assert.ok(
        !validate({ trackId: 'test_20260129', type: 'feature', status: 'new', priority: null })
      );
      assert.ok(
        validate({
          trackId: 'test1_20260129',
          type: 'feature',
          status: 'new',
          dependencies: ['test2_20260129'],
        })
      );
    });

    it('should handle missing and malformed analytics fields gracefully', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      assert.strictEqual(
        trackAnalytics.queryByPhase('implementation', [
          { trackId: 'x', type: 'feature', status: 'new' },
        ]).tasks.length,
        0
      );
      assert.strictEqual(
        trackAnalytics.queryByAgent('developer', [{ trackId: 'x', type: 'feature', status: 'new' }])
          .tasks.length,
        0
      );
      assert.strictEqual(
        trackAnalytics.computeProjectMetrics([
          { trackId: 'x', type: 'feature', status: 'completed' },
        ]).totalEstimatedDays,
        0
      );
      assert.strictEqual(
        trackAnalytics.computeProjectMetrics([
          { trackId: 'x', type: 'feature', status: 'completed', estimatedEffort: { days: 5 } },
        ]).totalActualDays,
        0
      );
      const duration = trackAnalytics.queryByStatus('completed', [
        { trackId: 'x', type: 'feature', status: 'completed' },
      ]).metrics.avgDurationDays;
      assert.ok(duration === 0 || duration === null);
      assert.ok(
        trackAnalytics.queryByStatus('completed', [
          {
            trackId: 'x',
            type: 'feature',
            status: 'completed',
            created_at: 'invalid-date',
            updated_at: 'invalid-date',
          },
        ])
      );
      assert.ok(trackAnalytics.computeProjectMetrics([{ trackId: 'x' }]));
    });

    it('should handle division by zero in effort multiplier', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const result = trackAnalytics.computeProjectMetrics([
        {
          trackId: 'x',
          type: 'feature',
          status: 'completed',
          estimatedEffort: { days: 0 },
          actualEffort: { days: 5 },
        },
      ]);
      assert.ok(result.avgEffortMultiplier === Infinity || result.avgEffortMultiplier === null);
    });
  });

  describe('Performance Tests', () => {
    it('should validate 1000 metadata objects in <1 second', () => {
      const startTime = Date.now();
      for (let i = 0; i < 1000; i++) {
        validate({
          trackId: `test${i}_20260129`,
          type: 'feature',
          status: 'new',
          metrics: {
            elapsedTimeMs: 1000 * i,
            effortMultiplier: 1.0,
            riskScore: 50,
            completionRate: 0,
          },
        });
      }
      assert.ok(Date.now() - startTime < 1000);
    });

    it('should meet query and report performance thresholds', () => {
      if (!trackAnalytics) assert.fail('Analytics library not loaded');
      const tracks = Array.from({ length: 1000 }, (_, i) => ({
        trackId: `test${i}_20260129`,
        type: 'feature',
        status: i % 3 === 0 ? 'completed' : 'in_progress',
        phaseState: i % 2 === 0 ? 'deployed' : 'implementation',
        estimatedEffort: { days: 5 },
        actualEffort: { days: i % 3 === 0 ? 3.5 : undefined },
        description: `Test track ${i}`,
      }));

      const phaseStart = Date.now();
      trackAnalytics.queryByPhase('deployed', tracks);
      assert.ok(Date.now() - phaseStart < 100);

      const metricsStart = Date.now();
      trackAnalytics.computeProjectMetrics(tracks);
      assert.ok(Date.now() - metricsStart < 200);

      const reportStart = Date.now();
      trackAnalytics.generateReport(tracks);
      assert.ok(Date.now() - reportStart < 500);
    });

    it('should handle nested effort breakdown structures', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        estimatedEffort: {
          days: 10,
          breakdown: { design: 2, implementation: 5, testing: 2, documentation: 1 },
        },
        actualEffort: {
          days: 8,
          breakdown: { design: 1.5, implementation: 4, testing: 1.5, documentation: 1 },
        },
      };
      assert.ok(validate(metadata));
    });
  });
});
