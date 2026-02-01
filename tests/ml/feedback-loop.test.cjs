/**
 * SPEC-026: Feedback Loop Tests
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const FeedbackLoop = require('../../.claude/lib/ml/feedback-loop.cjs');
const PatternDetector = require('../../.claude/lib/ml/pattern-detector.cjs');

// Mock Optimization Engine
class MockOptimizer {
    constructor() {
        this.savecalled = false;
    }
    savePolicies() {
        this.savecalled = true;
    }
}

// Generate minimal valid session for feature extraction
function generateSession() {
    return {
        history: [{ agent: 'test' }],
        metrics: { totalDuration: 100, errorCount: 0, tokenUsage: 10, peakMemoryMB: 10 },
        trace: {}
    };
}

describe('SPEC-026: Feedback Loop', () => {
    const tmpDir = path.join(__dirname, '.tmp-ml-test');
    const modelPath = path.join(tmpDir, 'model.json');

    beforeEach(() => {
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('triggers retraining after threshold', () => {
        const pd = new PatternDetector({ k: 1 });
        const opt = new MockOptimizer();
        const feedback = new FeedbackLoop(pd, opt, { retrainThreshold: 2, modelPath, automationMode: 'log' });

        // First session - Ingest only
        const triggered1 = feedback.process(generateSession());
        assert.equal(triggered1, false);
        assert.equal(pd.isTrained, false);

        // Second session - Retrain
        const triggered2 = feedback.process(generateSession());
        assert.equal(triggered2, true);
        assert.equal(pd.isTrained, true);
    });

    it('persists model on retraining', () => {
        const pd = new PatternDetector({ k: 1 });
        const opt = new MockOptimizer();
        const feedback = new FeedbackLoop(pd, opt, { retrainThreshold: 1, modelPath, automationMode: 'log' });

        feedback.process(generateSession());

        assert.ok(fs.existsSync(modelPath), 'Model file should exist');

        // Verify content
        const data = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        assert.ok(data.centroids, 'Should contain centroids');
    });

    it('does not retrain when automationMode is off', () => {
        const pd = new PatternDetector({ k: 1 });
        const opt = new MockOptimizer();
        const feedback = new FeedbackLoop(pd, opt, { retrainThreshold: 2, modelPath, automationMode: 'off' });

        feedback.process(generateSession());
        const triggered = feedback.process(generateSession());

        assert.equal(triggered, false, 'Retrain should not run when automationMode is off');
        assert.equal(pd.isTrained, false, 'Model should remain untrained');
    });

    it('reloads persisted model', () => {
        // 1. Train and Save
        const pd1 = new PatternDetector({ k: 1 });
        pd1.ingest(generateSession());
        pd1.train();
        pd1.saveModel(modelPath);

        // 2. Load into new instance
        const pd2 = new PatternDetector();
        const success = pd2.loadModel(modelPath);

        assert.ok(success, 'Load should succeed');
        assert.equal(pd2.isTrained, true);
        assert.deepEqual(pd2.clusteringModel.centroids, pd1.clusteringModel.centroids);
    });
});
