#!/usr/bin/env node
/**
 * SPEC-011: Advanced Workflow State Machine Tests
 * ================================================
 *
 * TDD RED Phase - Comprehensive Tests for Advanced Features:
 * 1. Basic State Transitions (10 tests)
 * 2. Nested/Parent-Child Workflows (10 tests)
 * 3. State Machine Guards & Validators (10 tests)
 * 4. Workflow Composition & Delegation (10 tests)
 *
 * Total: 40 comprehensive tests
 *
 * These tests complement workflow-state-transactions.test.cjs by focusing on
 * state machine patterns rather than transaction ACID properties.
 */

'use strict';

const { describe, it, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');

// Test fixtures
const TEST_DIR = path.join(__dirname, '../../.test-temp/state-machine-advanced');
const STATE_FILE = path.join(TEST_DIR, 'workflow-state.json');

// Import modules (will fail initially - expected in RED phase)
let WorkflowStateMachine, StateValidator, WorkflowComposer;

try {
  ({ WorkflowStateMachine } = require('../../.claude/lib/workflow/workflow-state-machine.cjs'));
  ({ StateValidator } = require('../../.claude/lib/workflow/state-validator.cjs'));
  ({ WorkflowComposer } = require('../../.claude/lib/workflow/workflow-composer.cjs'));
} catch (err) {
  console.warn('[RED PHASE] Modules not yet implemented:', err.message);
  // Create stub classes to allow test syntax validation
  WorkflowStateMachine = class {
    constructor() {
      throw new Error('NOT IMPLEMENTED: WorkflowStateMachine');
    }
  };
  StateValidator = class {
    constructor() {
      throw new Error('NOT IMPLEMENTED: StateValidator');
    }
  };
  WorkflowComposer = class {
    constructor() {
      throw new Error('NOT IMPLEMENTED: WorkflowComposer');
    }
  };
}

// =============================================================================
// Test Setup/Teardown
// =============================================================================

beforeEach(async () => {
  // Clean test directory
  if (fs.existsSync(TEST_DIR)) {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  }
  await fs.promises.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  // Cleanup after each test
  if (fs.existsSync(TEST_DIR)) {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  }
});

// =============================================================================
// Category 1: Basic State Transitions (10 tests)
// =============================================================================

describe('State Transitions: Valid Flows', () => {
  it('should transition through pending -> running -> completed', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
    });

    await machine.transition('running');
    assert.strictEqual(await machine.getCurrentState(), 'running');

    await machine.transition('completed');
    assert.strictEqual(await machine.getCurrentState(), 'completed');
  });

  it('should allow pending -> failed transition', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
    });

    await machine.transition('failed', { reason: 'validation_error' });
    assert.strictEqual(await machine.getCurrentState(), 'failed');

    const state = await machine.getStateData();
    assert.strictEqual(state.metadata?.reason, 'validation_error');
  });

  it('should reject invalid transitions', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
    });

    // Cannot go from pending directly to completed
    try {
      await machine.transition('completed');
      assert.fail('Should reject invalid transition');
    } catch (err) {
      assert.match(err.message, /invalid.*transition|not allowed/i);
    }
  });

  it('should maintain transition history', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
    });

    await machine.transition('running');
    await machine.transition('paused');
    await machine.transition('running');
    await machine.transition('completed');

    const history = await machine.getTransitionHistory();
    assert.strictEqual(history.length, 4);
    assert.strictEqual(history[0].from, 'pending');
    assert.strictEqual(history[0].to, 'running');
    assert.strictEqual(history[3].to, 'completed');
  });

  it('should support paused state', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
    });

    await machine.transition('paused');
    assert.strictEqual(await machine.getCurrentState(), 'paused');

    // Can resume from paused
    await machine.transition('running');
    assert.strictEqual(await machine.getCurrentState(), 'running');
  });

  it('should support cancelled state', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
    });

    await machine.transition('cancelled', { cancelledBy: 'user' });
    assert.strictEqual(await machine.getCurrentState(), 'cancelled');

    const state = await machine.getStateData();
    assert.strictEqual(state.metadata?.cancelledBy, 'user');
  });

  it('should track state entry/exit timestamps', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
    });

    const beforeTransition = Date.now();
    await machine.transition('running');
    const afterTransition = Date.now();

    const state = await machine.getStateData();
    const enteredAt = new Date(state.enteredAt).getTime();

    assert.ok(enteredAt >= beforeTransition);
    assert.ok(enteredAt <= afterTransition);
  });

  it('should persist state to file', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
    });

    await machine.transition('running');
    await machine.transition('completed');

    // Verify file exists
    assert.ok(fs.existsSync(STATE_FILE));

    // Load state from file
    const content = JSON.parse(await fs.promises.readFile(STATE_FILE, 'utf8'));
    assert.strictEqual(content.currentState, 'completed');
    assert.strictEqual(content.workflowId, 'wf-1');
  });

  it('should restore state from file', async () => {
    // Create machine and transition
    {
      const machine = new WorkflowStateMachine({
        workflowId: 'wf-1',
        initialState: 'pending',
        stateFile: STATE_FILE,
      });
      await machine.transition('running');
    }

    // Restore from file
    {
      const machine = new WorkflowStateMachine({
        workflowId: 'wf-1',
        stateFile: STATE_FILE,
      });
      assert.strictEqual(await machine.getCurrentState(), 'running');
    }
  });

  it('should handle concurrent state queries without blocking', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
    });

    const queries = await Promise.all([
      machine.getCurrentState(),
      machine.getCurrentState(),
      machine.getCurrentState(),
    ]);

    assert.strictEqual(queries[0], 'running');
    assert.strictEqual(queries[1], 'running');
    assert.strictEqual(queries[2], 'running');
  });
});

