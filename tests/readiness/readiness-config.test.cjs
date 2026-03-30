'use strict';

/**
 * Tests for Readiness Config
 *
 * Covers validation contract assertions:
 * - VAL-RR-003: Configurable per-project thresholds
 *   - loadConfig with no config file returns DEFAULT_CONFIG without error
 *   - loadConfig merges overrides onto defaults
 *   - Individual pillar weights can be overridden (deep merge, not replace)
 *   - Invalid JSON logs warning and returns DEFAULT_CONFIG
 *   - getThreshold returns per-pillar pass threshold
 *   - getPillarWeights returns merged weight map
 *   - Deep merge preserves unspecified default values
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadConfig,
  getThreshold,
  getPillarWeights,
  DEFAULT_CONFIG,
  DEFAULT_PILLAR_WEIGHTS,
  DEFAULT_LEVEL_BOUNDARIES,
} = require('../../.claude/lib/readiness/readiness-config.cjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Write a .claude/readiness.json file in a temp project directory.
 * @param {string} tmpDir - Temp directory root
 * @param {object} config - Config object to write (will be JSON-stringified)
 */
function writeReadinessJson(tmpDir, config) {
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'readiness.json'), JSON.stringify(config), 'utf8');
}

/**
 * Write raw content to .claude/readiness.json (for invalid JSON tests).
 * @param {string} tmpDir - Temp directory root
 * @param {string} rawContent - Raw string content
 */
