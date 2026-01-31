#!/usr/bin/env node
/**
 * Workflow Integration Tests
 * ==========================
 *
 * Comprehensive integration tests for the entire executable workflow ecosystem.
 * Tests full workflow execution, cross-workflow triggering, checkpoint/resume,
 * rollback scenarios, system registration, and evolution state sync.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Test framework
const tests = [];
let passed = 0;
let failed = 0;

// SEC-IMPL-003: Track WorkflowEngine instances for cleanup to prevent memory leaks
const engineInstances = [];

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  ✓ ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${test.name}`);
      console.log(`    Error: ${e.message}`);
      failed++;
    } finally {
      // SEC-IMPL-003: Clean up WorkflowEngine event handlers after each test
      // Prevents memory leak from accumulated handlers
      for (const engine of engineInstances) {
        if (engine && typeof engine.clearHandlers === 'function') {
          engine.clearHandlers();
        }
      }
      engineInstances.length = 0; // Clear array
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Setup
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEST_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'test-integration-temp');
const TEST_CHECKPOINT_DIR = path.join(TEST_DIR, 'checkpoints');
const TEST_BACKUP_DIR = path.join(TEST_DIR, 'backups');
const TEST_STATE_FILE = path.join(TEST_DIR, 'evolution-state.json');

// SEC-IMPL-003: Monkey-patch WorkflowEngine to track instances for cleanup
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  const module = originalRequire.apply(this, arguments);

  // Intercept workflow-engine.cjs
  if (id === './workflow-engine.cjs' && module.WorkflowEngine) {
    const OriginalWorkflowEngine = module.WorkflowEngine;

    // Return wrapped version that tracks instances
    return {
      ...module,
      WorkflowEngine: class TrackedWorkflowEngine extends OriginalWorkflowEngine {
        constructor(...args) {
          super(...args);
          engineInstances.push(this);
        }
      },
    };
  }

  return module;
};

// Cleanup function
function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function setup() {
  cleanup();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(TEST_CHECKPOINT_DIR, { recursive: true });
  fs.mkdirSync(TEST_BACKUP_DIR, { recursive: true });
}

// Test workflow YAML
const TEST_WORKFLOW_YAML = `
name: test-integration-workflow
version: 1.0.0
description: Integration test workflow

phases:
  evaluate:
    description: Evaluate phase
    steps:
      - id: eval_step
        action: function
        handler: evalHandler
        description: Evaluation step

  validate:
    description: Validate phase
    steps:
      - id: validate_step
        action: function
        handler: validateHandler
        description: Validation step

  obtain:
    description: Obtain phase
    steps:
      - id: obtain_step
        action: function
        handler: obtainHandler
        description: Obtain step

  lock:
    description: Lock phase
    steps:
      - id: lock_step
        action: function
        handler: lockHandler
        description: Lock step
        compensate:
          type: file:create

  verify:
    description: Verify phase
    steps:
      - id: verify_step
        action: function
        handler: verifyHandler
        description: Verify step

  enable:
    description: Enable phase
    steps:
      - id: enable_step
        action: function
        handler: enableHandler
        description: Enable step

rollback:
  strategy: saga
  compensations:
    - file:create: delete file

metadata:
  iron_laws:
    - TEST LAW 1
`;

// =============================================================================
// Full Workflow Execution Tests
// =============================================================================

describe('Full Workflow Execution', () => {
  it('should execute a complete workflow end-to-end', async () => {
    const { WorkflowEngine } = require('../../../.claude/lib/workflow/workflow-engine.cjs');

    // Write test workflow
    const workflowPath = path.join(TEST_DIR, 'test-workflow.yaml');
    fs.writeFileSync(workflowPath, TEST_WORKFLOW_YAML);

    // Create engine
    const engine = new WorkflowEngine(workflowPath, {
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    await engine.load();

    // Register handlers for each step
    const executionOrder = [];

    engine.registerHandler('evalHandler', async _ctx => {
      executionOrder.push('evaluate');
      return { output: { confirmed: true } };
    });

    engine.registerHandler('validateHandler', async _ctx => {
      executionOrder.push('validate');
      return { output: { valid: true } };
    });

    engine.registerHandler('obtainHandler', async _ctx => {
      executionOrder.push('obtain');
      return { output: { researched: true } };
    });

    engine.registerHandler('lockHandler', async _ctx => {
      executionOrder.push('lock');
      return { output: { created: true } };
    });

    engine.registerHandler('verifyHandler', async _ctx => {
      executionOrder.push('verify');
      return { output: { verified: true } };
    });

    engine.registerHandler('enableHandler', async _ctx => {
      executionOrder.push('enable');
      return { output: { enabled: true } };
    });

    // Execute
    const result = await engine.execute({});

    // Verify execution order
    assertEqual(executionOrder.length, 6, 'Should execute 6 steps');
    assertEqual(executionOrder[0], 'evaluate', 'First phase should be evaluate');
    assertEqual(executionOrder[1], 'validate', 'Second phase should be validate');
    assertEqual(executionOrder[2], 'obtain', 'Third phase should be obtain');
    assertEqual(executionOrder[3], 'lock', 'Fourth phase should be lock');
    assertEqual(executionOrder[4], 'verify', 'Fifth phase should be verify');
    assertEqual(executionOrder[5], 'enable', 'Sixth phase should be enable');

    // Verify final state
    assertEqual(result.status, 'completed', 'Workflow should be completed');
    assertEqual(result.completedPhases.length, 6, 'Should have 6 completed phases');
  });

  it('should capture step results for gate evaluation', async () => {
    const { WorkflowEngine } = require('../../../.claude/lib/workflow/workflow-engine.cjs');

    const workflowPath = path.join(TEST_DIR, 'test-workflow.yaml');
    if (!fs.existsSync(workflowPath)) {
      fs.writeFileSync(workflowPath, TEST_WORKFLOW_YAML);
    }

    const engine = new WorkflowEngine(workflowPath, {
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    await engine.load();

    // Register handlers
    engine.registerHandler('evalHandler', async () => ({ output: { data: 'eval-data' } }));
    engine.registerHandler('validateHandler', async () => ({ output: { data: 'validate-data' } }));
    engine.registerHandler('obtainHandler', async () => ({ output: { data: 'obtain-data' } }));
    engine.registerHandler('lockHandler', async () => ({ output: { data: 'lock-data' } }));
    engine.registerHandler('verifyHandler', async () => ({ output: { data: 'verify-data' } }));
    engine.registerHandler('enableHandler', async () => ({ output: { data: 'enable-data' } }));

    const result = await engine.execute({});

    // Verify step results are captured
    assert(result.stepResults.eval_step, 'Should have eval_step result');
    assert(result.stepResults.validate_step, 'Should have validate_step result');
    assert(result.stepResults.obtain_step, 'Should have obtain_step result');
    assertEqual(
      result.stepResults.eval_step.output.data,
      'eval-data',
      'Step result should have correct data'
    );
  });

  it('should emit events during execution', async () => {
    const { WorkflowEngine } = require('../../../.claude/lib/workflow/workflow-engine.cjs');

    const workflowPath = path.join(TEST_DIR, 'test-workflow.yaml');
    const engine = new WorkflowEngine(workflowPath, {
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    await engine.load();

    // Register handlers
    engine.registerHandler('evalHandler', async () => ({ output: {} }));
    engine.registerHandler('validateHandler', async () => ({ output: {} }));
    engine.registerHandler('obtainHandler', async () => ({ output: {} }));
    engine.registerHandler('lockHandler', async () => ({ output: {} }));
    engine.registerHandler('verifyHandler', async () => ({ output: {} }));
    engine.registerHandler('enableHandler', async () => ({ output: {} }));

    // Track events
    const events = [];
    engine.on('phase:start', data => events.push({ type: 'phase:start', phase: data.phase }));
    engine.on('phase:end', data => events.push({ type: 'phase:end', phase: data.phase }));
    engine.on('step:start', data => events.push({ type: 'step:start', stepId: data.stepId }));
    engine.on('step:end', data => events.push({ type: 'step:end', stepId: data.stepId }));

    await engine.execute({});

    // Verify events were emitted
    const phaseStarts = events.filter(e => e.type === 'phase:start');
    const phaseEnds = events.filter(e => e.type === 'phase:end');
    const stepStarts = events.filter(e => e.type === 'step:start');
    const stepEnds = events.filter(e => e.type === 'step:end');

    assertEqual(phaseStarts.length, 6, 'Should have 6 phase:start events');
    assertEqual(phaseEnds.length, 6, 'Should have 6 phase:end events');
    assertEqual(stepStarts.length, 6, 'Should have 6 step:start events');
    assertEqual(stepEnds.length, 6, 'Should have 6 step:end events');
  });
});

// =============================================================================
// Cross-Workflow Triggering Tests
// =============================================================================

describe('Cross-Workflow Triggering', () => {
  it('should trigger another workflow synchronously', async () => {
    const {
      CrossWorkflowTrigger,
    } = require('../../../.claude/lib/workflow/cross-workflow-trigger.cjs');

    const trigger = new CrossWorkflowTrigger(null); // No engine, use handlers

    // Register handlers for workflows
    const executionLog = [];

    trigger.registerTriggerHandler('workflow-a', async ctx => {
      executionLog.push('workflow-a');
      return { success: true, data: ctx.input };
    });

    trigger.registerTriggerHandler('workflow-b', async ctx => {
      executionLog.push('workflow-b');
      return { success: true, data: ctx.input * 2 };
    });

    // Trigger workflow-b from workflow-a
    const result = await trigger.trigger('workflow-a', 'workflow-b', { input: 21 });

    assert(result.success, 'Should succeed');
    assertEqual(result.data, 42, 'Should return doubled input');
    assertEqual(executionLog.length, 1, 'Should execute workflow-b');
  });

  it('should detect circular triggers', async () => {
    const {
      CrossWorkflowTrigger,
    } = require('../../../.claude/lib/workflow/cross-workflow-trigger.cjs');

    const trigger = new CrossWorkflowTrigger(null);

    // Test circular detection function directly
    const chain = ['workflow-a', 'workflow-b'];
    const isCircular = trigger.detectCircularTrigger(chain, 'workflow-a');

    assert(isCircular, 'Should detect circular trigger');
  });

  it('should track trigger history', async () => {
    const {
      CrossWorkflowTrigger,
    } = require('../../../.claude/lib/workflow/cross-workflow-trigger.cjs');

    const trigger = new CrossWorkflowTrigger(null);

    trigger.registerTriggerHandler('target', async () => ({ success: true }));

    await trigger.trigger('source-1', 'target', {});
    await trigger.trigger('source-2', 'target', {});

    const history = trigger.getTriggerHistory();
    assertEqual(history.length, 2, 'Should have 2 triggers in history');

    const source1History = trigger.getTriggerHistory('source-1');
    assertEqual(source1History.length, 1, 'Should have 1 trigger from source-1');
  });

  it('should trigger multiple workflows in parallel', async () => {
    const {
      CrossWorkflowTrigger,
    } = require('../../../.claude/lib/workflow/cross-workflow-trigger.cjs');

    const trigger = new CrossWorkflowTrigger(null);
    const completionTimes = {};

    trigger.registerTriggerHandler('fast', async () => {
      completionTimes.fast = Date.now();
      return { time: 'fast' };
    });

    trigger.registerTriggerHandler('slow', async () => {
      await new Promise(r => setTimeout(r, 50));
      completionTimes.slow = Date.now();
      return { time: 'slow' };
    });

    const results = await trigger.triggerMultiple('source', [
      { workflowId: 'fast', context: {} },
      { workflowId: 'slow', context: {} },
    ]);

    assertEqual(results.length, 2, 'Should have 2 results');
    assert(
      results.every(r => r.status === 'success'),
      'All should succeed'
    );
  });
});

// =============================================================================
// Checkpoint and Resume Tests
// =============================================================================

describe('Checkpoint and Resume', () => {
  it('should save and load checkpoints', async () => {
    const { CheckpointManager } = require('../../../.claude/lib/workflow/checkpoint-manager.cjs');

    const manager = new CheckpointManager({
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    // Save checkpoint
    const state = {
      phase: 'obtain',
      stepIndex: 2,
      stepResults: { step1: { output: 'data' } },
    };

    const checkpointId = await manager.save('test-workflow', state);

    assert(checkpointId, 'Should return checkpoint ID');
    assert(checkpointId.startsWith('chk-'), 'ID should start with chk-');

    // Load checkpoint
    const loaded = await manager.load(checkpointId);

    assertEqual(loaded.phase, 'obtain', 'Should restore phase');
    assertEqual(loaded.stepIndex, 2, 'Should restore stepIndex');
    assert(loaded.stepResults.step1, 'Should restore stepResults');
  });

  it('should list checkpoints for a workflow', async () => {
    const { CheckpointManager } = require('../../../.claude/lib/workflow/checkpoint-manager.cjs');

    const manager = new CheckpointManager({
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    // Create multiple checkpoints
    await manager.save('workflow-a', { phase: 'evaluate', stepIndex: 0 });
    await manager.save('workflow-a', { phase: 'validate', stepIndex: 1 });
    await manager.save('workflow-b', { phase: 'obtain', stepIndex: 2 });

    const checkpointsA = await manager.list('workflow-a');
    const checkpointsB = await manager.list('workflow-b');

    assertEqual(checkpointsA.length, 2, 'Should have 2 checkpoints for workflow-a');
    assertEqual(checkpointsB.length, 1, 'Should have 1 checkpoint for workflow-b');
  });

  it('should get latest checkpoint for a workflow', async () => {
    const { CheckpointManager } = require('../../../.claude/lib/workflow/checkpoint-manager.cjs');

    const manager = new CheckpointManager({
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    await manager.save('workflow-c', { phase: 'evaluate', stepIndex: 0 });
    await new Promise(r => setTimeout(r, 10)); // Small delay
    await manager.save('workflow-c', { phase: 'lock', stepIndex: 3 });

    const latest = await manager.loadLatest('workflow-c');

    assertEqual(latest.phase, 'lock', 'Should get latest checkpoint');
  });

  it('should cleanup old checkpoints', async () => {
    const { CheckpointManager } = require('../../../.claude/lib/workflow/checkpoint-manager.cjs');

    const manager = new CheckpointManager({
      checkpointDir: TEST_CHECKPOINT_DIR,
      maxCount: 2,
    });

    // Create 4 checkpoints
    await manager.save('workflow-cleanup', { phase: 'evaluate', stepIndex: 0 });
    await manager.save('workflow-cleanup', { phase: 'validate', stepIndex: 1 });
    await manager.save('workflow-cleanup', { phase: 'obtain', stepIndex: 2 });
    await manager.save('workflow-cleanup', { phase: 'lock', stepIndex: 3 });

    // Cleanup
    const _result = await manager.cleanup(Infinity, 2);

    const remaining = await manager.list('workflow-cleanup');
    assertEqual(remaining.length, 2, 'Should have only 2 checkpoints after cleanup');
  });
});

// =============================================================================
// Rollback Tests
// =============================================================================

describe('Rollback Scenarios', () => {
  it('should rollback with saga coordinator', async () => {
    const { SagaCoordinator } = require('../../../.claude/lib/workflow/saga-coordinator.cjs');

    const saga = new SagaCoordinator({
      backupDir: TEST_BACKUP_DIR,
      persistLog: false,
    });

    // Begin transaction
    await saga.begin('test-workflow');

    const compensationsCalled = [];

    // Record actions
    saga.record({
      stepId: 'step1',
      type: 'test:action',
      compensate: async () => compensationsCalled.push('step1'),
    });

    saga.record({
      stepId: 'step2',
      type: 'test:action',
      compensate: async () => compensationsCalled.push('step2'),
    });

    saga.record({
      stepId: 'step3',
      type: 'test:action',
      compensate: async () => compensationsCalled.push('step3'),
    });

    // Rollback
    await saga.rollback();

    // Verify compensations called in reverse order
    assertEqual(compensationsCalled.length, 3, 'Should call 3 compensations');
    assertEqual(compensationsCalled[0], 'step3', 'First compensation should be step3');
    assertEqual(compensationsCalled[1], 'step2', 'Second compensation should be step2');
    assertEqual(compensationsCalled[2], 'step1', 'Third compensation should be step1');
  });

  it('should backup and restore files', async () => {
    const { SagaCoordinator } = require('../../../.claude/lib/workflow/saga-coordinator.cjs');

    const saga = new SagaCoordinator({
      backupDir: TEST_BACKUP_DIR,
      persistLog: false,
    });

    // Create test file
    const testFile = path.join(TEST_DIR, 'test-restore.txt');
    fs.writeFileSync(testFile, 'original content');

    await saga.begin('test-workflow');

    // Backup file
    const backupId = await saga.backup(testFile);
    assert(backupId, 'Should return backup ID');

    // Modify file
    fs.writeFileSync(testFile, 'modified content');

    // Restore
    await saga.restore(backupId);

    const restored = fs.readFileSync(testFile, 'utf-8');
    assertEqual(restored, 'original content', 'Should restore original content');
  });

  it('should continue rollback even if one compensation fails', async () => {
    const { SagaCoordinator } = require('../../../.claude/lib/workflow/saga-coordinator.cjs');

    const saga = new SagaCoordinator({
      backupDir: TEST_BACKUP_DIR,
      persistLog: false,
    });

    await saga.begin('test-workflow');

    const compensationsCalled = [];

    saga.record({
      stepId: 'step1',
      type: 'test:action',
      compensate: async () => compensationsCalled.push('step1'),
    });

    saga.record({
      stepId: 'step2',
      type: 'test:action',
      compensate: async () => {
        throw new Error('Compensation failed!');
      },
    });

    saga.record({
      stepId: 'step3',
      type: 'test:action',
      compensate: async () => compensationsCalled.push('step3'),
    });

    // Rollback (should not throw)
    await saga.rollback();

    // Should still call step1 and step3
    assertEqual(compensationsCalled.length, 2, 'Should call 2 compensations');
    assert(compensationsCalled.includes('step3'), 'Should call step3');
    assert(compensationsCalled.includes('step1'), 'Should call step1');
  });
});

// =============================================================================
// System Registration Tests
// =============================================================================

describe('System Registration', () => {
  it('should create backups before registration', async () => {
    const { SystemRegistrationHandler } = require('../integration/system-registration-handler.cjs');

    // Create test files
    const testClaudeMd = path.join(TEST_DIR, 'CLAUDE.md');
    fs.writeFileSync(
      testClaudeMd,
      '# Test\n## 3. AGENT ROUTING TABLE\n| Type | Agent | File |\n|------|-------|------|\n| Test | test | test |'
    );

    const handler = new SystemRegistrationHandler({
      basePath: TEST_DIR,
      testMode: true,
    });

    const result = await handler.registerAgent({
      name: 'new-agent',
      requestType: 'New Type',
      filePath: '.claude/agents/new-agent.md',
    });

    assert(result.backupCreated, 'Should create backup');
    assert(result.registrations.includes('claude-md'), 'Should register in CLAUDE.md');
  });

  it('should verify registration status', async () => {
    const { SystemRegistrationHandler } = require('../integration/system-registration-handler.cjs');

    const testClaudeMd = path.join(TEST_DIR, 'CLAUDE.md');
    fs.writeFileSync(testClaudeMd, '# Test\nContains existing-agent somewhere');

    const handler = new SystemRegistrationHandler({
      basePath: TEST_DIR,
      testMode: true,
    });

    const result = await handler.verifyRegistration('agent', 'existing-agent');

    assert(result.registered, 'Should find existing agent');
    assert(result.locations.includes('claude-md'), 'Should be in claude-md');
  });
});

// =============================================================================
// Evolution State Sync Tests
// =============================================================================

describe('Evolution State Sync', () => {
  it('should load and save evolution state', async () => {
    const { EvolutionStateSync } = require('../../../.claude/lib/evolution-state-sync.cjs');

    const sync = new EvolutionStateSync({
      statePath: TEST_STATE_FILE,
    });

    // Update current evolution
    await sync.updateCurrentEvolution({
      type: 'agent',
      name: 'test-agent',
      phase: 'obtain',
    });

    // Load state
    const state = await sync.loadState();

    assert(state.currentEvolution, 'Should have current evolution');
    assertEqual(state.currentEvolution.name, 'test-agent', 'Should have correct name');
    assertEqual(state.state, 'obtain', 'State should match phase');
  });

  it('should manage suggestion queue', async () => {
    const { EvolutionStateSync } = require('../../../.claude/lib/evolution-state-sync.cjs');

    const sync = new EvolutionStateSync({
      statePath: TEST_STATE_FILE,
    });

    // Add suggestions
    await sync.addSuggestion({ type: 'skill', name: 'new-skill', reason: 'Needed' });
    await sync.addSuggestion({ type: 'agent', name: 'new-agent', reason: 'Requested' });

    const pending = await sync.getPendingSuggestions();
    assertEqual(pending.length, 2, 'Should have 2 suggestions');

    // Pop first suggestion
    const first = await sync.popSuggestion();
    assertEqual(first.type, 'skill', 'Should pop first suggestion');

    const remaining = await sync.getPendingSuggestions();
    assertEqual(remaining.length, 1, 'Should have 1 remaining');
  });

  it('should record evolution history', async () => {
    const { EvolutionStateSync } = require('../../../.claude/lib/evolution-state-sync.cjs');

    const sync = new EvolutionStateSync({
      statePath: TEST_STATE_FILE,
    });

    // Record history entries
    await sync.recordHistory({
      type: 'agent',
      name: 'agent-1',
      path: '.claude/agents/agent-1.md',
    });

    await sync.recordHistory({
      type: 'skill',
      name: 'skill-1',
      path: '.claude/skills/skill-1/SKILL.md',
    });

    const history = await sync.getHistory();
    assert(history.length >= 2, 'Should have at least 2 history entries');
  });

  it('should support locking mechanism', async () => {
    const { EvolutionStateSync } = require('../../../.claude/lib/evolution-state-sync.cjs');

    const sync = new EvolutionStateSync({
      statePath: TEST_STATE_FILE,
      lockTimeout: 1000,
    });

    // First lock should succeed
    const locked1 = await sync.lock('workflow-1');
    assert(locked1, 'First lock should succeed');

    // Second lock on same workflow should fail
    const locked2 = await sync.lock('workflow-1');
    assert(!locked2, 'Second lock should fail');

    // Unlock
    await sync.unlock('workflow-1');

    // Now lock should succeed
    const locked3 = await sync.lock('workflow-1');
    assert(locked3, 'Lock after unlock should succeed');
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling and Recovery', () => {
  it('should handle step execution errors gracefully', async () => {
    const { WorkflowEngine } = require('../../../.claude/lib/workflow/workflow-engine.cjs');

    const workflowPath = path.join(TEST_DIR, 'test-workflow.yaml');
    fs.writeFileSync(workflowPath, TEST_WORKFLOW_YAML);

    const engine = new WorkflowEngine(workflowPath, {
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    await engine.load();

    // Register handlers - one will fail
    engine.registerHandler('evalHandler', async () => {
      throw new Error('Intentional failure');
    });

    let errorCaught = false;
    try {
      await engine.execute({});
    } catch (e) {
      errorCaught = true;
      assert(e.message.includes('Intentional failure'), 'Should propagate error');
    }

    assert(errorCaught, 'Should catch error');
    assertEqual(engine.state.status, 'failed', 'Status should be failed');
  });

  it('should checkpoint before risky operations', async () => {
    const { WorkflowEngine } = require('../../../.claude/lib/workflow/workflow-engine.cjs');

    const workflowPath = path.join(TEST_DIR, 'test-workflow.yaml');
    const engine = new WorkflowEngine(workflowPath, {
      checkpointDir: TEST_CHECKPOINT_DIR,
    });

    await engine.load();

    // Register handlers
    engine.registerHandler('evalHandler', async () => ({ output: {} }));
    engine.registerHandler('validateHandler', async () => ({ output: {} }));
    engine.registerHandler('obtainHandler', async () => ({ output: {} }));
    engine.registerHandler('lockHandler', async () => ({ output: {} }));
    engine.registerHandler('verifyHandler', async () => ({ output: {} }));
    engine.registerHandler('enableHandler', async () => ({ output: {} }));

    // Execute first phase
    await engine.executePhase('evaluate', {});

    // Create checkpoint using engine's own checkpoint method
    const checkpointId = await engine.checkpoint();
    assert(checkpointId, 'Should create checkpoint');

    // Verify checkpoint file exists and can be loaded
    const checkpointPath = path.join(TEST_CHECKPOINT_DIR, `${checkpointId}.json`);
    assert(fs.existsSync(checkpointPath), 'Checkpoint file should exist');

    // Verify we can resume from it
    const engine2 = new WorkflowEngine(workflowPath, {
      checkpointDir: TEST_CHECKPOINT_DIR,
    });
    await engine2.load();
    await engine2.resume(checkpointId);

    // Verify state was restored
    const state = engine2.getState();
    assert(state.completedPhases.includes('evaluate'), 'Should restore completed phases');
  });
});

// =============================================================================
// Workflow Validator Integration Tests
// =============================================================================

describe('Workflow Validation Integration', () => {
  it('should validate actual workflow files', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');

    const validator = new WorkflowValidator();
    const creatorsDir = path.join(PROJECT_ROOT, '.claude', 'workflows', 'creators');

    const results = await validator.validateAll(creatorsDir);

    assert(results.length > 0, 'Should validate at least one workflow');

    // Generate report
    const report = validator.generateReport(results);
    assert(report.includes('Workflow Validation Report'), 'Should generate report');
  });

  it('should integrate validation with CLI', async () => {
    const { WorkflowValidator } = require('../../../.claude/lib/workflow/workflow-validator.cjs');
    const { WorkflowCLI } = require('../../../.claude/lib/workflow/workflow-cli.cjs');

    const cli = new WorkflowCLI();
    const validator = new WorkflowValidator();

    // List workflows
    const workflows = await cli.listWorkflows();

    // Validate each
    for (const workflow of workflows.slice(0, 3)) {
      // Only validate first 3
      const result = await validator.validate(workflow.path);
      // Just check it doesn't crash
      assert(typeof result.valid === 'boolean', 'Should return valid boolean');
    }
  });
});

// =============================================================================
// Run Tests
// =============================================================================

async function main() {
  console.log('Workflow Integration Tests');
  console.log('==========================\n');

  // Setup
  setup();

  try {
    await runTests();
  } finally {
    // Cleanup
    cleanup();
  }

  console.log(`\n\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
