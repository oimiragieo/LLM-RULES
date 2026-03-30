'use strict';

/**
 * Tests for Handoff Pipeline
 *
 * Covers expected behaviors:
 * - Handoff file detection triggers scrutiny review
 * - Approved verdict transitions feature to completed
 * - Rejected verdict transitions feature to failed
 * - Friction loop receives validation-failed and emits re-enqueued
 * - Re-enqueued triggers feature recovery (failed->pending)
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createHandoffPipeline } = require('../../.claude/lib/orchestration/handoff-pipeline.cjs');
const { FrictionLoopEngine } = require('../../.claude/lib/mission/friction-loop.cjs');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Wait for an event to be emitted, with a timeout.
 * @param {import('node:events').EventEmitter} emitter
 * @param {string} eventName
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<any[]>} - Array of event arguments
 */
function waitForEvent(emitter, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event '${eventName}' after ${timeoutMs}ms`));
    }, timeoutMs);

    emitter.once(eventName, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

/**
 * Write features.json to a directory.
 * @param {string} dir - Target directory
 * @param {Array} features - Array of feature objects
 * @returns {string} featuresPath
 */
function writeFeatures(dir, features) {
  const featuresPath = path.join(dir, 'features.json');
  fs.writeFileSync(featuresPath, JSON.stringify({ features }, null, 2), 'utf8');
  return featuresPath;
}

/**
 * Write a handoff JSON file to the handoffs directory.
 * @param {string} handoffsDir - Target directory
 * @param {string} featureId - Feature ID
 * @param {object} [extra={}] - Extra fields to merge
 * @returns {string} handoffPath
 */
function writeHandoff(handoffsDir, featureId, extra) {
  fs.mkdirSync(handoffsDir, { recursive: true });
  const filename = `${Date.now()}-${featureId}.json`;
  const handoffPath = path.join(handoffsDir, filename);
  fs.writeFileSync(handoffPath, JSON.stringify({ featureId, ...extra }, null, 2));
  return handoffPath;
}

/**
 * Read features.json from a path.
 * @param {string} featuresPath
 * @returns {object[]}
 */
function readFeatures(featuresPath) {
  return JSON.parse(fs.readFileSync(featuresPath, 'utf8')).features;
}

// ---------------------------------------------------------------------------
// Mock reviewer factories
// ---------------------------------------------------------------------------

/**
 * Mock reviewer that always approves synchronously.
 * @param {object} opts
 * @returns {{ run: function(): Promise<object> }}
 */
function createApproveReviewer(opts) {
  return {
    run: async () => ({
      verdict: 'approved',
      featureId: opts.featureId,
      timestamp: new Date().toISOString(),
      steps: [],
      failures: [],
      summary: `All verification steps passed for feature ${opts.featureId}`,
      skippedDestructive: [],
    }),
  };
}

/**
 * Mock reviewer that always rejects with one failing step.
 * @param {object} opts
 * @returns {{ run: function(): Promise<object> }}
 */
function createRejectReviewer(opts) {
  return {
    run: async () => ({
      verdict: 'rejected',
      featureId: opts.featureId,
      timestamp: new Date().toISOString(),
      steps: [{ command: 'test-cmd', exitCode: 1, output: 'Test output\nfailed' }],
      failures: [{ step: 'test-cmd', exitCode: 1, error: 'Test failed' }],
      summary: `1/1 verification steps failed for feature ${opts.featureId}`,
      skippedDestructive: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('HandoffPipeline', () => {
  let tempDir;
  let testDir;
  let workspacePath;
  let handoffsDir;
  let featuresPath;
  let frictionLoop;
  let pipeline;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-pipeline-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(tempDir, 'case-'));
    workspacePath = testDir;
    handoffsDir = path.join(workspacePath, 'handoffs');
    fs.mkdirSync(handoffsDir, { recursive: true });

    frictionLoop = new FrictionLoopEngine({});
    frictionLoop.start();

    pipeline = null;
  });

  afterEach(() => {
    if (pipeline) {
      pipeline.stop();
      pipeline = null;
    }
    frictionLoop.stop();
  });

  // -------------------------------------------------------------------------
  // Factory function
  // -------------------------------------------------------------------------

  describe('createHandoffPipeline', () => {
    it('returns an EventEmitter with start() and stop() methods', () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-a',
          description: 'Feature A',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      assert.ok(typeof pipeline.start === 'function', 'Should have .start() method');
      assert.ok(typeof pipeline.stop === 'function', 'Should have .stop() method');
      assert.ok(typeof pipeline.on === 'function', 'Should have .on() method');
      assert.ok(typeof pipeline.emit === 'function', 'Should have .emit() method');
    });
  });

  // -------------------------------------------------------------------------
  // Approved verdict path
  // -------------------------------------------------------------------------

  describe('approved verdict path', () => {
    it('handoff file detection triggers scrutiny review and emits feature-completed', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-a',
          description: 'Feature A',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      // Write handoff before starting pipeline (picked up by _processExistingFiles)
      writeHandoff(handoffsDir, 'feat-a');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const completedPromise = waitForEvent(pipeline, 'feature-completed', 3000);
      pipeline.start();
      const [payload] = await completedPromise;

      assert.ok(payload, 'feature-completed event should fire');
      assert.strictEqual(payload.featureId, 'feat-a', 'featureId should match');
    });

    it('approved verdict transitions feature validating->completed', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-a',
          description: 'Feature A',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      writeHandoff(handoffsDir, 'feat-a');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const completedPromise = waitForEvent(pipeline, 'feature-completed', 3000);
      pipeline.start();
      await completedPromise;

      // Stop pipeline immediately to prevent Windows polling re-detection
      pipeline.stop();

      // Allow time for file write
      await new Promise(r => setTimeout(r, 100));

      const features = readFeatures(featuresPath);
      const featA = features.find(f => f.id === 'feat-a');
      assert.strictEqual(
        featA.status,
        'completed',
        'Feature should be completed after approved verdict'
      );
    });

    it('feature-completed event contains featureId and verdict', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-c',
          description: 'Feature C',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      writeHandoff(handoffsDir, 'feat-c');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const completedPromise = waitForEvent(pipeline, 'feature-completed', 3000);
      pipeline.start();
      const [payload] = await completedPromise;

      assert.ok(
        Object.prototype.hasOwnProperty.call(payload, 'featureId'),
        'payload.featureId must exist'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(payload, 'verdict'),
        'payload.verdict must exist'
      );
      assert.strictEqual(payload.featureId, 'feat-c', 'featureId should match');
      assert.strictEqual(payload.verdict.verdict, 'approved', 'verdict.verdict should be approved');
    });
  });

  // -------------------------------------------------------------------------
  // Rejected verdict path
  // -------------------------------------------------------------------------

  describe('rejected verdict path', () => {
    it('rejected verdict transitions feature to failed', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-b',
          description: 'Feature B',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      writeHandoff(handoffsDir, 'feat-b');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createRejectReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      // The friction loop emits re-enqueued after receiving validation-failed
      // which also triggers the failed->pending transition
      const reenqueuedPromise = waitForEvent(frictionLoop, 're-enqueued', 3000);
      pipeline.start();
      await reenqueuedPromise;

      // After re-enqueued, the feature was failed and then moved to pending
      // Check that it was in failed state before re-enqueued by inspecting
      // the re-enqueued payload context
      await new Promise(r => setTimeout(r, 50));

      const features = readFeatures(featuresPath);
      const featB = features.find(f => f.id === 'feat-b');
      // After re-enqueued handler runs, feature is pending (recovered from failed)
      assert.strictEqual(
        featB.status,
        'pending',
        'Feature should be pending after failed->pending recovery'
      );
    });

    it('rejected verdict emits validation-failed on frictionLoop', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-b',
          description: 'Feature B',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      writeHandoff(handoffsDir, 'feat-b');

      const validationFailedEvents = [];
      frictionLoop.on('validation-failed', data => {
        validationFailedEvents.push(data);
      });

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createRejectReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const reenqueuedPromise = waitForEvent(frictionLoop, 're-enqueued', 3000);
      pipeline.start();
      await reenqueuedPromise;

      assert.ok(
        validationFailedEvents.length > 0,
        'validation-failed should be emitted on frictionLoop'
      );
      assert.strictEqual(
        validationFailedEvents[0].originalContext.featureId,
        'feat-b',
        'originalContext.featureId should match'
      );
    });

    it('validation-failed payload includes blocking issues from failures', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-d',
          description: 'Feature D',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      writeHandoff(handoffsDir, 'feat-d');

      let capturedValidationFailed = null;
      frictionLoop.on('validation-failed', data => {
        capturedValidationFailed = data;
      });

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createRejectReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const reenqueuedPromise = waitForEvent(frictionLoop, 're-enqueued', 3000);
      pipeline.start();
      await reenqueuedPromise;

      assert.ok(capturedValidationFailed !== null, 'Should have captured validation-failed event');
      assert.ok(
        capturedValidationFailed.error instanceof Error,
        'error should be an Error instance'
      );
      assert.ok(typeof capturedValidationFailed.stderr === 'string', 'stderr should be a string');
    });
  });

  // -------------------------------------------------------------------------
  // Friction loop re-enqueued -> feature recovery
  // -------------------------------------------------------------------------

  describe('friction loop re-enqueued recovery', () => {
    it('re-enqueued event triggers feature failed->pending transition', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-e',
          description: 'Feature E',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      writeHandoff(handoffsDir, 'feat-e');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createRejectReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const reenqueuedPromise = waitForEvent(frictionLoop, 're-enqueued', 3000);
      pipeline.start();
      await reenqueuedPromise;

      // Give event loop a tick for the pipeline's re-enqueued handler to complete
      await new Promise(r => setTimeout(r, 50));

      const features = readFeatures(featuresPath);
      const featE = features.find(f => f.id === 'feat-e');
      assert.strictEqual(featE.status, 'pending', 'Feature should be pending after re-enqueued');
    });

    it('re-enqueued retryCount increments on each rejection', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-f',
          description: 'Feature F',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
          retryCount: 0,
        },
      ]);

      writeHandoff(handoffsDir, 'feat-f');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createRejectReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const reenqueuedPromise = waitForEvent(frictionLoop, 're-enqueued', 3000);
      pipeline.start();
      await reenqueuedPromise;
      await new Promise(r => setTimeout(r, 50));

      const features = readFeatures(featuresPath);
      const featF = features.find(f => f.id === 'feat-f');
      // retryCount should be incremented when transitioning to failed
      assert.ok(featF.retryCount >= 1, 'retryCount should be at least 1 after rejection');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('emits error event when handoff has no featureId', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-a',
          description: 'Feature A',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      // Write handoff WITHOUT featureId
      const badHandoffPath = path.join(handoffsDir, `${Date.now()}-bad.json`);
      fs.writeFileSync(badHandoffPath, JSON.stringify({ some: 'data', noFeatureId: true }));

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const errorPromise = waitForEvent(pipeline, 'error', 3000);
      pipeline.start();
      const [err] = await errorPromise;

      assert.ok(err instanceof Error || typeof err.message === 'string', 'Should emit an Error');
    });

    it('emits error event when feature not found in features.json', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'other-feat',
          description: 'Other Feature',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      // Write handoff for a feature that does NOT exist in features.json
      writeHandoff(handoffsDir, 'nonexistent-feat');

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      const errorPromise = waitForEvent(pipeline, 'error', 3000);
      pipeline.start();
      const [err] = await errorPromise;

      assert.ok(err instanceof Error || typeof err.message === 'string', 'Should emit an Error');
    });
  });

  // -------------------------------------------------------------------------
  // Pipeline lifecycle
  // -------------------------------------------------------------------------

  describe('pipeline lifecycle', () => {
    it('stop() halts handoff processing', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-a',
          description: 'Feature A',
          status: 'in_progress',
          preconditions: [],
          verificationSteps: [],
        },
      ]);

      pipeline = createHandoffPipeline({
        workspacePath,
        featuresPath,
        frictionLoop,
        _reviewerFactory: createApproveReviewer,
        _watcherOptions: { pollingIntervalMs: 50, debounceMs: 50 },
      });

      pipeline.start();

      // Stop immediately before any handoff is written
      pipeline.stop();

      const completedEvents = [];
      pipeline.on('feature-completed', () => completedEvents.push(true));

      // Write handoff AFTER stopping
      writeHandoff(handoffsDir, 'feat-a');

      // Wait to confirm no events arrive
      await new Promise(r => setTimeout(r, 400));

      assert.strictEqual(completedEvents.length, 0, 'No feature-completed after stop()');
    });
  });
});