// =============================================================================
// Category 2: Nested/Parent-Child Workflows (10 tests)
// =============================================================================

describe('Nested Workflows: Parent-Child Relationships', () => {
  it('should create child workflow from parent', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    const child = await parent.spawnChild('child-1', { phase: 'preprocessing' });

    assert.strictEqual(child.getParentId(), 'parent-1');
    assert.strictEqual(child.getWorkflowId(), 'child-1');
  });

  it('should track all child workflows', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    await parent.spawnChild('child-1');
    await parent.spawnChild('child-2');
    await parent.spawnChild('child-3');

    const children = await parent.getChildren();
    assert.strictEqual(children.length, 3);
    assert.ok(children.find(c => c.workflowId === 'child-1'));
    assert.ok(children.find(c => c.workflowId === 'child-2'));
    assert.ok(children.find(c => c.workflowId === 'child-3'));
  });

  it('should block parent completion until all children complete', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    const child1 = await parent.spawnChild('child-1');
    const child2 = await parent.spawnChild('child-2');

    // Try to complete parent before children
    try {
      await parent.transition('completed');
      assert.fail('Should block parent completion');
    } catch (err) {
      assert.match(err.message, /children.*not.*completed|child.*pending/i);
    }

    // Complete children
    await child1.transition('running');
    await child1.transition('completed');
    await child2.transition('running');
    await child2.transition('completed');

    // Now parent can complete
    await parent.transition('completed');
    assert.strictEqual(await parent.getCurrentState(), 'completed');
  });

  it('should cascade failure from child to parent', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
      cascadeFailure: true,
    });

    const child = await parent.spawnChild('child-1');
    await child.transition('running');

    // Child fails
    await child.transition('failed', { reason: 'data_error' });

    // Parent should auto-transition to failed
    const parentState = await parent.getCurrentState();
    assert.strictEqual(parentState, 'failed');

    const parentData = await parent.getStateData();
    assert.match(parentData.metadata?.reason || '', /child.*failed/i);
  });

  it('should support independent child workflows (no cascade)', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
      cascadeFailure: false,
    });

    const child = await parent.spawnChild('child-1');
    await child.transition('running');
    await child.transition('failed');

    // Parent should remain running
    assert.strictEqual(await parent.getCurrentState(), 'running');
  });

  it('should cancel all children when parent is cancelled', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    const child1 = await parent.spawnChild('child-1');
    const child2 = await parent.spawnChild('child-2');
    await child1.transition('running');
    await child2.transition('running');

    // Cancel parent
    await parent.transition('cancelled');

    // Children should auto-cancel
    assert.strictEqual(await child1.getCurrentState(), 'cancelled');
    assert.strictEqual(await child2.getCurrentState(), 'cancelled');
  });

  it('should support nested workflow hierarchies (grandchildren)', async () => {
    const root = new WorkflowStateMachine({
      workflowId: 'root',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'root.json'),
    });

    const child = await root.spawnChild('child');
    const grandchild = await child.spawnChild('grandchild');

    assert.strictEqual(grandchild.getParentId(), 'child');
    assert.strictEqual(child.getParentId(), 'root');

    const rootId = await grandchild.getRootId();
    assert.strictEqual(rootId, 'root');
  });

  it('should aggregate child progress to parent', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    const child1 = await parent.spawnChild('child-1');
    const child2 = await parent.spawnChild('child-2');

    await child1.setProgress(50);
    await child2.setProgress(100);

    // Parent progress = average of children
    const parentProgress = await parent.getAggregatedProgress();
    assert.strictEqual(parentProgress, 75); // (50 + 100) / 2
  });

  it('should limit max depth of nesting', async () => {
    const root = new WorkflowStateMachine({
      workflowId: 'root',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'root.json'),
      maxNestingDepth: 3,
    });

    const level1 = await root.spawnChild('level1');
    const level2 = await level1.spawnChild('level2');
    const level3 = await level2.spawnChild('level3');

    // Level 4 should fail
    try {
      await level3.spawnChild('level4');
      assert.fail('Should reject nesting beyond max depth');
    } catch (err) {
      assert.match(err.message, /max.*depth|nesting.*limit/i);
    }
  });

  it('should support detaching child from parent', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent-1',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    const child = await parent.spawnChild('child-1');
    await child.detach();

    // Child should no longer have parent
    assert.strictEqual(child.getParentId(), null);

    // Parent should not track child
    const children = await parent.getChildren();
    assert.strictEqual(children.length, 0);
  });
});

