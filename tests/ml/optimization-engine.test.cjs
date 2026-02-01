/**
 * SPEC-024: Optimization Engine Tests
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const OptimizationEngine = require('../../.claude/lib/ml/optimization-engine.cjs');

// Mock Pattern Detector (isTrained required for optimize() to run)
class MockPatternDetector {
    constructor(fixedPatternId) {
        this.fixedPatternId = fixedPatternId;
        this.isTrained = true;
    }
    analyze(_session) {
        return {
            patternId: this.fixedPatternId,
            confidence: 0.9
        };
    }
}

describe('SPEC-024: Optimization Engine', () => {

    it('isReady when pattern detector is trained', () => {
        const detector = new MockPatternDetector(0);
        const engine = new OptimizationEngine(detector);
        assert.deepEqual(engine.isReady(), { ready: true });
    });

    it('isReady false when pattern detector not trained', () => {
        const detector = new MockPatternDetector(0);
        detector.isTrained = false;
        const engine = new OptimizationEngine(detector);
        const r = engine.isReady();
        assert.equal(r.ready, false);
        assert.match(r.reason, /not trained/);
    });

    it('optimize returns null when not ready', () => {
        const detector = new MockPatternDetector(0);
        detector.isTrained = false;
        const engine = new OptimizationEngine(detector);
        assert.equal(engine.optimize({}), null);
    });

    it('recommends policy for known pattern', () => {
        const detector = new MockPatternDetector(0);
        const engine = new OptimizationEngine(detector);

        const recommendation = engine.optimize({ some: 'sessionData' });

        assert.ok(recommendation, 'Should return a recommendation');
        assert.equal(recommendation.maxConcurrency, 50, 'Should match Policy 0');
        assert.match(recommendation._meta.reason, /Matched Pattern 0/);
    });

    it('recommends different policy for different pattern', () => {
        const detector = new MockPatternDetector(1);
        const engine = new OptimizationEngine(detector);

        const recommendation = engine.optimize({ some: 'sessionData' });

        assert.equal(recommendation.maxConcurrency, 5, 'Should match Policy 1');
    });

    it('returns null for unknown pattern', () => {
        const detector = new MockPatternDetector(999);
        const engine = new OptimizationEngine(detector);

        const recommendation = engine.optimize({ some: 'sessionData' });

        assert.equal(recommendation, null, 'Should return null for unknown pattern');
    });

    it('supports custom policies via config', () => {
        const detector = new MockPatternDetector(0);
        const policies = { 0: { customSetting: 'active' } };
        const engine = new OptimizationEngine(detector, { policies });

        const recommendation = engine.optimize({});
        assert.equal(recommendation.customSetting, 'active');
    });

    it('persists policies to disk', () => {
        const tmpFile = path.join(__dirname, 'test-policies.json');
        const detector = new MockPatternDetector(0);
        const policies = { 0: { persisted: true } };

        const engine = new OptimizationEngine(detector, {
            policies,
            persistencePath: tmpFile
        });

        engine.savePolicies();

        // Verify file exists
        assert.ok(fs.existsSync(tmpFile));

        // Load into new engine
        const engine2 = new OptimizationEngine(detector, { persistencePath: tmpFile });
        engine2.loadPolicies();

        assert.deepEqual(engine2.policies, policies);

        // Cleanup
        fs.unlinkSync(tmpFile);
    });

});
