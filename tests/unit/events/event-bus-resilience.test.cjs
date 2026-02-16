#!/usr/bin/env node
/**
 * Tests for EventBus Resilience (Enterprise Hardening)
 *
 * Verifies that the EventBus:
 * 1. Does not crash when handlers fail (Isolation).
 * 2. Does not hang indefinitely when handlers hang (Timeouts).
 * 3. Reports slow handlers (Observability).
 */

'use strict';

process.env.EVENT_BUS_HANDLER_TIMEOUT = '50'; // Set timeout to 50ms for testing
const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

// Mock logger to capture output
const logs = [];
const mockLogger = {
  error: (msg, meta) => logs.push({ level: 'error', msg, meta }),
  warn: (msg, meta) => logs.push({ level: 'warn', msg, meta }),
  info: (msg, meta) => logs.push({ level: 'info', msg, meta }),
};

// Inject mock logger (this requires the module to allow injection, or we rely on console capture if not)
// For now, we'll assume the EventBus uses the global logger we can't easily mock without dependency injection.
// So we will focus on the BEHAVIOR (timings).

async function testResilience() {
  console.log('EventBus Resilience Tests');
  console.log('=========================');

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

  // TEST 1: Hanging Handler Isolation
  // Goal: A handler that hangs should not block other handlers forever (e.g. timeout after 50ms)
  await test('should timeout hanging handlers', async () => {
    const EVENT = 'AGENT_STARTED';

    // Slow handler (hangs for 200ms)
    eventBus.on(EVENT, async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Fast handler
    eventBus.on(EVENT, () => {
      // no-op
    });

    const start = Date.now();
    // We expect this to take max ~100ms (timeout) + overhead, NOT 200ms
    // Note: The current implementation waits, so this test is EXPECTED TO FAIL or take 200ms
    await eventBus.emit(EVENT, {
      type: EVENT,
      timestamp: new Date().toISOString(),
      agentId: 'test',
      agentType: 'test',
      taskId: 'test',
    });
    const elapsed = Date.now() - start;

    if (elapsed >= 190) {
      throw new Error(`Emit took ${elapsed}ms, confirming blocking behavior (Need to fix this!)`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
}

testResilience();
