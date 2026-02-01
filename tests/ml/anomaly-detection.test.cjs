/**
 * SPEC-025: Anomaly Detector Tests
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const AnomalyDetector = require('../../.claude/lib/ml/anomaly-detector.cjs');
const PatternDetector = require('../../.claude/lib/ml/pattern-detector.cjs');

// Mock Pattern Detector
class MockPatternDetector {
    constructor() {
        this.isTrained = true;
    }
    analyze(session) {
        if (session.type === 'normal') {
            return { patternId: 0, distance: 0.1 };
        } else if (session.type === 'outlier') {
            return { patternId: 0, distance: 5.0 };
        } else if (session.type === 'unknown') {
            return { patternId: -1, distance: Infinity };
        }
        return { patternId: 0, distance: 0 };
    }
}

describe('SPEC-025: Anomaly Detector', () => {

    it('accepts normal sessions', () => {
        const pd = new MockPatternDetector();
        const ad = new AnomalyDetector(pd, { threshold: 1.0 });

        const result = ad.detect({ type: 'normal' });
        assert.equal(result.isAnomaly, false);
        assert.ok(result.distance < 1.0);
    });

    it('flags distant sessions as anomalies', () => {
        const pd = new MockPatternDetector();
        const ad = new AnomalyDetector(pd, { threshold: 1.0 });

        const result = ad.detect({ type: 'outlier' });
        assert.equal(result.isAnomaly, true);
        assert.equal(result.severity, 'high'); // 5.0 > 2.0
        assert.match(result.reason, /Distance/);
    });

    it('flags unclassifiable sessions', () => {
        const pd = new MockPatternDetector();
        const ad = new AnomalyDetector(pd);

        const result = ad.detect({ type: 'unknown' });
        assert.equal(result.isAnomaly, true);
        assert.match(result.reason, /Unclassifiable/);
    });

    it('handles untrained detector gracefully', () => {
        const pd = new MockPatternDetector();
        pd.isTrained = false;
        const ad = new AnomalyDetector(pd);

        const result = ad.detect({});
        assert.equal(result.isAnomaly, false);
        assert.match(result.reason, /not ready/);
    });

    it('flags a real outlier session vs trained baseline', () => {
        const detector = new PatternDetector({ k: 2 });

        function makeSession({ agents = ['developer', 'qa'], tools = ['Read'], durationMs = 5000 } = {}) {
            return {
                history: agents.map((agent, idx) => ({ agent, tools: idx === 0 ? tools : [] })),
                metrics: {
                    totalDuration: durationMs,
                    errorCount: 0,
                    criticalErrors: 0,
                    tokenUsage: 1000,
                    peakMemoryMB: 50
                },
                trace: {}
            };
        }

        // Baseline training: short, consistent sessions
        for (let i = 0; i < 10; i++) detector.ingest(makeSession({ durationMs: 8000 + i * 50 }));
        for (let i = 0; i < 10; i++) detector.ingest(makeSession({ agents: ['developer', 'developer'], durationMs: 9000 + i * 50 }));
        detector.train();

        // Threshold tuned for normalized features (0-1); Euclidean distance over scalars is at most sqrt(7)
        const anomaly = new AnomalyDetector(detector, { threshold: 0.5 });

        const normal = anomaly.detect(makeSession({ durationMs: 8500 }));
        assert.equal(normal.isAnomaly, false);

        // Outlier: extreme duration + longer history (normalized sequenceLength + totalDuration)
        const outlierSession = makeSession({
            agents: new Array(100).fill('developer'),
            tools: ['Write', 'Bash', 'Task'],
            durationMs: 3600000
        });

        const outlier = anomaly.detect(outlierSession);
        assert.equal(outlier.isAnomaly, true);
        assert.equal(outlier.severity, 'high');
    });

});
