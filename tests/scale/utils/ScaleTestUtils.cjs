/**
 * ScaleTestUtils.cjs
 * Utilities for enterprise-scale simulation testing (SPEC-014).
 */

'use strict';

const crypto = require('crypto');

class ScaleTestUtils {
  /**
   * Generates a mock workflow state object.
   * @param {string} id - Workflow ID
   * @param {number} phaseCount - Number of phases to simulate
   * @returns {object} Workflow state object
   */
  static createMockWorkflow(id, phaseCount = 5) {
    const phases = {};
    for (let i = 1; i <= phaseCount; i++) {
      phases[`phase-${i}`] = {
        name: `Phase ${i}`,
        status: 'pending',
        tasks: [],
        checkpoints: []
      };
    }

    return {
      workflowId: id,
      status: 'active',
      currentPhase: 'phase-1',
      phases,
      context: {
        startTime: Date.now(),
        metadata: {
          priority: 'high',
          tags: ['scale-test', `w-${id}`]
        }
      },
      history: []
    };
  }

  /**
   * Simulates workflow execution by advancing phases and adding tasks.
   * @param {object} workflow - The workflow state object (mutated)
   * @param {number} durationMs - How long to simulate (synthetic delay)
   * @param {number} taskCount - Number of tasks to "complete"
   */
  static async simulateExecution(workflow, durationMs = 100, taskCount = 5) {
    const start = Date.now();
    let tasksAdded = 0;
    
    // Simulate work by adding tasks to current phase
    while (Date.now() - start < durationMs && tasksAdded < taskCount) {
      const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;
      const phaseId = workflow.currentPhase;
      
      workflow.phases[phaseId].tasks.push({
        id: taskId,
        status: 'completed',
        result: `Result for ${taskId}`,
        timestamp: Date.now()
      });
      
      workflow.history.push({
        event: 'task_completed',
        taskId,
        timestamp: Date.now()
      });
      
      tasksAdded++;
      await new Promise(r => setTimeout(r, 5)); // Micro-yield
    }

    // Advance phase if not at end
    const phaseKeys = Object.keys(workflow.phases);
    const currentIndex = phaseKeys.indexOf(workflow.currentPhase);
    if (currentIndex < phaseKeys.length - 1) {
      workflow.phases[workflow.currentPhase].status = 'completed';
      workflow.currentPhase = phaseKeys[currentIndex + 1];
      workflow.phases[workflow.currentPhase].status = 'active';
    } else {
      workflow.status = 'completed';
    }
    
    return tasksAdded;
  }
}

class MemoryMonitor {
  constructor() {
    this.baseline = process.memoryUsage().heapUsed;
    this.peak = this.baseline;
  }

  check() {
    const current = process.memoryUsage().heapUsed;
    if (current > this.peak) this.peak = current;
    return current;
  }

  getDeltaMb() {
    const current = this.check();
    return (current - this.baseline) / (1024 * 1024);
  }

  getPeakDeltaMb() {
    return (this.peak - this.baseline) / (1024 * 1024);
  }
}

module.exports = { ScaleTestUtils, MemoryMonitor };
