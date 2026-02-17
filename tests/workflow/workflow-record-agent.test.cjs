/**
 * Tests: recordAgent wiring for workflow phase advance (Task 24)
 * ==============================================================
 *
 * Test 1 – recordAgentForCurrentPhaseIfActive on Task spawn:
 *   - Setup temp workflow-state.json with currentPhase: 'PHASE_1_DESIGN', agents = {}
 *   - Call recordAgentForCurrentPhaseIfActive with agentType/taskId
 *   - Assert: agents.planner exists and taskId matches
 *
 * Test 2 – phase advance on TaskUpdate(completed):
 *   - Setup temp workflow-state with in_progress agent
 *   - Call processTaskCompletion from post-completion-chain
 *   - Assert: currentPhase advances or phase-advance file written
 *
 * Test 3 – no workflow file / currentPhase COMPLETE → no side effect
 */

'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Helper to create a temp directory and return cleanup fn
function makeTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-'));
  return {
    dir: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {
        // ignore cleanup errors
      }
    },
  };
}

// Helper to write a minimal workflow state file
function writeWorkflowState(filePath, overrides = {}) {
  const base = {
    workflowId: 'wf-test-001',
    requestSummary: 'test',
    complexity: 'LOW',
    currentPhase: 'PHASE_1_DESIGN',
    phases: {
      PHASE_0_TRIAGE: { status: 'completed', agents: {}, gate: null },
      PHASE_1_DESIGN: { status: 'in_progress', agents: {}, gate: null },
      PHASE_2_IMPLEMENT: { status: 'pending', agents: {}, gate: null },
      PHASE_3_REVIEW: { status: 'pending', agents: {}, gate: null },
      PHASE_4_DEPLOY: { status: 'pending', agents: {}, gate: null },
      PHASE_5_DOCUMENT: { status: 'pending', agents: {}, gate: null },
      PHASE_6_REFLECT: { status: 'pending', agents: {}, gate: null },
    },
    artifacts: {},
    skippedPhases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Deep merge phases overrides
  const state = Object.assign({}, base, overrides);
  if (overrides.phases) {
    state.phases = Object.assign({}, base.phases, overrides.phases);
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  return state;
}

describe('recordAgentForCurrentPhaseIfActive', () => {
  let tmp;
  let stateFile;

  beforeEach(() => {
    tmp = makeTempDir();
    stateFile = path.join(tmp.dir, 'workflow-state.json');
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it('Test 1: records agent in current phase when workflow is active', () => {
    // Arrange: create workflow in PHASE_1_DESIGN with empty agents
    writeWorkflowState(stateFile);

    // Act: call the helper
    const { recordAgentForCurrentPhaseIfActive } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-record-agent.cjs`
    );

    recordAgentForCurrentPhaseIfActive(
      PROJECT_ROOT,
      { taskId: 'task-p0-1', agentType: 'planner' },
      stateFile
    );

    // Assert
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.ok(
      saved.phases.PHASE_1_DESIGN.agents.planner,
      'planner agent should exist in PHASE_1_DESIGN'
    );
    assert.strictEqual(
      saved.phases.PHASE_1_DESIGN.agents.planner.taskId,
      'task-p0-1',
      'taskId should match'
    );
    assert.strictEqual(
      saved.phases.PHASE_1_DESIGN.agents.planner.status,
      'in_progress',
      'status should be in_progress'
    );
  });

  it('Test 3a: does nothing when no workflow state file exists', () => {
    // Arrange: no state file
    const nonExistent = path.join(tmp.dir, 'no-file.json');

    // Act + Assert: should not throw
    const { recordAgentForCurrentPhaseIfActive } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-record-agent.cjs`
    );

    assert.doesNotThrow(() => {
      recordAgentForCurrentPhaseIfActive(
        PROJECT_ROOT,
        { taskId: 'task-x', agentType: 'developer' },
        nonExistent
      );
    });

    // File should still not exist (or not be created)
    assert.ok(
      !fs.existsSync(nonExistent) ||
        JSON.parse(fs.readFileSync(nonExistent, 'utf8'))?.phases?.PHASE_1_DESIGN?.agents
          ?.developer === undefined,
      'should not create a workflow state file or record agent'
    );
  });

  it('Test 3b: does nothing when currentPhase is COMPLETE', () => {
    // Arrange: workflow in COMPLETE state
    writeWorkflowState(stateFile, { currentPhase: 'COMPLETE' });
    const _originalContent = fs.readFileSync(stateFile, 'utf8');

    // Act
    const { recordAgentForCurrentPhaseIfActive } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-record-agent.cjs`
    );

    recordAgentForCurrentPhaseIfActive(
      PROJECT_ROOT,
      { taskId: 'task-y', agentType: 'developer' },
      stateFile
    );

    // Assert: file unchanged (no agents recorded)
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    // No phases should have 'developer' agent recorded
    const anyAgentRecorded = Object.values(saved.phases || {}).some(
      phase => phase.agents && phase.agents.developer
    );
    assert.ok(!anyAgentRecorded, 'no agent should be recorded when workflow is COMPLETE');
  });

  it('Test 3c: does nothing when currentPhase is PHASE_0_TRIAGE', () => {
    // Arrange: workflow in PHASE_0_TRIAGE
    writeWorkflowState(stateFile, { currentPhase: 'PHASE_0_TRIAGE' });

    // Act
    const { recordAgentForCurrentPhaseIfActive } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-record-agent.cjs`
    );

    recordAgentForCurrentPhaseIfActive(
      PROJECT_ROOT,
      { taskId: 'task-z', agentType: 'planner' },
      stateFile
    );

    // Assert: PHASE_0_TRIAGE agents still empty
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.deepStrictEqual(
      saved.phases.PHASE_0_TRIAGE.agents,
      {},
      'PHASE_0_TRIAGE agents should remain empty'
    );
  });
});

describe('processTaskCompletion with phase advance', () => {
  let tmp;
  let stateFile;
  let phaseAdvanceFile;
  let savedEnv;

  beforeEach(() => {
    tmp = makeTempDir();
    stateFile = path.join(tmp.dir, 'workflow-state.json');
    phaseAdvanceFile = path.join(tmp.dir, 'phase-advance.json');

    // Override env vars so post-completion-chain uses our temp files
    savedEnv = {
      WORKFLOW_STATE_FILE: process.env.WORKFLOW_STATE_FILE,
      PHASE_ADVANCE_FILE: process.env.PHASE_ADVANCE_FILE,
    };
    process.env.WORKFLOW_STATE_FILE = stateFile;
    process.env.PHASE_ADVANCE_FILE = phaseAdvanceFile;
  });

  afterEach(() => {
    // Restore env vars
    if (savedEnv.WORKFLOW_STATE_FILE === undefined) {
      delete process.env.WORKFLOW_STATE_FILE;
    } else {
      process.env.WORKFLOW_STATE_FILE = savedEnv.WORKFLOW_STATE_FILE;
    }
    if (savedEnv.PHASE_ADVANCE_FILE === undefined) {
      delete process.env.PHASE_ADVANCE_FILE;
    } else {
      process.env.PHASE_ADVANCE_FILE = savedEnv.PHASE_ADVANCE_FILE;
    }
    tmp.cleanup();
  });

  it('Test 2: phase advances to PHASE_2_IMPLEMENT when PHASE_1_DESIGN agent completes', async () => {
    // Arrange: workflow with planner agent in PHASE_1_DESIGN
    writeWorkflowState(stateFile, {
      currentPhase: 'PHASE_1_DESIGN',
      phases: {
        PHASE_1_DESIGN: {
          status: 'in_progress',
          agents: {
            planner: {
              taskId: 'task-p0-1',
              status: 'in_progress',
              startedAt: new Date().toISOString(),
              completedAt: null,
              artifacts: [],
              metadata: {},
            },
          },
          gate: null,
        },
      },
    });

    // Build a fake PostToolUse hook input for TaskUpdate completed
    const hookData = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-p0-1',
        status: 'completed',
      },
    };

    // Delete the cached module so env vars take effect
    const chainPath = require.resolve(
      `${PROJECT_ROOT}/.claude/hooks/workflow/post-completion-chain.cjs`
    );
    delete require.cache[chainPath];

    const { processTaskCompletion } = require(chainPath);

    // Act
    await processTaskCompletion(hookData);

    // Assert: currentPhase should advance to PHASE_2_IMPLEMENT
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(
      saved.currentPhase,
      'PHASE_2_IMPLEMENT',
      'currentPhase should advance to PHASE_2_IMPLEMENT'
    );
  });
});
