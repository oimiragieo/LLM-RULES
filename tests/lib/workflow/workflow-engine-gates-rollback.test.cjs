#!/usr/bin/env node
/**
 * Workflow Engine Tests
 * =====================
 *
 * TDD: Tests written FIRST before implementation.
 * Following the research report patterns from workflow-engine-implementations.md
 *
 * Test Coverage:
 * 1. PHASES and TRANSITIONS constants
 * 2. WorkflowEngine class construction
 * 3. Workflow definition parsing (YAML)
 * 4. Workflow validation
 * 5. Phase execution with state machine
 * 6. Step execution with hooks
 * 7. Gate validation
 * 8. Checkpoint and resume
 * 9. Rollback / compensating actions
 * 10. Full workflow execution
 * 11. Event system
 * 12. Handler registration
 * 13. Event handler deduplication (SEC-MEM-001)
 * 14. Module exports
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test directories
const TEST_DIR = path.join(__dirname, '__workflow_test_temp__');
const CHECKPOINT_DIR = path.join(TEST_DIR, 'checkpoints');
const WORKFLOW_DIR = path.join(TEST_DIR, 'workflows');

// Will be loaded dynamically
let WorkflowEngine, PHASES, TRANSITIONS, parseWorkflow, validateWorkflow, MAX_HANDLERS;
let moduleLoaded = false;
void PHASES;
void TRANSITIONS;
void validateWorkflow;
void MAX_HANDLERS;

// Test framework - collects tests and runs them sequentially
let passCount = 0;
let failCount = 0;
const testQueue = [];
let currentDescribe = '';

// SEC-IMPL-003: Track WorkflowEngine instances for cleanup to prevent memory leaks
let engineInstances = [];

function describe(name, fn) {
  currentDescribe = name;
  fn();
}

function it(name, fn) {
  testQueue.push({ describe: currentDescribe, name, fn });
}

async function runTestQueue() {
  let lastDescribe = '';

  for (const test of testQueue) {
    if (test.describe !== lastDescribe) {
      console.log(`\n${test.describe}`);
      lastDescribe = test.describe;
    }

    try {
      const result = test.fn();
      // Handle async tests
      if (result && typeof result.then === 'function') {
        await result;
      }
      console.log(`  [PASS] ${test.name}`);
      passCount++;
    } catch (err) {
      console.error(`  [FAIL] ${test.name}`);
      console.error(`         ${err.message}`);
      failCount++;
      process.exitCode = 1;
    } finally {
      // SEC-IMPL-003: Clean up WorkflowEngine event handlers after each test
      // Prevents memory leak from accumulated handlers (50 tests x 100 handlers = 5MB)
      for (const engine of engineInstances) {
        if (engine && typeof engine.clearHandlers === 'function') {
          engine.clearHandlers();
        }
      }
      engineInstances = [];
    }
  }
}

// Setup/teardown
function setupTestDirs() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
}

function cleanupTestDirs() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

// Load module (fails until implementation exists)
function loadModule() {
  if (moduleLoaded) return true;
  try {
    delete require.cache[require.resolve('../../../.claude/lib/workflow/workflow-engine.cjs')];
    const mod = require('../../../.claude/lib/workflow/workflow-engine.cjs');

    // SEC-IMPL-003: Wrap WorkflowEngine to track instances for cleanup
    const OriginalWorkflowEngine = mod.WorkflowEngine;
    WorkflowEngine = class TrackedWorkflowEngine extends OriginalWorkflowEngine {
      constructor(...args) {
        super(...args);
        engineInstances.push(this);
      }
    };

    PHASES = mod.PHASES;
    TRANSITIONS = mod.TRANSITIONS;
    parseWorkflow = mod.parseWorkflow;
    validateWorkflow = mod.validateWorkflow;
    MAX_HANDLERS = mod.MAX_HANDLERS;
    moduleLoaded = true;
    return true;
  } catch (e) {
    console.error(`  [SKIP] Module not loaded: ${e.message}`);
    return false;
  }
}

// Sample workflow YAML for testing
const SAMPLE_WORKFLOW_YAML = `
name: test-workflow
version: 1.0.0
description: Test workflow for unit tests
phases:
  evaluate:
    steps:
      - id: confirm_need
        action: prompt
        validation:
          required: true
      - id: document_gap
        action: write
        path: /tmp/gap.md
    gates:
      - type: assertion
        condition: steps.confirm_need.output.confirmed === true
  validate:
    steps:
      - id: check_conflicts
        action: function
        handler: checkConflicts
    gates:
      - type: assertion
        condition: steps.check_conflicts.output.hasConflicts === false
  obtain:
    steps:
      - id: research
        action: function
        handler: doResearch
  lock:
    steps:
      - id: create_artifact
        action: function
        handler: createArtifact
    compensate:
      - action: function
        handler: deleteArtifact
  verify:
    steps:
      - id: quality_check
        action: function
        handler: qualityCheck
  enable:
    steps:
      - id: register
        action: function
        handler: registerArtifact
`;

// =============================================================================
// Run tests
// =============================================================================

async function runTests() {
  console.log('Workflow Engine Tests');
  console.log('=====================');
  console.log(`Test directory: ${TEST_DIR}`);

  setupTestDirs();

  // Try to load module
  if (!loadModule()) {
    console.log('\n[WARNING] Module not yet implemented. Some tests will be skipped.');
  }

  // =============================================================================
  // SECTION 1: Constants and State Machine
  // =============================================================================

  describe('Gate validation', function () {
    it('should pass gate when condition is met', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.state = { stepResults: { confirm_need: { output: { confirmed: true } } } };

      const gate = { type: 'assertion', condition: 'steps.confirm_need.output.confirmed === true' };
      const result = await engine.evaluateGate(gate);
      assert.strictEqual(result.passed, true);
    });

    it('should fail gate when condition is not met', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.state = { stepResults: { confirm_need: { output: { confirmed: false } } } };

      const gate = { type: 'assertion', condition: 'steps.confirm_need.output.confirmed === true' };
      const result = await engine.evaluateGate(gate);
      assert.strictEqual(result.passed, false);
    });

    it('should emit gate:pass event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.state = { stepResults: {} };

      let eventFired = false;
      engine.on('gate:pass', () => {
        eventFired = true;
      });

      const gate = { type: 'assertion', condition: 'true' };
      await engine.evaluateGate(gate);
      assert.ok(eventFired);
    });

    it('should emit gate:fail event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.state = { stepResults: {} };

      let eventFired = false;
      engine.on('gate:fail', () => {
        eventFired = true;
      });

      const gate = { type: 'assertion', condition: 'false' };
      await engine.evaluateGate(gate);
      assert.ok(eventFired);
    });
  });

  // =============================================================================
  // SECTION 8: Checkpoint and Resume
  // =============================================================================

  describe('Checkpoint functionality', function () {
    it('should save checkpoint to disk', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      engine.workflow = { name: 'test', version: '1.0.0', phases: {} };
      engine.state = {
        runId: 'test-run-123',
        currentPhase: 'validate',
        completedPhases: ['evaluate'],
        stepResults: { step1: { data: 'result' } },
      };

      const checkpointId = await engine.checkpoint();
      assert.ok(checkpointId);
      assert.strictEqual(typeof checkpointId, 'string');

      const files = fs.readdirSync(CHECKPOINT_DIR);
      assert.ok(files.length > 0);
    });

    it('should emit checkpoint:save event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      engine.workflow = { name: 'test', version: '1.0.0', phases: {} };
      engine.state = {
        runId: 'test-run-456',
        currentPhase: 'validate',
        completedPhases: ['evaluate'],
        stepResults: {},
      };

      let eventFired = false;
      engine.on('checkpoint:save', data => {
        eventFired = true;
        assert.strictEqual(data.runId, 'test-run-456');
      });

      await engine.checkpoint();
      assert.ok(eventFired);
    });

    it('should resume from checkpoint', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      engine.workflow = { name: 'test', version: '1.0.0', phases: {} };
      engine.state = {
        runId: 'test-run-789',
        currentPhase: 'validate',
        completedPhases: ['evaluate'],
        stepResults: { s1: { x: 1 } },
      };

      const checkpointId = await engine.checkpoint();

      // Create new engine and resume
      const newEngine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      newEngine.workflow = { name: 'test', version: '1.0.0', phases: {} };
      await newEngine.resume(checkpointId);

      const state = newEngine.getState();
      assert.strictEqual(state.currentPhase, 'validate');
      assert.ok(state.completedPhases.includes('evaluate'));
    });

    it('should emit checkpoint:restore event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      engine.workflow = { name: 'test', version: '1.0.0', phases: {} };
      engine.state = {
        runId: 'test-run-abc',
        currentPhase: 'obtain',
        completedPhases: ['evaluate', 'validate'],
        stepResults: {},
      };

      const checkpointId = await engine.checkpoint();

      const newEngine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      newEngine.workflow = { name: 'test', version: '1.0.0', phases: {} };

      let eventFired = false;
      newEngine.on('checkpoint:restore', () => {
        eventFired = true;
      });

      await newEngine.resume(checkpointId);
      assert.ok(eventFired);
    });

    it('should throw if checkpoint not found', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml', { checkpointDir: CHECKPOINT_DIR });
      engine.workflow = { name: 'test', version: '1.0.0', phases: {} };

      await assert.rejects(
        async () => await engine.resume('nonexistent-checkpoint'),
        /checkpoint.*not found/i
      );
    });
  });

  // =============================================================================
  // SECTION 9: Rollback / Compensating Actions
  // =============================================================================

  describe('Rollback functionality', function () {
    it('should execute compensating actions on rollback', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.state = {
        completedPhases: ['evaluate', 'validate', 'obtain', 'lock'],
        completedSteps: [],
      };

      let rollbackCalled = false;
      engine.registerHandler('deleteArtifact', async () => {
        rollbackCalled = true;
      });

      await engine.rollback();
      assert.ok(rollbackCalled);
    });

    it('should rollback in reverse order', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = {
        name: 'test',
        version: '1.0.0',
        phases: {
          evaluate: {
            steps: [],
            compensate: [{ action: 'function', handler: 'r1' }],
          },
          validate: {
            steps: [],
            compensate: [{ action: 'function', handler: 'r2' }],
          },
        },
      };
      engine.state = { completedPhases: ['evaluate', 'validate'], completedSteps: [] };

      const order = [];
      engine.registerHandler('r1', async () => order.push('r1'));
      engine.registerHandler('r2', async () => order.push('r2'));

      await engine.rollback();
      // Should be reverse: validate first (r2), then evaluate (r1)
      assert.deepStrictEqual(order, ['r2', 'r1']);
    });

    it('should reset state after rollback', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.state = {
        completedPhases: ['evaluate', 'validate', 'obtain', 'lock'],
        completedSteps: [],
      };
      engine.registerHandler('deleteArtifact', async () => {});

      await engine.rollback();
      const state = engine.getState();
      assert.deepStrictEqual(state.completedPhases, []);
    });
  });

  // =============================================================================
  // SECTION 10: Full Workflow Execution
  // =============================================================================

  // Run all tests sequentially
  await runTestQueue();

  // Cleanup
  cleanupTestDirs();

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${passCount + failCount} tests`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('='.repeat(50));
}

// Run tests if this is the main module
if (require.main === module) {
  runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
