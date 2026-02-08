/**
 * Integration Example: Complexity Classifier + Workflow State Manager
 * =====================================================================
 *
 * Demonstrates how the two modules work together in a typical workflow.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { describe, it, beforeEach, afterEach } = require('node:test');

const { classifyRequest } = require(
  path.join(__dirname, '../../../.claude/lib/workflow/complexity-classifier.cjs')
);
const {
  createWorkflow,
  getActiveWorkflow,
  advancePhase,
  recordAgent,
  markAgentComplete,
  evaluateGate,
  completeWorkflow,
  getPhaseArtifacts,
} = require(path.join(__dirname, '../../../.claude/lib/workflow/workflow-state-manager.cjs'));

const TEST_STATE_FILE = path.join(
  __dirname,
  '../../../.claude/context/runtime/test-integration-workflow.json'
);

describe('Integration: Complexity Classifier + Workflow State Manager', () => {
  beforeEach(() => {
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  it('should execute a MEDIUM complexity workflow end-to-end', () => {
    // Step 1: Router classifies request
    const userRequest = 'refactor authentication module';
    const classification = classifyRequest(userRequest);

    assert.strictEqual(classification.complexity, 'MEDIUM');
    assert.strictEqual(classification.risk, 'HIGH'); // auth is high risk
    assert.deepStrictEqual(classification.phasePath, [
      'PHASE_0_TRIAGE',
      'PHASE_1_DESIGN',
      'PHASE_2_IMPLEMENT',
      'PHASE_3_REVIEW',
      'PHASE_4_DEPLOY',
      'PHASE_5_DOCUMENT',
    ]);

    // Step 2: Router creates workflow
    const workflowId = createWorkflow(userRequest, classification.complexity, TEST_STATE_FILE);
    assert.ok(workflowId.startsWith('wf-'));

    // Step 3: Router advances to PHASE_1_DESIGN and spawns agents
    advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
    recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '101', TEST_STATE_FILE);
    recordAgent(workflowId, 'PHASE_1_DESIGN', 'architect', '102', TEST_STATE_FILE);

    // Step 4: Agents complete their work
    markAgentComplete(
      workflowId,
      'PHASE_1_DESIGN',
      'planner',
      {
        artifacts: ['.claude/context/plans/auth-refactor-impl-plan.md'],
      },
      TEST_STATE_FILE
    );

    markAgentComplete(
      workflowId,
      'PHASE_1_DESIGN',
      'architect',
      {
        artifacts: ['.claude/context/plans/auth-refactor-design.md'],
      },
      TEST_STATE_FILE
    );

    // Step 5: Evaluate quality gate
    const gate1 = evaluateGate(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
    assert.strictEqual(gate1.passed, true);

    // Step 6: Advance to PHASE_2_IMPLEMENT
    advancePhase(workflowId, 'PHASE_2_IMPLEMENT', TEST_STATE_FILE);

    // Get artifacts from previous phase
    const artifacts = getPhaseArtifacts(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
    assert.strictEqual(artifacts.length, 2);
    assert.ok(artifacts.includes('.claude/context/plans/auth-refactor-impl-plan.md'));

    // Step 7: Developer implements
    recordAgent(workflowId, 'PHASE_2_IMPLEMENT', 'developer', '103', TEST_STATE_FILE);
    markAgentComplete(
      workflowId,
      'PHASE_2_IMPLEMENT',
      'developer',
      {
        filesModified: ['src/auth/auth.service.ts', 'src/auth/auth.controller.ts'],
        testsAdded: true,
        testsPassing: true,
      },
      TEST_STATE_FILE
    );

    // Step 8: Evaluate gate 2
    const gate2 = evaluateGate(workflowId, 'PHASE_2_IMPLEMENT', TEST_STATE_FILE);
    assert.strictEqual(gate2.passed, true);

    // Step 9: Complete workflow (simplified - skip remaining phases for test)
    completeWorkflow(workflowId, TEST_STATE_FILE);

    // Step 10: Verify workflow is no longer active
    const activeWorkflow = getActiveWorkflow(TEST_STATE_FILE);
    assert.strictEqual(activeWorkflow, null);
  });

  it('should handle HIGH complexity workflow with security review', () => {
    // Router classifies "add OAuth2" as HIGH complexity, HIGH risk
    const classification = classifyRequest('add OAuth2 authentication');

    assert.strictEqual(classification.complexity, 'HIGH');
    assert.strictEqual(classification.risk, 'HIGH');

    // Should include all phases including PHASE_6_REFLECT
    assert.ok(classification.phasePath.includes('PHASE_6_REFLECT'));

    // Create workflow
    const workflowId = createWorkflow(
      'add OAuth2 authentication',
      classification.complexity,
      TEST_STATE_FILE
    );

    // Advance to PHASE_1_DESIGN with security-architect
    advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
    recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '201', TEST_STATE_FILE);
    recordAgent(workflowId, 'PHASE_1_DESIGN', 'architect', '202', TEST_STATE_FILE);
    recordAgent(workflowId, 'PHASE_1_DESIGN', 'security-architect', '203', TEST_STATE_FILE);

    // Security architect completes threat model
    markAgentComplete(
      workflowId,
      'PHASE_1_DESIGN',
      'security-architect',
      {
        artifacts: ['.claude/context/reports/security/oauth2-threat-model.md'],
      },
      TEST_STATE_FILE
    );

    // Other agents complete
    markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'planner', {}, TEST_STATE_FILE);
    markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'architect', {}, TEST_STATE_FILE);

    // Gate should pass
    const gate = evaluateGate(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
    assert.strictEqual(gate.passed, true);

    // Verify security artifact was recorded
    const artifacts = getPhaseArtifacts(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
    assert.ok(artifacts.includes('.claude/context/reports/security/oauth2-threat-model.md'));
  });

  it('should handle TRIVIAL complexity with minimal phases', () => {
    // TRIVIAL complexity skips most phases
    const classification = classifyRequest('fix typo in README');

    assert.strictEqual(classification.complexity, 'TRIVIAL');
    assert.deepStrictEqual(classification.phasePath, [
      'PHASE_0_TRIAGE',
      'PHASE_2_IMPLEMENT',
      'PHASE_4_DEPLOY',
    ]);

    // Only 3 phases for TRIVIAL (no design, no review, no documentation, no reflection)
    assert.strictEqual(classification.phasePath.length, 3);
  });
});
