#!/usr/bin/env node
/**
 * Tests for EventBus Trace Propagation (Phase 5.1)
 *
 * Verifies that the EventBus:
 * 1. Automatically generates a traceId if missing.
 * 2. Propagates the same traceId to nested emissions.
 * 3. Allows overriding the traceId.
 */

'use strict';

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

async function testTracing() {
  console.log('EventBus Tracing Tests');
  console.log('======================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  await test('should generate and propagate traceId', async () => {
    const EVENT_1 = 'AGENT_STARTED';
    const EVENT_2 = 'TASK_CREATED';

    let traceId1, traceId2;

    eventBus.on(EVENT_1, async payload => {
      traceId1 = payload.traceId;
      await eventBus.emit(EVENT_2, {
        type: EVENT_2,
        taskId: 'nested-task',
        subject: 'Nested',
        description: 'Nested task',
        timestamp: new Date().toISOString(),
      });
    });

    eventBus.on(EVENT_2, payload => {
      traceId2 = payload.traceId;
    });

    await eventBus.emit(EVENT_1, {
      type: EVENT_1,
      agentId: 'test',
      agentType: 'test',
      taskId: 'root-task',
      timestamp: new Date().toISOString(),
    });

    if (!traceId1) throw new Error('Root event missing traceId');
    if (!traceId2) throw new Error('Nested event missing traceId');
    if (traceId1 !== traceId2) throw new Error(`TraceId mismatch: ${traceId1} vs ${traceId2}`);
  });

  await test('should allow overriding traceId', async () => {
    const EVENT = 'AGENT_STARTED';
    const customTraceId = 'custom-trace-123';
    let receivedTraceId;

    eventBus.on(EVENT, payload => {
      receivedTraceId = payload.traceId;
    });

    await eventBus.emit(EVENT, {
      type: EVENT,
      agentId: 'test',
      agentType: 'test',
      taskId: 'override-test',
      traceId: customTraceId,
      timestamp: new Date().toISOString(),
    });

    if (receivedTraceId !== customTraceId) {
      throw new Error(`Expected ${customTraceId}, got ${receivedTraceId}`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testTracing().catch(err => {
  console.error(err);
  process.exit(1);
});
