#!/usr/bin/env node
/**
 * Tests for post-completion-chain metadata preservation
 *
 * Verifies that when a TaskUpdate(completed) contains delivery metadata,
 * the hook preserves it in the workflow state and advances the phase correctly.
 *
 * Test scenarios:
 * 1. Metadata with delivery counts is preserved in workflow state
 * 2. Metadata without delivery counts is preserved in workflow state
 * 3. Agent completion records completedAt timestamp
 * 4. Phase advances correctly after single-agent completion
 * 5. Non-blocking - hook exits 0 even on errors
 * 6. Multiple completions preserve all agent metadata independently
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
  processTaskCompletion,
  WORKFLOW_STATE_FILE,
  PHASE_ADVANCE_FILE,
} = require('../../.claude/hooks/workflow/post-completion-chain.cjs');

// Test utilities
let testsFailed = 0;
let testsPass = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    testsFailed++;
    return false;
  }
  console.log(`PASS: ${message}`);
  testsPass++;
  return true;
}

function cleanupWorkflow() {
  [WORKFLOW_STATE_FILE, PHASE_ADVANCE_FILE].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
}

function setupWorkflow(workflowState) {
  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(workflowState, null, 2));
}

// ─── Test 1: Metadata with delivery counts is preserved ──────────────────────
async function testMetadataWithDeliveryCounts() {
  cleanupWorkflow();
  console.log('\n=== Test 1: Metadata with delivery counts preserved ===');

  setupWorkflow({
    workflowId: 'wf-signal-test',
    currentPhase: 'validate',
    phases: {
      evaluate: { status: 'completed', gate: { passed: true } },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '50', status: 'in_progress' },
        },
      },
      obtain: { status: 'pending' },
    },
  });

  await processTaskCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '50',
        status: 'completed',
        metadata: {
          summary: 'Partial delivery',
          deliveredCount: 1,
          requestedCount: 4,
        },
      },
    },
  });

  const state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  const agentData = state.phases.validate.agents.developer;
  assert(agentData.status === 'completed', 'Agent should be marked completed');
  assert(agentData.metadata.deliveredCount === 1, 'deliveredCount should be preserved');
  assert(agentData.metadata.requestedCount === 4, 'requestedCount should be preserved');
  assert(agentData.metadata.summary === 'Partial delivery', 'summary should be preserved');
}

// ─── Test 2: Metadata without delivery counts is preserved ───────────────────
async function testMetadataWithoutDeliveryCounts() {
  cleanupWorkflow();
  console.log('\n=== Test 2: Metadata without delivery counts preserved ===');

  setupWorkflow({
    workflowId: 'wf-signal-test',
    currentPhase: 'validate',
    phases: {
      evaluate: { status: 'completed', gate: { passed: true } },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '50', status: 'in_progress' },
        },
      },
      obtain: { status: 'pending' },
    },
  });

  await processTaskCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '50',
        status: 'completed',
        metadata: {
          summary: 'Done',
          filesModified: ['src/foo.ts'],
        },
      },
    },
  });

  const state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  const agentData = state.phases.validate.agents.developer;
  assert(agentData.status === 'completed', 'Agent should be marked completed');
  assert(
    Array.isArray(agentData.metadata.filesModified),
    'filesModified should be preserved as array'
  );
}

// ─── Test 3: completedAt timestamp is recorded ───────────────────────────────
async function testCompletedAtTimestamp() {
  cleanupWorkflow();
  console.log('\n=== Test 3: completedAt timestamp recorded ===');

  setupWorkflow({
    workflowId: 'wf-signal-test',
    currentPhase: 'validate',
    phases: {
      evaluate: { status: 'completed', gate: { passed: true } },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '51', status: 'in_progress' },
        },
      },
      obtain: { status: 'pending' },
    },
  });

  await processTaskCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '51',
        status: 'completed',
        metadata: { summary: 'Done' },
      },
    },
  });

  const state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  const agentData = state.phases.validate.agents.developer;
  assert(typeof agentData.completedAt === 'string', 'completedAt should be a string timestamp');
  assert(!isNaN(Date.parse(agentData.completedAt)), 'completedAt should be a valid ISO date');
}

// ─── Test 4: Phase advances correctly after single-agent completion ──────────
async function testPhaseAdvancesOnCompletion() {
  cleanupWorkflow();
  console.log('\n=== Test 4: Phase advances on completion ===');

  setupWorkflow({
    workflowId: 'wf-signal-test',
    currentPhase: 'validate',
    phases: {
      evaluate: { status: 'completed', gate: { passed: true } },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '52', status: 'in_progress' },
        },
      },
      obtain: { status: 'pending' },
    },
  });

  await processTaskCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '52',
        status: 'completed',
        metadata: { summary: 'All 4 items delivered', deliveredCount: 4, requestedCount: 4 },
      },
    },
  });

  const state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  assert(state.currentPhase === 'obtain', 'Current phase should advance to obtain');
  assert(state.phases.validate.status === 'completed', 'Validate phase should be completed');
  assert(fs.existsSync(PHASE_ADVANCE_FILE), 'Phase advance signal should exist');
}

// ─── Test 5: Non-blocking — hook must not crash and must return result ────────
async function testNonBlocking() {
  cleanupWorkflow();
  console.log('\n=== Test 5: Non-blocking ===');

  // Write invalid JSON to workflow state
  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, '{corrupted-json', 'utf8');

  let threw = false;
  try {
    await processTaskCompletion({
      toolUse: {
        tool: 'TaskUpdate',
        input: {
          taskId: '50',
          status: 'completed',
          metadata: { summary: 'Partial', deliveredCount: 1, requestedCount: 4 },
        },
      },
    });
  } catch (_e) {
    threw = true;
  }

  assert(!threw, 'Hook must not throw even on invalid workflow state');
}

// ─── Test 6: Multiple completions preserve all agent metadata ─────────────────
async function testMultipleCompletionsPreserveMetadata() {
  cleanupWorkflow();
  console.log('\n=== Test 6: Multiple completions preserve metadata ===');

  setupWorkflow({
    workflowId: 'wf-signal-test',
    currentPhase: 'validate',
    phases: {
      evaluate: { status: 'completed', gate: { passed: true } },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '60', status: 'in_progress' },
          qa: { taskId: '61', status: 'in_progress' },
        },
      },
      obtain: { status: 'pending' },
    },
  });

  // First agent completes
  await processTaskCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '60',
        status: 'completed',
        metadata: { summary: 'Dev done', deliveredCount: 3, requestedCount: 3 },
      },
    },
  });

  let state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  assert(
    state.phases.validate.agents.developer.status === 'completed',
    'First agent should be completed'
  );
  assert(
    state.phases.validate.agents.qa.status === 'in_progress',
    'Second agent should still be in_progress'
  );
  assert(!fs.existsSync(PHASE_ADVANCE_FILE), 'Phase should NOT advance with agents remaining');

  // Second agent completes
  await processTaskCompletion({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '61',
        status: 'completed',
        metadata: { summary: 'QA done', testsPassing: true },
      },
    },
  });

  state = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  assert(
    state.phases.validate.agents.developer.metadata.deliveredCount === 3,
    'First agent metadata should be preserved after second completion'
  );
  assert(
    state.phases.validate.agents.qa.metadata.testsPassing === true,
    'Second agent metadata should be preserved'
  );
  assert(state.currentPhase === 'obtain', 'Phase should advance after all agents complete');
}

// ─── Run all tests ───────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n========================================');
  console.log('Post-Completion Chain — Metadata Preservation Tests');
  console.log('========================================');

  try {
    await testMetadataWithDeliveryCounts();
    await testMetadataWithoutDeliveryCounts();
    await testCompletedAtTimestamp();
    await testPhaseAdvancesOnCompletion();
    await testNonBlocking();
    await testMultipleCompletionsPreserveMetadata();

    console.log('\n========================================');
    console.log(`Tests Passed: ${testsPass}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('========================================\n');

    cleanupWorkflow();

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nTest execution error:', error.message);
    console.error(error.stack);
    cleanupWorkflow();
    process.exit(1);
  }
}

runTests();
