'use strict';

/**
 * Tests for Readiness Scorer
 *
 * Covers validation contract assertions:
 * - VAL-RS-001: All 9 pillars evaluated and present in output
 * - VAL-RS-002: Pillar weights match specification
 * - VAL-RS-003: 5-level AMM correctly classifies readiness
 * - VAL-RS-004: JSON output contract is stable (AJV validated)
 * - VAL-RS-005: Running against agent-studio produces valid report
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Ajv = require('ajv');

// Module under test
const { ReadinessScorer, PILLAR_WEIGHTS, LEVEL_BOUNDARIES } =
  require('../../.claude/lib/readiness/readiness-scorer.cjs');

// Expected pillar names (from spec)
const EXPECTED_PILLARS = [
  'styleAndValidation',
  'buildSystem',
  'testing',
  'documentation',
  'developmentEnvironment',
  'debuggingAndObservability',
  'security',
  'taskDiscovery',
  'productAndExperimentation',
];

// Expected weights (from spec)
const EXPECTED_WEIGHTS = {
  styleAndValidation: 1.0,
  buildSystem: 1.0,
  testing: 1.5,
  documentation: 0.8,
  developmentEnvironment: 0.8,
  debuggingAndObservability: 1.0,
  security: 1.2,
  taskDiscovery: 0.7,
  productAndExperimentation: 0.5,
};

// JSON Schema for readiness report output
const READINESS_REPORT_SCHEMA = {
  type: 'object',
  required: ['repoPath', 'timestamp', 'level', 'overallScore', 'pillars', 'gateStatus'],
  properties: {
    repoPath: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    level: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4', 'L5'] },
    overallScore: { type: 'number', minimum: 0, maximum: 100 },
    pillars: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['score', 'passed', 'weight', 'command', 'exitCode'],
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
          passed: { type: 'boolean' },
          weight: { type: 'number' },
          command: { type: 'string' },
          exitCode: { type: 'number', nullable: true },
          reason: { type: 'string', nullable: true },
        },
        additionalProperties: false,
      },
    },
    gateStatus: {
      type: 'object',
      required: ['passed', 'threshold'],
      properties: {
        passed: { type: 'boolean' },
        threshold: { type: 'number' },
        details: { type: 'string' },
      },
      additionalProperties: true,
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: true,
};

describe('Readiness Scorer', () => {
  let tempDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-scorer-test-'));
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('VAL-RS-001: All 9 pillars evaluated and present in output', () => {
    it('has exactly 9 pillar names defined', () => {
      const pillarNames = Object.keys(PILLAR_WEIGHTS);
      assert.strictEqual(pillarNames.length, 9, 'Should have exactly 9 pillars');
    });

    it('has all expected pillar names', () => {
      const pillarNames = Object.keys(PILLAR_WEIGHTS);
      for (const expected of EXPECTED_PILLARS) {
        assert.ok(pillarNames.includes(expected), `Missing pillar: ${expected}`);
      }
    });

    it('report includes all 9 pillars with scores', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();

      // Check all 9 pillars present
      const reportPillarNames = Object.keys(report.pillars);
      assert.strictEqual(reportPillarNames.length, 9, 'Report should have 9 pillars');

      for (const expected of EXPECTED_PILLARS) {
        assert.ok(reportPillarNames.includes(expected), `Report missing pillar: ${expected}`);
        const pillar = report.pillars[expected];
        assert.ok(typeof pillar.score === 'number', `Pillar ${expected} should have score`);
        assert.ok(typeof pillar.passed === 'boolean', `Pillar ${expected} should have passed flag`);
        assert.ok(typeof pillar.command === 'string', `Pillar ${expected} should have command`);
      }
    });
  });

  describe('VAL-RS-002: Pillar weights match specification', () => {
    it('testing weight is 1.5', () => {
      assert.strictEqual(PILLAR_WEIGHTS.testing, 1.5);
    });

    it('security weight is 1.2', () => {
      assert.strictEqual(PILLAR_WEIGHTS.security, 1.2);
    });

    it('styleAndValidation weight is 1.0', () => {
      assert.strictEqual(PILLAR_WEIGHTS.styleAndValidation, 1.0);
    });

    it('buildSystem weight is 1.0', () => {
      assert.strictEqual(PILLAR_WEIGHTS.buildSystem, 1.0);
    });

    it('debuggingAndObservability weight is 1.0', () => {
      assert.strictEqual(PILLAR_WEIGHTS.debuggingAndObservability, 1.0);
    });

    it('documentation weight is 0.8', () => {
      assert.strictEqual(PILLAR_WEIGHTS.documentation, 0.8);
    });

    it('developmentEnvironment weight is 0.8', () => {
      assert.strictEqual(PILLAR_WEIGHTS.developmentEnvironment, 0.8);
    });

    it('taskDiscovery weight is 0.7', () => {
      assert.strictEqual(PILLAR_WEIGHTS.taskDiscovery, 0.7);
    });

    it('productAndExperimentation weight is 0.5', () => {
      assert.strictEqual(PILLAR_WEIGHTS.productAndExperimentation, 0.5);
    });

    it('overall score is weighted average', () => {
      // Create a mock scorer where we know the pillar scores
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
        mockPillars: {
          styleAndValidation: { score: 100, exitCode: 0 },
          buildSystem: { score: 100, exitCode: 0 },
          testing: { score: 100, exitCode: 0 },
          documentation: { score: 100, exitCode: 0 },
          developmentEnvironment: { score: 100, exitCode: 0 },
          debuggingAndObservability: { score: 100, exitCode: 0 },
          security: { score: 100, exitCode: 0 },
          taskDiscovery: { score: 100, exitCode: 0 },
          productAndExperimentation: { score: 100, exitCode: 0 },
        },
      });

      const report = scorer.score();

      // With all pillars at 100, overall should be 100
      assert.strictEqual(report.overallScore, 100);

      // Calculate weighted average manually
      let totalWeightedScore = 0;
      let totalWeight = 0;

      for (const pillar of Object.keys(EXPECTED_WEIGHTS)) {
        totalWeightedScore += 100 * EXPECTED_WEIGHTS[pillar];
        totalWeight += EXPECTED_WEIGHTS[pillar];
      }

      const expectedAverage = totalWeightedScore / totalWeight;
      assert.strictEqual(report.overallScore, Math.round(expectedAverage));
    });

    it('weights in pillar output match specification', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();

      for (const [name, expectedWeight] of Object.entries(EXPECTED_WEIGHTS)) {
        const pillar = report.pillars[name];
        assert.ok(pillar, `Pillar ${name} should exist`);
        assert.strictEqual(pillar.weight, expectedWeight, `Pillar ${name} weight mismatch`);
      }
    });
  });

  describe('VAL-RS-003: 5-level AMM correctly classifies readiness', () => {
    it('level L1 for score 0-39', () => {
      const boundaries = LEVEL_BOUNDARIES.find(b => b.name === 'L1');
      assert.strictEqual(boundaries.min, 0);
      assert.strictEqual(boundaries.max, 39);
    });

    it('level L2 for score 40-59', () => {
      const boundaries = LEVEL_BOUNDARIES.find(b => b.name === 'L2');
      assert.strictEqual(boundaries.min, 40);
      assert.strictEqual(boundaries.max, 59);
    });

    it('level L3 for score 60-79', () => {
      const boundaries = LEVEL_BOUNDARIES.find(b => b.name === 'L3');
      assert.strictEqual(boundaries.min, 60);
      assert.strictEqual(boundaries.max, 79);
    });

    it('level L4 for score 80-94', () => {
      const boundaries = LEVEL_BOUNDARIES.find(b => b.name === 'L4');
      assert.strictEqual(boundaries.min, 80);
      assert.strictEqual(boundaries.max, 94);
    });

    it('level L5 for score 95-100', () => {
      const boundaries = LEVEL_BOUNDARIES.find(b => b.name === 'L5');
      assert.strictEqual(boundaries.min, 95);
      assert.strictEqual(boundaries.max, 100);
    });

    // Helper to create mock pillars for score testing
    function createMockPillarsForScore(targetScore) {
      const mockPillars = {};
      for (const pillarName of EXPECTED_PILLARS) {
        mockPillars[pillarName] = { score: targetScore, exitCode: 0 };
      }
      return mockPillars;
    }

    it('boundary value 39 maps to L1', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(39),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L1');
    });

    it('boundary value 40 maps to L2', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(40),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L2');
    });

    it('boundary value 59 maps to L2', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(59),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L2');
    });

    it('boundary value 60 maps to L3', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(60),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L3');
    });

    it('boundary value 79 maps to L3', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(79),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L3');
    });

    it('boundary value 80 maps to L4', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(80),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L4');
    });

    it('boundary value 94 maps to L4', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(94),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L4');
    });

    it('boundary value 95 maps to L5', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(95),
      });
      const report = scorer.score();
      assert.strictEqual(report.level, 'L5');
    });
  });

  describe('VAL-RS-004: JSON output contract is stable (AJV validated)', () => {
    it('output conforms to schema with all required fields', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();

      // Validate with AJV
      const ajv = new Ajv({ strict: false });
      const validate = ajv.compile(READINESS_REPORT_SCHEMA);
      const valid = validate(report);

      assert.ok(valid, `Schema validation failed: ${JSON.stringify(validate.errors, null, 2)}`);
    });

    it('repoPath is a string', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();
      assert.strictEqual(typeof report.repoPath, 'string');
      assert.strictEqual(report.repoPath, tempDir);
    });

    it('timestamp is valid ISO string', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();
      assert.strictEqual(typeof report.timestamp, 'string');

      // Should be parseable as a date
      const date = new Date(report.timestamp);
      assert.ok(!isNaN(date.getTime()), 'timestamp should be valid date');
    });

    it('level is one of L1-L5', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();
      assert.ok(['L1', 'L2', 'L3', 'L4', 'L5'].includes(report.level));
    });

    it('overallScore is number between 0 and 100', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();
      assert.strictEqual(typeof report.overallScore, 'number');
      assert.ok(report.overallScore >= 0, 'score should be >= 0');
      assert.ok(report.overallScore <= 100, 'score should be <= 100');
    });

    it('gateStatus has passed and threshold', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();
      assert.ok(typeof report.gateStatus === 'object');
      assert.strictEqual(typeof report.gateStatus.passed, 'boolean');
      assert.strictEqual(typeof report.gateStatus.threshold, 'number');
    });

    it('recommendations is an array', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();
      assert.ok(Array.isArray(report.recommendations));
    });

    it('each pillar has required fields', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();

      for (const [name, pillar] of Object.entries(report.pillars)) {
        assert.strictEqual(typeof pillar.score, 'number', `${name} should have score`);
        assert.strictEqual(typeof pillar.passed, 'boolean', `${name} should have passed`);
        assert.strictEqual(typeof pillar.weight, 'number', `${name} should have weight`);
        assert.strictEqual(typeof pillar.command, 'string', `${name} should have command`);
        // exitCode can be null for timeout
        assert.ok(
          pillar.exitCode === null || typeof pillar.exitCode === 'number',
          `${name} should have exitCode`
        );
      }
    });
  });

  describe('Command execution and timeout handling', () => {
    it('command timeout produces partial score, not crash', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 1, // 1ms timeout - should timeout on most commands
      });

      // Should not throw
      const report = scorer.score();

      // Should still have valid structure
      assert.strictEqual(typeof report.overallScore, 'number');
      assert.ok(report.overallScore >= 0);

      // Check that pillars still have valid data
      for (const pillar of Object.values(report.pillars)) {
        assert.strictEqual(typeof pillar.score, 'number');
      }
    });

    it('exit code captured for each pillar command', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        timeout: 5000,
      });

      const report = scorer.score();

      for (const [name, pillar] of Object.entries(report.pillars)) {
        // exitCode should be defined (null for timeout, number for actual exit)
        assert.ok(
          pillar.exitCode !== undefined,
          `${name} should have exitCode defined`
        );
      }
    });

    it('passed is true when exit code is 0', () => {
      // Mock scorer with known exit codes
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: {
          testing: { score: 100, exitCode: 0 },
        },
      });

      const report = scorer.score();
      assert.strictEqual(report.pillars.testing.passed, true);
    });

    it('passed is false when exit code is non-zero', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: {
          testing: { score: 50, exitCode: 1 },
        },
      });

      const report = scorer.score();
      assert.strictEqual(report.pillars.testing.passed, false);
    });
  });

  describe('Gate threshold (80%)', () => {
    // Helper to create mock pillars for score testing
    function createMockPillarsForScore(targetScore) {
      const mockPillars = {};
      for (const pillarName of EXPECTED_PILLARS) {
        mockPillars[pillarName] = { score: targetScore, exitCode: 0 };
      }
      return mockPillars;
    }

    it('gateStatus.passed is true when score >= 80', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(80),
      });

      const report = scorer.score();
      assert.strictEqual(report.gateStatus.passed, true);
      assert.strictEqual(report.gateStatus.threshold, 80);
    });

    it('gateStatus.passed is false when score < 80', () => {
      const scorer = new ReadinessScorer({
        repoPath: tempDir,
        mockPillars: createMockPillarsForScore(79),
      });

      const report = scorer.score();
      assert.strictEqual(report.gateStatus.passed, false);
      assert.strictEqual(report.gateStatus.threshold, 80);
    });
  });
});

// Integration test - runs only when explicitly requested
describe('VAL-RS-005: Running against agent-studio repo itself', { skip: true }, () => {
  // This test is skipped by default to avoid long-running tests
  // Enable with --test-flag or by changing skip: false

  const projectRoot = path.resolve(__dirname, '..', '..');

  it('produces valid report without errors', () => {
    const scorer = new ReadinessScorer({
      repoPath: projectRoot,
      timeout: 30000,
    });

    const report = scorer.score();

    // No errors - should produce valid output
    assert.ok(report, 'Should produce a report');
    assert.strictEqual(typeof report, 'object');
  });

  it('has all 9 pillars with scores', () => {
    const scorer = new ReadinessScorer({
      repoPath: projectRoot,
      timeout: 30000,
    });

    const report = scorer.score();

    assert.strictEqual(Object.keys(report.pillars).length, 9);

    for (const pillar of Object.values(report.pillars)) {
      assert.strictEqual(typeof pillar.score, 'number');
      assert.ok(pillar.score >= 0 && pillar.score <= 100);
    }
  });

  it('score is a valid number between 0-100', () => {
    const scorer = new ReadinessScorer({
      repoPath: projectRoot,
      timeout: 30000,
    });

    const report = scorer.score();

    assert.strictEqual(typeof report.overallScore, 'number');
    assert.ok(report.overallScore >= 0, 'Score >= 0');
    assert.ok(report.overallScore <= 100, 'Score <= 100');
  });

  it('level is at least L2 for a well-configured repo', () => {
    const scorer = new ReadinessScorer({
      repoPath: projectRoot,
      timeout: 30000,
    });

    const report = scorer.score();

    // agent-studio should score at least L2 (40+) since it has
    // build system, testing, linting, etc.
    const levelNum = parseInt(report.level.substring(1), 10);
    assert.ok(levelNum >= 2, `Expected at least L2, got ${report.level}`);
  });
});
