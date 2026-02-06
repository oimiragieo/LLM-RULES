/**
 * Workflow State Manager Tests
 * ==============================
 *
 * Tests for workflow state management logic.
 * Based on enterprise-orchestration-plan-2026-02-06.md Task 2.1
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { describe, it, beforeEach, afterEach } = require('node:test');

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

// Test state file path
const TEST_STATE_FILE = path.join(__dirname, '../../../.claude/context/runtime/test-workflow-state.json');

describe('WorkflowStateManager', () => {
  beforeEach(() => {
    // Clean up test state file before each test
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  afterEach(() => {
    // Clean up after each test
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  describe('createWorkflow', () => {
    it('should create a new workflow with TRIVIAL complexity', () => {
      const workflowId = createWorkflow('fix typo in README', 'TRIVIAL', TEST_STATE_FILE);

      assert.ok(workflowId.startsWith('wf-'));
      assert.ok(fs.existsSync(TEST_STATE_FILE));

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.strictEqual(state.workflowId, workflowId);
      assert.strictEqual(state.requestSummary, 'fix typo in README');
      assert.strictEqual(state.complexity, 'TRIVIAL');
      assert.strictEqual(state.currentPhase, 'PHASE_0_TRIAGE');
    });

    it('should create a new workflow with HIGH complexity', () => {
      createWorkflow('Add OAuth2 authentication', 'HIGH', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.strictEqual(state.complexity, 'HIGH');
      assert.strictEqual(state.currentPhase, 'PHASE_0_TRIAGE');
    });

    it('should initialize all phases', () => {
      createWorkflow('test request', 'MEDIUM', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.ok(state.phases);
      assert.ok(state.phases.PHASE_0_TRIAGE);
      assert.ok(state.phases.PHASE_1_DESIGN);
      assert.ok(state.phases.PHASE_2_IMPLEMENT);
    });

    it('should set createdAt and updatedAt timestamps', () => {
      createWorkflow('test', 'LOW', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.ok(state.createdAt);
      assert.ok(state.updatedAt);
      assert.ok(new Date(state.createdAt).getTime() > 0);
    });
  });

  describe('getActiveWorkflow', () => {
    it('should return null when no workflow exists', () => {
      const workflow = getActiveWorkflow(TEST_STATE_FILE);
      assert.strictEqual(workflow, null);
    });

    it('should return the active workflow', () => {
      const workflowId = createWorkflow('test request', 'LOW', TEST_STATE_FILE);

      const workflow = getActiveWorkflow(TEST_STATE_FILE);
      assert.ok(workflow);
      assert.strictEqual(workflow.workflowId, workflowId);
      assert.strictEqual(workflow.requestSummary, 'test request');
    });

    it('should return null if workflow is completed', () => {
      const workflowId = createWorkflow('test', 'LOW', TEST_STATE_FILE);
      completeWorkflow(workflowId, TEST_STATE_FILE);

      const workflow = getActiveWorkflow(TEST_STATE_FILE);
      assert.strictEqual(workflow, null);
    });
  });

  describe('advancePhase', () => {
    it('should advance from PHASE_0_TRIAGE to PHASE_1_DESIGN', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);

      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.strictEqual(state.currentPhase, 'PHASE_1_DESIGN');
      assert.strictEqual(state.phases.PHASE_0_TRIAGE.status, 'completed');
      assert.ok(state.phases.PHASE_0_TRIAGE.completedAt);
    });

    it('should update updatedAt timestamp', async () => {
      const workflowId = createWorkflow('test', 'MEDIUM', TEST_STATE_FILE);

      const before = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8')).updatedAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      const after = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8')).updatedAt;
      assert.notStrictEqual(before, after);
    });

    it('should set new phase status to in_progress', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.strictEqual(state.phases.PHASE_1_DESIGN.status, 'in_progress');
    });
  });

  describe('recordAgent', () => {
    it('should record an agent in a phase', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '42', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.ok(state.phases.PHASE_1_DESIGN.agents);
      assert.ok(state.phases.PHASE_1_DESIGN.agents.planner);
      assert.strictEqual(state.phases.PHASE_1_DESIGN.agents.planner.taskId, '42');
      assert.strictEqual(state.phases.PHASE_1_DESIGN.agents.planner.status, 'in_progress');
    });

    it('should set startedAt timestamp', () => {
      const workflowId = createWorkflow('test', 'MEDIUM', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_2_IMPLEMENT', TEST_STATE_FILE);

      recordAgent(workflowId, 'PHASE_2_IMPLEMENT', 'developer', '99', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.ok(state.phases.PHASE_2_IMPLEMENT.agents.developer.startedAt);
    });
  });

  describe('markAgentComplete', () => {
    it('should mark an agent as completed', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '42', TEST_STATE_FILE);

      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'planner', { plan: 'done' }, TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.strictEqual(state.phases.PHASE_1_DESIGN.agents.planner.status, 'completed');
      assert.ok(state.phases.PHASE_1_DESIGN.agents.planner.completedAt);
      assert.deepStrictEqual(state.phases.PHASE_1_DESIGN.agents.planner.metadata, { plan: 'done' });
    });

    it('should store artifacts if provided', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'architect', '50', TEST_STATE_FILE);

      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'architect', {
        artifacts: ['.claude/context/plans/test-design.md']
      }, TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.deepStrictEqual(state.phases.PHASE_1_DESIGN.agents.architect.artifacts, [
        '.claude/context/plans/test-design.md'
      ]);
    });
  });

  describe('evaluateGate', () => {
    it('should pass gate when all agents completed (Phase 1)', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '1', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'architect', '2', TEST_STATE_FILE);
      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'planner', { plan: 'done' }, TEST_STATE_FILE);
      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'architect', { design: 'done' }, TEST_STATE_FILE);

      const result = evaluateGate(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      assert.strictEqual(result.passed, true);
      assert.ok(Array.isArray(result.checks));
    });

    it('should fail gate when agents not completed', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '1', TEST_STATE_FILE);
      // Don't mark as complete

      const result = evaluateGate(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      assert.strictEqual(result.passed, false);
      assert.ok(result.failedChecks.length > 0);
    });

    it('should record gate evaluation results', () => {
      const workflowId = createWorkflow('test', 'MEDIUM', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '1', TEST_STATE_FILE);
      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'planner', {}, TEST_STATE_FILE);

      evaluateGate(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.ok(state.phases.PHASE_1_DESIGN.gate);
      assert.strictEqual(state.phases.PHASE_1_DESIGN.gate.passed, true);
      assert.ok(state.phases.PHASE_1_DESIGN.gate.checkedAt);
    });
  });

  describe('completeWorkflow', () => {
    it('should mark workflow as COMPLETE', () => {
      const workflowId = createWorkflow('test', 'TRIVIAL', TEST_STATE_FILE);

      completeWorkflow(workflowId, TEST_STATE_FILE);

      const state = JSON.parse(fs.readFileSync(TEST_STATE_FILE, 'utf8'));
      assert.strictEqual(state.currentPhase, 'COMPLETE');
      assert.ok(state.completedAt);
    });

    it('should not be returned by getActiveWorkflow after completion', () => {
      const workflowId = createWorkflow('test', 'LOW', TEST_STATE_FILE);
      completeWorkflow(workflowId, TEST_STATE_FILE);

      const workflow = getActiveWorkflow(TEST_STATE_FILE);
      assert.strictEqual(workflow, null);
    });
  });

  describe('getPhaseArtifacts', () => {
    it('should return artifacts from all agents in a phase', () => {
      const workflowId = createWorkflow('test', 'HIGH', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'planner', '1', TEST_STATE_FILE);
      recordAgent(workflowId, 'PHASE_1_DESIGN', 'architect', '2', TEST_STATE_FILE);
      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'planner', {
        artifacts: ['.claude/context/plans/impl-plan.md']
      }, TEST_STATE_FILE);
      markAgentComplete(workflowId, 'PHASE_1_DESIGN', 'architect', {
        artifacts: ['.claude/context/plans/design.md']
      }, TEST_STATE_FILE);

      const artifacts = getPhaseArtifacts(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      assert.ok(Array.isArray(artifacts));
      assert.strictEqual(artifacts.length, 2);
      assert.ok(artifacts.includes('.claude/context/plans/impl-plan.md'));
      assert.ok(artifacts.includes('.claude/context/plans/design.md'));
    });

    it('should return empty array if no artifacts', () => {
      const workflowId = createWorkflow('test', 'LOW', TEST_STATE_FILE);
      advancePhase(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      const artifacts = getPhaseArtifacts(workflowId, 'PHASE_1_DESIGN', TEST_STATE_FILE);

      assert.deepStrictEqual(artifacts, []);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing state file gracefully', () => {
      const workflow = getActiveWorkflow('/nonexistent/path/state.json');
      assert.strictEqual(workflow, null);
    });

    it('should handle corrupted state file', () => {
      fs.writeFileSync(TEST_STATE_FILE, 'invalid json');

      const workflow = getActiveWorkflow(TEST_STATE_FILE);
      assert.strictEqual(workflow, null);
    });
  });
});
