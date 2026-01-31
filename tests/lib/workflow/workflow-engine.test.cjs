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

  describe('PHASES constant', function () {
    it('should define all 6 EVOLVE phases', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(PHASES, 'PHASES should be defined');
      assert.strictEqual(PHASES.EVALUATE, 'evaluate');
      assert.strictEqual(PHASES.VALIDATE, 'validate');
      assert.strictEqual(PHASES.OBTAIN, 'obtain');
      assert.strictEqual(PHASES.LOCK, 'lock');
      assert.strictEqual(PHASES.VERIFY, 'verify');
      assert.strictEqual(PHASES.ENABLE, 'enable');
    });

    it('should have exactly 6 phases', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.strictEqual(Object.keys(PHASES).length, 6);
    });
  });

  describe('TRANSITIONS constant', function () {
    it('should define valid transitions for each phase', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(TRANSITIONS, 'TRANSITIONS should be defined');
      assert.deepStrictEqual(TRANSITIONS.evaluate, ['validate']);
      assert.deepStrictEqual(TRANSITIONS.validate, ['obtain']);
      assert.deepStrictEqual(TRANSITIONS.obtain, ['lock']);
      assert.deepStrictEqual(TRANSITIONS.lock, ['verify']);
      assert.ok(TRANSITIONS.verify.includes('enable'), 'verify should transition to enable');
      assert.ok(TRANSITIONS.verify.includes('lock'), 'verify should allow retry to lock');
      assert.deepStrictEqual(TRANSITIONS.enable, ['complete']);
    });

    it('verify phase should allow retry back to lock', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(TRANSITIONS.verify.includes('lock'));
    });
  });

  // =============================================================================
  // SECTION 2: WorkflowEngine Class - Constructor
  // =============================================================================

  describe('WorkflowEngine constructor', function () {
    it('should create instance with workflow path', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/path/to/workflow.yaml');
      assert.ok(engine instanceof WorkflowEngine);
    });

    it('should accept options parameter', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const options = {
        checkpointDir: CHECKPOINT_DIR,
        hooks: { onPhaseStart: () => {} },
      };
      const engine = new WorkflowEngine('/path/to/workflow.yaml', options);
      assert.strictEqual(engine.options.checkpointDir, CHECKPOINT_DIR);
    });

    it('should initialize with pending state', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/path/to/workflow.yaml');
      const state = engine.getState();
      assert.strictEqual(state.status, 'pending');
      assert.strictEqual(state.currentPhase, null);
    });
  });

  // =============================================================================
  // SECTION 3: Workflow Definition Parser
  // =============================================================================

  describe('parseWorkflow function', function () {
    it('should parse valid YAML workflow', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      assert.strictEqual(workflow.name, 'test-workflow');
      assert.strictEqual(workflow.version, '1.0.0');
      assert.ok(workflow.phases);
    });

    it('should parse phases with steps', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      assert.ok(workflow.phases.evaluate);
      assert.strictEqual(workflow.phases.evaluate.steps.length, 2);
      assert.strictEqual(workflow.phases.evaluate.steps[0].id, 'confirm_need');
    });

    it('should throw on invalid input', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      // null/undefined should throw
      assert.throws(() => parseWorkflow(null), /empty|invalid/i);
      assert.throws(() => parseWorkflow(undefined), /empty|invalid/i);
      assert.throws(() => parseWorkflow(123), /empty|invalid/i);
    });

    it('should throw on empty workflow', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.throws(() => parseWorkflow(''), /empty/i);
    });
  });

  describe('validateWorkflow function', function () {
    it('should validate workflow has required fields', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const valid = { name: 'test', version: '1.0.0', phases: {} };
      const result = validateWorkflow(valid);
      assert.strictEqual(result.valid, true);
    });

    it('should reject workflow without name', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const invalid = { version: '1.0.0', phases: {} };
      const result = validateWorkflow(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /name/i.test(e)));
    });

    it('should reject workflow without phases', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const invalid = { name: 'test', version: '1.0.0' };
      const result = validateWorkflow(invalid);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /phases/i.test(e)));
    });

    it('should validate step IDs are unique', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const workflow = {
        name: 'test',
        version: '1.0.0',
        phases: {
          evaluate: {
            steps: [
              { id: 'step1', action: 'prompt' },
              { id: 'step1', action: 'write' }, // Duplicate
            ],
          },
        },
      };
      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => /duplicate.*step1/i.test(e)));
    });
  });

  // =============================================================================
  // SECTION 4: WorkflowEngine.load() Method
  // =============================================================================

  describe('WorkflowEngine.load()', function () {
    it('should load workflow from file path', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');

      const workflowPath = path.join(WORKFLOW_DIR, 'test.yaml');
      fs.writeFileSync(workflowPath, SAMPLE_WORKFLOW_YAML);

      const engine = new WorkflowEngine(workflowPath);
      await engine.load();
      assert.ok(engine.workflow);
      assert.strictEqual(engine.workflow.name, 'test-workflow');
    });

    it('should throw if workflow file does not exist', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/nonexistent/workflow.yaml');
      await assert.rejects(async () => await engine.load(), /ENOENT|not found/i);
    });

    it('should validate workflow after loading', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');

      const workflowPath = path.join(WORKFLOW_DIR, 'valid.yaml');
      fs.writeFileSync(workflowPath, SAMPLE_WORKFLOW_YAML);

      const engine = new WorkflowEngine(workflowPath);
      await engine.load();
      assert.strictEqual(engine.isValid, true);
    });
  });

  // =============================================================================
  // SECTION 5: Phase Execution
  // =============================================================================

  describe('WorkflowEngine.executePhase()', function () {
    it('should execute a phase and update state', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.registerHandler('checkConflicts', async () => ({ output: { hasConflicts: false } }));
      engine.registerHandler('doResearch', async () => ({ output: { success: true } }));

      // Start from evaluate - pre-populate with correct result structure
      engine.state = {
        status: 'running',
        currentPhase: null,
        completedPhases: [],
        completedSteps: [],
        stepResults: {},
      };
      await engine.executePhase('evaluate', { confirm_need: { output: { confirmed: true } } });

      const state = engine.getState();
      assert.ok(state.completedPhases.includes('evaluate'));
    });

    it('should emit phase:start event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;

      let eventFired = false;
      engine.on('phase:start', data => {
        eventFired = true;
        assert.strictEqual(data.phase, 'evaluate');
      });

      engine.state = {
        status: 'running',
        currentPhase: null,
        completedPhases: [],
        completedSteps: [],
        stepResults: {},
      };
      await engine.executePhase('evaluate', { confirm_need: { output: { confirmed: true } } });
      assert.ok(eventFired);
    });

    it('should emit phase:end event on completion', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;

      let eventFired = false;
      engine.on('phase:end', data => {
        eventFired = true;
        assert.strictEqual(data.phase, 'evaluate');
        assert.strictEqual(data.status, 'completed');
      });

      engine.state = {
        status: 'running',
        currentPhase: null,
        completedPhases: [],
        completedSteps: [],
        stepResults: {},
      };
      await engine.executePhase('evaluate', { confirm_need: { output: { confirmed: true } } });
      assert.ok(eventFired);
    });

    it('should validate phase transitions', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.state = {
        status: 'running',
        currentPhase: null,
        completedPhases: [],
        completedSteps: [],
        stepResults: {},
      };

      // Cannot skip to lock without completing prior phases
      await assert.rejects(async () => await engine.executePhase('lock'), /invalid transition/i);
    });
  });

  // =============================================================================
  // SECTION 6: Step Execution
  // =============================================================================

  describe('WorkflowEngine.executeStep()', function () {
    it('should execute a single step by ID', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.state = { currentPhase: 'evaluate', stepResults: {}, completedSteps: [] };
      engine.registerHandler('confirm_need', async () => ({ confirmed: true }));

      const result = await engine.executeStep('confirm_need');
      assert.ok(result.confirmed);
    });

    it('should store step result in state', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.state = { currentPhase: 'evaluate', stepResults: {}, completedSteps: [] };
      engine.registerHandler('confirm_need', async () => ({ data: 'stored' }));

      await engine.executeStep('confirm_need');
      assert.deepStrictEqual(engine.getState().stepResults.confirm_need, { data: 'stored' });
    });

    it('should emit step:start event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.state = { currentPhase: 'evaluate', stepResults: {}, completedSteps: [] };
      engine.registerHandler('confirm_need', async () => ({}));

      let eventFired = false;
      engine.on('step:start', data => {
        eventFired = true;
        assert.strictEqual(data.stepId, 'confirm_need');
      });

      await engine.executeStep('confirm_need');
      assert.ok(eventFired);
    });

    it('should emit step:end event', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.state = { currentPhase: 'evaluate', stepResults: {}, completedSteps: [] };
      engine.registerHandler('confirm_need', async () => ({ result: 'done' }));

      let eventFired = false;
      engine.on('step:end', data => {
        eventFired = true;
        assert.strictEqual(data.stepId, 'confirm_need');
        assert.deepStrictEqual(data.result, { result: 'done' });
      });

      await engine.executeStep('confirm_need');
      assert.ok(eventFired);
    });

    it('should throw for unknown step ID', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;
      engine.state = { currentPhase: 'evaluate', stepResults: {}, completedSteps: [] };

      await assert.rejects(async () => await engine.executeStep('unknown'), /step.*not found/i);
    });
  });

  // =============================================================================
  // SECTION 7: Gate Validation
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

  describe('WorkflowEngine.execute()', function () {
    it('should execute full workflow through all phases', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = parseWorkflow(SAMPLE_WORKFLOW_YAML);
      engine.isValid = true;

      // Register all handlers - results must match gate conditions in YAML
      // Gates expect: steps.<step_id>.output.<field>
      engine.registerHandler('confirm_need', async () => ({ output: { confirmed: true } }));
      engine.registerHandler('document_gap', async () => ({ output: { success: true } }));
      engine.registerHandler('checkConflicts', async () => ({ output: { hasConflicts: false } }));
      engine.registerHandler('doResearch', async () => ({ output: { queries: 3 } }));
      engine.registerHandler('createArtifact', async () => ({ output: { path: '/test' } }));
      engine.registerHandler('qualityCheck', async () => ({ output: { passed: true } }));
      engine.registerHandler('registerArtifact', async () => ({ output: { registered: true } }));

      const result = await engine.execute({ input: 'test' });
      assert.strictEqual(result.status, 'completed');
      assert.strictEqual(result.completedPhases.length, 6);
    });

    it('should pass context to handlers', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = {
        name: 'simple',
        version: '1.0.0',
        phases: {
          evaluate: { steps: [{ id: 's1', action: 'function', handler: 'h1' }] },
          validate: { steps: [{ id: 's2', action: 'function', handler: 'h2' }] },
          obtain: { steps: [{ id: 's3', action: 'function', handler: 'h3' }] },
          lock: { steps: [{ id: 's4', action: 'function', handler: 'h4' }] },
          verify: { steps: [{ id: 's5', action: 'function', handler: 'h5' }] },
          enable: { steps: [{ id: 's6', action: 'function', handler: 'h6' }] },
        },
      };
      engine.isValid = true;

      let receivedContext;
      engine.registerHandler('h1', async ctx => {
        receivedContext = ctx;
        return {};
      });
      ['h2', 'h3', 'h4', 'h5', 'h6'].forEach(h => engine.registerHandler(h, async () => ({})));

      await engine.execute({ myData: 'value' });
      assert.ok(receivedContext);
      assert.strictEqual(receivedContext.myData, 'value');
    });

    it('should stop on phase failure', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.workflow = {
        name: 'simple',
        version: '1.0.0',
        phases: {
          evaluate: { steps: [{ id: 's1', action: 'function', handler: 'h1' }] },
          validate: { steps: [{ id: 's2', action: 'function', handler: 'h2' }] },
          obtain: { steps: [] },
          lock: { steps: [] },
          verify: { steps: [] },
          enable: { steps: [] },
        },
      };
      engine.isValid = true;

      engine.registerHandler('h1', async () => ({}));
      engine.registerHandler('h2', async () => {
        throw new Error('Validation failed');
      });

      await assert.rejects(async () => await engine.execute({}), /Validation failed/);

      const state = engine.getState();
      assert.ok(state.completedPhases.includes('evaluate'));
      assert.ok(!state.completedPhases.includes('validate'));
    });

    it('should generate unique run ID', async function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const createEngine = () => {
        const e = new WorkflowEngine('/mock/path.yaml');
        e.workflow = {
          name: 'simple',
          version: '1.0.0',
          phases: {
            evaluate: { steps: [] },
            validate: { steps: [] },
            obtain: { steps: [] },
            lock: { steps: [] },
            verify: { steps: [] },
            enable: { steps: [] },
          },
        };
        e.isValid = true;
        return e;
      };

      const e1 = createEngine();
      const e2 = createEngine();

      await e1.execute({});
      await e2.execute({});

      assert.notStrictEqual(e1.getState().runId, e2.getState().runId);
    });
  });

  // =============================================================================
  // SECTION 11: Event System
  // =============================================================================

  describe('Event system', function () {
    it('should support on() for event registration', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      assert.strictEqual(typeof engine.on, 'function');
      engine.on('test', () => {});
    });

    it('should support multiple handlers for same event', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      let count = 0;
      engine.on('test', () => count++);
      engine.on('test', () => count++);
      engine.emit('test', {});
      assert.strictEqual(count, 2);
    });

    it('should pass event data to handlers', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      let received;
      engine.on('test', data => {
        received = data;
      });
      engine.emit('test', { foo: 'bar' });
      assert.deepStrictEqual(received, { foo: 'bar' });
    });

    it('should support off() for event removal', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      let count = 0;
      const handler = () => count++;
      engine.on('test', handler);
      engine.off('test', handler);
      engine.emit('test', {});
      assert.strictEqual(count, 0);
    });
  });

  // =============================================================================
  // SECTION 12: Handler Registration
  // =============================================================================

  describe('Handler registration', function () {
    it('should register handler by name', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      engine.registerHandler('myHandler', async () => ({}));
      assert.ok(engine.hasHandler('myHandler'));
    });

    it('should retrieve registered handler', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      const handler = async () => ({ result: 'test' });
      engine.registerHandler('myHandler', handler);
      const retrieved = engine.getHandler('myHandler');
      assert.strictEqual(retrieved, handler);
    });

    it('should throw for unregistered handler', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');
      assert.throws(() => engine.getHandler('unknown'), /handler.*not found/i);
    });
  });

  // =============================================================================
  // SECTION 13: Event Handler Deduplication (SEC-MEM-001)
  // =============================================================================

  describe('Event handler deduplication', function () {
    it('should export MAX_HANDLERS constant', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const mod = require('../../../.claude/lib/workflow/workflow-engine.cjs');
      assert.ok(
        typeof mod.MAX_HANDLERS === 'number',
        'MAX_HANDLERS should be exported as a number'
      );
      assert.strictEqual(mod.MAX_HANDLERS, 100, 'MAX_HANDLERS should be 100');
    });

    it('should prevent duplicate handlers with same ID', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      let count = 0;
      const handler = () => count++;

      // Register same handler with same ID twice
      const result1 = engine.onWithId('test', handler, 'handler-1');
      const result2 = engine.onWithId('test', handler, 'handler-1');

      assert.strictEqual(result1, true, 'First registration should succeed');
      assert.strictEqual(result2, false, 'Duplicate registration should fail');

      // Emit should only call handler once
      engine.emit('test', {});
      assert.strictEqual(count, 1, 'Handler should only be called once');
    });

    it('should allow different handlers with different IDs', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      let count = 0;
      const handler1 = () => count++;
      const handler2 = () => count++;

      const result1 = engine.onWithId('test', handler1, 'handler-1');
      const result2 = engine.onWithId('test', handler2, 'handler-2');

      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);

      engine.emit('test', {});
      assert.strictEqual(count, 2, 'Both handlers should be called');
    });

    it('should enforce MAX_HANDLERS limit per event type', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const mod = require('../../../.claude/lib/workflow/workflow-engine.cjs');
      const engine = new WorkflowEngine('/mock/path.yaml');

      // Register MAX_HANDLERS handlers
      for (let i = 0; i < mod.MAX_HANDLERS; i++) {
        const result = engine.onWithId('test', () => {}, `handler-${i}`);
        assert.strictEqual(result, true, `Handler ${i} should register`);
      }

      // Next registration should fail
      const result = engine.onWithId('test', () => {}, `handler-${mod.MAX_HANDLERS}`);
      assert.strictEqual(result, false, 'Registration beyond MAX_HANDLERS should fail');
    });

    it('should track handlers separately per event type', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      // Same ID but different events should both succeed
      const result1 = engine.onWithId('event-a', () => {}, 'handler-1');
      const result2 = engine.onWithId('event-b', () => {}, 'handler-1');

      assert.strictEqual(result1, true);
      assert.strictEqual(result2, true);
    });

    it('should provide clearHandlers() method', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      let count = 0;
      engine.onWithId('test', () => count++, 'handler-1');
      engine.emit('test', {});
      assert.strictEqual(count, 1);

      // Clear handlers
      engine.clearHandlers();

      // Emit should not call handler
      engine.emit('test', {});
      assert.strictEqual(count, 1, 'Handler should not be called after clearHandlers');
    });

    it('should clear handlers for specific event type', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      let countA = 0;
      let countB = 0;
      engine.onWithId('event-a', () => countA++, 'handler-a');
      engine.onWithId('event-b', () => countB++, 'handler-b');

      // Clear only event-a handlers
      engine.clearHandlers('event-a');

      engine.emit('event-a', {});
      engine.emit('event-b', {});

      assert.strictEqual(countA, 0, 'event-a handler should not be called');
      assert.strictEqual(countB, 1, 'event-b handler should still be called');
    });

    it('should allow re-registration after clearHandlers', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      engine.onWithId('test', () => {}, 'handler-1');
      engine.clearHandlers();

      // Should be able to re-register with same ID
      const result = engine.onWithId('test', () => {}, 'handler-1');
      assert.strictEqual(result, true, 'Should allow re-registration after clear');
    });

    it('should return handler count for event type', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      assert.strictEqual(engine.getHandlerCount('test'), 0, 'Initial count should be 0');

      engine.onWithId('test', () => {}, 'handler-1');
      assert.strictEqual(engine.getHandlerCount('test'), 1);

      engine.onWithId('test', () => {}, 'handler-2');
      assert.strictEqual(engine.getHandlerCount('test'), 2);

      // Duplicate should not increase count
      engine.onWithId('test', () => {}, 'handler-2');
      assert.strictEqual(engine.getHandlerCount('test'), 2);
    });

    it('should integrate with off() method', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      let count = 0;
      const handler = () => count++;

      engine.onWithId('test', handler, 'handler-1');
      engine.off('test', handler);

      // Should allow re-registration after off()
      const result = engine.onWithId('test', handler, 'handler-1');
      assert.strictEqual(result, true, 'Should allow re-registration after off()');
    });

    it('should use Set-based deduplication internally', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      const engine = new WorkflowEngine('/mock/path.yaml');

      // Access internal handler registry (for testing internals)
      assert.ok(engine.handlerRegistry instanceof Map, 'handlerRegistry should be a Map');

      engine.onWithId('test', () => {}, 'handler-1');
      const registry = engine.handlerRegistry.get('test');
      assert.ok(registry instanceof Set, 'Event registry should be a Set');
    });
  });

  // =============================================================================
  // SECTION 14: Module Exports
  // =============================================================================

  describe('Module exports', function () {
    it('should export WorkflowEngine class', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(WorkflowEngine);
      assert.strictEqual(typeof WorkflowEngine, 'function');
    });

    it('should export PHASES constant', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(PHASES);
      assert.strictEqual(typeof PHASES, 'object');
    });

    it('should export TRANSITIONS constant', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(TRANSITIONS);
      assert.strictEqual(typeof TRANSITIONS, 'object');
    });

    it('should export parseWorkflow function', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(parseWorkflow);
      assert.strictEqual(typeof parseWorkflow, 'function');
    });

    it('should export validateWorkflow function', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(validateWorkflow);
      assert.strictEqual(typeof validateWorkflow, 'function');
    });

    it('should export MAX_HANDLERS constant', function () {
      if (!moduleLoaded) throw new Error('Module not loaded');
      assert.ok(MAX_HANDLERS);
      assert.strictEqual(typeof MAX_HANDLERS, 'number');
    });
  });

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
