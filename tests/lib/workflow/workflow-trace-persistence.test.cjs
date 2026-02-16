#!/usr/bin/env node
/**
 * Tests for Workflow Trace Persistence (Phase 1.1)
 *
 * Verifies that workflows created or advanced via the state manager
 * inherit and persist the traceId from the current EventBus context.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const eventBus = require('../../../.claude/lib/events/event-bus.cjs');
const stateManager = require('../../../.claude/lib/workflow/workflow-state-manager.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const TEST_STATE_FILE = path.join(PROJECT_ROOT, '.claude', 'tmp', 'test-workflow-trace.json');

async function testWorkflowTrace() {
  console.log('Workflow Trace Persistence Tests');
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

  // Ensure clean state
  if (fs.existsSync(TEST_STATE_FILE)) fs.unlinkSync(TEST_STATE_FILE);

  await test('should persist traceId on workflow creation', async () => {
    const customTraceId = 'trace-wf-create-123';

    await eventBus.emit(
      'AGENT_STARTED',
      {
        type: 'AGENT_STARTED',
        agentId: 'test',
        agentType: 'test',
        taskId: 'test',
        traceId: customTraceId,
      },
      {
        // We need to run the state manager inside the event handler or
        // simulate the context.
        mode: 'sequential',
      }
    );

    // To properly test AsyncLocalStorage, we need to be IN the context.
    // The EventBus.emit above doesn't block this script's execution context.
    // So we use a manual store.run for the test if needed, or rely on the bus.

    // Internal access to the same storage would be better, but we'll
    // mock the emission logic or use the Bus's internal structure if exported.
    // Since we just added getContext(), let's use a helper to wrap our call.

    // Actually, the easiest way to test this is to emit an event whose handler
    // creates the workflow.

    eventBus.on('TASK_CREATED', () => {
      stateManager.createWorkflow('Test Trace', 'LOW', TEST_STATE_FILE);
    });

    await eventBus.emit('TASK_CREATED', {
      type: 'TASK_CREATED',
      taskId: 'task-1',
      subject: 'Trace Test',
      description: 'Test',
      traceId: customTraceId,
    });

    const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
    if (state.traceId !== customTraceId) {
      throw new Error(`Expected traceId ${customTraceId}, got ${state.traceId}`);
    }
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testWorkflowTrace().catch(err => {
  console.error(err);
  process.exit(1);
});