// =============================================================================
// Category 3: State Machine Guards & Validators (10 tests)
// =============================================================================

describe('State Guards: Pre/Post Transition Validation', () => {
  it('should execute guard before transition', async () => {
    const guardCalls = [];

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
      guards: {
        running: async context => {
          guardCalls.push('running-guard');
          return context.metadata?.authorized === true;
        },
      },
    });

    // Transition without authorization should fail
    try {
      await machine.transition('running');
      assert.fail('Should reject unauthorized transition');
    } catch (err) {
      assert.match(err.message, /guard.*failed|not.*authorized/i);
    }

    // Transition with authorization should succeed
    await machine.transition('running', { metadata: { authorized: true } });
    assert.strictEqual(await machine.getCurrentState(), 'running');
    assert.ok(guardCalls.includes('running-guard'));
  });

  it('should execute entry action on state entry', async () => {
    const entryCalls = [];

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
      onEntry: {
        running: async context => {
          entryCalls.push(`entered-running-${context.workflowId}`);
        },
      },
    });

    await machine.transition('running');

    assert.ok(entryCalls.includes('entered-running-wf-1'));
  });

  it('should execute exit action on state exit', async () => {
    const exitCalls = [];

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
      onExit: {
        running: async context => {
          exitCalls.push(`exited-running-${context.workflowId}`);
        },
      },
    });

    await machine.transition('completed');

    assert.ok(exitCalls.includes('exited-running-wf-1'));
  });

  it('should validate state data before transition', async () => {
    const validator = new StateValidator({
      schemas: {
        completed: {
          required: ['result', 'duration'],
          properties: {
            result: { type: 'string' },
            duration: { type: 'number', minimum: 0 },
          },
        },
      },
    });

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
      validator,
    });

    // Missing required fields
    try {
      await machine.transition('completed');
      assert.fail('Should reject invalid state data');
    } catch (err) {
      assert.match(err.message, /validation.*failed|missing.*required/i);
    }

    // Valid data
    await machine.transition('completed', {
      metadata: { result: 'success', duration: 123 },
    });
    assert.strictEqual(await machine.getCurrentState(), 'completed');
  });

  it('should support async validators', async () => {
    const validator = new StateValidator({
      schemas: {
        completed: {
          custom: async data => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return data.metadata?.checksum === 'abc123';
          },
        },
      },
    });

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
      validator,
    });

    try {
      await machine.transition('completed');
      assert.fail('Should reject invalid checksum');
    } catch (err) {
      assert.match(err.message, /validation.*failed|custom.*validator/i);
    }

    await machine.transition('completed', { metadata: { checksum: 'abc123' } });
    assert.strictEqual(await machine.getCurrentState(), 'completed');
  });

  it('should reject transitions to terminal states', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'completed',
      stateFile: STATE_FILE,
      terminalStates: ['completed', 'failed', 'cancelled'],
    });

    // Cannot transition from terminal state
    try {
      await machine.transition('running');
      assert.fail('Should reject transition from terminal state');
    } catch (err) {
      assert.match(err.message, /terminal.*state|cannot.*transition/i);
    }
  });

  it('should support conditional transitions based on context', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
      conditionalTransitions: {
        running: {
          retry: context => context.metadata?.retryCount < 3,
          failed: context => context.metadata?.retryCount >= 3,
        },
      },
    });

    // First retry allowed
    await machine.transition('retry', { metadata: { retryCount: 1 } });
    assert.strictEqual(await machine.getCurrentState(), 'retry');

    // Retry again
    await machine.transition('running');
    await machine.transition('retry', { metadata: { retryCount: 2 } });

    // Third retry should fail
    await machine.transition('running');
    try {
      await machine.transition('retry', { metadata: { retryCount: 3 } });
      assert.fail('Should reject retry after max count');
    } catch (err) {
      assert.match(err.message, /condition.*not.*met|retry.*limit/i);
    }
  });

  it('should track transition attempt failures', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'pending',
      stateFile: STATE_FILE,
      guards: {
        running: async () => false, // Always fail
      },
    });

    // Attempt transition multiple times
    for (let i = 0; i < 5; i++) {
      try {
        await machine.transition('running');
      } catch (_err) {
        // Expected
      }
    }

    const failures = await machine.getFailedTransitions();
    assert.strictEqual(failures.length, 5);
    assert.strictEqual(failures[0].from, 'pending');
    assert.strictEqual(failures[0].to, 'running');
  });

  it('should support rollback on guard failure', async () => {
    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
      guards: {
        completed: async context => {
          if (!context.metadata?.validated) {
            throw new Error('Validation failed');
          }
          return true;
        },
      },
      rollbackOnGuardFailure: true,
    });

    const stateBefore = await machine.getCurrentState();

    try {
      await machine.transition('completed');
      assert.fail('Should fail guard');
    } catch (_err) {
      // State should remain unchanged
      const stateAfter = await machine.getCurrentState();
      assert.strictEqual(stateAfter, stateBefore);
    }
  });

  it('should execute state machine hooks in correct order', async () => {
    const executionOrder = [];

    const machine = new WorkflowStateMachine({
      workflowId: 'wf-1',
      initialState: 'running',
      stateFile: STATE_FILE,
      guards: {
        completed: async () => {
          executionOrder.push('guard');
          return true;
        },
      },
      onExit: {
        running: async () => {
          executionOrder.push('exit-running');
        },
      },
      onEntry: {
        completed: async () => {
          executionOrder.push('entry-completed');
        },
      },
    });

    await machine.transition('completed');

    // Verify hook execution order
    assert.strictEqual(executionOrder[0], 'guard');
    assert.strictEqual(executionOrder[1], 'exit-running');
    assert.strictEqual(executionOrder[2], 'entry-completed');
  });
});

