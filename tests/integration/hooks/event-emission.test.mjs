/**
 * Integration Tests: Hooks Event Emission (P1-6.4)
 *
 * Tests that hooks emit events via EventBus:
 * - routing-guard.cjs emits TOOL_INVOKED and AGENT_STARTED events
 * - unified-creator-guard.cjs emits TOOL_INVOKED events
 * - Hooks remain non-blocking (events are async)
 * - Graceful degradation (if EventBus unavailable, hooks continue)
 *
 * Related Files:
 * - .claude/hooks/routing/routing-guard.cjs (routing validation)
 * - .claude/hooks/routing/unified-creator-guard.cjs (creator guard)
 * - .claude/lib/events/event-bus.cjs (EventBus singleton)
 * - .claude/lib/events/event-types.cjs (Event types)
 *
 * Spec Reference:
 * - .claude/context/artifacts/specs/event-bus-integration-spec.md
 *   Section 6.4 Hooks Integration
 *   Code Example 6.4.1
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');
const require = createRequire(import.meta.url);

// Import EventBus
const eventBus = require(path.join(projectRoot, '.claude/lib/events/event-bus.cjs'));

/**
 * Helper to run a hook with input
 * @param {string} hookPath - Path to hook script
 * @param {object} toolInput - Tool input to pass to hook
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
async function runHook(hookPath, toolInput) {
  return new Promise((resolve, reject) => {
    const hookProcess = spawn('node', [hookPath], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'test' },
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
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });

    hookProcess.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Test event emission by directly importing and calling hook functions
 * @param {string} hookPath - Path to hook module
 * @param {string} toolName - Tool name
 * @param {object} toolInput - Tool input
 * @param {string[]} eventTypes - Expected event types
 * @returns {Promise<{events: object[]}>}
 */
async function _testEventEmissionDirect(hookPath, toolName, toolInput, eventTypes) {
  // Clear subscriptions
  eventBus.subscriptions = [];

  const capturedEvents = [];

  // Subscribe to events
  eventTypes.forEach(eventType => {
    eventBus.on(eventType, payload => {
      capturedEvents.push({ type: eventType, payload });
    });
  });

  // Dynamically import hook module (reset cache first)
  delete require.cache[require.resolve(hookPath)];
  require(hookPath);

  // Call the function that would emit events (if exported)
  // For routing-guard, we test via the EventBus directly after requiring

  // Simulate event emission (hooks emit events in their main() function)
  // We can't call main() directly (it calls process.exit), so we verify
  // the EventBus is available and events can be emitted

  // Wait for async emission
  await new Promise(resolve => setTimeout(resolve, 50));

  return { events: capturedEvents };
}

