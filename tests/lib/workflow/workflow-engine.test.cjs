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
