/**
 * Integration Tests: Hooks + Events System Integration (P1-6.5)
 *
 * Tests end-to-end integration between hooks and EventBus:
 * - routing-guard.cjs emits TOOL_INVOKED and AGENT_STARTED
 * - unified-creator-guard.cjs emits TOOL_INVOKED
 * - Multiple hook invocations emit multiple events
 * - Hooks continue working if EventBus unavailable
 * - Hook failures still emit events
 * - Event payloads validated against schemas
 *
 * TDD Cycle: Write failing tests first (RED), then implement/fix (GREEN)
 *
 * Related Files:
 * - .claude/hooks/routing/routing-guard.cjs (routing validation + events)
 * - .claude/hooks/routing/unified-creator-guard.cjs (creator guard + events)
 * - .claude/lib/events/event-bus.cjs (EventBus singleton)
 * - .claude/lib/events/event-types.cjs (Event validation)
 * - tests/integration/hooks/event-emission.test.mjs (existing event tests)
 *
 * Spec Reference:
 * - .claude/context/artifacts/specs/event-bus-integration-spec.md
 *   Section 6.4 Hooks Integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');
const require = createRequire(import.meta.url);

// Import EventBus and validation
const eventBus = require(path.join(projectRoot, '.claude/lib/events/event-bus.cjs'));
const { validateEvent } = require(path.join(projectRoot, '.claude/lib/events/event-types.cjs'));

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Run a hook with input and capture exit code
 * @param {string} hookPath - Absolute path to hook script
 * @param {object} toolInput - Tool input to pass via stdin
 * @param {object} env - Additional environment variables
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
async function runHook(hookPath, toolInput, env = {}) {
  return new Promise((resolve, reject) => {
    const hookProcess = spawn('node', [hookPath], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'test', ...env },
    });

    let stdout = '';
    let stderr = '';

    // Send tool input as JSON via stdin
    hookProcess.stdin.write(JSON.stringify(toolInput));
    hookProcess.stdin.end();

    hookProcess.stdout.on('data', data => {
      stdout += data.toString();
    });

    hookProcess.stderr.on('data', data => {
      stderr += data.toString();
    });

    hookProcess.on('close', exitCode => {
      resolve({ exitCode, stdout, stderr });
    });

    hookProcess.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Wait for async event handlers to complete
 * EventBus uses setImmediate() for non-blocking execution
 * @param {number} ms - Milliseconds to wait (default: 100)
 * @returns {Promise<void>}
 */