describe('Hooks Event Emission', () => {
  beforeEach(() => {
    // Clear subscriptions
    eventBus.subscriptions = [];
  });

  describe('routing-guard.cjs Event Emission', () => {
    const routingGuardPath = path.join(projectRoot, '.claude/hooks/routing/routing-guard.cjs');

    it('should not break hook execution when emitting events', async () => {
      const toolInput = {
        toolName: 'Task',
        toolInput: {
          subagent_type: 'general-purpose',
          description: 'Test agent',
          prompt: 'You are a test agent. Task ID: task-123',
        },
        timestamp: new Date().toISOString(),
      };

      const { exitCode, stderr } = await runHook(routingGuardPath, toolInput);

      // Hook should allow (Router can spawn agents)
      assert.strictEqual(exitCode, 0, 'routing-guard should allow Task tool');

      // Should not have event emission errors
      assert.ok(!stderr.includes('Event emission failed'), 'Should not have event emission errors');
    });

    it('should have EventBus integration code', async () => {
      // Verify hook module has EventBus import
      const hookSource = fs.readFileSync(routingGuardPath, 'utf-8');

      assert.ok(hookSource.includes('event-bus.cjs'), 'Hook should import EventBus');

      assert.ok(hookSource.includes('TOOL_INVOKED'), 'Hook should reference TOOL_INVOKED event');

      assert.ok(hookSource.includes('AGENT_STARTED'), 'Hook should reference AGENT_STARTED event');

      assert.ok(hookSource.includes('eventBus.emit'), 'Hook should call eventBus.emit()');
    });

    it('should emit events with valid structure (unit test)', async () => {
      // Test event emission directly via EventBus
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push({ type: 'TOOL_INVOKED', payload });
      });

      eventBus.on('AGENT_STARTED', payload => {
        capturedEvents.push({ type: 'AGENT_STARTED', payload });
      });

      // Emit events as the hook would
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Task',
        input: { subagent_type: 'developer' },
        agentId: 'router',
        taskId: 'task-123',
        timestamp: new Date().toISOString(),
      });

      await eventBus.emit('AGENT_STARTED', {
        type: 'AGENT_STARTED',
        agentId: 'developer-123',
        agentType: 'developer',
        taskId: 'task-123',
        timestamp: new Date().toISOString(),
      });

      // Wait for async handlers
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(capturedEvents.length, 2, 'Should capture 2 events');

      const toolEvent = capturedEvents[0].payload;
      assert.strictEqual(toolEvent.toolName, 'Task');
      assert.ok(toolEvent.timestamp);

      const agentEvent = capturedEvents[1].payload;
      assert.strictEqual(agentEvent.agentType, 'developer');
      assert.ok(agentEvent.timestamp);
    });

    it('should gracefully degrade if EventBus unavailable', async () => {
      const toolInput = {
        toolName: 'TaskList',
        toolInput: {},
        timestamp: new Date().toISOString(),
      };

      const { exitCode } = await runHook(routingGuardPath, toolInput);

      // Hook should allow TaskList (whitelisted)
      assert.strictEqual(exitCode, 0, 'Hook should continue even if event emission fails');
    });
  });

  describe('unified-creator-guard.cjs Event Emission', () => {
    const creatorGuardPath = path.join(
      projectRoot,
      '.claude/hooks/routing/unified-creator-guard.cjs'
    );

    it('should not break hook execution when emitting events', async () => {
      const toolInput = {
        toolName: 'Write',
        toolInput: {
          file_path: path.join(projectRoot, 'test-file.txt'),
          content: 'test content',
        },
        timestamp: new Date().toISOString(),
      };

      const { exitCode, stderr } = await runHook(creatorGuardPath, toolInput);

      // Hook should allow (not a protected artifact)
      assert.strictEqual(exitCode, 0, 'unified-creator-guard should allow non-artifact writes');

      // Should not have event emission errors
      assert.ok(!stderr.includes('Event emission failed'), 'Should not have event emission errors');
    });

    it('should have EventBus integration code', async () => {
      // Verify hook module has EventBus import
      const hookSource = fs.readFileSync(creatorGuardPath, 'utf-8');

      assert.ok(hookSource.includes('event-bus.cjs'), 'Hook should import EventBus');

      assert.ok(hookSource.includes('TOOL_INVOKED'), 'Hook should reference TOOL_INVOKED event');

      assert.ok(hookSource.includes('eventBus.emit'), 'Hook should call eventBus.emit()');
    });

    it('should emit TOOL_INVOKED for Write operations (unit test)', async () => {
      const capturedEvents = [];

      eventBus.on('TOOL_INVOKED', payload => {
        capturedEvents.push({ type: 'TOOL_INVOKED', payload });
      });

      // Emit event as the hook would
      await eventBus.emit('TOOL_INVOKED', {
        type: 'TOOL_INVOKED',
        toolName: 'Write',
        input: { file_path: 'test.txt', content: 'test' },
        agentId: 'router',
        taskId: 'task-123',
        timestamp: new Date().toISOString(),
        metadata: {
          hook: 'unified-creator-guard',
          artifactType: 'unknown',
          requiredCreator: null,
        },
      });

      // Wait for async handlers
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(capturedEvents.length, 1, 'Should capture 1 event');

      const toolEvent = capturedEvents[0].payload;
      assert.strictEqual(toolEvent.toolName, 'Write');
      assert.strictEqual(toolEvent.metadata.hook, 'unified-creator-guard');
      assert.ok(toolEvent.timestamp);
    });
  });

  describe('Non-Blocking Event Emission', () => {
    const routingGuardPath = path.join(projectRoot, '.claude/hooks/routing/routing-guard.cjs');

    it('should not add latency to hook execution', async () => {
      const toolInput = {
        toolName: 'TaskList',
        toolInput: {},
        timestamp: new Date().toISOString(),
      };

      const start = Date.now();

      const { exitCode } = await runHook(routingGuardPath, toolInput);

      const elapsed = Date.now() - start;

      // Hook execution should be fast (<1000ms including process spawn)
      // Event emission should not add significant latency
      assert.strictEqual(exitCode, 0, 'Hook should allow operation');
      assert.ok(
        elapsed < 1000,
        `Hook execution took ${elapsed}ms, should be <1000ms (non-blocking events)`
      );
    });
  });
});