// =============================================================================
// Category 4: Workflow Composition & Delegation (10 tests)
// =============================================================================

describe('Workflow Composition: Multi-Workflow Orchestration', () => {
  it('should compose multiple workflows into pipeline', async () => {
    const composer = new WorkflowComposer();

    const wf1 = new WorkflowStateMachine({
      workflowId: 'preprocess',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf1.json'),
    });

    const wf2 = new WorkflowStateMachine({
      workflowId: 'process',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf2.json'),
    });

    const wf3 = new WorkflowStateMachine({
      workflowId: 'postprocess',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf3.json'),
    });

    const pipeline = await composer.createPipeline([wf1, wf2, wf3]);

    // Execute pipeline
    await pipeline.execute();

    // All workflows should complete in order
    assert.strictEqual(await wf1.getCurrentState(), 'completed');
    assert.strictEqual(await wf2.getCurrentState(), 'completed');
    assert.strictEqual(await wf3.getCurrentState(), 'completed');
  });

  it('should delegate workflow execution to sub-workflow', async () => {
    const parent = new WorkflowStateMachine({
      workflowId: 'parent',
      initialState: 'running',
      stateFile: path.join(TEST_DIR, 'parent.json'),
    });

    const subworkflow = new WorkflowStateMachine({
      workflowId: 'subworkflow',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'sub.json'),
    });

    await parent.delegateTo(subworkflow, 'heavy-computation');

    // Parent should wait for subworkflow
    assert.strictEqual(await parent.getCurrentState(), 'delegated');

    // Complete subworkflow
    await subworkflow.transition('running');
    await subworkflow.transition('completed');

    // Parent should auto-resume
    assert.strictEqual(await parent.getCurrentState(), 'running');
  });

  it('should pass data between composed workflows', async () => {
    const _composer = new WorkflowComposer();

    const wf1 = new WorkflowStateMachine({
      workflowId: 'extract',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf1.json'),
    });

    const wf2 = new WorkflowStateMachine({
      workflowId: 'transform',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf2.json'),
    });

    await wf1.transition('running');
    await wf1.setOutputData({ records: [1, 2, 3] });
    await wf1.transition('completed');

    const output1 = await wf1.getOutputData();

    await wf2.setInputData(output1);
    await wf2.transition('running');
    await wf2.transition('completed');

    const input2 = await wf2.getInputData();
    assert.deepStrictEqual(input2.records, [1, 2, 3]);
  });

  it('should support parallel workflow execution', async () => {
    const composer = new WorkflowComposer();

    const wf1 = new WorkflowStateMachine({
      workflowId: 'task-a',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wfa.json'),
    });

    const wf2 = new WorkflowStateMachine({
      workflowId: 'task-b',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wfb.json'),
    });

    const wf3 = new WorkflowStateMachine({
      workflowId: 'task-c',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wfc.json'),
    });

    const startTime = performance.now();
    await composer.executeParallel([wf1, wf2, wf3]);
    const elapsed = performance.now() - startTime;

    // Should complete in parallel (not sequential)
    // With 100ms delay per workflow, parallel = ~100ms, sequential = ~300ms
    assert.ok(elapsed < 200, `Parallel execution took ${elapsed}ms (expected <200ms)`);
  });

  it('should support fan-out/fan-in pattern', async () => {
    const composer = new WorkflowComposer();

    const source = new WorkflowStateMachine({
      workflowId: 'source',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'source.json'),
    });

    // Fan-out to 3 parallel workers
    const workers = [];
    for (let i = 1; i <= 3; i++) {
      workers.push(
        new WorkflowStateMachine({
          workflowId: `worker-${i}`,
          initialState: 'pending',
          stateFile: path.join(TEST_DIR, `worker${i}.json`),
        })
      );
    }

    const sink = new WorkflowStateMachine({
      workflowId: 'sink',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'sink.json'),
    });

    const pattern = await composer.createFanOutFanIn(source, workers, sink);
    await pattern.execute();

    // All workers should complete
    for (const worker of workers) {
      assert.strictEqual(await worker.getCurrentState(), 'completed');
    }

    // Sink should aggregate results
    assert.strictEqual(await sink.getCurrentState(), 'completed');
  });

  it('should handle workflow composition errors gracefully', async () => {
    const composer = new WorkflowComposer();

    const wf1 = new WorkflowStateMachine({
      workflowId: 'step1',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf1.json'),
    });

    const wf2 = new WorkflowStateMachine({
      workflowId: 'step2',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'wf2.json'),
    });

    const pipeline = await composer.createPipeline([wf1, wf2], {
      stopOnError: true,
    });

    // Force step1 to fail
    await wf1.transition('running');
    await wf1.transition('failed');

    try {
      await pipeline.execute();
      assert.fail('Should propagate failure');
    } catch (_err) {
      // wf2 should not have started
      assert.strictEqual(await wf2.getCurrentState(), 'pending');
    }
  });

  it('should support conditional workflow routing', async () => {
    const _composer = new WorkflowComposer();

    const router = new WorkflowStateMachine({
      workflowId: 'router',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'router.json'),
    });

    const pathA = new WorkflowStateMachine({
      workflowId: 'path-a',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'path-a.json'),
    });

    const pathB = new WorkflowStateMachine({
      workflowId: 'path-b',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'path-b.json'),
    });

    await router.transition('running');
    await router.setOutputData({ route: 'pathA' });
    await router.transition('completed');

    const routerOutput = await router.getOutputData();
    const selectedPath = routerOutput.route === 'pathA' ? pathA : pathB;

    await selectedPath.transition('running');
    await selectedPath.transition('completed');

    // Only pathA should have executed
    assert.strictEqual(await pathA.getCurrentState(), 'completed');
    assert.strictEqual(await pathB.getCurrentState(), 'pending');
  });

  it('should support workflow retry with backoff', async () => {
    const composer = new WorkflowComposer();
    let attemptCount = 0;

    const unstableWorkflow = new WorkflowStateMachine({
      workflowId: 'unstable',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'unstable.json'),
      onEntry: {
        running: async () => {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Simulated failure');
          }
        },
      },
    });

    await composer.retryWorkflow(unstableWorkflow, {
      maxRetries: 3,
      backoff: 'exponential',
    });

    // Should succeed on third attempt
    assert.strictEqual(attemptCount, 3);
    assert.strictEqual(await unstableWorkflow.getCurrentState(), 'completed');
  });

  it('should support circuit breaker pattern', async () => {
    const composer = new WorkflowComposer({ circuitBreaker: true });

    const failingWorkflow = new WorkflowStateMachine({
      workflowId: 'failing',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'failing.json'),
      onEntry: {
        running: async () => {
          throw new Error('Always fails');
        },
      },
    });

    // Fail 5 times to trip circuit breaker
    for (let i = 0; i < 5; i++) {
      try {
        await composer.execute(failingWorkflow);
      } catch (_err) {
        // Expected
      }
    }

    // Circuit should be open - reject immediately without execution
    const start = performance.now();
    try {
      await composer.execute(failingWorkflow);
      assert.fail('Should reject due to open circuit');
    } catch (err) {
      const elapsed = performance.now() - start;
      assert.match(err.message, /circuit.*open|breaker.*tripped/i);
      assert.ok(elapsed < 10, `Should fail fast (<10ms), took ${elapsed}ms`);
    }
  });

  it('should support workflow saga pattern (compensating transactions)', async () => {
    const composer = new WorkflowComposer();
    const compensations = [];

    const step1 = new WorkflowStateMachine({
      workflowId: 'book-flight',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'step1.json'),
      compensate: async () => {
        compensations.push('cancel-flight');
      },
    });

    const step2 = new WorkflowStateMachine({
      workflowId: 'book-hotel',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'step2.json'),
      compensate: async () => {
        compensations.push('cancel-hotel');
      },
    });

    const step3 = new WorkflowStateMachine({
      workflowId: 'charge-card',
      initialState: 'pending',
      stateFile: path.join(TEST_DIR, 'step3.json'),
      onEntry: {
        running: async () => {
          throw new Error('Payment failed');
        },
      },
      compensate: async () => {
        compensations.push('refund-card');
      },
    });

    const saga = await composer.createSaga([step1, step2, step3]);

    try {
      await saga.execute();
      assert.fail('Should fail at step3');
    } catch (_err) {
      // Should compensate in reverse order
      assert.deepStrictEqual(compensations, ['cancel-hotel', 'cancel-flight']);
    }
  });
});

// =============================================================================
// Summary
// =============================================================================

console.log('[RED PHASE COMPLETE] 40 comprehensive state machine tests written');
console.log('Test Coverage:');
console.log('  - Basic State Transitions: 10 tests');
console.log('  - Nested/Parent-Child Workflows: 10 tests');
console.log('  - State Guards & Validators: 10 tests');
console.log('  - Workflow Composition & Delegation: 10 tests');
console.log('');
console.log('Next: GREEN phase - Implement minimal code to pass tests');
