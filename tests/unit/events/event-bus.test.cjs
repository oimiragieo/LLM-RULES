#!/usr/bin/env node
/**
 * Tests for event-bus.cjs (P1-5.1)
 *
 * Tests EventBus singleton with pub/sub, priority support, and async operations.
 * Following TDD: Write failing tests first, then implement.
 */

'use strict';

const path = require('path');

// Valid payloads for registered event types (event-bus validates against event-types.cjs)
const EVENT_TYPE = 'AGENT_STARTED';
function validPayload(overrides = {}) {
  return {
    type: EVENT_TYPE,
    agentId: 'test-agent',
    agentType: 'test',
    taskId: 'test-task',
    ...overrides,
  };
}

// Test utilities
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    failCount++;
  }
}

async function describe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

// =============================================================================
// Test Suite
// =============================================================================

async function runTests() {
  console.log('EventBus Tests (P1-5.1)');
  console.log('=======================');

  // Load module (will fail until implemented)
  let eventBus;
  try {
    eventBus = require('../../../.claude/lib/events/event-bus.cjs');
  } catch (error) {
    console.error('Failed to load EventBus module:', error.message);
    console.error(
      'This is expected for RED phase of TDD - implement the module to make tests pass'
    );
    process.exit(1);
  }

  await describe('EventBus Singleton', async () => {
    await test('should export a singleton instance', () => {
      assert(eventBus !== null, 'eventBus should not be null');
      assert(typeof eventBus === 'object', 'eventBus should be an object');
    });

    await test('should have emit method', () => {
      assert(typeof eventBus.emit === 'function', 'emit should be a function');
    });

    await test('should have on method', () => {
      assert(typeof eventBus.on === 'function', 'on should be a function');
    });

    await test('should have once method', () => {
      assert(typeof eventBus.once === 'function', 'once should be a function');
    });

    await test('should have off method', () => {
      assert(typeof eventBus.off === 'function', 'off should be a function');
    });

    await test('should have waitFor method', () => {
      assert(typeof eventBus.waitFor === 'function', 'waitFor should be a function');
    });
  });

  await describe('Event Emission', async () => {
    await test('should emit events to subscribers', async () => {
      let received = null;
      const subscription = eventBus.on(EVENT_TYPE, payload => {
        received = payload;
      });

      await eventBus.emit(EVENT_TYPE, validPayload({ data: 'test' }));

      // Give time for async emission
      await new Promise(resolve => setTimeout(resolve, 10));

      assert(received !== null, 'event should be received');
      assert(received.data === 'test', 'event data should match');
      assert(received.timestamp !== undefined, 'timestamp should be added');

      eventBus.off(subscription);
    });

    await test('should add timestamp to emitted events', async () => {
      let received = null;
      const subscription = eventBus.on(EVENT_TYPE, payload => {
        received = payload;
      });

      await eventBus.emit(EVENT_TYPE, validPayload({ value: 42 }));

      await new Promise(resolve => setTimeout(resolve, 10));

      assert(received !== null, 'event should be received');
      assert(received.timestamp !== undefined, 'timestamp should exist');
      assert(typeof received.timestamp === 'string', 'timestamp should be a string');
      eventBus.off(subscription);
    });

    await test('should handle multiple subscribers for same event', async () => {
      const received = [];
      const sub1 = eventBus.on(EVENT_TYPE, _payload => {
        received.push('handler1');
      });
      const sub2 = eventBus.on(EVENT_TYPE, _payload => {
        received.push('handler2');
      });

      await eventBus.emit(EVENT_TYPE, validPayload({ test: true }));

      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(received.length, 2, 'both handlers should be called');
      assert(received.includes('handler1'), 'handler1 should be called');
      assert(received.includes('handler2'), 'handler2 should be called');

      eventBus.off(sub1);
      eventBus.off(sub2);
    });

    await test('should await async handlers before emit resolves', async () => {
      const calls = [];
      const sub = eventBus.on(EVENT_TYPE, async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        calls.push('done');
      });

      const started = Date.now();
      await eventBus.emit(EVENT_TYPE, validPayload({ contract: 'awaitable' }));
      const elapsed = Date.now() - started;

      assertEqual(calls.length, 1, 'handler should complete before emit resolves');
      assert(
        elapsed >= 20,
        `emit should wait for async handlers; elapsed=${elapsed}ms expected >= 20ms`
      );

      eventBus.off(sub);
    });
  });

  await describe('Priority Support', async () => {
    await test('should execute handlers in priority order (higher first)', async () => {
      const order = [];
      const sub1 = eventBus.on(EVENT_TYPE, () => order.push('low'), 10);
      const sub2 = eventBus.on(EVENT_TYPE, () => order.push('medium'), 50);
      const sub3 = eventBus.on(EVENT_TYPE, () => order.push('high'), 90);

      await eventBus.emit(EVENT_TYPE, validPayload());

      await new Promise(resolve => setTimeout(resolve, 10));

      assertDeepEqual(
        order,
        ['high', 'medium', 'low'],
        'handlers should execute high to low priority'
      );

      eventBus.off(sub1);
      eventBus.off(sub2);
      eventBus.off(sub3);
    });

    await test('should default priority to 50', async () => {
      const order = [];
      const sub1 = eventBus.on(EVENT_TYPE, () => order.push('default'));
      const sub2 = eventBus.on(EVENT_TYPE, () => order.push('high'), 90);
      const sub3 = eventBus.on(EVENT_TYPE, () => order.push('low'), 10);

      await eventBus.emit(EVENT_TYPE, validPayload());

      await new Promise(resolve => setTimeout(resolve, 10));

      assertDeepEqual(order, ['high', 'default', 'low'], 'default priority should be 50');

      eventBus.off(sub1);
      eventBus.off(sub2);
      eventBus.off(sub3);
    });
  });

  await describe('Subscription Management', async () => {
    await test('should unsubscribe correctly', async () => {
      let callCount = 0;
      const subscription = eventBus.on(EVENT_TYPE, () => callCount++);

      await eventBus.emit(EVENT_TYPE, validPayload());
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should be called once');

      eventBus.off(subscription);

      await eventBus.emit(EVENT_TYPE, validPayload());
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should not be called after unsubscribe');
    });

    await test('should support once subscription', async () => {
      let callCount = 0;
      eventBus.once(EVENT_TYPE, () => callCount++);

      await eventBus.emit(EVENT_TYPE, validPayload());
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should be called once');

      await eventBus.emit(EVENT_TYPE, validPayload());
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should not be called again');
    });
  });

  await describe('waitFor Promise-based Event Waiting', async () => {
    await test('should resolve when event is emitted', async () => {
      const promise = eventBus.waitFor(EVENT_TYPE, 1000);

      setTimeout(() => {
        eventBus.emit(EVENT_TYPE, validPayload({ result: 'success' }));
      }, 50);

      const payload = await promise;

      assert(payload !== null, 'payload should not be null');
      assertEqual(payload.result, 'success', 'payload should contain result');
    });

    await test('should timeout if event not emitted', async () => {
      let timedOut = false;
      try {
        await eventBus.waitFor(EVENT_TYPE, 100);
      } catch (error) {
        timedOut = true;
        assert(error.message.includes('Timeout'), 'error should mention timeout');
      }

      assert(timedOut, 'should timeout');
    });

    await test('should support default timeout of 30 seconds', async () => {
      const start = Date.now();
      const promise = eventBus.waitFor(EVENT_TYPE);

      setTimeout(() => {
        eventBus.emit(EVENT_TYPE, validPayload());
      }, 50);

      await promise;
      const elapsed = Date.now() - start;

      assert(elapsed < 1000, 'should not wait full 30s when event is emitted');
    });
  });

  await describe('Error Handling', async () => {
    await test('should not crash if handler throws error', async () => {
      let errorThrown = false;
      const sub1 = eventBus.on(EVENT_TYPE, () => {
        errorThrown = true;
        throw new Error('Handler error');
      });
      let successCalled = false;
      const sub2 = eventBus.on(EVENT_TYPE, () => {
        successCalled = true;
      });

      await eventBus.emit(EVENT_TYPE, validPayload());

      await new Promise(resolve => setTimeout(resolve, 10));

      assert(errorThrown, 'error handler should have been called');
      assert(successCalled, 'subsequent handlers should still execute');

      eventBus.off(sub1);
      eventBus.off(sub2);
    });
  });

  // Summary
  console.log('\n=======================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
