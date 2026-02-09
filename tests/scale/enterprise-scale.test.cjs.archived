/**
 * SPEC-014: Enterprise-Scale Testing Suite (Expanded)
 *
 * Validates framework stability under concurrency and long-running sessions.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ScaleTestUtils, MemoryMonitor } = require('./utils/ScaleTestUtils.cjs');

describe('SPEC-014: Scale - Enterprise Workflows', () => {
  it('Concurrent Workflows: Runs 50 workflows in parallel without error', async () => {
    const monitor = new MemoryMonitor();
    const WORKFLOW_COUNT = 50;
    const workflows = [];

    // 1. Create 50 workflows
    for (let i = 0; i < WORKFLOW_COUNT; i++) {
      workflows.push(ScaleTestUtils.createMockWorkflow(`wf-${i}`, 3));
    }

    // 2. Run them in parallel (simulation)
    // We simulate execution interleaving by using Promise.all
    const tasks = workflows.map(wf => ScaleTestUtils.simulateExecution(wf, 500, 10)); // 500ms, 10 tasks each

    const results = await Promise.all(tasks);

    // 3. Assertions
    const totalTasks = results.reduce((a, b) => a + b, 0);
    assert.equal(totalTasks, WORKFLOW_COUNT * 10, 'All workflows should complete 10 tasks');

    // Verify isolation (simple check: valid state structure)
    workflows.forEach(wf => {
      assert.ok(wf.currentPhase, 'Workflow should have currentPhase');
      assert.ok(wf.history.length >= 10, 'History should show activity');
    });

    const delta = monitor.getPeakDeltaMb();
    assert.ok(delta < 200, `Memory delta should be < 200MB (was ${delta.toFixed(2)}MB)`);
  });

  it('Long-Running Simulation: Handles 50+ phases without state explosion', async () => {
    const monitor = new MemoryMonitor();
    const PHASE_COUNT = 50;
    const workflow = ScaleTestUtils.createMockWorkflow('long-runner', PHASE_COUNT);

    let totalTasksCompleted = 0;

    // Iteratively advance through all 50 phases
    for (let i = 0; i < PHASE_COUNT; i++) {
      const tasks = await ScaleTestUtils.simulateExecution(workflow, 100, 5); // 100ms, 5 tasks per phase
      totalTasksCompleted += tasks;
    }

    assert.equal(workflow.status, 'completed', 'Workflow should finish all phases');
    assert.equal(totalTasksCompleted, PHASE_COUNT * 5, 'Should complete all tasks');

    const jsonSize = JSON.stringify(workflow).length;
    const sizeMb = jsonSize / (1024 * 1024);

    // Assuming linear growth, but size should stay reasonable for 250 tasks
    assert.ok(sizeMb < 5, `State file size should be < 5MB (was ${sizeMb.toFixed(2)}MB)`);

    const delta = monitor.getPeakDeltaMb();
    assert.ok(delta < 50, `Memory delta should be low (was ${delta.toFixed(2)}MB)`);
  });
});
