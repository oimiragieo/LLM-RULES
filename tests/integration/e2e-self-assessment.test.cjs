'use strict';

/**
 * Zero-Mock Integration Tests: Self-Assessment
 *
 * Exercises real modules against the actual agent-studio repository with no mocks.
 *
 * VAL-E2E-003: ReadinessScorer self-assessment against agent-studio
 *   - Produces valid JSON report with all 9 pillars
 *   - All pillar scores in [0, 100]
 *   - Overall level >= L2
 *   - No zero-scored pillar
 *   - Deterministic across two consecutive runs
 *   - validateReport() returns true
 *
 * VAL-E2E-004: ServicesRegistry self-resolution against .factory/services.yaml
 *   - All canonical commands resolve to non-empty strings
 *   - Binary prefix of each command found on PATH
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  ReadinessScorer,
  validateReport,
} = require('../../.claude/lib/readiness/readiness-scorer.cjs');
const { ServicesRegistry } = require('../../.claude/lib/services/services-registry.cjs');
const { commandExists } = require('../../.claude/lib/utils/command-exists.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path to the agent-studio repository root */
const REPO_PATH = path.resolve(__dirname, '..', '..');

/** Path to the services.yaml within agent-studio */
const SERVICES_YAML_PATH = path.join(REPO_PATH, '.factory', 'services.yaml');

/** Expected pillar names from the 9-pillar AMM spec */
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

/**
 * Timeout per command for the ReadinessScorer (ms).
 * - Short enough that slow commands (pnpm test, lint) timeout quickly.
 * - Long enough for fast node existence-check commands (~200–400 ms spawn time).
 */
const SCORER_TIMEOUT = 2000;

// ---------------------------------------------------------------------------
// VAL-E2E-003: Readiness self-assessment
// ---------------------------------------------------------------------------

describe('VAL-E2E-003: Readiness self-assessment against agent-studio', () => {
  /** Report from run 1 (used for all assertions) */
  let report1;
  /** Report from run 2 (used for determinism assertion only) */
  let report2;

  before(() => {
    // Run 1
    const scorer1 = new ReadinessScorer({
      repoPath: REPO_PATH,
      timeout: SCORER_TIMEOUT,
    });
    report1 = scorer1.score();

    // Run 2 (determinism check)
    const scorer2 = new ReadinessScorer({
      repoPath: REPO_PATH,
      timeout: SCORER_TIMEOUT,
    });
    report2 = scorer2.score();
  });

  it('produces valid JSON output (parseable, non-empty report object)', () => {
    assert.ok(report1, 'ReadinessScorer should return a report object');
    assert.strictEqual(typeof report1, 'object', 'Report should be an object');

    // Must serialize / parse without errors
    const serialized = JSON.stringify(report1);
    assert.ok(serialized && serialized.length > 0, 'Report should serialize to non-empty JSON');
    const parsed = JSON.parse(serialized);
    assert.ok(parsed, 'Serialized report should be parseable back to object');
  });

  it('has exactly 9 pillar keys', () => {
    assert.ok(
      report1.pillars && typeof report1.pillars === 'object',
      'Report should have a pillars object'
    );
    const pillarKeys = Object.keys(report1.pillars);
    assert.strictEqual(
      pillarKeys.length,
      9,
      `Expected 9 pillars, got ${pillarKeys.length}: ${pillarKeys.join(', ')}`
    );

    // Verify all expected pillar names are present
    for (const name of EXPECTED_PILLARS) {
      assert.ok(name in report1.pillars, `Missing expected pillar: ${name}`);
    }
  });

  it('all pillar scores are numbers in [0, 100]', () => {
    for (const [name, pillar] of Object.entries(report1.pillars)) {
      assert.strictEqual(
        typeof pillar.score,
        'number',
        `Pillar '${name}' score should be a number, got ${typeof pillar.score}`
      );
      assert.ok(pillar.score >= 0, `Pillar '${name}' score should be >= 0, got ${pillar.score}`);
      assert.ok(
        pillar.score <= 100,
        `Pillar '${name}' score should be <= 100, got ${pillar.score}`
      );
    }
  });

  it('overall level is >= L2', () => {
    const validLevels = ['L1', 'L2', 'L3', 'L4', 'L5'];
    assert.ok(
      validLevels.includes(report1.level),
      `Report level '${report1.level}' is not a valid AMM level`
    );
    const levelNum = parseInt(report1.level.slice(1), 10);
    assert.ok(
      levelNum >= 2,
      `Expected overall level >= L2, got ${report1.level} (overallScore: ${report1.overallScore})`
    );
  });

  it('no pillar has score 0', () => {
    for (const [name, pillar] of Object.entries(report1.pillars)) {
      assert.ok(pillar.score > 0, `Pillar '${name}' must have score > 0, got ${pillar.score}`);
    }
  });

  it('two consecutive scorer runs produce identical pillar scores (deterministic)', () => {
    for (const name of EXPECTED_PILLARS) {
      const score1 = report1.pillars[name].score;
      const score2 = report2.pillars[name].score;
      assert.strictEqual(
        score1,
        score2,
        `Pillar '${name}' must be deterministic: run1=${score1}, run2=${score2}`
      );
    }
  });

  it('validateReport() returns true for the report', () => {
    const valid = validateReport(report1);
    assert.strictEqual(
      valid,
      true,
      `validateReport() returned false — schema validation failed: ${JSON.stringify(validateReport.errors)}`
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-E2E-004: ServicesRegistry self-resolution
// ---------------------------------------------------------------------------

describe('VAL-E2E-004: Services.yaml self-resolution and executability', () => {
  let registry;
  let loadResult;

  before(() => {
    registry = new ServicesRegistry(SERVICES_YAML_PATH);
    loadResult = registry.load();
  });

  it('loads agent-studio .factory/services.yaml successfully', () => {
    assert.strictEqual(
      loadResult.exists,
      true,
      `services.yaml should exist at: ${SERVICES_YAML_PATH}`
    );
    assert.strictEqual(
      loadResult.valid,
      true,
      `services.yaml should be valid — errors: ${JSON.stringify(loadResult.errors)}`
    );
  });

  it('all canonical commands resolve to non-empty strings', () => {
    const commands = registry.getCommands();
    const commandKeys = Object.keys(commands);

    assert.ok(commandKeys.length > 0, 'services.yaml should define at least one command');

    for (const key of commandKeys) {
      const resolved = registry.resolveCommand(key);
      assert.ok(
        typeof resolved === 'string' && resolved.trim().length > 0,
        `Command '${key}' should resolve to a non-empty string, got: ${JSON.stringify(resolved)}`
      );
    }
  });

  it('binary prefix (pnpm) of each command is found on PATH', () => {
    const commands = registry.getCommands();

    for (const key of Object.keys(commands)) {
      const resolved = registry.resolveCommand(key);
      if (!resolved) continue;

      // Extract the binary (first whitespace-delimited token)
      const binary = resolved.trim().split(/\s+/)[0];
      assert.ok(
        binary && binary.length > 0,
        `Command '${key}' resolved to '${resolved}' but has no binary prefix`
      );
      assert.ok(
        commandExists(binary),
        `Binary '${binary}' for command '${key}' should be found on PATH`
      );
    }
  });
});
