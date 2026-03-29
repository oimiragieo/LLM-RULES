'use strict';

/**
 * Tests for Friction Loop Engine - Core Assertions
 *
 * Validates assertions:
 * - VAL-FL-001: Validation failure triggers worker revival
 * - VAL-FL-002: Revived worker gets context plus stderr plus iteration
 * - VAL-FL-003: Escalation — retry at 1, replan at 2, human at 3
 * - VAL-FL-004: Capped after max iterations
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

// Module under test
const { FrictionLoopEngine } = require('../../.claude/lib/mission/friction-loop.cjs');

/**
 * Helper to wait for an event with timeout
 */
function waitForEvent(emitter, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    emitter.once(eventName, payload => {
      clearTimeout(timeout);
      resolve({ event: eventName, payload });
    });
  });
}

/**
 * Create an in-memory SQLite database with the message_queue table
 */
function createTestDatabase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, user_id TEXT, text TEXT,
      attachments TEXT DEFAULT '[]', timestamp INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', attempt_count INTEGER DEFAULT 0
    )
  `);
  return db;
}

describe('FrictionLoopEngine - Core', () => {
  let tempDir;
  let db;
  let engine;
  let enqueueSpy;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friction-loop-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    db = createTestDatabase();
    enqueueSpy = [];
    engine = new FrictionLoopEngine({
      db,
      enqueueFn: (dbInstance, payload) => {
        enqueueSpy.push(payload);
        const id = `test-${Date.now()}-${enqueueSpy.length}`;
        dbInstance
          .prepare(
            `INSERT INTO message_queue (id, chat_id, text, timestamp, status) VALUES (?, ?, ?, ?, 'pending')`
          )
          .run(id, payload.chatId || 'mission-engine', JSON.stringify(payload), Date.now());
        return { id };
      },
    });
  });

  afterEach(() => {
    if (engine) engine.stop();
    if (db) db.close();
  });

  describe('VAL-FL-001: Validation failure triggers worker revival', () => {
    it('re-enqueues task when validation-failed event fires', async () => {
      engine.start();
      const originalContext = {
        featureId: 'test-feature',
        skillName: 'test-skill',
        personaContext: {},
      };
      engine.emit('validation-failed', {
        originalContext,
        error: new Error('Validation failed'),
        stderr: 'Error',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.ok(result, 're-enqueued event should be emitted');
      assert.strictEqual(result.payload.featureId, 'test-feature', 'featureId should match');
    });

    it('increments attempt_count on each failure', async () => {
      engine.start();
      const originalContext = {
        featureId: 'test-feature-2',
        skillName: 'test-skill',
        personaContext: {},
      };
      engine.emit('validation-failed', {
        originalContext,
        error: new Error('First failure'),
        stderr: 'E1',
      });
      const result1 = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result1.payload.iteration, 1, 'First failure should be iteration 1');
      engine.emit('validation-failed', {
        originalContext: result1.payload,
        error: new Error('Second failure'),
        stderr: 'E2',
      });
      const result2 = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result2.payload.iteration, 2, 'Second failure should be iteration 2');
    });
  });

  describe('VAL-FL-002: Revived worker gets context plus stderr plus iteration', () => {
    it('re-enqueued payload contains originalContext', async () => {
      engine.start();
      const originalContext = {
        featureId: 'context-test',
        skillName: 'my-skill',
        personaContext: { missionObjectives: ['Build'] },
      };
      engine.emit('validation-failed', {
        originalContext,
        error: new Error('Failed'),
        stderr: 'test',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.ok(result.payload.originalContext, 'Should have originalContext');
      assert.deepStrictEqual(
        result.payload.originalContext.personaContext,
        originalContext.personaContext
      );
    });

    it('re-enqueued payload contains stderrDump', async () => {
      engine.start();
      const stderrOutput = 'Error: Something went wrong\n  at line 42';
      engine.emit('validation-failed', {
        originalContext: { featureId: 'stderr-test', skillName: 'test' },
        error: new Error('Failed'),
        stderr: stderrOutput,
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result.payload.stderrDump, stderrOutput, 'stderrDump should match');
    });

    it('re-enqueued payload contains iteration number', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'iter-test', skillName: 'test' },
        error: new Error('Failed'),
        stderr: 'e',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(typeof result.payload.iteration, 'number', 'Iteration should be a number');
    });
  });

  describe('VAL-FL-003: Escalation — retry at 1, replan at 2, human at 3', () => {
    it('iteration 1 uses strategy "retry"', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'retry-test', skillName: 'test' },
        error: new Error('Failed'),
        stderr: 'e',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result.payload.strategy, 'retry', 'Iteration 1 should use retry strategy');
    });

    it('iteration 2 uses strategy "replan"', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'replan-test', skillName: 'test' },
        error: new Error('F1'),
        stderr: 'e1',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { featureId: 'replan-test', skillName: 'test', iteration: 1 },
        error: new Error('F2'),
        stderr: 'e2',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(
        result.payload.strategy,
        'replan',
        'Iteration 2 should use replan strategy'
      );
    });

    it('iteration 3 emits human-intervention-required event', async () => {
      engine.start();
      const ctx = {
        featureId: 'human-test',
        skillName: 'test',
        personaContext: { featureDescription: 'Test' },
      };
      engine.emit('validation-failed', {
        originalContext: ctx,
        error: new Error('F1'),
        stderr: 'e1',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 1 },
        error: new Error('F2'),
        stderr: 'e2',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 2 },
        error: new Error('F3'),
        stderr: 'e3',
      });
      const result = await waitForEvent(engine, 'human-intervention-required', 3000);
      assert.strictEqual(result.payload.featureId, 'human-test');
      assert.strictEqual(result.payload.iterationCount, 3);
      assert.strictEqual(result.payload.stderrHistory.length, 3);
    });

    it('human-intervention-required includes full context dump', async () => {
      engine.start();
      const ctx = {
        featureId: 'dump-test',
        featureTitle: 'Test Feature',
        skillName: 'test',
        personaContext: { missionObjectives: ['Build'] },
      };
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 2 },
        error: new Error('F'),
        stderr: 'e',
      });
      const result = await waitForEvent(engine, 'human-intervention-required', 3000);
      assert.strictEqual(result.payload.featureTitle, 'Test Feature');
      assert.ok(result.payload.originalPrompt, 'Should have originalPrompt');
      assert.ok(result.payload.suggestedAction, 'Should have suggestedAction');
    });
  });

  describe('VAL-FL-004: Capped after max iterations', () => {
    it('after cap (3), subsequent failures emit friction-capped event', async () => {
      engine.start();
      const ctx = { featureId: 'capped-test', skillName: 'test' };
      engine.emit('validation-failed', {
        originalContext: ctx,
        error: new Error('F1'),
        stderr: 'e1',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 1 },
        error: new Error('F2'),
        stderr: 'e2',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 2 },
        error: new Error('F3'),
        stderr: 'e3',
      });
      await waitForEvent(engine, 'human-intervention-required', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 3 },
        error: new Error('F4'),
        stderr: 'e4',
      });
      const result = await waitForEvent(engine, 'friction-capped', 3000);
      assert.strictEqual(result.payload.featureId, 'capped-test');
      assert.strictEqual(result.payload.iterationCount, 4);
    });

    it('no re-enqueue after cap is reached', async () => {
      engine.start();
      const ctx = { featureId: 'no-retry-cap', skillName: 'test' };
      engine.emit('validation-failed', {
        originalContext: ctx,
        error: new Error('F1'),
        stderr: 'e1',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 1 },
        error: new Error('F2'),
        stderr: 'e2',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 2 },
        error: new Error('F3'),
        stderr: 'e3',
      });
      await waitForEvent(engine, 'human-intervention-required', 3000);
      let reEnqueueFired = false;
      engine.on('re-enqueued', () => {
        reEnqueueFired = true;
      });
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 3 },
        error: new Error('F4'),
        stderr: 'e4',
      });
      await waitForEvent(engine, 'friction-capped', 3000);
      assert.strictEqual(reEnqueueFired, false, 'Should NOT emit re-enqueued after cap');
    });

    it('multiple failures after cap all emit friction-capped', async () => {
      engine.start();
      const ctx = { featureId: 'multi-capped', skillName: 'test' };
      engine.emit('validation-failed', {
        originalContext: ctx,
        error: new Error('F1'),
        stderr: 'e1',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 1 },
        error: new Error('F2'),
        stderr: 'e2',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 2 },
        error: new Error('F3'),
        stderr: 'e3',
      });
      await waitForEvent(engine, 'human-intervention-required', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 3 },
        error: new Error('F4'),
        stderr: 'e4',
      });
      await waitForEvent(engine, 'friction-capped', 3000);
      engine.emit('validation-failed', {
        originalContext: { ...ctx, iteration: 4 },
        error: new Error('F5'),
        stderr: 'e5',
      });
      await waitForEvent(engine, 'friction-capped', 3000);
      assert.ok(true, 'Multiple failures after cap should all emit friction-capped');
    });
  });

  describe('Transient errors', () => {
    it('transient error uses retry strategy', async () => {
      engine.start();
      const transientError = new Error('Network timeout');
      transientError.transient = true;
      engine.emit('validation-failed', {
        originalContext: { featureId: 'trans-test', skillName: 'test' },
        error: transientError,
        stderr: 'net',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(
        result.payload.strategy,
        'retry',
        'Transient error should use retry strategy'
      );
    });

    it('transient error does not advance escalation counter', async () => {
      engine.start();
      const transientError = new Error('Temporary failure');
      transientError.transient = true;
      engine.emit('validation-failed', {
        originalContext: { featureId: 'trans-no-esc', skillName: 'test' },
        error: transientError,
        stderr: 'e1',
      });
      const result1 = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result1.payload.iteration, 1);
      engine.emit('validation-failed', {
        originalContext: { ...result1.payload },
        error: transientError,
        stderr: 'e2',
      });
      const result2 = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result2.payload.strategy, 'retry', 'Transient should always use retry');
    });

    it('non-transient error after transient still advances counter', async () => {
      engine.start();
      const transientError = new Error('Temporary');
      transientError.transient = true;
      engine.emit('validation-failed', {
        originalContext: { featureId: 'trans-then-non', skillName: 'test' },
        error: transientError,
        stderr: 'e1',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      engine.emit('validation-failed', {
        originalContext: { featureId: 'trans-then-non', skillName: 'test', iteration: 1 },
        error: new Error('Permanent'),
        stderr: 'e2',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(
        result.payload.strategy,
        'replan',
        'Non-transient should advance escalation'
      );
    });
  });

  describe('Edge cases', () => {
    it('handles missing originalContext gracefully', async () => {
      engine.start();
      let errorReceived = null;
      engine.on('error', err => {
        errorReceived = err;
      });
      engine.emit('validation-failed', { error: new Error('Failed'), stderr: 'e' });
      await new Promise(r => setTimeout(r, 200));
      assert.ok(errorReceived, 'Should emit error event');
      assert.strictEqual(errorReceived.code, 'MISSING_CONTEXT');
    });

    it('handles missing stderr gracefully', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'no-stderr', skillName: 'test' },
        error: new Error('Failed'),
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(result.payload.stderrDump, '');
    });

    it('tracks per-feature iteration counts independently', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'feature-a', skillName: 'test' },
        error: new Error('A'),
        stderr: 'a',
      });
      const resultA = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(resultA.payload.iteration, 1);
      engine.emit('validation-failed', {
        originalContext: { featureId: 'feature-b', skillName: 'test' },
        error: new Error('B'),
        stderr: 'b',
      });
      const resultB = await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(resultB.payload.iteration, 1, 'Feature B should start at iteration 1');
    });
  });

  describe('Integration', () => {
    it('calls enqueueFn when re-enqueueing', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'enqueue-test', skillName: 'test' },
        error: new Error('Failed'),
        stderr: 'e',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      assert.strictEqual(enqueueSpy.length, 1);
    });

    it('enqueueFn receives correct payload structure', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'payload-test', skillName: 'my-skill' },
        error: new Error('Failed'),
        stderr: 's',
      });
      await waitForEvent(engine, 're-enqueued', 3000);
      const p = enqueueSpy[0];
      assert.strictEqual(p.featureId, 'payload-test');
      assert.strictEqual(p.skillName, 'my-skill');
      assert.ok(p.stderrDump);
    });
  });

  describe('Lifecycle', () => {
    it('start() enables event processing', async () => {
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'start-test', skillName: 'test' },
        error: new Error('F'),
        stderr: 'e',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.ok(result);
    });

    it('stop() disables event processing', async () => {
      engine.start();
      engine.stop();
      let fired = false;
      engine.on('re-enqueued', () => {
        fired = true;
      });
      engine.emit('validation-failed', {
        originalContext: { featureId: 'stop-test', skillName: 'test' },
        error: new Error('F'),
        stderr: 'e',
      });
      await new Promise(r => setTimeout(r, 500));
      assert.strictEqual(fired, false);
    });

    it('can be started again after stop()', async () => {
      engine.start();
      engine.stop();
      await new Promise(r => setTimeout(r, 100));
      engine.start();
      engine.emit('validation-failed', {
        originalContext: { featureId: 'restart-test', skillName: 'test' },
        error: new Error('F'),
        stderr: 'e',
      });
      const result = await waitForEvent(engine, 're-enqueued', 3000);
      assert.ok(result);
    });
  });
});
