/**
 * Unit test: .claude/lib/ml/index.cjs export resolution (named vs default export).
 * Locks behavior so that default-export-only modules (pattern-detector, optimization-engine)
 * are resolved correctly and do not regress.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Reset env so we control which getters return instances
const originalEnv = { ...process.env };

function resetEnv() {
  process.env.PATTERN_DETECTION_ENABLED = originalEnv.PATTERN_DETECTION_ENABLED;
  process.env.PERFORMANCE_PROFILING_ENABLED = originalEnv.PERFORMANCE_PROFILING_ENABLED;
}

describe('ML index export resolution', () => {
  afterEach(() => {
    resetEnv();
    // Clear require cache so index re-reads env
    delete require.cache[require.resolve('../../.claude/lib/ml/index.cjs')];
  });

  it('getPatternDetector returns null when PATTERN_DETECTION_ENABLED is not set', () => {
    process.env.PATTERN_DETECTION_ENABLED = '';
    const ml = require('../../.claude/lib/ml/index.cjs');
    assert.equal(ml.getPatternDetector(), null);
  });

  it('getOptimizationEngine returns null when PERFORMANCE_PROFILING_ENABLED is not set', () => {
    process.env.PERFORMANCE_PROFILING_ENABLED = '';
    const ml = require('../../.claude/lib/ml/index.cjs');
    assert.equal(ml.getOptimizationEngine(), null);
  });

  it('getPatternDetector remains null when enabled (stubbed ML module)', () => {
    process.env.PATTERN_DETECTION_ENABLED = 'true';
    const ml = require('../../.claude/lib/ml/index.cjs');
    const instance = ml.getPatternDetector();
    assert.equal(instance, null);
  });

  it('getOptimizationEngine remains null when enabled (stubbed ML module)', () => {
    process.env.PERFORMANCE_PROFILING_ENABLED = 'true';
    const ml = require('../../.claude/lib/ml/index.cjs');
    const instance = ml.getOptimizationEngine();
    assert.equal(instance, null);
  });

  it('getOptimizationEngine does not expose instance methods in stub mode', () => {
    process.env.PERFORMANCE_PROFILING_ENABLED = 'true';
    const ml = require('../../.claude/lib/ml/index.cjs');
    const instance = ml.getOptimizationEngine();
    assert.equal(instance, null);
  });

  it('ML_AUTOMATION_MODE is exported and defaults to off', () => {
    process.env.ML_AUTOMATION_MODE = '';
    delete require.cache[require.resolve('../../.claude/lib/ml/index.cjs')];
    const ml = require('../../.claude/lib/ml/index.cjs');
    assert.equal(ml.ML_AUTOMATION_MODE, 'off');
    assert.equal(ml.getMLAutomationMode(), 'off');
  });

  it('getMLStatus includes automationMode', () => {
    const ml = require('../../.claude/lib/ml/index.cjs');
    const status = ml.getMLStatus();
    assert.ok('automationMode' in status);
    assert.ok(['off', 'log', 'enforce'].includes(status.automationMode));
  });
});
