#!/usr/bin/env node
/**
 * Tests for post-completion-chain hook (Task 3.1)
 *
 * Verifies that when an agent completes via TaskUpdate(completed),
 * the hook:
 * 1. Reads workflow-state.json
 * 2. Marks the agent as complete
 * 3. Checks if all phase agents are complete
 * 4. Evaluates quality gate
 * 5. Writes phase-advance signal if gate passes
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');
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

function cleanup() {
  [WORKFLOW_STATE_FILE, PHASE_ADVANCE_FILE].forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
}

// Test 1: Pass through when TaskUpdate is not a completion
async function testPassThroughNonCompletion() {
  cleanup();
  console.log('\n=== Test: Pass through non-completion ===');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '42',
        status: 'in_progress',
      },
    },
  };

  const result = await processTaskCompletion(hookData);
  assert(Object.keys(result.result || {}).length === 0, 'Should pass through with empty output');
}

// Test 2: Pass through when no active workflow exists
async function testPassThroughNoWorkflow() {
  cleanup();
  console.log('\n=== Test: Pass through with no workflow ===');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '42',
        status: 'completed',
      },
    },
  };

  const result = await processTaskCompletion(hookData);
  assert(
    Object.keys(result.result || {}).length === 0,
    'Should pass through when no workflow exists'
  );
}

// Test 2b: Pass through when workflow-state.json is malformed/invalid
async function testPassThroughInvalidWorkflowState() {
  cleanup();
  console.log('\n=== Test: Pass through with invalid workflow state ===');

  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, '{"invalid":true}', 'utf8');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '42',
        status: 'completed',
      },
    },
  };

  const result = await processTaskCompletion(hookData);
  assert(
    Object.keys(result.result || {}).length === 0,
    'Should pass through when workflow state is invalid'
  );
}

// Test 3: Mark agent complete when TaskUpdate(completed) matches workflow agent
async function testMarkAgentComplete() {
  cleanup();
  console.log('\n=== Test: Mark agent complete ===');

  const workflowState = {
    workflowId: 'wf-test-001',
    currentPhase: 'validate',
    phases: {
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '42', status: 'in_progress' },
        },
      },
    },
  };

  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(workflowState, null, 2));

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '42',
        status: 'completed',
        metadata: {
          summary: 'Implementation complete',
          testsAdded: true,
          testsPassing: true,
        },
      },
    },
  };

  await processTaskCompletion(hookData);

  const updatedState = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  assert(
    updatedState.phases.validate.agents.developer.status === 'completed',
    'Agent status should be marked complete'
  );
  assert(
    updatedState.phases.validate.agents.developer.metadata.testsAdded === true,
    'Metadata should be preserved'
  );
}

// Test 4: Write phase-advance signal when all agents complete and gate passes
async function testPhaseAdvanceOnCompletion() {
  cleanup();
  console.log('\n=== Test: Phase advance on completion ===');

  const workflowState = {
    workflowId: 'wf-test-002',
    currentPhase: 'validate',
    phases: {
      evaluate: {
        status: 'completed',
        gate: { passed: true },
      },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '43', status: 'in_progress' },
        },
      },
      obtain: {
        status: 'pending',
      },
    },
    artifacts: {
      implementationPlan: '.claude/context/plans/test-plan.md',
    },
  };

  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(workflowState, null, 2));

  // Create dummy plan file for gate check
  const planPath = path.join(PROJECT_ROOT, workflowState.artifacts.implementationPlan);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '# Test Plan\n\n## Tasks\n\n- [x] Task 1\n');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '43',
        status: 'completed',
        metadata: {
          summary: 'Implementation complete',
          testsAdded: true,
          testsPassing: true,
        },
      },
    },
  };

  await processTaskCompletion(hookData);

  assert(fs.existsSync(PHASE_ADVANCE_FILE), 'Phase-advance signal should be created');

  if (fs.existsSync(PHASE_ADVANCE_FILE)) {
    const phaseAdvance = JSON.parse(fs.readFileSync(PHASE_ADVANCE_FILE, 'utf8'));
    assert(phaseAdvance.workflowId === 'wf-test-002', 'Workflow ID should match');
    assert(phaseAdvance.advanceTo === 'obtain', 'Should advance to obtain phase');
    assert(phaseAdvance.previousPhase === 'validate', 'Previous phase should be recorded');
    assert(phaseAdvance.gatePassed === true, 'Gate should have passed');
  }

  // Cleanup
  fs.unlinkSync(planPath);
  fs.rmSync(path.dirname(planPath), { recursive: true, force: true });
}

// Test 5: Do not advance when not all agents are complete
async function testNoAdvanceOnGateFailure() {
  cleanup();
  console.log('\n=== Test: No advance when not all agents complete ===');

  const workflowState = {
    workflowId: 'wf-test-003',
    currentPhase: 'validate',
    phases: {
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '44', status: 'in_progress' },
          qa: { taskId: '44b', status: 'in_progress' },
        },
      },
      obtain: {
        status: 'pending',
      },
    },
  };

  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(workflowState, null, 2));

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '44',
        status: 'completed',
        metadata: {
          summary: 'Implementation complete',
        },
      },
    },
  };

  await processTaskCompletion(hookData);

  assert(
    !fs.existsSync(PHASE_ADVANCE_FILE),
    'Phase-advance should NOT be created when agents remain'
  );

  const updatedState = JSON.parse(fs.readFileSync(WORKFLOW_STATE_FILE, 'utf8'));
  assert(
    updatedState.phases.validate.agents.developer.status === 'completed',
    'Completed agent should be marked complete'
  );
  assert(
    updatedState.phases.validate.agents.qa.status === 'in_progress',
    'Other agent should still be in_progress'
  );
}

// Test 6: Duplicate completion should not advance phase again
async function testDuplicateCompletionIsIdempotent() {
  cleanup();
  console.log('\n=== Test: Duplicate completion idempotency ===');

  const workflowState = {
    workflowId: 'wf-test-004',
    currentPhase: 'validate',
    phases: {
      evaluate: {
        status: 'completed',
        gate: { passed: true },
      },
      validate: {
        status: 'in_progress',
        agents: {
          developer: { taskId: '45', status: 'in_progress' },
        },
      },
      obtain: {
        status: 'pending',
      },
    },
    artifacts: {
      implementationPlan: '.claude/context/plans/test-plan-idempotent.md',
    },
  };

  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(workflowState, null, 2));

  const planPath = path.join(PROJECT_ROOT, workflowState.artifacts.implementationPlan);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '# Test Plan\n\n## Tasks\n\n- [x] Task 1\n');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '45',
        status: 'completed',
        metadata: {
          summary: 'Implementation complete',
          testsAdded: true,
          testsPassing: true,
        },
      },
    },
  };

  await processTaskCompletion(hookData);
  const firstAdvance = JSON.parse(fs.readFileSync(PHASE_ADVANCE_FILE, 'utf8'));
  const firstTimestamp = firstAdvance.timestamp;

  await processTaskCompletion(hookData);
  const secondAdvance = JSON.parse(fs.readFileSync(PHASE_ADVANCE_FILE, 'utf8'));
  const secondTimestamp = secondAdvance.timestamp;

  assert(
    firstTimestamp === secondTimestamp,
    'Duplicate completion should not rewrite phase-advance'
  );

  fs.unlinkSync(planPath);
  fs.rmSync(path.dirname(planPath), { recursive: true, force: true });
}

// Run all tests
async function runTests() {
  console.log('\n========================================');
  console.log('Post-Completion Chain Hook Tests');
  console.log('========================================');

  try {
    await testPassThroughNonCompletion();
    await testPassThroughNoWorkflow();
    await testPassThroughInvalidWorkflowState();
    await testMarkAgentComplete();
    await testPhaseAdvanceOnCompletion();
    await testNoAdvanceOnGateFailure();
    await testDuplicateCompletionIsIdempotent();

    console.log('\n========================================');
    console.log(`Tests Passed: ${testsPass}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('========================================\n');

    cleanup();

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nTest execution error:', error.message);
    console.error(error.stack);
    cleanup();
    process.exit(1);
  }
}

runTests();
