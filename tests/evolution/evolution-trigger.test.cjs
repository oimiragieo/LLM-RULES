'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { EvolutionTrigger } = require('../../.claude/lib/evolution/evolution-trigger.cjs');

// ---------------------------------------------------------------------------
// Helpers — minimal stubs so tests stay deterministic and free of I/O
// ---------------------------------------------------------------------------

/**
 * Build a stub SkillUsageTracker that returns pre-seeded stats and records.
 * PatternDetector calls getAllStats() and _readAllRecords() internally.
 */
function makeStubTracker(allStats, allRecords) {
  return {
    getAllStats: () => allStats || {},
    _readAllRecords: () => allRecords || [],
  };
}

/**
 * Build a mock evolution-request-router that records createRequest() calls.
 */
function makeStubRouter() {
  const calls = [];
  return {
    calls,
    createRequest(request) {
      calls.push(request);
    },
  };
}

/**
 * Produce stats for a skill that was NEVER used → deprecate suggestion with
 * confidence 0.9 (well above the default 0.7 threshold).
 */
function neverUsedStats(skillName) {
  return {
    [skillName]: {
      skillName,
      invocations: 0,
      successRate: 0,
      avgDurationMs: 0,
      lastUsed: null,
    },
  };
}

/**
 * Produce stats for a skill with very high latency → optimize suggestion.
 * ratio = avgDurationMs / thresholdMs
 * confidence = 1 - 1/ratio
 * To get confidence ≥ 0.7: ratio ≥ 3.33 → avgDurationMs ≥ 3.33 × 5000 = 16 667ms
 */
function highLatencyStats(skillName, avgDurationMs) {
  return {
    [skillName]: {
      skillName,
      invocations: 50,
      successRate: 1,
      avgDurationMs,
      lastUsed: new Date().toISOString(),
    },
  };
}

/**
 * Stats for a frequently-failing skill with enough invocations to produce a
 * high-confidence "split" suggestion.
 * confidence = dataWeight*0.6 + severityWeight*0.4
 * dataWeight = min(1, 150/100) = 1
 * successRate = 0.05 → severityWeight = 0.95
 * confidence = 0.6 + 0.95*0.4 = 0.98 ≥ 0.7 ✓
 */
function frequentlyFailingStats(skillName) {
  return {
    [skillName]: {
      skillName,
      invocations: 150,
      successRate: 0.05,
      avgDurationMs: 200,
      lastUsed: new Date().toISOString(),
    },
  };
}

/**
 * Stats for a skill whose latency is just barely above the threshold but
 * produces a LOW-confidence optimize suggestion (confidence ≈ 0.167 < 0.7).
 * avgDurationMs=6000, threshold=5000 → ratio=1.2 → confidence=1-1/1.2≈0.167
 */
