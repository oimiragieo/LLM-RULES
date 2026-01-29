/**
 * Extended Unit Tests: EventBus (P1-5.4)
 *
 * Comprehensive unit tests for EventBus covering:
 * - Emit validation with invalid events
 * - Priority ordering edge cases (same priority, boundary values)
 * - once() cleanup after single execution
 * - off() subscription cleanup
 * - Edge cases: duplicate subscriptions, handler errors, async handlers
 *
 * Coverage Target: >95% of EventBus code
 *
 * Related Files:
 * - .claude/lib/events/event-bus.cjs (EventBus implementation)
 * - tests/unit/events/event-bus.test.cjs (Basic unit tests - 17 tests)
 * - tests/integration/events/priority-pub-sub.test.mjs (Integration tests - 14 tests)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');
const require = createRequire(import.meta.url);

// Import CommonJS modules
const eventBus = require(path.join(projectRoot, '.claude/lib/events/event-bus.cjs'));

describe('EventBus Extended Unit Tests', () => {
  beforeEach(() => {
    // Clear subscriptions between tests
    eventBus.subscriptions = [];
  });

  describe('Emit Validation with Invalid Events', () => {
    it('should reject events with invalid type', async () => {
      let errorMessage = '';
      const originalError = console.error;
      console.error = msg => {
        errorMessage = msg;
      };

      try {
        await eventBus.emit('INVALID_TYPE', {
          type: 'INVALID_TYPE',
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorMessage.includes('Invalid event'), 'Should log validation error');
      } finally {
        console.error = originalError;
      }
    });

    it('should reject AGENT_STARTED without required fields', async () => {
      let errorMessage = '';
      const originalError = console.error;
      console.error = msg => {
        errorMessage = msg;
      };

      try {
        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          // Missing agentId, agentType, taskId
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorMessage.includes('Invalid event'), 'Should log validation error');
        assert.ok(errorMessage.includes('AGENT_STARTED'), 'Should mention event type');
      } finally {
        console.error = originalError;
      }
    });

    it('should reject AGENT_STARTED with invalid timestamp format', async () => {
      let errorMessage = '';
      const originalError = console.error;
      console.error = msg => {
        errorMessage = msg;
      };

      try {
        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: 'invalid-date', // Invalid ISO 8601 format
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorMessage.includes('Invalid event'), 'Should log validation error');
      } finally {
        console.error = originalError;
      }
    });

    it('should not emit events that fail validation', async () => {
      let handlerCalled = false;

      eventBus.on('AGENT_STARTED', () => {
        handlerCalled = true;
      });

      const originalError = console.error;
      console.error = () => {};

      try {
        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          // Missing required fields
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.strictEqual(handlerCalled, false, 'Handler should not be called for invalid events');
      } finally {
        console.error = originalError;
      }
    });

    it('should validate TASK_CREATED with required fields', async () => {
      let errorMessage = '';
      const originalError = console.error;
      console.error = msg => {
        errorMessage = msg;
      };

      try {
        await eventBus.emit('TASK_CREATED', {
          type: 'TASK_CREATED',
          taskId: 'task-123',
          // Missing subject and description
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorMessage.includes('Invalid event'), 'Should log validation error');
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('Priority Ordering Edge Cases', () => {
    it('should handle priority boundary values (0 and 100)', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => executionOrder.push('max'), 100);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('min'), 0);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('middle'), 50);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(
        executionOrder,
        ['max', 'middle', 'min'],
        'Should handle boundary priority values (100, 50, 0)'
      );
    });

    it('should handle multiple handlers with same priority (FIFO order)', async () => {
      const executionOrder = [];

      // All priority 50 (default)
      eventBus.on('AGENT_STARTED', () => executionOrder.push('1st'));
      eventBus.on('AGENT_STARTED', () => executionOrder.push('2nd'));
      eventBus.on('AGENT_STARTED', () => executionOrder.push('3rd'));
      eventBus.on('AGENT_STARTED', () => executionOrder.push('4th'));

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(
        executionOrder,
        ['1st', '2nd', '3rd', '4th'],
        'Same priority handlers should execute in subscription order (FIFO)'
      );
    });

    it('should handle negative priority values', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => executionOrder.push('negative'), -10);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('zero'), 0);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('positive'), 10);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(
        executionOrder,
        ['positive', 'zero', 'negative'],
        'Should handle negative priority values'
      );
    });

    it('should handle very large priority values', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => executionOrder.push('huge'), 10000);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('normal'), 50);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('small'), 1);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(
        executionOrder,
        ['huge', 'normal', 'small'],
        'Should handle very large priority values'
      );
    });

    it('should sort stable when priorities are equal', async () => {
      const executionOrder = [];

      // Add 10 handlers with same priority
      for (let i = 0; i < 10; i++) {
        eventBus.on('AGENT_STARTED', () => executionOrder.push(i), 50);
      }

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(
        executionOrder,
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        'Should maintain stable sort order for equal priorities'
      );
    });
  });

  describe('once() Cleanup Behavior', () => {
    it('should execute handler once and then auto-unsubscribe', async () => {
      let callCount = 0;

      eventBus.once('AGENT_STARTED', () => {
        callCount++;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(callCount, 1, 'Handler should execute once');

      // Emit again
      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(callCount, 1, 'Handler should not execute again (auto-unsubscribed)');
    });

    it('should remove subscription from subscriptions array after execution', async () => {
      const initialCount = eventBus.subscriptions.length;

      eventBus.once('AGENT_STARTED', () => {});

      const afterOnceCount = eventBus.subscriptions.length;
      assert.strictEqual(afterOnceCount, initialCount + 1, 'Should add subscription');

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      const afterEmitCount = eventBus.subscriptions.length;
      assert.strictEqual(
        afterEmitCount,
        initialCount,
        'Should remove subscription after execution'
      );
    });

    it('should not leak memory with multiple once() subscriptions', async () => {
      const initialCount = eventBus.subscriptions.length;

      // Add 100 once() subscriptions
      for (let i = 0; i < 100; i++) {
        eventBus.once('AGENT_STARTED', () => {});
      }

      assert.strictEqual(
        eventBus.subscriptions.length,
        initialCount + 100,
        'Should add all subscriptions'
      );

      // Emit event
      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(
        eventBus.subscriptions.length,
        initialCount,
        'Should remove all once() subscriptions'
      );
    });

    it('should support once() with async handler', async () => {
      let callCount = 0;

      eventBus.once('AGENT_STARTED', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        callCount++;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(callCount, 1, 'Async handler should execute once');

      // Emit again
      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(callCount, 1, 'Async handler should not execute again');
    });

    it('should call handler before unsubscribing', async () => {
      let handlerExecuted = false;
      let subscriptionRemovedDuringHandler = false;

      eventBus.once('AGENT_STARTED', () => {
        handlerExecuted = true;
        // Check if subscription still exists at this point
        subscriptionRemovedDuringHandler = eventBus.subscriptions.length === 0;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(handlerExecuted, true, 'Handler should execute');
      assert.strictEqual(
        subscriptionRemovedDuringHandler,
        false,
        'Subscription should exist during handler execution'
      );
    });
  });

  describe('off() Subscription Cleanup', () => {
    it('should remove subscription correctly', async () => {
      let callCount = 0;

      const subscription = eventBus.on('AGENT_STARTED', () => {
        callCount++;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(callCount, 1, 'Handler should execute before off()');

      eventBus.off(subscription);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(callCount, 1, 'Handler should not execute after off()');
    });

    it('should not fail when removing non-existent subscription', () => {
      const fakeSubscription = { eventType: 'AGENT_STARTED', handler: () => {}, priority: 50 };

      // Should not throw
      assert.doesNotThrow(() => {
        eventBus.off(fakeSubscription);
      });
    });

    it('should remove specific subscription without affecting others', async () => {
      const calls = [];

      const sub1 = eventBus.on('AGENT_STARTED', () => calls.push('sub1'));
      const sub2 = eventBus.on('AGENT_STARTED', () => calls.push('sub2'));
      const sub3 = eventBus.on('AGENT_STARTED', () => calls.push('sub3'));

      // Remove middle subscription
      eventBus.off(sub2);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(calls, ['sub1', 'sub3'], 'Should only call remaining subscriptions');

      // Cleanup
      eventBus.off(sub1);
      eventBus.off(sub3);
    });

    it('should remove subscription from subscriptions array', () => {
      const initialCount = eventBus.subscriptions.length;

      const subscription = eventBus.on('AGENT_STARTED', () => {});

      assert.strictEqual(
        eventBus.subscriptions.length,
        initialCount + 1,
        'Should add subscription'
      );

      eventBus.off(subscription);

      assert.strictEqual(eventBus.subscriptions.length, initialCount, 'Should remove subscription');
    });

    it('should handle calling off() multiple times on same subscription', () => {
      const subscription = eventBus.on('AGENT_STARTED', () => {});

      // First off() should remove
      eventBus.off(subscription);

      // Second off() should not throw
      assert.doesNotThrow(() => {
        eventBus.off(subscription);
      });
    });
  });

  describe('Edge Cases: Duplicate Subscriptions', () => {
    it('should allow duplicate subscriptions with same handler', async () => {
      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      eventBus.on('AGENT_STARTED', handler);
      eventBus.on('AGENT_STARTED', handler); // Duplicate

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(callCount, 2, 'Duplicate handlers should both execute');
    });

    it('should allow subscriptions with same handler but different priorities', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => executionOrder.push('low'), 10);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('high'), 90);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(executionOrder, ['high', 'low'], 'Should execute in priority order');
    });

    it('should handle removing one duplicate subscription', async () => {
      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      const sub1 = eventBus.on('AGENT_STARTED', handler);
      const sub2 = eventBus.on('AGENT_STARTED', handler); // Duplicate

      // Remove one
      eventBus.off(sub1);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(callCount, 1, 'Only remaining duplicate should execute');

      // Cleanup
      eventBus.off(sub2);
    });
  });

  describe('Edge Cases: Handler Errors', () => {
    it('should continue executing handlers after one throws', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => executionOrder.push('first'));
      eventBus.on('AGENT_STARTED', () => {
        throw new Error('Handler error');
      });
      eventBus.on('AGENT_STARTED', () => executionOrder.push('third'));

      const originalError = console.error;
      console.error = () => {};

      try {
        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });
        await new Promise(resolve => setTimeout(resolve, 50));

        assert.deepStrictEqual(
          executionOrder,
          ['first', 'third'],
          'Should execute all handlers despite error'
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should log handler errors with event type', async () => {
      let errorLog = '';

      const originalError = console.error;
      console.error = (...args) => {
        errorLog = args.join(' ');
      };

      try {
        eventBus.on('AGENT_STARTED', () => {
          throw new Error('Test error message');
        });

        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });
        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorLog.includes('Handler error'), 'Should mention handler error');
        assert.ok(errorLog.includes('AGENT_STARTED'), 'Should mention event type');
      } finally {
        console.error = originalError;
      }
    });

    it('should handle handler returning undefined', async () => {
      let executed = false;

      eventBus.on('AGENT_STARTED', () => {
        executed = true;
        // Implicitly return undefined
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(executed, true, 'Handler returning undefined should execute');
    });

    it('should handle handler returning null', async () => {
      let executed = false;

      eventBus.on('AGENT_STARTED', () => {
        executed = true;
        return null;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(executed, true, 'Handler returning null should execute');
    });
  });

  describe('Edge Cases: Async Handlers', () => {
    it('should handle async handlers that reject', async () => {
      let errorLogged = false;

      const originalError = console.error;
      console.error = () => {
        errorLogged = true;
      };

      try {
        eventBus.on('AGENT_STARTED', async () => {
          throw new Error('Async rejection');
        });

        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });
        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorLogged, 'Async rejection should be logged');
      } finally {
        console.error = originalError;
      }
    });

    it('should wait for async handlers to complete before next in priority', async () => {
      const executionOrder = [];

      eventBus.on(
        'AGENT_STARTED',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          executionOrder.push('high');
        },
        90
      );

      eventBus.on(
        'AGENT_STARTED',
        () => {
          executionOrder.push('low');
        },
        10
      );

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 150));

      assert.deepStrictEqual(
        executionOrder,
        ['high', 'low'],
        'Should execute in priority order even with async'
      );
    });

    it('should handle mix of sync and async handlers', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => executionOrder.push('sync1'));
      eventBus.on('AGENT_STARTED', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('async');
      });
      eventBus.on('AGENT_STARTED', () => executionOrder.push('sync2'));

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.deepStrictEqual(
        executionOrder,
        ['sync1', 'async', 'sync2'],
        'Should execute mixed handlers in order'
      );
    });

    it('should not block emit() on slow async handlers', async () => {
      const start = Date.now();

      eventBus.on('AGENT_STARTED', async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      const elapsed = Date.now() - start;

      assert.ok(elapsed < 100, `emit() should return immediately, took ${elapsed}ms`);
    });
  });

  describe('Edge Cases: Empty Events and No Subscribers', () => {
    it('should handle emitting event with no subscribers', async () => {
      // Should not throw
      await assert.doesNotReject(async () => {
        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });
      });
    });

    it('should handle event with minimal payload', async () => {
      let received = null;

      eventBus.on('AGENT_STARTED', payload => {
        received = payload;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(received, 'Event should be received');
      assert.ok(received.timestamp, 'Timestamp should be added');
    });

    it('should add timestamp if missing from payload', async () => {
      let received = null;

      eventBus.on('AGENT_STARTED', payload => {
        received = payload;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
      }); // No timestamp

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(received, 'Event should be received');
      assert.ok(received.timestamp, 'Timestamp should be auto-added');
      assert.ok(typeof received.timestamp === 'string', 'Timestamp should be string');
    });

    it('should preserve existing timestamp if provided', async () => {
      let received = null;
      const customTimestamp = '2026-01-28T10:00:00.000Z';

      eventBus.on('AGENT_STARTED', payload => {
        received = payload;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: customTimestamp,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(received.timestamp, customTimestamp, 'Should preserve custom timestamp');
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak memory with many subscriptions and unsubscriptions', async () => {
      const initialCount = eventBus.subscriptions.length;

      // Add and remove 1000 subscriptions
      for (let i = 0; i < 1000; i++) {
        const sub = eventBus.on('AGENT_STARTED', () => {});
        eventBus.off(sub);
      }

      assert.strictEqual(
        eventBus.subscriptions.length,
        initialCount,
        'Should not leak subscriptions'
      );
    });

    it('should cleanup once() subscriptions after emission', async () => {
      const initialCount = eventBus.subscriptions.length;

      // Add 50 once() subscriptions
      for (let i = 0; i < 50; i++) {
        eventBus.once('AGENT_STARTED', () => {});
      }

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(
        eventBus.subscriptions.length,
        initialCount,
        'Should cleanup all once() subscriptions'
      );
    });

    it('should not accumulate subscriptions on multiple off() calls', () => {
      const initialCount = eventBus.subscriptions.length;

      const sub = eventBus.on('AGENT_STARTED', () => {});

      eventBus.off(sub);
      eventBus.off(sub); // Second call
      eventBus.off(sub); // Third call

      assert.strictEqual(
        eventBus.subscriptions.length,
        initialCount,
        'Should not affect count on duplicate off() calls'
      );
    });
  });

  describe('waitFor() Edge Cases', () => {
    it('should timeout when event not emitted', async () => {
      let timedOut = false;

      try {
        await eventBus.waitFor('AGENT_STARTED', 100);
      } catch (error) {
        timedOut = true;
        assert.ok(error.message.includes('Timeout'), 'Should mention timeout in error');
        assert.ok(error.message.includes('AGENT_STARTED'), 'Should mention event type');
      }

      assert.ok(timedOut, 'Should timeout');
    });

    it('should resolve when event emitted after waitFor', async () => {
      const promise = eventBus.waitFor('AGENT_STARTED', 1000);

      // Emit after 50ms
      setTimeout(() => {
        eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          data: 'test',
          timestamp: new Date().toISOString(),
        });
      }, 50);

      const result = await promise;

      assert.ok(result, 'Should resolve with payload');
      assert.strictEqual(result.data, 'test');
    });

    it('should cleanup timeout when event is emitted', async () => {
      const promise = eventBus.waitFor('AGENT_STARTED', 5000);

      setTimeout(() => {
        eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });
      }, 50);

      await promise;

      // If timeout wasn't cleared, this test would hang for 5 seconds
      // If it completes quickly, timeout was cleared
    });
  });
});
