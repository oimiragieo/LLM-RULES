#!/usr/bin/env node
/**
 * Tests for EventBus Circularity Protection (Phase 1.1)
 *
 * Verifies that the EventBus detects and blocks infinite loops
 * caused by handlers emitting events that trigger themselves.
 */

'use strict';

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

async function testCircularity() {
  console.log('EventBus Circularity Tests');
  console.log('==========================');

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

  await test('should prevent infinite event loops', async () => {
    const EVENT_A = 'AGENT_STARTED';
    const EVENT_B = 'TASK_CREATED';

    let emissionCount = 0;

    // Handler A triggers B
    eventBus.on(EVENT_A, async payload => {
      emissionCount++;
      if (emissionCount > 50) return; // Safety break
      await eventBus.emit(EVENT_B, {
        type: EVENT_B,
        taskId: payload.taskId,
        subject: 'Circular Test',
        description: 'Testing circularity protection',
        timestamp: new Date().toISOString(),
      });
    });

    // Handler B triggers A
    eventBus.on(EVENT_B, async payload => {
      emissionCount++;
      if (emissionCount > 50) return; // Safety break
      await eventBus.emit(EVENT_A, {
        type: EVENT_A,
        agentId: 'test',
        agentType: 'test',
        taskId: payload.taskId,
        timestamp: new Date().toISOString(),
      });
    });

    try {
      await eventBus.emit(EVENT_A, {
        type: EVENT_A,
        agentId: 'test',
        agentType: 'test',
        taskId: 'loop-test',
        timestamp: new Date().toISOString(),
      });
    } catch (_err) {
      // This might not be reached if the bus catches the error
    }

    // With MAX_DEPTH = 10, emissionCount should be limited
    if (emissionCount < 50 && emissionCount >= 10) {
      return; // Success: loop was broken
    }

    if (emissionCount >= 50) {
      throw new Error(`Infinite loop detected! Emission count reached ${emissionCount}`);
    }

    throw new Error(`Circularity protection failed to trigger. Emission count: ${emissionCount}`);
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testCircularity().catch(err => {
  console.error(err);
  process.exit(1);
});
