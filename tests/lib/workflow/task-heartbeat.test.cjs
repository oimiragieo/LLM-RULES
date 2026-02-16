#!/usr/bin/env node
/**
 * Test: Task Heartbeat visibility (TDD 3.1)
 * 
 * Verifies that long-running tasks emit periodic heartbeats.
 */

'use strict';

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

async function testHeartbeat() {
  console.log('--- Task Heartbeat Test ---');

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

  await test('should emit heartbeats during long tasks', async () => {
    let heartbeats = 0;
    eventBus.on('TASK_HEARTBEAT', () => {
      heartbeats++;
    });

    // We simulate a "TaskUpdate" that triggers heartbeats
    // or we manually trigger the hook.
    // For now, let's verify if the bus is wired to receive them.
    
    // We'll implement the heartbeat logic in a dedicated module.
    const { startHeartbeat, stopHeartbeat } = require('../../../.claude/lib/utils/heartbeat.cjs');
    
    const h = startHeartbeat('task-1', { interval: 50 });
    await new Promise(resolve => setTimeout(resolve, 210));
    stopHeartbeat(h);

    if (heartbeats < 3) throw new Error(`Expected at least 3 heartbeats, got ${heartbeats}`);
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testHeartbeat();
