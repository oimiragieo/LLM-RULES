#!/usr/bin/env node
/**
 * Tests for EventBus Parallel Emission (Phase 1.2)
 *
 * Verifies that the EventBus can execute handlers in parallel
 * when requested, improving performance for independent tasks.
 */

'use strict';

const eventBus = require('../../../.claude/lib/events/event-bus.cjs');

async function testParallel() {
  console.log('EventBus Parallel Emission Tests');
  console.log('================================');

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

  await test('should execute handlers in parallel when requested', async () => {
    const EVENT = 'AGENT_STARTED';
    
    // Each handler takes 50ms
    eventBus.on(EVENT, async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    eventBus.on(EVENT, async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    eventBus.on(EVENT, async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    const start = Date.now();
    // Default is sequential, so this would take ~150ms
    // We pass a flag for parallel
    await eventBus.emit(EVENT, { 
      type: EVENT, 
      agentId: 'test', 
      agentType: 'test', 
      taskId: 'parallel-test',
      timestamp: new Date().toISOString()
    }, { mode: 'parallel' });
    
    const elapsed = Date.now() - start;

    if (elapsed > 120) {
      throw new Error(`Emission took ${elapsed}ms, expected parallel execution (< 100ms)`);
    }
    
    if (elapsed < 40) {
      throw new Error(`Emission took ${elapsed}ms, too fast?`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testParallel().catch(err => {
  console.error(err);
  process.exit(1);
});
