'use strict';

/**
 * Tests for Worker Dispatch Loop
 *
 * Covers VAL-MO-002 assertions:
 * - Dispatch loop finds eligible features via getEligibleFeatures()
 * - Eligible features transitioned to in_progress before dispatch
 * - Features with unmet preconditions stay pending
 * - Budget exhaustion pauses dispatch
 * - Loop emits worker-dispatched events with {featureId, sessionId}
 * - Loop stops when paused or no pending features
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createDispatchLoop } = require('../../.claude/lib/orchestration/dispatch-loop.cjs');
const { createMockDb, createMockBudget } = require('../integration/helpers/mock-factory.cjs');

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
 * Write state.json to a directory.
 * @param {string} dir - Workspace directory
 * @param {object} state - State object
 * @returns {string} statePath
 */
function writeState(dir, state) {
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  return statePath;
}

/**
 * Read features.json from a directory.
 * @param {string} featuresPath
 * @returns {object[]}
 */
function readFeatures(featuresPath) {
  return JSON.parse(fs.readFileSync(featuresPath, 'utf8')).features;
}

/**
 * Compact pending-feature factory. Defaults skillName to 'tdd' (allowlisted)
 * and preconditions to [] so test fixtures stay one-liners.
 * @param {string} id
 * @param {object} [overrides]
 * @returns {object}
 */