function lowLatencyOvershootStats(skillName) {
  return {
    [skillName]: {
      skillName,
      invocations: 50,
      successRate: 1,
      avgDurationMs: 6000,
      lastUsed: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EvolutionTrigger', () => {
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('applies default thresholds when none provided', () => {
      const trigger = new EvolutionTrigger();
      assert.strictEqual(trigger._thresholds.minInvocationsForAnalysis, 20);
      assert.strictEqual(trigger._thresholds.failureRateAlert, 0.3);
      assert.strictEqual(trigger._thresholds.latencyAlertMs, 5000);
      assert.strictEqual(trigger._thresholds.unusedDays, 30);
      assert.strictEqual(trigger._thresholds.confidenceThreshold, 0.7);
    });

    it('applies custom thresholds over defaults', () => {
      const trigger = new EvolutionTrigger({
        thresholds: {
          minInvocationsForAnalysis: 50,
          failureRateAlert: 0.5,
          latencyAlertMs: 10000,
          unusedDays: 60,
          confidenceThreshold: 0.8,
        },
      });
      assert.strictEqual(trigger._thresholds.minInvocationsForAnalysis, 50);
      assert.strictEqual(trigger._thresholds.failureRateAlert, 0.5);
      assert.strictEqual(trigger._thresholds.latencyAlertMs, 10000);
      assert.strictEqual(trigger._thresholds.unusedDays, 60);
      assert.strictEqual(trigger._thresholds.confidenceThreshold, 0.8);
    });

    it('partially overrides defaults when only some thresholds provided', () => {
      const trigger = new EvolutionTrigger({
        thresholds: { unusedDays: 14 },
      });
      assert.strictEqual(trigger._thresholds.unusedDays, 14);
      // Unspecified defaults remain unchanged
      assert.strictEqual(trigger._thresholds.minInvocationsForAnalysis, 20);
      assert.strictEqual(trigger._thresholds.confidenceThreshold, 0.7);
    });

    it('handles missing options gracefully (no args)', () => {
      assert.doesNotThrow(() => new EvolutionTrigger());
    });

    it('stores null router when evolutionRequestRouter not provided', () => {
      const trigger = new EvolutionTrigger();
      assert.strictEqual(trigger._router, null);
    });

    it('stores the provided router', () => {
      const router = makeStubRouter();
      const trigger = new EvolutionTrigger({ evolutionRequestRouter: router });
      assert.strictEqual(trigger._router, router);
    });
  });

  // -----------------------------------------------------------------------
  describe('evaluate(usageTracker)', () => {
    let savedEnv;
    before(() => {
      savedEnv = process.env.AGENT_EVOLUTION_ENABLED;
      process.env.AGENT_EVOLUTION_ENABLED = '1';
    });
    after(() => {
      if (savedEnv === undefined) delete process.env.AGENT_EVOLUTION_ENABLED;
      else process.env.AGENT_EVOLUTION_ENABLED = savedEnv;
    });

    it('returns correct structure {triggered, skipped, analyzed}', () => {
      const trigger = new EvolutionTrigger();
      const tracker = makeStubTracker({}, []);
      const result = trigger.evaluate(tracker);
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'triggered'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'skipped'));
      assert.ok(Object.prototype.hasOwnProperty.call(result, 'analyzed'));
      assert.ok(Array.isArray(result.triggered));
      assert.ok(Array.isArray(result.skipped));
      assert.ok(typeof result.analyzed === 'number');
    });

    it('returns empty result when tracker has no data', () => {
      const trigger = new EvolutionTrigger();
      const tracker = makeStubTracker({}, []);
      const result = trigger.evaluate(tracker);
      assert.deepStrictEqual(result.triggered, []);
      assert.deepStrictEqual(result.skipped, []);
      assert.strictEqual(result.analyzed, 0);
    });

    it('triggers high-confidence deprecate suggestion (never-used skill → confidence 0.9)', () => {
      const trigger = new EvolutionTrigger();
      const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
      const result = trigger.evaluate(tracker);
      assert.strictEqual(result.triggered.length, 1);
      assert.strictEqual(result.triggered[0].type, 'deprecate');
      assert.strictEqual(result.triggered[0].skillName, 'idle-skill');
      assert.ok(result.triggered[0].confidence >= 0.7, 'confidence should be ≥ 0.7');
    });

    it('skips low-confidence optimize suggestion (barely over latency threshold → ~0.17)', () => {
      const trigger = new EvolutionTrigger();
      const tracker = makeStubTracker(lowLatencyOvershootStats('slow-skill'), []);
      const result = trigger.evaluate(tracker);
      // optimize suggestion is generated but its confidence is ~0.167 < 0.7
      assert.strictEqual(result.skipped.length, 1);
      assert.strictEqual(result.skipped[0].type, 'optimize');
      assert.ok(result.skipped[0].confidence < 0.7, 'low-confidence suggestion should be skipped');
      assert.strictEqual(result.triggered.length, 0);
    });

    it('calls router.createRequest for each triggered suggestion when router is provided', () => {
      const router = makeStubRouter();
      const trigger = new EvolutionTrigger({ evolutionRequestRouter: router });
      const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
      const result = trigger.evaluate(tracker);
      assert.strictEqual(result.triggered.length, 1);
      assert.strictEqual(router.calls.length, 1, 'createRequest should have been called once');
    });

    it('does not call router.createRequest in dry-run mode (no router)', () => {
      // Track if createRequest is ever called accidentally
      const trigger = new EvolutionTrigger(); // no router
      const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
      const result = trigger.evaluate(tracker);
      // Above threshold → goes into triggered but no router calls
      assert.strictEqual(result.triggered.length, 1);
      // No errors thrown, router was never invoked
    });

    it('does NOT make router calls when router is null (dry-run)', () => {
      const trigger = new EvolutionTrigger({ evolutionRequestRouter: null });
      const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
      // Should not throw; router.createRequest should not be called
      assert.doesNotThrow(() => trigger.evaluate(tracker));
    });

    it('analyzed equals total suggestions count regardless of threshold', () => {
      const trigger = new EvolutionTrigger();
      // Two skills: one never used (high confidence), one barely slow (low confidence)
      const allStats = {
        ...neverUsedStats('idle-skill'),
        ...lowLatencyOvershootStats('slow-skill'),
      };
      const tracker = makeStubTracker(allStats, []);
      const result = trigger.evaluate(tracker);
      // Both generate a suggestion (one triggered, one skipped)
      assert.strictEqual(result.analyzed, result.triggered.length + result.skipped.length);
      assert.strictEqual(result.triggered.length, 1);
      assert.strictEqual(result.skipped.length, 1);
    });

    it('router receives request with required fields', () => {
      const router = makeStubRouter();
      const trigger = new EvolutionTrigger({ evolutionRequestRouter: router });
      const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
      trigger.evaluate(tracker);
      assert.strictEqual(router.calls.length, 1);
      const req = router.calls[0];
      assert.ok(req.id, 'request should have an id');
      assert.ok(req.trigger, 'request should have a trigger');
      assert.ok(req.summary, 'request should have a summary');
      assert.strictEqual(req.status, 'proposed');
      assert.ok(req.timestamp, 'request should have a timestamp');
      assert.ok(req.confidence >= 0.7, 'request confidence should be ≥ 0.7');
    });

    it('uses custom confidence threshold to control what triggers', () => {
      // High confidence threshold (0.95) — only never-used skill with confidence 0.9
      // just barely falls below 0.95 (confidence=0.9 < 0.95 → skipped)
      const trigger = new EvolutionTrigger({
        thresholds: { confidenceThreshold: 0.95 },
      });
      const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
      const result = trigger.evaluate(tracker);
      // confidence 0.9 < 0.95 → skipped
      assert.strictEqual(result.triggered.length, 0);
      assert.strictEqual(result.skipped.length, 1);
    });

    it('high-latency skill with very high avgDurationMs triggers optimize above threshold', () => {
      // avgDurationMs = 20000, threshold = 5000 → ratio=4 → confidence=1-1/4=0.75 ≥ 0.7
      const trigger = new EvolutionTrigger();
      const tracker = makeStubTracker(highLatencyStats('laggy-skill', 20000), []);
      const result = trigger.evaluate(tracker);
      // The skill was recently used so no deprecate; only optimize
      assert.ok(
        result.triggered.some(s => s.type === 'optimize'),
        'Should trigger optimize suggestion for high-latency skill'
      );
    });

    it('frequently-failing skill triggers split suggestion above threshold', () => {
      const trigger = new EvolutionTrigger({
        thresholds: {
          // Lower minInvocationsForAnalysis so our 150-invocation skill qualifies
          minInvocationsForAnalysis: 10,
          failureRateAlert: 0.3,
        },
      });
      const tracker = makeStubTracker(frequentlyFailingStats('flaky-skill'), []);
      const result = trigger.evaluate(tracker);
      assert.ok(
        result.triggered.some(s => s.type === 'split'),
        'Should trigger split suggestion for frequently-failing skill'
      );
    });

    it('calls createRequest for multiple triggered suggestions', () => {
      const router = makeStubRouter();
      const trigger = new EvolutionTrigger({
        evolutionRequestRouter: router,
        thresholds: { minInvocationsForAnalysis: 10 },
      });
      // Two skills that produce high-confidence suggestions:
      // idle-skill → deprecate (confidence 0.9), flaky-skill → split (confidence ~0.98)
      const allStats = {
        ...neverUsedStats('idle-skill'),
        ...frequentlyFailingStats('flaky-skill'),
      };
      const tracker = makeStubTracker(allStats, []);
      const result = trigger.evaluate(tracker);
      assert.strictEqual(
        router.calls.length,
        result.triggered.length,
        'createRequest called once per triggered suggestion'
      );
    });

    it('wires PatternDetector -> SuggestionGenerator -> EvolutionRequestRouter end-to-end', () => {
      const router = makeStubRouter();
      const trigger = new EvolutionTrigger({
        evolutionRequestRouter: router,
        thresholds: { minInvocationsForAnalysis: 10 },
      });

      // Seed stats with a never-used skill to get a high-confidence deprecate suggestion
      const tracker = makeStubTracker(neverUsedStats('stale-skill'), []);
      const result = trigger.evaluate(tracker);

      // Verify the full pipeline ran
      assert.ok(result.analyzed >= 1, 'At least one suggestion should have been analyzed');
      assert.ok(result.triggered.length >= 1, 'At least one suggestion should have triggered');
      assert.strictEqual(
        router.calls.length,
        result.triggered.length,
        'Router called once per triggered evolution'
      );
      // Verify the triggered suggestion has required fields
      const suggestion = result.triggered[0];
      assert.ok(suggestion.type, 'suggestion should have type');
      assert.ok(suggestion.skillName, 'suggestion should have skillName');
      assert.ok(suggestion.reason, 'suggestion should have reason');
      assert.ok(typeof suggestion.confidence === 'number', 'confidence should be a number');
    });
  });

  // -----------------------------------------------------------------------
  describe('AGENT_EVOLUTION_ENABLED env gate', () => {
    it('no-ops and returns null when AGENT_EVOLUTION_ENABLED is not set', () => {
      const saved = process.env.AGENT_EVOLUTION_ENABLED;
      delete process.env.AGENT_EVOLUTION_ENABLED;
      try {
        const router = makeStubRouter();
        const trigger = new EvolutionTrigger({ evolutionRequestRouter: router });
        const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
        const result = trigger.evaluate(tracker);
        assert.strictEqual(result, null, 'evaluate() should return null when env gate is off');
        assert.strictEqual(router.calls.length, 0, 'router should not be called when gate is off');
      } finally {
        if (saved === undefined) delete process.env.AGENT_EVOLUTION_ENABLED;
        else process.env.AGENT_EVOLUTION_ENABLED = saved;
      }
    });

    it('no-ops and returns null when AGENT_EVOLUTION_ENABLED is "0"', () => {
      const saved = process.env.AGENT_EVOLUTION_ENABLED;
      process.env.AGENT_EVOLUTION_ENABLED = '0';
      try {
        const trigger = new EvolutionTrigger();
        const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
        const result = trigger.evaluate(tracker);
        assert.strictEqual(result, null, 'evaluate() should return null when env is "0"');
      } finally {
        if (saved === undefined) delete process.env.AGENT_EVOLUTION_ENABLED;
        else process.env.AGENT_EVOLUTION_ENABLED = saved;
      }
    });

    it('runs full pipeline and returns result when AGENT_EVOLUTION_ENABLED is "1"', () => {
      const saved = process.env.AGENT_EVOLUTION_ENABLED;
      process.env.AGENT_EVOLUTION_ENABLED = '1';
      try {
        const router = makeStubRouter();
        const trigger = new EvolutionTrigger({ evolutionRequestRouter: router });
        const tracker = makeStubTracker(neverUsedStats('idle-skill'), []);
        const result = trigger.evaluate(tracker);
        assert.ok(result !== null, 'evaluate() should return a result when env gate is on');
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'triggered'));
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'skipped'));
        assert.ok(Object.prototype.hasOwnProperty.call(result, 'analyzed'));
        assert.strictEqual(result.triggered.length, 1, 'should trigger one suggestion');
        assert.strictEqual(router.calls.length, 1, 'router should be called when gate is on');
      } finally {
        if (saved === undefined) delete process.env.AGENT_EVOLUTION_ENABLED;
        else process.env.AGENT_EVOLUTION_ENABLED = saved;
      }
    });
  });
});
