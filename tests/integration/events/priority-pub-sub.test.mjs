/**
 * Integration Tests: EventBus Pub/Sub with Priority Support (P1-5.3)
 *
 * Tests the integration of:
 * - Event validation using validateEvent() from event-types.cjs
 * - Priority-ordered handler execution
 * - Error boundaries (handler errors don't crash bus)
 * - Async, non-blocking emission
 *
 * Related Files:
 * - .claude/lib/events/event-bus.cjs (EventBus implementation)
 * - .claude/lib/events/event-types.cjs (Event type validation)
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');
const require = createRequire(import.meta.url);

// Import CommonJS modules
const eventBus = require(path.join(projectRoot, '.claude/lib/events/event-bus.cjs'));

describe('EventBus Pub/Sub with Priority', () => {
  beforeEach(() => {
    // Clear subscriptions between tests
    eventBus.subscriptions = [];
  });

  describe('Event Validation Integration', () => {
    it('should emit valid AGENT_STARTED events', async () => {
      let received = null;
      eventBus.on('AGENT_STARTED', payload => {
        received = payload;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'dev-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(received, 'Event should be received');
      assert.strictEqual(received.agentId, 'dev-123');
      assert.strictEqual(received.agentType, 'developer');
      assert.strictEqual(received.taskId, 'task-456');
    });

    it('should reject invalid events (missing required fields)', async () => {
      let errorLogged = false;
      const originalError = console.error;
      console.error = () => {
        errorLogged = true;
      };

      try {
        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          // Missing agentId, agentType, taskId
          timestamp: new Date().toISOString(),
        });

        // Wait for async validation
        await new Promise(resolve => setTimeout(resolve, 50));

        // Should log validation error
        assert.ok(errorLogged, 'Should log validation error for invalid event');
      } finally {
        console.error = originalError;
      }
    });

    it('should validate event type exists', async () => {
      let errorLogged = false;
      const originalError = console.error;
      console.error = () => {
        errorLogged = true;
      };

      try {
        await eventBus.emit('INVALID_EVENT_TYPE', {
          type: 'INVALID_EVENT_TYPE',
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorLogged, 'Should log error for unknown event type');
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('Priority Ordering', () => {
    it('should execute handlers in priority order (highest first)', async () => {
      const executionOrder = [];

      // Subscribe with different priorities
      eventBus.on('AGENT_STARTED', () => executionOrder.push('low'), 10);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('medium'), 50);
      eventBus.on('AGENT_STARTED', () => executionOrder.push('high'), 90);

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      // Wait for async handlers
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.deepStrictEqual(
        executionOrder,
        ['high', 'medium', 'low'],
        'Handlers should execute in priority order (high -> medium -> low)'
      );
    });

    it('should maintain FIFO order for same priority', async () => {
      const executionOrder = [];

      // Subscribe with same priority (default 50)
      eventBus.on('AGENT_STARTED', () => executionOrder.push('first'));
      eventBus.on('AGENT_STARTED', () => executionOrder.push('second'));
      eventBus.on('AGENT_STARTED', () => executionOrder.push('third'));

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
        ['first', 'second', 'third'],
        'Handlers with same priority should execute in FIFO order'
      );
    });

    it('should support async handlers with priority', async () => {
      const executionOrder = [];

      // Async handlers
      eventBus.on(
        'AGENT_STARTED',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          executionOrder.push('low');
        },
        10
      );

      eventBus.on(
        'AGENT_STARTED',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          executionOrder.push('high');
        },
        90
      );

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      // Wait for async handlers to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.deepStrictEqual(
        executionOrder,
        ['high', 'low'],
        'Async handlers should execute in priority order'
      );
    });
  });

  describe('Error Boundaries', () => {
    it('should not crash bus when handler throws error', async () => {
      const executionOrder = [];

      eventBus.on('AGENT_STARTED', () => {
        executionOrder.push('before-error');
      });

      eventBus.on('AGENT_STARTED', () => {
        throw new Error('Handler error');
      });

      eventBus.on('AGENT_STARTED', () => {
        executionOrder.push('after-error');
      });

      // Suppress error logging
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
          ['before-error', 'after-error'],
          'Handlers should continue executing after error'
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should log handler errors without crashing', async () => {
      let errorLogged = false;
      let errorMessage = '';

      const originalError = console.error;
      console.error = (...args) => {
        errorLogged = true;
        errorMessage = args.join(' ');
      };

      try {
        eventBus.on('AGENT_STARTED', () => {
          throw new Error('Test handler error');
        });

        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorLogged, 'Error should be logged');
        assert.ok(
          errorMessage.includes('Handler error'),
          'Error message should mention handler error'
        );
      } finally {
        console.error = originalError;
      }
    });

    it('should handle async handler rejections', async () => {
      let errorLogged = false;

      const originalError = console.error;
      console.error = () => {
        errorLogged = true;
      };

      try {
        eventBus.on('AGENT_STARTED', async () => {
          throw new Error('Async handler error');
        });

        await eventBus.emit('AGENT_STARTED', {
          type: 'AGENT_STARTED',
          agentId: 'test-123',
          agentType: 'developer',
          taskId: 'task-456',
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        assert.ok(errorLogged, 'Async handler error should be logged');
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('Non-Blocking Emission', () => {
    it('should return immediately (non-blocking)', async () => {
      const start = Date.now();

      eventBus.on('AGENT_STARTED', async () => {
        // Simulate slow handler (100ms)
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      const elapsed = Date.now() - start;

      // emit() should return immediately (<50ms, not wait for 100ms handler)
      assert.ok(elapsed < 50, `emit() should return immediately, took ${elapsed}ms`);
    });

    it('should execute handlers asynchronously', async () => {
      let handlerExecuted = false;

      eventBus.on('AGENT_STARTED', () => {
        handlerExecuted = true;
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'test-123',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      // Handler not executed yet (async)
      assert.strictEqual(handlerExecuted, false, 'Handler should not execute immediately');

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(handlerExecuted, true, 'Handler should execute asynchronously');
    });
  });

  describe('Real-World Event Types', () => {
    it('should handle TASK_CREATED events', async () => {
      let received = null;

      eventBus.on('TASK_CREATED', payload => {
        received = payload;
      });

      await eventBus.emit('TASK_CREATED', {
        type: 'TASK_CREATED',
        taskId: 'task-123',
        subject: 'Test task',
        description: 'Test description',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(received, 'TASK_CREATED event should be received');
      assert.strictEqual(received.taskId, 'task-123');
      assert.strictEqual(received.subject, 'Test task');
    });

    it('should handle TOOL_INVOKED events', async () => {
      let received = null;

      eventBus.on('TOOL_INVOKED', payload => {
        received = payload;
      });

      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Read',
        input: { filePath: 'test.js' },
        agentId: 'dev-123',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(received, 'TOOL_INVOKED event should be received');
      assert.strictEqual(received.toolName, 'Read');
      assert.strictEqual(received.agentId, 'dev-123');
    });

    it('should handle LLM_COMPLETED events', async () => {
      let received = null;

      eventBus.on('LLM_COMPLETED', payload => {
        received = payload;
      });

      await eventBus.emit('LLM_COMPLETED', {
        type: 'LLM_COMPLETED',
        model: 'sonnet',
        completionTokens: 500,
        totalTokens: 1000,
        latency: 250,
        cost: 0.005,
        timestamp: new Date().toISOString(),
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(received, 'LLM_COMPLETED event should be received');
      assert.strictEqual(received.model, 'sonnet');
      assert.strictEqual(received.completionTokens, 500);
    });
  });
});