function pendingFeature(id, overrides) {
  return Object.assign(
    { id, description: id.toUpperCase(), status: 'pending', skillName: 'tdd', preconditions: [] },
    overrides || {}
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DispatchLoop', () => {
  let tempDir;
  let testDir;
  let workspacePath;
  let featuresPath;
  let missionPath;
  let db;
  let budget;
  let loop;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-loop-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(tempDir, 'case-'));
    workspacePath = testDir;
    missionPath = path.join(testDir, 'mission.md');
    fs.writeFileSync(missionPath, '# Test Mission\n\nA test mission for dispatch loop.', 'utf8');

    // Default: running state
    writeState(workspacePath, { state: 'running' });

    db = createMockDb();
    budget = createMockBudget();
    loop = null;
  });

  afterEach(() => {
    // Always stop the loop if it's still running
    if (loop) {
      loop.stop();
      loop = null;
    }
  });

  // -------------------------------------------------------------------------
  // createDispatchLoop factory
  // -------------------------------------------------------------------------

  describe('createDispatchLoop', () => {
    it('returns an EventEmitter with start() and stop() methods', () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      assert.ok(typeof loop.on === 'function', 'Should have .on() method');
      assert.ok(typeof loop.emit === 'function', 'Should have .emit() method');
      assert.ok(typeof loop.start === 'function', 'Should have .start() method');
      assert.ok(typeof loop.stop === 'function', 'Should have .stop() method');
    });
  });

  // -------------------------------------------------------------------------
  // Eligible feature dispatch
  // -------------------------------------------------------------------------

  describe('eligible feature dispatch', () => {
    it('emits worker-dispatched event when eligible feature found', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const eventPromise = waitForEvent(loop, 'worker-dispatched', 3000);
      loop.start();
      const [payload] = await eventPromise;

      assert.ok(payload, 'Should emit worker-dispatched payload');
      assert.strictEqual(payload.featureId, 'feat-a', 'featureId should match');
      assert.ok(typeof payload.sessionId === 'string', 'sessionId should be a string');
      assert.ok(payload.sessionId.length > 0, 'sessionId should not be empty');
    });

    it('transitions feature to in_progress before dispatch', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const eventPromise = waitForEvent(loop, 'worker-dispatched', 3000);
      loop.start();
      await eventPromise;

      // Allow time for file write
      await new Promise(r => setTimeout(r, 100));

      const features = readFeatures(featuresPath);
      const featA = features.find(f => f.id === 'feat-a');
      assert.strictEqual(
        featA.status,
        'in_progress',
        'Feature should be in_progress after dispatch'
      );
    });

    it('acquires a worker slot from budget for each dispatched feature', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const eventPromise = waitForEvent(loop, 'worker-dispatched', 3000);
      loop.start();
      await eventPromise;

      assert.ok(budget._calls.length >= 1, 'budget.acquireWorkerSlot should be called');
      assert.ok(budget._calls[0].result.allowed === true, 'slot should be allowed');
    });

    it('enqueues a message to db for dispatched feature', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-a',
          description: 'Feature A',
          status: 'pending',
          preconditions: [],
          skillName: 'tdd',
        },
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const eventPromise = waitForEvent(loop, 'worker-dispatched', 3000);
      loop.start();
      await eventPromise;

      // Allow DB write to settle
      await new Promise(r => setTimeout(r, 50));

      const runCalls = db._calls.filter(c => c.op === 'run');
      assert.ok(runCalls.length >= 1, 'Should have at least one db.run call for enqueue');
    });

    it('dispatches multiple eligible features in one poll cycle', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
        pendingFeature('feat-b', { description: 'Feature B' }),
      ]);

      const dispatched = [];
      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      loop.on('worker-dispatched', payload => {
        dispatched.push(payload.featureId);
      });

      // Wait for 2 dispatches
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for 2 dispatches')), 3000);
        loop.on('worker-dispatched', () => {
          if (dispatched.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        });
        loop.start();
      });

      assert.ok(dispatched.includes('feat-a'), 'feat-a should be dispatched');
      assert.ok(dispatched.includes('feat-b'), 'feat-b should be dispatched');
    });
  });

  // -------------------------------------------------------------------------
  // Precondition handling
  // -------------------------------------------------------------------------

  describe('precondition handling', () => {
    it('does not dispatch feature with unmet preconditions', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
        {
          id: 'feat-b',
          description: 'Feature B',
          status: 'pending',
          preconditions: ['feat-a'],
        },
      ]);

      const dispatched = [];
      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      loop.on('worker-dispatched', payload => {
        dispatched.push(payload.featureId);
      });

      loop.start();

      // Wait for feat-a to be dispatched
      await waitForEvent(loop, 'worker-dispatched', 3000);
      // Give a bit more time to confirm feat-b is NOT dispatched yet
      await new Promise(r => setTimeout(r, 200));

      assert.ok(dispatched.includes('feat-a'), 'feat-a should be dispatched');
      assert.ok(
        !dispatched.includes('feat-b'),
        'feat-b should NOT be dispatched (precondition unmet)'
      );
    });

    it('feature with unmet preconditions stays pending', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
        {
          id: 'feat-b',
          description: 'Feature B',
          status: 'pending',
          preconditions: ['feat-a'],
        },
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      loop.start();
      await waitForEvent(loop, 'worker-dispatched', 3000);
      await new Promise(r => setTimeout(r, 200));

      const features = readFeatures(featuresPath);
      const featB = features.find(f => f.id === 'feat-b');
      assert.strictEqual(featB.status, 'pending', 'feat-b should remain pending');
    });
  });

  // -------------------------------------------------------------------------
  // Budget exhaustion
  // -------------------------------------------------------------------------

  describe('budget exhaustion', () => {
    it('does not dispatch when budget is exhausted', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      budget = createMockBudget({ exhausted: true });
      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const dispatched = [];
      loop.on('worker-dispatched', payload => dispatched.push(payload));

      loop.start();
      // Wait enough time for a poll to happen
      await new Promise(r => setTimeout(r, 300));
      loop.stop();

      assert.strictEqual(
        dispatched.length,
        0,
        'No features should be dispatched when budget exhausted'
      );
    });

    it('emits budget-exhausted event when slot denied', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      budget = createMockBudget({ exhausted: true });
      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const exhaustedPromise = waitForEvent(loop, 'budget-exhausted', 3000);
      loop.start();
      await exhaustedPromise;

      // Feature should still be pending
      const features = readFeatures(featuresPath);
      const featA = features.find(f => f.id === 'feat-a');
      assert.strictEqual(
        featA.status,
        'pending',
        'Feature should remain pending when budget exhausted'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Stop conditions
  // -------------------------------------------------------------------------

  describe('stop conditions', () => {
    it('stops when state.json shows paused', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      // Start in paused state
      writeState(workspacePath, { state: 'paused' });

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const stoppedPromise = waitForEvent(loop, 'stopped', 3000);
      loop.start();
      const [stoppedPayload] = await stoppedPromise;

      assert.strictEqual(stoppedPayload.reason, 'paused', 'Should stop with reason paused');
    });

    it('stops when no pending features remain', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A', status: 'completed' }),
        pendingFeature('feat-b', { description: 'Feature B', status: 'completed' }),
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const stoppedPromise = waitForEvent(loop, 'stopped', 3000);
      loop.start();
      const [stoppedPayload] = await stoppedPromise;

      assert.strictEqual(
        stoppedPayload.reason,
        'no-pending-features',
        'Should stop with reason no-pending-features'
      );
    });

    it('stop() method halts the polling loop', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      // Use exhausted budget so no dispatches happen (avoids the no-pending-features stop)
      budget = createMockBudget({ exhausted: true });

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      loop.start();
      // Allow one poll cycle
      await new Promise(r => setTimeout(r, 150));
      loop.stop();

      const callsBefore = budget._calls.length;
      // Wait to confirm no more polls happen
      await new Promise(r => setTimeout(r, 200));
      const callsAfter = budget._calls.length;

      assert.strictEqual(callsBefore, callsAfter, 'Budget should not be called after stop()');
    });

    it('calling start() multiple times does not create duplicate loops', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
      ]);

      const dispatched = [];
      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      loop.on('worker-dispatched', payload => dispatched.push(payload));

      // Start twice
      loop.start();
      loop.start();

      await waitForEvent(loop, 'worker-dispatched', 3000);
      await new Promise(r => setTimeout(r, 200));

      // Should dispatch feat-a exactly once, not twice
      const featADispatches = dispatched.filter(p => p.featureId === 'feat-a');
      assert.strictEqual(featADispatches.length, 1, 'feat-a should be dispatched exactly once');
    });
  });

  // -------------------------------------------------------------------------
  // Event payload structure
  // -------------------------------------------------------------------------

  describe('worker-dispatched event payload', () => {
    it('payload has featureId and sessionId fields', async () => {
      featuresPath = writeFeatures(testDir, [
        {
          id: 'feat-x',
          description: 'Feature X',
          status: 'pending',
          preconditions: [],
          skillName: 'tdd',
        },
      ]);

      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      const eventPromise = waitForEvent(loop, 'worker-dispatched', 3000);
      loop.start();
      const [payload] = await eventPromise;

      assert.ok(
        Object.prototype.hasOwnProperty.call(payload, 'featureId'),
        'payload.featureId must exist'
      );
      assert.ok(
        Object.prototype.hasOwnProperty.call(payload, 'sessionId'),
        'payload.sessionId must exist'
      );
      assert.strictEqual(
        payload.featureId,
        'feat-x',
        'featureId should match the dispatched feature'
      );
      assert.ok(typeof payload.sessionId === 'string', 'sessionId must be a string');
      assert.ok(payload.sessionId.length > 0, 'sessionId must be non-empty');
    });

    it('each dispatched feature gets a unique sessionId', async () => {
      featuresPath = writeFeatures(testDir, [
        pendingFeature('feat-a', { description: 'Feature A' }),
        pendingFeature('feat-b', { description: 'Feature B' }),
      ]);

      const sessionIds = [];
      loop = createDispatchLoop({
        workspacePath,
        featuresPath,
        db,
        budget,
        missionPath,
        pollIntervalMs: 50,
      });

      loop.on('worker-dispatched', payload => {
        sessionIds.push(payload.sessionId);
      });

      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout waiting for 2 dispatches')), 3000);
        loop.on('worker-dispatched', () => {
          if (sessionIds.length >= 2) {
            clearTimeout(timer);
            resolve();
          }
        });
        loop.start();
      });

      assert.ok(sessionIds.length >= 2, 'Should have at least 2 session IDs');
      assert.notStrictEqual(sessionIds[0], sessionIds[1], 'Session IDs should be unique');
    });
  });
});
