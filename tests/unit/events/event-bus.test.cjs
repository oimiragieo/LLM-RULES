#!/usr/bin/env node
/**
 * Tests for event-bus.cjs (P1-5.1)
 *
 * Tests EventBus singleton with pub/sub, priority support, and async operations.
 * Following TDD: Write failing tests first, then implement.
 */

'use strict';

const path = require('path');

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
      const subscription = eventBus.on('TEST_EVENT', payload => {
        received = payload;
      });

      await eventBus.emit('TEST_EVENT', { data: 'test' });

      // Give time for async emission
      await new Promise(resolve => setTimeout(resolve, 10));

      assert(received !== null, 'event should be received');
      assert(received.data === 'test', 'event data should match');
      assert(received.timestamp !== undefined, 'timestamp should be added');

      eventBus.off(subscription);
    });

    await test('should add timestamp to emitted events', async () => {
      let received = null;
      const subscription = eventBus.on('TIMESTAMP_TEST', payload => {
        received = payload;
      });

      await eventBus.emit('TIMESTAMP_TEST', { value: 42 });

      await new Promise(resolve => setTimeout(resolve, 10));

      assert(received !== null, 'event should be received');
      assert(received.timestamp !== undefined, 'timestamp should exist');
      assert(typeof received.timestamp === 'string', 'timestamp should be a string');
      eventBus.off(subscription);
    });

    await test('should handle multiple subscribers for same event', async () => {
      const received = [];
      const sub1 = eventBus.on('MULTI_TEST', _payload => {
        received.push('handler1');
      });
      const sub2 = eventBus.on('MULTI_TEST', _payload => {
        received.push('handler2');
      });

      await eventBus.emit('MULTI_TEST', { test: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(received.length, 2, 'both handlers should be called');
      assert(received.includes('handler1'), 'handler1 should be called');
      assert(received.includes('handler2'), 'handler2 should be called');

      eventBus.off(sub1);
      eventBus.off(sub2);
    });
  });

  await describe('Priority Support', async () => {
    await test('should execute handlers in priority order (higher first)', async () => {
      const order = [];
      const sub1 = eventBus.on('PRIORITY_TEST', () => order.push('low'), 10);
      const sub2 = eventBus.on('PRIORITY_TEST', () => order.push('medium'), 50);
      const sub3 = eventBus.on('PRIORITY_TEST', () => order.push('high'), 90);

      await eventBus.emit('PRIORITY_TEST', {});

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
      const sub1 = eventBus.on('DEFAULT_PRIORITY', () => order.push('default'));
      const sub2 = eventBus.on('DEFAULT_PRIORITY', () => order.push('high'), 90);
      const sub3 = eventBus.on('DEFAULT_PRIORITY', () => order.push('low'), 10);

      await eventBus.emit('DEFAULT_PRIORITY', {});

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
      const subscription = eventBus.on('UNSUB_TEST', () => callCount++);

      await eventBus.emit('UNSUB_TEST', {});
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should be called once');

      eventBus.off(subscription);

      await eventBus.emit('UNSUB_TEST', {});
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should not be called after unsubscribe');
    });

    await test('should support once subscription', async () => {
      let callCount = 0;
      eventBus.once('ONCE_TEST', () => callCount++);

      await eventBus.emit('ONCE_TEST', {});
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should be called once');

      await eventBus.emit('ONCE_TEST', {});
      await new Promise(resolve => setTimeout(resolve, 10));

      assertEqual(callCount, 1, 'handler should not be called again');
    });
  });

  await describe('waitFor Promise-based Event Waiting', async () => {
    await test('should resolve when event is emitted', async () => {
      const promise = eventBus.waitFor('WAIT_TEST', 1000);

      setTimeout(() => {
        eventBus.emit('WAIT_TEST', { result: 'success' });
      }, 50);

      const payload = await promise;

      assert(payload !== null, 'payload should not be null');
      assertEqual(payload.result, 'success', 'payload should contain result');
    });

    await test('should timeout if event not emitted', async () => {
      let timedOut = false;
      try {
        await eventBus.waitFor('TIMEOUT_TEST', 100);
      } catch (error) {
        timedOut = true;
        assert(error.message.includes('Timeout'), 'error should mention timeout');
      }

      assert(timedOut, 'should timeout');
    });

    await test('should support default timeout of 30 seconds', async () => {
      const start = Date.now();
      const promise = eventBus.waitFor('NEVER_EMITTED');

      setTimeout(() => {
        eventBus.emit('NEVER_EMITTED', {});
      }, 50);

      await promise;
      const elapsed = Date.now() - start;

      assert(elapsed < 1000, 'should not wait full 30s when event is emitted');
    });
  });

  await describe('Error Handling', async () => {
    await test('should not crash if handler throws error', async () => {
      let errorThrown = false;
      const sub1 = eventBus.on('ERROR_TEST', () => {
        errorThrown = true;
        throw new Error('Handler error');
      });
      let successCalled = false;
      const sub2 = eventBus.on('ERROR_TEST', () => {
        successCalled = true;
      });

      await eventBus.emit('ERROR_TEST', {});

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
