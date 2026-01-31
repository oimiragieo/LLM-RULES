/**
 * Track Metadata Analytics Tests (SPEC-008)
 * TDD: RED phase - These tests will fail until analytics functions are implemented
 *
 * Tests cover:
 * - Analytics field validation (10+ tests)
 * - Query functions (20+ tests)
 * - Reporting generation (15+ tests)
 * - Edge cases (20+ tests)
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
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

// Import analytics library (will fail initially in RED phase)
let trackAnalytics;
try {
  trackAnalytics = require(ANALYTICS_LIB_PATH);
} catch (_err) {
  // Expected to fail in RED phase
  trackAnalytics = null;
}

describe('Track Metadata Analytics - SPEC-008', () => {
  let ajv;
  let schema;
  let validate;

  // Setup: Load schema
  it('should load track metadata schema', () => {
    assert.ok(fs.existsSync(SCHEMA_PATH), `Schema file not found at ${SCHEMA_PATH}`);
    const schemaContent = fs.readFileSync(SCHEMA_PATH, 'utf8');
    schema = JSON.parse(schemaContent);

    ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  describe('Analytics Field Validation (10 tests)', () => {
    it('should validate metrics.elapsedTimeMs (positive number)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        metrics: {
          elapsedTimeMs: 3600000, // 1 hour
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should reject metrics.elapsedTimeMs (negative)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        metrics: {
          elapsedTimeMs: -100,
        },
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject negative elapsed time');
    });

    it('should validate metrics.effortMultiplier (0.5 to 5 range)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        metrics: {
          effortMultiplier: 1.5,
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should reject metrics.effortMultiplier (below 0.5)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        metrics: {
          effortMultiplier: 0.3,
        },
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject effort multiplier < 0.5');
    });

    it('should reject metrics.effortMultiplier (above 5)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        metrics: {
          effortMultiplier: 6.0,
        },
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject effort multiplier > 5');
    });

    it('should validate metrics.riskScore (0-100 range)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'in_progress',
        metrics: {
          riskScore: 75,
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should reject metrics.riskScore (negative)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'in_progress',
        metrics: {
          riskScore: -10,
        },
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject negative risk score');
    });

    it('should reject metrics.riskScore (above 100)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'in_progress',
        metrics: {
          riskScore: 150,
        },
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject risk score > 100');
    });

    it('should validate metrics.completionRate (0-100 range)', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'in_progress',
        metrics: {
          completionRate: 60,
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('should validate reporting object structure', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        reporting: {
          generatedAt: '2026-01-29T10:00:00Z',
          lastReportPath: '.claude/context/artifacts/reports/test-report.md',
          insights: ['Implementation faster than estimated', 'Testing took 80% of estimate'],
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, `Validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });
  });

  describe('Query Functions - queryByPhase (5 tests)', () => {
    const sampleTracks = [
      {
        trackId: 'track1_20260129',
        type: 'feature',
        status: 'completed',
        phaseState: 'deployed',
        estimatedEffort: { days: 5 },
        actualEffort: { days: 3.5 },
      },
      {
        trackId: 'track2_20260129',
        type: 'bug',
        status: 'in_progress',
        phaseState: 'implementation',
        estimatedEffort: { days: 2 },
      },
      {
        trackId: 'track3_20260129',
        type: 'feature',
        status: 'completed',
        phaseState: 'deployed',
        estimatedEffort: { days: 3 },
        actualEffort: { days: 4 },
      },
    ];

    it('should query tasks by phase (deployed)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded (expected in RED phase)');
      }

      const result = trackAnalytics.queryByPhase('deployed', sampleTracks);

      assert.strictEqual(result.tasks.length, 2, 'Should return 2 deployed tasks');
      assert.strictEqual(result.phase, 'deployed');
      assert.ok(result.metrics, 'Should include metrics');
    });

    it('should query tasks by phase (implementation)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByPhase('implementation', sampleTracks);

      assert.strictEqual(result.tasks.length, 1, 'Should return 1 implementation task');
      assert.strictEqual(result.phase, 'implementation');
    });

    it('should return empty for non-existent phase', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByPhase('spec_review', sampleTracks);

      assert.strictEqual(result.tasks.length, 0, 'Should return 0 tasks');
    });

    it('should compute aggregate metrics for phase', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByPhase('deployed', sampleTracks);

      assert.ok(result.metrics.avgEstimatedDays, 'Should compute avg estimated days');
      assert.ok(result.metrics.avgActualDays, 'Should compute avg actual days');
      assert.ok(result.metrics.totalTasks, 'Should count total tasks');
    });

    it('should handle empty tracks array', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByPhase('deployed', []);

      assert.strictEqual(result.tasks.length, 0);
      assert.strictEqual(result.metrics.totalTasks, 0);
    });
  });

  describe('Query Functions - queryByAgent (5 tests)', () => {
    const sampleTracks = [
      {
        trackId: 'track1_20260129',
        type: 'feature',
        status: 'completed',
        assignee: 'developer',
        estimatedEffort: { days: 5 },
        actualEffort: { days: 3.5 },
      },
      {
        trackId: 'track2_20260129',
        type: 'bug',
        status: 'in_progress',
        assignee: 'developer',
        estimatedEffort: { days: 2 },
      },
      {
        trackId: 'track3_20260129',
        type: 'docs',
        status: 'completed',
        assignee: 'technical-writer',
        estimatedEffort: { days: 1 },
        actualEffort: { days: 0.5 },
      },
    ];

    it('should query tasks by agent (developer)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByAgent('developer', sampleTracks);

      assert.strictEqual(result.tasks.length, 2, 'Should return 2 developer tasks');
      assert.strictEqual(result.agent, 'developer');
    });

    it('should compute completion metrics for agent', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByAgent('developer', sampleTracks);

      assert.ok(result.metrics.completedTasks, 'Should count completed tasks');
      assert.ok(result.metrics.inProgressTasks, 'Should count in-progress tasks');
      assert.ok(result.metrics.completionRate !== undefined, 'Should compute completion rate');
    });

    it('should handle agent with no tasks', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByAgent('qa', sampleTracks);

      assert.strictEqual(result.tasks.length, 0);
      assert.strictEqual(result.metrics.completionRate, 0);
    });

    it('should compute accuracy metrics (estimated vs actual)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByAgent('developer', sampleTracks);

      assert.ok(result.metrics.avgEstimatedDays, 'Should compute avg estimated');
      assert.ok(result.metrics.avgActualDays, 'Should compute avg actual');
      assert.ok(result.metrics.estimateAccuracy !== undefined, 'Should compute accuracy %');
    });

    it('should handle undefined assignee field', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracksWithoutAssignee = [
        { trackId: 'track1_20260129', type: 'feature', status: 'new' },
      ];

      const result = trackAnalytics.queryByAgent('developer', tracksWithoutAssignee);

      assert.strictEqual(result.tasks.length, 0);
    });
  });

  describe('Query Functions - queryByStatus (5 tests)', () => {
    const sampleTracks = [
      {
        trackId: 'track1_20260129',
        type: 'feature',
        status: 'completed',
        created_at: '2026-01-25T10:00:00Z',
        updated_at: '2026-01-29T15:00:00Z',
      },
      {
        trackId: 'track2_20260129',
        type: 'bug',
        status: 'in_progress',
        created_at: '2026-01-28T10:00:00Z',
        updated_at: '2026-01-29T10:00:00Z',
      },
      {
        trackId: 'track3_20260129',
        type: 'feature',
        status: 'completed',
        created_at: '2026-01-26T10:00:00Z',
        updated_at: '2026-01-28T15:00:00Z',
      },
    ];

    it('should query tasks by status (completed)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByStatus('completed', sampleTracks);

      assert.strictEqual(result.tasks.length, 2, 'Should return 2 completed tasks');
      assert.strictEqual(result.status, 'completed');
    });

    it('should compute timeline metrics', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByStatus('completed', sampleTracks);

      assert.ok(result.metrics.avgDurationDays, 'Should compute avg duration');
      assert.ok(result.metrics.totalTasks, 'Should count total tasks');
    });

    it('should group tasks by type within status', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByStatus('completed', sampleTracks);

      assert.ok(result.metrics.byType, 'Should group by type');
      assert.strictEqual(result.metrics.byType.feature, 2);
    });

    it('should handle missing timestamp fields', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracksWithoutTimestamps = [
        { trackId: 'track1_20260129', type: 'feature', status: 'completed' },
      ];

      const result = trackAnalytics.queryByStatus('completed', tracksWithoutTimestamps);

      assert.ok(result.metrics.avgDurationDays === 0 || result.metrics.avgDurationDays === null);
    });

    it('should sort tasks by updated_at (most recent first)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.queryByStatus('completed', sampleTracks);

      assert.strictEqual(result.tasks[0].trackId, 'track1_20260129', 'Most recent should be first');
    });
  });

  describe('Query Functions - computeProjectMetrics (5 tests)', () => {
    const sampleTracks = [
      {
        trackId: 'track1_20260129',
        type: 'feature',
        status: 'completed',
        phaseState: 'deployed',
        estimatedEffort: { days: 5 },
        actualEffort: { days: 3.5 },
        priority: 'high',
      },
      {
        trackId: 'track2_20260129',
        type: 'bug',
        status: 'in_progress',
        phaseState: 'implementation',
        estimatedEffort: { days: 2 },
        priority: 'critical',
      },
      {
        trackId: 'track3_20260129',
        type: 'feature',
        status: 'new',
        phaseState: 'plan_ready',
        estimatedEffort: { days: 3 },
        priority: 'medium',
      },
    ];

    it('should compute project-wide completion percentage', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.computeProjectMetrics(sampleTracks);

      assert.ok(result.completionPercentage !== undefined);
      assert.ok(result.completionPercentage >= 0 && result.completionPercentage <= 100);
    });

    it('should compute average effort multiplier', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.computeProjectMetrics(sampleTracks);

      assert.ok(result.avgEffortMultiplier !== undefined);
      // Track1: 3.5/5 = 0.7x, so should be < 1
      assert.ok(result.avgEffortMultiplier < 1);
    });

    it('should count phases completed', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.computeProjectMetrics(sampleTracks);

      assert.ok(result.phasesCompleted, 'Should count completed phases');
      assert.strictEqual(result.phasesCompleted.deployed, 1);
    });

    it('should group by priority', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.computeProjectMetrics(sampleTracks);

      assert.ok(result.byPriority, 'Should group by priority');
      assert.strictEqual(result.byPriority.critical, 1);
      assert.strictEqual(result.byPriority.high, 1);
      assert.strictEqual(result.byPriority.medium, 1);
    });

    it('should compute total estimated vs actual effort', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const result = trackAnalytics.computeProjectMetrics(sampleTracks);

      assert.ok(result.totalEstimatedDays, 'Should sum estimated');
      assert.ok(result.totalActualDays, 'Should sum actual');
      assert.strictEqual(result.totalEstimatedDays, 10); // 5 + 2 + 3
      assert.strictEqual(result.totalActualDays, 3.5); // Only track1 has actual
    });
  });

  describe('Reporting Generation (15 tests)', () => {
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

    it('should generate markdown report', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(typeof report === 'string', 'Should return string');
      assert.ok(report.includes('# Track Analytics Report'), 'Should have title');
    });

    it('should include generation timestamp', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('Generated:'), 'Should include timestamp');
      assert.ok(/\d{4}-\d{2}-\d{2}/.test(report), 'Should match date format');
    });

    it('should include project metrics section', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('## Project Metrics'), 'Should have project metrics');
      assert.ok(report.includes('Completion Percentage'), 'Should show completion');
    });

    it('should include phase breakdown', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('## Phase Breakdown'), 'Should have phase section');
      assert.ok(report.includes('deployed'), 'Should list deployed phase');
    });

    it('should include agent metrics', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracksWithAgents = sampleTracks.map(t => ({ ...t, assignee: 'developer' }));
      const report = trackAnalytics.generateReport(tracksWithAgents);

      assert.ok(report.includes('## Agent Metrics'), 'Should have agent section');
    });

    it('should include priority breakdown', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('## Priority Breakdown'), 'Should have priority section');
    });

    it('should include insights section', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('## Insights'), 'Should have insights section');
    });

    it('should auto-generate insights (faster than estimated)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      // Track1: 3.5 actual vs 5 estimated (30% faster)
      assert.ok(
        report.includes('faster than estimated') || report.includes('under budget'),
        'Should detect faster completion'
      );
    });

    it('should auto-generate insights (critical priority items)', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('critical'), 'Should highlight critical items');
    });

    it('should include task list by status', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('### Completed Tasks'), 'Should list completed');
      assert.ok(report.includes('### In Progress Tasks'), 'Should list in-progress');
    });

    it('should format task entries correctly', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(report.includes('track1_20260129'), 'Should include track ID');
      assert.ok(report.includes('Implement user auth'), 'Should include description');
    });

    it('should handle empty tracks array', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport([]);

      assert.ok(report.includes('No tracks'), 'Should handle empty');
    });

    it('should include effort accuracy metrics', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      assert.ok(
        report.includes('Estimated') || report.includes('Actual'),
        'Should show effort comparison'
      );
    });

    it('should include data consistency validation', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      // Should validate no missing required fields
      assert.ok(!report.includes('ERROR'), 'Should not have validation errors');
    });

    it('should be valid markdown', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const report = trackAnalytics.generateReport(sampleTracks);

      // Check markdown structure
      assert.ok(/^#\s/.test(report), 'Should start with H1');
      assert.ok(/##\s/.test(report), 'Should have H2 sections');
      assert.ok(/\n-\s/.test(report) || /\|\s/.test(report), 'Should have lists or tables');
    });
  });

  describe('Edge Cases (20 tests)', () => {
    it('should handle null metrics object', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        metrics: null,
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject null metrics');
    });

    it('should handle missing phaseState field', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [{ trackId: 'test_20260129', type: 'feature', status: 'new' }];
      const result = trackAnalytics.queryByPhase('implementation', tracks);

      assert.strictEqual(result.tasks.length, 0);
    });

    it('should handle missing assignee field', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [{ trackId: 'test_20260129', type: 'feature', status: 'new' }];
      const result = trackAnalytics.queryByAgent('developer', tracks);

      assert.strictEqual(result.tasks.length, 0);
    });

    it('should handle missing estimatedEffort field', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [{ trackId: 'test_20260129', type: 'feature', status: 'completed' }];
      const result = trackAnalytics.computeProjectMetrics(tracks);

      assert.strictEqual(result.totalEstimatedDays, 0);
    });

    it('should handle missing actualEffort field', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [
        {
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          estimatedEffort: { days: 5 },
        },
      ];
      const result = trackAnalytics.computeProjectMetrics(tracks);

      assert.strictEqual(result.totalActualDays, 0);
    });

    it('should handle effort.days = 0', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        estimatedEffort: { days: 0 },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Should allow zero effort');
    });

    it('should handle very large effort values', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'in_progress',
        estimatedEffort: { days: 365 },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Should allow large effort values');
    });

    it('should handle float effort values', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        estimatedEffort: { days: 2.5 },
        actualEffort: { days: 1.75 },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Should allow float values');
    });

    it('should handle empty insights array', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        reporting: {
          generatedAt: '2026-01-29T10:00:00Z',
          insights: [],
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Should allow empty insights');
    });

    it('should handle very long insight strings', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        reporting: {
          generatedAt: '2026-01-29T10:00:00Z',
          insights: ['A'.repeat(1000)],
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Should allow long insights');
    });

    it('should handle missing timestamp in reporting', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        reporting: {
          insights: ['Test insight'],
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Timestamp is optional');
    });

    it('should reject invalid timestamp format', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        reporting: {
          generatedAt: '2026-01-29', // Not full ISO 8601
        },
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject partial timestamp');
    });

    it('should handle division by zero in metrics', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [
        {
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          estimatedEffort: { days: 0 },
          actualEffort: { days: 5 },
        },
      ];

      const result = trackAnalytics.computeProjectMetrics(tracks);

      // Should not throw, should handle gracefully
      assert.ok(result.avgEffortMultiplier === Infinity || result.avgEffortMultiplier === null);
    });

    it('should handle tracks without timestamps for duration calc', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [{ trackId: 'test_20260129', type: 'feature', status: 'completed' }];
      const result = trackAnalytics.queryByStatus('completed', tracks);

      assert.ok(result.metrics.avgDurationDays === 0 || result.metrics.avgDurationDays === null);
    });

    it('should handle malformed timestamps gracefully', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [
        {
          trackId: 'test_20260129',
          type: 'feature',
          status: 'completed',
          created_at: 'invalid-date',
          updated_at: 'invalid-date',
        },
      ];

      const result = trackAnalytics.queryByStatus('completed', tracks);

      // Should not throw
      assert.ok(result);
    });

    it('should handle circular dependencies gracefully', () => {
      // Note: Schema validation won't catch circular deps
      // Analytics functions should handle gracefully
      const metadata = {
        trackId: 'test1_20260129',
        type: 'feature',
        status: 'new',
        dependencies: ['test2_20260129'],
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Schema allows dependencies');
    });

    it('should handle missing required fields in query functions', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = [{ trackId: 'test_20260129' }]; // Missing type, status
      const result = trackAnalytics.computeProjectMetrics(tracks);

      // Should not throw, should handle gracefully
      assert.ok(result);
    });

    it('should handle empty string in fields', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        description: '', // Empty but string
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject empty description (minLength: 10)');
    });

    it('should handle mixed case in enum fields', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'FEATURE', // Wrong case
        status: 'new',
      };

      const valid = validate(metadata);
      assert.ok(!valid, 'Should reject wrong case');
    });

    it('should handle undefined vs null values', () => {
      const metadataNull = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'new',
        priority: null,
      };

      const valid = validate(metadataNull);
      assert.ok(!valid, 'Should reject null enum value');
    });
  });

  describe('Performance Tests (5 tests)', () => {
    it('should validate 1000 metadata objects in <1 second', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const metadata = {
          trackId: `test${i}_20260129`,
          type: 'feature',
          status: 'new',
          metrics: {
            elapsedTimeMs: 1000 * i,
            effortMultiplier: 1.0,
            riskScore: 50,
            completionRate: 0,
          },
        };

        validate(metadata);
      }

      const elapsed = Date.now() - startTime;
      assert.ok(elapsed < 1000, `Validation took ${elapsed}ms, should be <1000ms`);
    });

    it('should query 1000 tracks by phase in <100ms', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = Array.from({ length: 1000 }, (_, i) => ({
        trackId: `test${i}_20260129`,
        type: 'feature',
        status: 'completed',
        phaseState: i % 2 === 0 ? 'deployed' : 'implementation',
      }));

      const startTime = Date.now();
      trackAnalytics.queryByPhase('deployed', tracks);
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 100, `Query took ${elapsed}ms, should be <100ms`);
    });

    it('should compute project metrics for 1000 tracks in <200ms', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = Array.from({ length: 1000 }, (_, i) => ({
        trackId: `test${i}_20260129`,
        type: 'feature',
        status: i % 3 === 0 ? 'completed' : 'in_progress',
        estimatedEffort: { days: 5 },
        actualEffort: { days: i % 3 === 0 ? 3.5 : undefined },
      }));

      const startTime = Date.now();
      trackAnalytics.computeProjectMetrics(tracks);
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 200, `Metrics took ${elapsed}ms, should be <200ms`);
    });

    it('should generate report for 1000 tracks in <500ms', () => {
      if (!trackAnalytics) {
        assert.fail('Analytics library not loaded');
      }

      const tracks = Array.from({ length: 1000 }, (_, i) => ({
        trackId: `test${i}_20260129`,
        type: 'feature',
        status: i % 3 === 0 ? 'completed' : 'in_progress',
        description: `Test track ${i}`,
      }));

      const startTime = Date.now();
      trackAnalytics.generateReport(tracks);
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 500, `Report generation took ${elapsed}ms, should be <500ms`);
    });

    it('should handle deeply nested effort breakdowns without stack overflow', () => {
      const metadata = {
        trackId: 'test_20260129',
        type: 'feature',
        status: 'completed',
        estimatedEffort: {
          days: 10,
          breakdown: {
            design: 2,
            implementation: 5,
            testing: 2,
            documentation: 1,
          },
        },
        actualEffort: {
          days: 8,
          breakdown: {
            design: 1.5,
            implementation: 4,
            testing: 1.5,
            documentation: 1,
          },
        },
      };

      const valid = validate(metadata);
      assert.ok(valid, 'Should handle nested breakdowns');
    });
  });
});