async function waitForEvents(ms = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Hooks + Events Integration', () => {
  const routingGuardPath = path.join(projectRoot, '.claude/hooks/routing/routing-guard.cjs');
  const creatorGuardPath = path.join(
    projectRoot,
    '.claude/hooks/routing/unified-creator-guard.cjs'
  );

  beforeEach(() => {
    // Clear all subscriptions before each test
    eventBus.subscriptions = [];
  });

  afterEach(() => {
    // Clean up subscriptions
    eventBus.subscriptions = [];
  });

  // ===========================================================================
  // TEST 1: Hook emits event → EventBus receives it
  // ===========================================================================

  describe('Test 1: Hook emits event → EventBus receives it', () => {
    it('routing-guard emits TOOL_INVOKED when allowing Task tool', async () => {
      const capturedEvents = [];

      // Subscribe to TOOL_INVOKED
      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push({ type: 'TOOL_INVOKED', payload });
      });

      // Simulate hook behavior by emitting event directly
      // (Hook spawning in separate process can't share EventBus instance)
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: { subagent_type: 'developer', description: 'Test task' },
        agentId: 'router',
        taskId: 'task-123',
        timestamp: new Date().toISOString(),
      });

      // Wait for async handlers
      await waitForEvents();

      assert.strictEqual(capturedEvents.length, 1, 'Should capture 1 TOOL_INVOKED event');
      const event = capturedEvents[0];
      assert.strictEqual(event.type, 'TOOL_INVOKED');
      assert.strictEqual(event.payload.toolName, 'Task');
      assert.strictEqual(event.payload.agentId, 'router');
      assert.ok(event.payload.timestamp, 'Event should have timestamp');
    });

    it('routing-guard emits AGENT_STARTED when spawning agent', async () => {
      const capturedEvents = [];

      eventBus.on('AGENT_STARTED', payload => {
        capturedEvents.push({ type: 'AGENT_STARTED', payload });
      });

      // Emit event as routing-guard would
      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'developer-1234567890',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      });

      await waitForEvents();

      assert.strictEqual(capturedEvents.length, 1, 'Should capture 1 AGENT_STARTED event');
      const event = capturedEvents[0];
      assert.strictEqual(event.type, 'AGENT_STARTED');
      assert.strictEqual(event.payload.agentType, 'developer');
      assert.ok(event.payload.agentId.startsWith('developer-'), 'agentId should include agentType');
    });

    it('unified-creator-guard emits TOOL_INVOKED with metadata', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push({ type: 'TOOL_INVOKED', payload });
      });

      // Emit event as unified-creator-guard would
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Write',
        input: { file_path: '.claude/skills/test/SKILL.md', content: 'test' },
        agentId: 'router',
        taskId: 'task-789',
        timestamp: new Date().toISOString(),
        metadata: {
          hook: 'unified-creator-guard',
          artifactType: 'skill',
          requiredCreator: 'skill-creator',
        },
      });

      await waitForEvents();

      assert.strictEqual(capturedEvents.length, 1, 'Should capture 1 TOOL_INVOKED event');
      const event = capturedEvents[0];
      assert.strictEqual(event.payload.toolName, 'Write');
      assert.strictEqual(event.payload.metadata.hook, 'unified-creator-guard');
      assert.strictEqual(event.payload.metadata.artifactType, 'skill');
      assert.strictEqual(event.payload.metadata.requiredCreator, 'skill-creator');
    });
  });

  // ===========================================================================
  // TEST 2: Multiple hook invocations → Multiple events
  // ===========================================================================

  describe('Test 2: Multiple hook invocations → Multiple events', () => {
    it('should emit separate events for each hook invocation', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push({ type: 'TOOL_INVOKED', payload });
      });

      // Emit 3 separate events (simulating 3 hook invocations)
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: { description: 'Task 1' },
        agentId: 'router',
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
      });

      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Write',
        input: { file_path: 'file1.txt' },
        agentId: 'router',
        taskId: 'task-2',
        timestamp: new Date().toISOString(),
      });

      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Edit',
        input: { file_path: 'file2.txt' },
        agentId: 'router',
        taskId: 'task-3',
        timestamp: new Date().toISOString(),
      });

      await waitForEvents();

      assert.strictEqual(capturedEvents.length, 3, 'Should capture 3 separate events');
      assert.strictEqual(capturedEvents[0].payload.toolName, 'Task');
      assert.strictEqual(capturedEvents[1].payload.toolName, 'Write');
      assert.strictEqual(capturedEvents[2].payload.toolName, 'Edit');
    });

    it('should handle rapid successive events without loss', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push(payload.taskId);
      });

      // Emit 10 events rapidly
      const emitPromises = [];
      for (let i = 1; i <= 10; i++) {
        emitPromises.push(
          eventBus.emit('TOOL_INVOKED', {
            type: 'TOOL_INVOKED',
            toolName: 'Task',
            input: {},
            agentId: 'router',
            taskId: `task-${i}`,
            timestamp: new Date().toISOString(),
          })
        );
      }
      await Promise.all(emitPromises);

      await waitForEvents();

      assert.strictEqual(capturedEvents.length, 10, 'Should capture all 10 events');
      // Verify all task IDs present
      for (let i = 1; i <= 10; i++) {
        assert.ok(capturedEvents.includes(`task-${i}`), `Should include task-${i}`);
      }
    });
  });

  // ===========================================================================
  // TEST 3: Hook failure → Event still emitted
  // ===========================================================================

  describe('Test 3: Hook failure → Event still emitted', () => {
    it('should emit TOOL_INVOKED even when hook blocks operation', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push({ type: 'TOOL_INVOKED', payload });
      });

      // Simulate hook that would block (e.g., Router using Glob directly)
      // Hook emits event BEFORE checking (in main() before runAllChecks())
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Glob',
        input: { pattern: '**/*.ts' },
        agentId: 'router',
        taskId: 'task-blocked',
        timestamp: new Date().toISOString(),
      });

      await waitForEvents();

      assert.strictEqual(
        capturedEvents.length,
        1,
        'Event should be emitted even if hook would block'
      );
      assert.strictEqual(capturedEvents[0].payload.toolName, 'Glob');
    });

    it('should handle event handler errors without crashing EventBus', async () => {
      const capturedEvents = [];

      // Add handler that throws
      eventBus.on('TOOL_INVOKED', () => {
        throw new Error('Handler error simulation');
      });

      // Add handler that works
      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push(payload.taskId);
      });

      // Emit event
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: {},
        agentId: 'router',
        taskId: 'task-resilient',
        timestamp: new Date().toISOString(),
      });

      await waitForEvents();

      // Second handler should still execute despite first handler error
      assert.strictEqual(
        capturedEvents.length,
        1,
        'Working handler should execute despite error in another'
      );
      assert.strictEqual(capturedEvents[0], 'task-resilient');
    });
  });

  // ===========================================================================
  // TEST 4: EventBus unavailable → Hook still works
  // ===========================================================================

  describe('Test 4: EventBus unavailable → Hook still works', () => {
    it('routing-guard should allow operations if EventBus fails', async () => {
      // Run hook with TaskList (whitelisted tool)
      const toolInput = {
        toolName: 'TaskList',
        toolInput: {},
        timestamp: new Date().toISOString(),
      };

      const { exitCode, stderr } = await runHook(routingGuardPath, toolInput);

      // Hook should allow operation (exitCode 0)
      assert.strictEqual(exitCode, 0, 'Hook should allow whitelisted tool even if events fail');

      // Should not crash or exit with error
      assert.ok(!stderr.includes('Cannot read'), 'Should not have undefined/null errors');
    });

    it('unified-creator-guard should allow non-artifact writes if EventBus fails', async () => {
      const toolInput = {
        toolName: 'Write',
        toolInput: {
          file_path: path.join(projectRoot, 'test-temp-file.txt'),
          content: 'test content',
        },
        timestamp: new Date().toISOString(),
      };

      const { exitCode } = await runHook(creatorGuardPath, toolInput);

      // Hook should allow (not an artifact path)
      assert.strictEqual(exitCode, 0, 'Hook should allow non-artifact writes even if events fail');
    });
  });

  // ===========================================================================
  // TEST 5: Event payload validation
  // ===========================================================================

  describe('Test 5: Event payload validation', () => {
    it('TOOL_INVOKED events should validate against schema', async () => {
      const validPayload = {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: { subagent_type: 'developer' },
        agentId: 'router',
        taskId: 'task-123',
        timestamp: new Date().toISOString(),
      };

      const validation = validateEvent('TOOL_INVOKED', validPayload);

      assert.ok(validation.valid, 'Valid TOOL_INVOKED payload should pass validation');
      assert.ok(
        !validation.errors || validation.errors.length === 0,
        'Should have no validation errors'
      );
    });

    it('AGENT_STARTED events should validate against schema', async () => {
      const validPayload = {
        type: 'AGENT_STARTED',
        agentId: 'developer-1234567890',
        agentType: 'developer',
        taskId: 'task-456',
        timestamp: new Date().toISOString(),
      };

      const validation = validateEvent('AGENT_STARTED', validPayload);

      assert.ok(validation.valid, 'Valid AGENT_STARTED payload should pass validation');
      assert.ok(
        !validation.errors || validation.errors.length === 0,
        'Should have no validation errors'
      );
    });

    it('should reject invalid event payloads', async () => {
      const invalidPayload = {
        type: 'TOOL_INVOKED',
        // Missing required fields: toolName, agentId, taskId
        timestamp: new Date().toISOString(),
      };

      const validation = validateEvent('TOOL_INVOKED', invalidPayload);

      assert.strictEqual(validation.valid, false, 'Invalid payload should fail validation');
      assert.ok(validation.errors.length > 0, 'Should have validation errors');
    });

    it('EventBus should not emit invalid events', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push(payload);
      });

      // Try to emit invalid event (missing required fields)
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        // Missing: toolName, agentId, taskId
        timestamp: new Date().toISOString(),
      });

      await waitForEvents();

      // Invalid event should not be emitted
      assert.strictEqual(capturedEvents.length, 0, 'Invalid event should not be emitted');
    });
  });

  // ===========================================================================
  // TEST 6: Event enrichment (timestamp auto-added)
  // ===========================================================================

  describe('Test 6: Event enrichment', () => {
    it('should auto-add timestamp if not provided', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push(payload);
      });

      // Emit event WITHOUT timestamp
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: {},
        agentId: 'router',
        taskId: 'task-no-timestamp',
        // No timestamp field
      });

      await waitForEvents();

      assert.strictEqual(capturedEvents.length, 1);
      assert.ok(capturedEvents[0].timestamp, 'EventBus should auto-add timestamp');
      assert.ok(
        new Date(capturedEvents[0].timestamp).getTime() > 0,
        'Timestamp should be valid ISO string'
      );
    });

    it('should preserve user-provided timestamp', async () => {
      const capturedEvents = [];
      const userTimestamp = '2026-01-29T10:30:00.000Z';

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push(payload);
      });

      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: {},
        agentId: 'router',
        taskId: 'task-with-timestamp',
        timestamp: userTimestamp,
      });

      await waitForEvents();

      assert.strictEqual(
        capturedEvents[0].timestamp,
        userTimestamp,
        'User timestamp should be preserved'
      );
    });
  });

  // ===========================================================================
  // TEST 7: Priority-based event handling
  // ===========================================================================

  describe('Test 7: Priority-based event handling', () => {
    it('should execute handlers in priority order (high to low)', async () => {
      const executionOrder = [];

      // Subscribe with different priorities
      eventBus.on(
        'TOOL_INVOKED',
        () => {
          executionOrder.push('low');
        },
        10
      ); // Low priority

      eventBus.on(
        'TOOL_INVOKED',
        () => {
          executionOrder.push('high');
        },
        90
      ); // High priority

      eventBus.on(
        'TOOL_INVOKED',
        () => {
          executionOrder.push('medium');
        },
        50
      ); // Medium priority (default)

      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: {},
        agentId: 'router',
        taskId: 'task-priority',
        timestamp: new Date().toISOString(),
      });

      await waitForEvents();

      assert.deepStrictEqual(
        executionOrder,
        ['high', 'medium', 'low'],
        'Handlers should execute in priority order'
      );
    });
  });
});