function writeReadinessJsonRaw(tmpDir, rawContent) {
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'readiness.json'), rawContent, 'utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('readiness-config', () => {
  // ─── DEFAULT_CONFIG exports ───────────────────────────────────────────────

  describe('DEFAULT_CONFIG', () => {
    it('exports DEFAULT_CONFIG with gateThreshold of 80', () => {
      assert.equal(DEFAULT_CONFIG.gateThreshold, 80);
    });

    it('exports DEFAULT_CONFIG with all 9 pillar weights', () => {
      const keys = Object.keys(DEFAULT_CONFIG.pillarWeights);
      assert.equal(keys.length, 9);
      assert.ok(keys.includes('styleAndValidation'));
      assert.ok(keys.includes('buildSystem'));
      assert.ok(keys.includes('testing'));
      assert.ok(keys.includes('documentation'));
      assert.ok(keys.includes('developmentEnvironment'));
      assert.ok(keys.includes('debuggingAndObservability'));
      assert.ok(keys.includes('security'));
      assert.ok(keys.includes('taskDiscovery'));
      assert.ok(keys.includes('productAndExperimentation'));
    });

    it('exports DEFAULT_CONFIG pillarWeights matching PILLAR_WEIGHTS from readiness-scorer.cjs', () => {
      assert.equal(DEFAULT_CONFIG.pillarWeights.styleAndValidation, 1.0);
      assert.equal(DEFAULT_CONFIG.pillarWeights.buildSystem, 1.0);
      assert.equal(DEFAULT_CONFIG.pillarWeights.testing, 1.5);
      assert.equal(DEFAULT_CONFIG.pillarWeights.documentation, 0.8);
      assert.equal(DEFAULT_CONFIG.pillarWeights.developmentEnvironment, 0.8);
      assert.equal(DEFAULT_CONFIG.pillarWeights.debuggingAndObservability, 1.0);
      assert.equal(DEFAULT_CONFIG.pillarWeights.security, 1.2);
      assert.equal(DEFAULT_CONFIG.pillarWeights.taskDiscovery, 0.7);
      assert.equal(DEFAULT_CONFIG.pillarWeights.productAndExperimentation, 0.5);
    });

    it('exports DEFAULT_CONFIG levelBoundaries matching LEVEL_BOUNDARIES from readiness-scorer.cjs', () => {
      const boundaries = DEFAULT_CONFIG.levelBoundaries;
      assert.equal(boundaries.length, 5);

      const l1 = boundaries.find(b => b.name === 'L1');
      assert.ok(l1, 'L1 boundary should exist');
      assert.equal(l1.min, 0);
      assert.equal(l1.max, 39);

      const l5 = boundaries.find(b => b.name === 'L5');
      assert.ok(l5, 'L5 boundary should exist');
      assert.equal(l5.min, 95);
      assert.equal(l5.max, 100);
    });

    it('exports DEFAULT_PILLAR_WEIGHTS matching DEFAULT_CONFIG.pillarWeights', () => {
      assert.deepEqual(DEFAULT_PILLAR_WEIGHTS, DEFAULT_CONFIG.pillarWeights);
    });

    it('exports DEFAULT_LEVEL_BOUNDARIES matching DEFAULT_CONFIG.levelBoundaries', () => {
      assert.deepEqual(DEFAULT_LEVEL_BOUNDARIES, DEFAULT_CONFIG.levelBoundaries);
    });
  });

  // ─── loadConfig: missing config file ─────────────────────────────────────

  describe('loadConfig: missing config file', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-config-test-'));
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        // ignore cleanup errors (EBUSY on Windows)
      }
    });

    it('returns DEFAULT_CONFIG values when no .claude/readiness.json exists', () => {
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, DEFAULT_CONFIG.gateThreshold);
      assert.deepEqual(config.pillarWeights, DEFAULT_CONFIG.pillarWeights);
      assert.deepEqual(config.levelBoundaries, DEFAULT_CONFIG.levelBoundaries);
    });

    it('does not throw when config file is missing', () => {
      assert.doesNotThrow(() => loadConfig(tmpDir));
    });

    it('returns a copy, not a reference to DEFAULT_CONFIG', () => {
      const config = loadConfig(tmpDir);
      // Mutating the returned config should not affect DEFAULT_CONFIG
      config.pillarWeights.styleAndValidation = 999;
      assert.equal(DEFAULT_CONFIG.pillarWeights.styleAndValidation, 1.0);
    });

    it('returns gateThreshold 80 when no config file present', () => {
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, 80);
    });
  });

  // ─── loadConfig: merging overrides ───────────────────────────────────────

  describe('loadConfig: merging overrides onto defaults', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-config-merge-'));
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        // ignore cleanup errors
      }
    });

    it('merges gateThreshold override', () => {
      writeReadinessJson(tmpDir, { gateThreshold: 90 });
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, 90);
    });

    it('preserves default pillarWeights when only gateThreshold is overridden', () => {
      writeReadinessJson(tmpDir, { gateThreshold: 90 });
      const config = loadConfig(tmpDir);
      assert.deepEqual(config.pillarWeights, DEFAULT_CONFIG.pillarWeights);
    });

    it('merges individual pillar weight without replacing the whole object', () => {
      writeReadinessJson(tmpDir, { pillarWeights: { testing: 2.0 } });
      const config = loadConfig(tmpDir);
      // Overridden pillar reflects new value
      assert.equal(config.pillarWeights.testing, 2.0);
      // All other pillars remain at their defaults
      assert.equal(config.pillarWeights.styleAndValidation, 1.0);
      assert.equal(config.pillarWeights.buildSystem, 1.0);
      assert.equal(config.pillarWeights.documentation, 0.8);
      assert.equal(config.pillarWeights.developmentEnvironment, 0.8);
      assert.equal(config.pillarWeights.debuggingAndObservability, 1.0);
      assert.equal(config.pillarWeights.security, 1.2);
      assert.equal(config.pillarWeights.taskDiscovery, 0.7);
      assert.equal(config.pillarWeights.productAndExperimentation, 0.5);
    });

    it('deep merge preserves unspecified pillar defaults', () => {
      // Only override security weight — all others should stay at defaults
      writeReadinessJson(tmpDir, { pillarWeights: { security: 2.5 } });
      const config = loadConfig(tmpDir);
      assert.equal(config.pillarWeights.security, 2.5);
      assert.equal(config.pillarWeights.testing, DEFAULT_CONFIG.pillarWeights.testing);
      assert.equal(config.pillarWeights.taskDiscovery, DEFAULT_CONFIG.pillarWeights.taskDiscovery);
    });

    it('multiple pillar weights can be overridden simultaneously', () => {
      writeReadinessJson(tmpDir, {
        pillarWeights: { testing: 3.0, security: 0.5, documentation: 0.2 },
      });
      const config = loadConfig(tmpDir);
      assert.equal(config.pillarWeights.testing, 3.0);
      assert.equal(config.pillarWeights.security, 0.5);
      assert.equal(config.pillarWeights.documentation, 0.2);
      // Unspecified pillars stay at defaults
      assert.equal(config.pillarWeights.buildSystem, 1.0);
      assert.equal(config.pillarWeights.styleAndValidation, 1.0);
    });

    it('merges levelBoundaries override when provided', () => {
      const customBoundaries = [
        { name: 'L1', min: 0, max: 49 },
        { name: 'L2', min: 50, max: 100 },
      ];
      writeReadinessJson(tmpDir, { levelBoundaries: customBoundaries });
      const config = loadConfig(tmpDir);
      assert.deepEqual(config.levelBoundaries, customBoundaries);
    });

    it('uses default levelBoundaries when not overridden', () => {
      writeReadinessJson(tmpDir, { gateThreshold: 75 });
      const config = loadConfig(tmpDir);
      assert.deepEqual(config.levelBoundaries, DEFAULT_CONFIG.levelBoundaries);
    });

    it('empty overrides object returns full defaults', () => {
      writeReadinessJson(tmpDir, {});
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, DEFAULT_CONFIG.gateThreshold);
      assert.deepEqual(config.pillarWeights, DEFAULT_CONFIG.pillarWeights);
      assert.deepEqual(config.levelBoundaries, DEFAULT_CONFIG.levelBoundaries);
    });
  });

  // ─── loadConfig: invalid JSON ─────────────────────────────────────────────

  describe('loadConfig: invalid JSON fallback', () => {
    let tmpDir;
    let originalWarn;
    let warnMessages;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-config-invalid-'));
      // Capture console.warn output
      originalWarn = console.warn;
      warnMessages = [];
      console.warn = (...args) => {
        warnMessages.push(args.join(' '));
      };
    });

    after(() => {
      console.warn = originalWarn;
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        // ignore cleanup errors
      }
    });

    it('returns DEFAULT_CONFIG values when JSON is invalid', () => {
      warnMessages = [];
      writeReadinessJsonRaw(tmpDir, '{ this is not valid json }');
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, DEFAULT_CONFIG.gateThreshold);
      assert.deepEqual(config.pillarWeights, DEFAULT_CONFIG.pillarWeights);
      assert.deepEqual(config.levelBoundaries, DEFAULT_CONFIG.levelBoundaries);
    });

    it('logs a warning when JSON is invalid', () => {
      warnMessages = [];
      writeReadinessJsonRaw(tmpDir, '{ broken json !!!');
      loadConfig(tmpDir);
      assert.ok(warnMessages.length > 0, 'Should have logged at least one warning');
    });

    it('does not throw when JSON is invalid', () => {
      writeReadinessJsonRaw(tmpDir, 'NOT_JSON_AT_ALL');
      assert.doesNotThrow(() => loadConfig(tmpDir));
    });

    it('does not throw when config file is empty', () => {
      writeReadinessJsonRaw(tmpDir, '');
      assert.doesNotThrow(() => loadConfig(tmpDir));
    });

    it('returns defaults when config file is empty', () => {
      writeReadinessJsonRaw(tmpDir, '');
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, DEFAULT_CONFIG.gateThreshold);
    });
  });

  // ─── getThreshold ─────────────────────────────────────────────────────────

  describe('getThreshold', () => {
    it('returns gateThreshold from config when no pillarThresholds defined', () => {
      const config = { gateThreshold: 75 };
      assert.equal(getThreshold(config, 'testing'), 75);
    });

    it('returns per-pillar threshold when pillarThresholds[pillar] is defined', () => {
      const config = {
        gateThreshold: 80,
        pillarThresholds: { testing: 90 },
      };
      assert.equal(getThreshold(config, 'testing'), 90);
    });

    it('returns gateThreshold for pillars not in pillarThresholds', () => {
      const config = {
        gateThreshold: 80,
        pillarThresholds: { testing: 90 },
      };
      assert.equal(getThreshold(config, 'security'), 80);
    });

    it('returns DEFAULT_CONFIG.gateThreshold when config is null', () => {
      assert.equal(getThreshold(null, 'testing'), DEFAULT_CONFIG.gateThreshold);
    });

    it('returns DEFAULT_CONFIG.gateThreshold when config is undefined', () => {
      assert.equal(getThreshold(undefined, 'testing'), DEFAULT_CONFIG.gateThreshold);
    });

    it('returns correct threshold for all 9 pillars when using default gateThreshold', () => {
      const config = { gateThreshold: 80 };
      const pillars = [
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
      for (const pillar of pillars) {
        assert.equal(getThreshold(config, pillar), 80, `threshold for ${pillar} should be 80`);
      }
    });

    it('returns per-pillar threshold when available (overrides gateThreshold)', () => {
      const config = {
        gateThreshold: 80,
        pillarThresholds: {
          testing: 95,
          security: 70,
        },
      };
      assert.equal(getThreshold(config, 'testing'), 95);
      assert.equal(getThreshold(config, 'security'), 70);
      // Others fall back to gateThreshold
      assert.equal(getThreshold(config, 'documentation'), 80);
    });

    it('returns gateThreshold from loadConfig result for a project with no overrides', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-gt-'));
      try {
        const config = loadConfig(tmpDir);
        assert.equal(getThreshold(config, 'testing'), 80);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) {
          // ignore
        }
      }
    });
  });

  // ─── getPillarWeights ─────────────────────────────────────────────────────

  describe('getPillarWeights', () => {
    it('returns pillarWeights from config when present', () => {
      const config = {
        pillarWeights: { testing: 2.0, security: 1.5 },
      };
      const weights = getPillarWeights(config);
      assert.equal(weights.testing, 2.0);
      assert.equal(weights.security, 1.5);
    });

    it('returns DEFAULT_CONFIG.pillarWeights when config has no pillarWeights', () => {
      const config = { gateThreshold: 80 };
      const weights = getPillarWeights(config);
      assert.deepEqual(weights, DEFAULT_CONFIG.pillarWeights);
    });

    it('returns DEFAULT_CONFIG.pillarWeights when config is null', () => {
      const weights = getPillarWeights(null);
      assert.deepEqual(weights, DEFAULT_CONFIG.pillarWeights);
    });

    it('returns DEFAULT_CONFIG.pillarWeights when config is undefined', () => {
      const weights = getPillarWeights(undefined);
      assert.deepEqual(weights, DEFAULT_CONFIG.pillarWeights);
    });

    it('returns a copy, not a reference to internal state', () => {
      const config = loadConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-pw-')));
      const weights = getPillarWeights(config);
      weights.testing = 999;
      // DEFAULT_CONFIG should not be mutated
      assert.equal(DEFAULT_CONFIG.pillarWeights.testing, 1.5);
    });

    it('returns merged weight map from loadConfig result for project with single override', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-pw2-'));
      try {
        writeReadinessJson(tmpDir, { pillarWeights: { testing: 2.0 } });
        const config = loadConfig(tmpDir);
        const weights = getPillarWeights(config);
        assert.equal(weights.testing, 2.0);
        // All other defaults preserved
        assert.equal(weights.styleAndValidation, 1.0);
        assert.equal(weights.security, 1.2);
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (_) {
          // ignore
        }
      }
    });

    it('returns all 9 pillar weights', () => {
      const config = loadConfig(fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-pw3-')));
      const weights = getPillarWeights(config);
      assert.equal(Object.keys(weights).length, 9);
    });
  });

  // ─── VAL-RR-003: integration test ────────────────────────────────────────

  describe('VAL-RR-003: Configurable per-project thresholds', () => {
    let tmpDir;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-val-rr-003-'));
    });

    after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        // ignore cleanup errors
      }
    });

    it('missing config file uses defaults without error', () => {
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, 80);
      assert.deepEqual(config.pillarWeights, DEFAULT_CONFIG.pillarWeights);
    });

    it('custom pillar weights and level thresholds are loaded when .claude/readiness.json exists', () => {
      writeReadinessJson(tmpDir, {
        gateThreshold: 70,
        pillarWeights: { testing: 2.0, security: 0.5 },
        levelBoundaries: [
          { name: 'L1', min: 0, max: 49 },
          { name: 'L2', min: 50, max: 100 },
        ],
      });
      const config = loadConfig(tmpDir);
      assert.equal(config.gateThreshold, 70);
      assert.equal(config.pillarWeights.testing, 2.0);
      assert.equal(config.pillarWeights.security, 0.5);
      // Unspecified defaults preserved
      assert.equal(config.pillarWeights.styleAndValidation, 1.0);
      assert.equal(config.levelBoundaries.length, 2);
    });

    it('full round-trip: loadConfig -> getThreshold -> getPillarWeights', () => {
      writeReadinessJson(tmpDir, {
        gateThreshold: 85,
        pillarWeights: { testing: 2.5 },
        pillarThresholds: { security: 70 },
      });
      const config = loadConfig(tmpDir);

      // getThreshold uses gateThreshold for most pillars
      assert.equal(getThreshold(config, 'testing'), 85);
      // getThreshold uses pillarThresholds for security
      assert.equal(getThreshold(config, 'security'), 70);

      // getPillarWeights returns merged weights
      const weights = getPillarWeights(config);
      assert.equal(weights.testing, 2.5);
      assert.equal(weights.buildSystem, DEFAULT_CONFIG.pillarWeights.buildSystem);
    });
  });
});
