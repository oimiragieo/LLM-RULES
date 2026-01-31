#!/usr/bin/env node
/**
 * Cross-Workflow Trigger Tests
 * ============================
 *
 * Tests for the CrossWorkflowTrigger module that enables
 * one workflow to spawn/trigger another.
 */

'use strict';

const { CrossWorkflowTrigger } = require('../../../.claude/lib/workflow/cross-workflow-trigger.cjs');

// =============================================================================
// Test Framework
// =============================================================================

const testQueue = [];

function describe(name, fn) {
  console.log(`\n  ${name}`);
  fn();
}

function it(name, fn) {
  testQueue.push({ name, fn });
}

async function runTestQueue() {
  let passed = 0;
  let failed = 0;

  for (const test of testQueue) {
    try {
      await test.fn();
      console.log(`    \x1b[32m✓\x1b[0m ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`    \x1b[31m✗\x1b[0m ${test.name}`);
      console.log(`      Error: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
      }
    },
    toThrow(message) {
      let threw = false;
      try {
        if (typeof actual === 'function') actual();
      } catch (e) {
        threw = true;
        if (message && !e.message.includes(message)) {
          throw new Error(`Expected error containing "${message}", got "${e.message}"`);
        }
      }
      if (!threw) {
        throw new Error('Expected function to throw');
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toContain(expected) {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) {
          throw new Error(`Expected array to contain ${expected}`);
        }
      } else if (typeof actual === 'string') {
        if (!actual.includes(expected)) {
          throw new Error(`Expected string to contain "${expected}"`);
        }
      }
    },
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
  };
}

// =============================================================================
// Mock Workflow Engine
// =============================================================================

class MockWorkflowEngine {
  constructor() {
    this.workflows = new Map();
    this.executedWorkflows = [];
  }

  registerWorkflow(id, handler) {
    this.workflows.set(id, handler);
  }

  async executeWorkflow(id, context) {
    this.executedWorkflows.push({ id, context, timestamp: Date.now() });
    const handler = this.workflows.get(id);
    if (handler) {
      return await handler(context);
    }
    return { success: true };
  }

  hasWorkflow(id) {
    return this.workflows.has(id);
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('CrossWorkflowTrigger', () => {
  describe('constructor', () => {
    it('should create instance with workflow engine', () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);
      expect(trigger).toBeTruthy();
    });

    it('should initialize with empty trigger history', () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);
      expect(trigger.getTriggerHistory()).toEqual([]);
    });
  });

  describe('trigger()', () => {
    it('should trigger a workflow and return result', async () => {
      const engine = new MockWorkflowEngine();
      engine.registerWorkflow('skill-creator', async ctx => ({
        success: true,
        skillName: ctx.skillName,
      }));

      const trigger = new CrossWorkflowTrigger(engine);
      const result = await trigger.trigger(
        'agent-creator',
        'skill-creator',
        { skillName: 'test-skill' },
        { sync: true }
      );

      expect(result.success).toBe(true);
      expect(result.skillName).toBe('test-skill');
    });

    it('should record trigger in history', async () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      await trigger.trigger('agent-creator', 'skill-creator', { data: 'test' });

      const history = trigger.getTriggerHistory();
      expect(history).toHaveLength(1);
      expect(history[0].fromWorkflow).toBe('agent-creator');
      expect(history[0].toWorkflow).toBe('skill-creator');
    });

    it('should support async (fire-and-forget) triggers', async () => {
      const engine = new MockWorkflowEngine();
      let executed = false;

      engine.registerWorkflow('background-task', async () => {
        await new Promise(r => setTimeout(r, 10));
        executed = true;
        return { done: true };
      });

      const trigger = new CrossWorkflowTrigger(engine);
      const result = await trigger.trigger('main', 'background-task', {}, { sync: false });

      // Fire-and-forget returns immediately with pending status
      expect(result.status).toBe('pending');
      expect(result.triggerId).toBeTruthy();

      // Wait for background execution
      await new Promise(r => setTimeout(r, 50));
      expect(executed).toBe(true);
    });

    it('should detect circular trigger loops', async () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      // Simulate A -> B -> A loop
      trigger._activeChain = ['workflow-a', 'workflow-b'];

      let errorThrown = false;
      try {
        await trigger.trigger('workflow-b', 'workflow-a', {});
      } catch (e) {
        errorThrown = true;
        // Check for 'circular' case-insensitive
        expect(e.message.toLowerCase()).toContain('circular');
      }
      expect(errorThrown).toBe(true);
    });
  });

  describe('triggerMultiple()', () => {
    it('should trigger multiple workflows in parallel', async () => {
      const engine = new MockWorkflowEngine();
      engine.registerWorkflow('task-1', async () => ({ id: 1 }));
      engine.registerWorkflow('task-2', async () => ({ id: 2 }));
      engine.registerWorkflow('task-3', async () => ({ id: 3 }));

      const trigger = new CrossWorkflowTrigger(engine);
      const results = await trigger.triggerMultiple('orchestrator', [
        { workflowId: 'task-1', context: {} },
        { workflowId: 'task-2', context: {} },
        { workflowId: 'task-3', context: {} },
      ]);

      expect(results).toHaveLength(3);
      expect(results.map(r => r.result.id).sort()).toEqual([1, 2, 3]);
    });

    it('should handle partial failures gracefully', async () => {
      const engine = new MockWorkflowEngine();
      engine.registerWorkflow('success-task', async () => ({ ok: true }));
      engine.registerWorkflow('fail-task', async () => {
        throw new Error('Task failed');
      });

      const trigger = new CrossWorkflowTrigger(engine);
      const results = await trigger.triggerMultiple('orchestrator', [
        { workflowId: 'success-task', context: {} },
        { workflowId: 'fail-task', context: {} },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
      expect(results[1].error).toContain('Task failed');
    });
  });

  describe('registerTriggerHandler()', () => {
    it('should register a handler for specific workflow triggers', async () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      let handlerCalled = false;
      trigger.registerTriggerHandler('skill-creator', _context => {
        handlerCalled = true;
        return { handled: true };
      });

      engine.registerWorkflow('skill-creator', async ctx =>
        trigger._invokeHandler('skill-creator', ctx)
      );

      await trigger.trigger('agent-creator', 'skill-creator', { test: true });
      expect(handlerCalled).toBe(true);
    });
  });

  describe('getTriggerHistory()', () => {
    it('should return history filtered by workflow', async () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      await trigger.trigger('a', 'b', {});
      await trigger.trigger('a', 'c', {});
      await trigger.trigger('x', 'y', {});

      const historyA = trigger.getTriggerHistory('a');
      expect(historyA).toHaveLength(2);

      const historyX = trigger.getTriggerHistory('x');
      expect(historyX).toHaveLength(1);
    });

    it('should include timestamps in history entries', async () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      await trigger.trigger('a', 'b', {});

      const history = trigger.getTriggerHistory();
      expect(history[0].timestamp).toBeTruthy();
      expect(typeof history[0].timestamp).toBe('number');
    });
  });

  describe('detectCircularTrigger()', () => {
    it('should detect simple A -> A cycle', () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      expect(trigger.detectCircularTrigger(['workflow-a'], 'workflow-a')).toBe(true);
    });

    it('should detect longer A -> B -> A cycle', () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      expect(trigger.detectCircularTrigger(['workflow-a', 'workflow-b'], 'workflow-a')).toBe(true);
    });

    it('should allow non-circular chains', () => {
      const engine = new MockWorkflowEngine();
      const trigger = new CrossWorkflowTrigger(engine);

      expect(trigger.detectCircularTrigger(['workflow-a', 'workflow-b'], 'workflow-c')).toBe(false);
    });
  });
});

// =============================================================================
// Run Tests
// =============================================================================

console.log('\n  CrossWorkflowTrigger Tests');
runTestQueue();
