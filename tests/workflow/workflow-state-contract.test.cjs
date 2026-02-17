/**
 * Tests: Workflow state schema round-trip (Task 25)
 * ==================================================
 *
 * Test 1 – Schema round-trip:
 *   - Build a valid workflow state object (as createWorkflow does)
 *   - Write it with atomicWriteJSONSync to a temp file
 *   - Read back with readWorkflowStateFile
 *   - Assert returned object has expected workflowId, currentPhase, phases
 *
 * Test 2 – Phase advance on completion:
 *   - Set up temp workflow-state with in_progress agent
 *   - Call processTaskCompletion for a completion that matches an agent
 *   - Assert phase advances (currentPhase changes) and phase-advance file is written
 */

'use strict';

const assert = require('node:assert');
const { describe, it, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-contract-test-'));
  return {
    dir: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_err) {
        // ignore cleanup errors
      }
    },
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('workflow-state-contract: schema round-trip', () => {
  let tmp;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it('Test 1: createWorkflow writes a state that readWorkflowStateFile can read back', () => {
    const stateFile = path.join(tmp.dir, 'workflow-state.json');

    // Use createWorkflow to produce a valid state
    const { createWorkflow } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-state-manager.cjs`
    );
    const { readWorkflowStateFile } = require(
      `${PROJECT_ROOT}/.claude/lib/runtime/state-contracts.cjs`
    );

    const workflowId = createWorkflow('round-trip test', 'LOW', stateFile);

    // File should exist
    assert.ok(fs.existsSync(stateFile), 'state file should be created by createWorkflow');

    // Read back through readWorkflowStateFile (goes through AJV schema validation)
    const state = readWorkflowStateFile(stateFile, null);

    // Should not be null (schema validation must pass)
    assert.ok(
      state !== null,
      'readWorkflowStateFile should return non-null (schema validation passed)'
    );

    // Core required fields per schema: workflowId, currentPhase, phases
    assert.strictEqual(state.workflowId, workflowId, 'workflowId should match');
    assert.strictEqual(typeof state.currentPhase, 'string', 'currentPhase should be a string');
    assert.ok(state.currentPhase.length > 0, 'currentPhase should not be empty');
    assert.ok(
      state.phases && typeof state.phases === 'object' && !Array.isArray(state.phases),
      'phases should be an object'
    );
    assert.ok(
      Object.keys(state.phases).length >= 1,
      'phases should have at least one entry (schema minProperties: 1)'
    );
  });

  it('Test 1b: state written by createWorkflow passes schema: required fields present', () => {
    const stateFile = path.join(tmp.dir, 'workflow-state-b.json');

    const { createWorkflow } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-state-manager.cjs`
    );
    const { readWorkflowStateFile } = require(
      `${PROJECT_ROOT}/.claude/lib/runtime/state-contracts.cjs`
    );

    createWorkflow('complexity test', 'MEDIUM', stateFile);

    const state = readWorkflowStateFile(stateFile, null);
    assert.ok(state !== null, 'schema validation must pass after createWorkflow writes the file');

    // All seven phases should be present
    const expectedPhases = [
      'PHASE_0_TRIAGE',
      'PHASE_1_DESIGN',
      'PHASE_2_IMPLEMENT',
      'PHASE_3_REVIEW',
      'PHASE_4_DEPLOY',
      'PHASE_5_DOCUMENT',
      'PHASE_6_REFLECT',
    ];
    for (const phase of expectedPhases) {
      assert.ok(state.phases[phase], `phases should contain ${phase}`);
    }
  });
});

describe('workflow-state-contract: phase advance on agent completion', () => {
  let tmp;
  let stateFile;
  let phaseAdvanceFile;
  let savedEnv;

  beforeEach(() => {
    tmp = makeTempDir();
    stateFile = path.join(tmp.dir, 'workflow-state.json');
    phaseAdvanceFile = path.join(tmp.dir, 'phase-advance.json');

    savedEnv = {
      WORKFLOW_STATE_FILE: process.env.WORKFLOW_STATE_FILE,
      PHASE_ADVANCE_FILE: process.env.PHASE_ADVANCE_FILE,
    };
    process.env.WORKFLOW_STATE_FILE = stateFile;
    process.env.PHASE_ADVANCE_FILE = phaseAdvanceFile;
  });

  afterEach(() => {
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

  it('Test 2: processTaskCompletion advances phase and writes phase-advance file', async () => {
    // Arrange: use createWorkflow to build a valid state, then add an in_progress agent
    // We use PHASE_2_IMPLEMENT -> PHASE_3_REVIEW because Gate 2 only checks that all agents
    // are marked completed (with no failing tests flag), whereas Gate 1 requires an
    // implementationPlan artifact file to exist on disk.
    const { createWorkflow } = require(
      `${PROJECT_ROOT}/.claude/lib/workflow/workflow-state-manager.cjs`
    );
    const { atomicWriteJSONSync } = require(`${PROJECT_ROOT}/.claude/lib/utils/atomic-write.cjs`);

    const workflowId = createWorkflow('phase advance test', 'LOW', stateFile);

    // Read state, advance to PHASE_2_IMPLEMENT, and add agent
    const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    raw.currentPhase = 'PHASE_2_IMPLEMENT';
    raw.phases.PHASE_2_IMPLEMENT.status = 'in_progress';
    raw.phases.PHASE_2_IMPLEMENT.agents = {
      developer: {
        taskId: 'task-contract-1',
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        completedAt: null,
        artifacts: [],
        metadata: {},
      },
    };
    atomicWriteJSONSync(stateFile, raw);

    // Delete cached module so env vars take effect
    const chainPath = require.resolve(
      `${PROJECT_ROOT}/.claude/hooks/workflow/post-completion-chain.cjs`
    );
    delete require.cache[chainPath];

    const { processTaskCompletion } = require(chainPath);

    // Build hook input for TaskUpdate completed
    const hookData = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-contract-1',
        status: 'completed',
      },
    };

    // Act
    await processTaskCompletion(hookData);

    // Assert: currentPhase should advance to PHASE_3_REVIEW
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(
      saved.currentPhase,
      'PHASE_3_REVIEW',
      'currentPhase should advance to PHASE_3_REVIEW after developer completes'
    );

    // Assert: phase-advance file should be written
    assert.ok(
      fs.existsSync(phaseAdvanceFile),
      'phase-advance.json should be written when phase advances'
    );

    // Assert: phase-advance file has expected fields
    const advance = JSON.parse(fs.readFileSync(phaseAdvanceFile, 'utf8'));
    assert.strictEqual(advance.workflowId, workflowId, 'phase-advance workflowId should match');
    assert.strictEqual(advance.advanceTo, 'PHASE_3_REVIEW', 'advanceTo should be PHASE_3_REVIEW');
    assert.strictEqual(
      advance.previousPhase,
      'PHASE_2_IMPLEMENT',
      'previousPhase should be PHASE_2_IMPLEMENT'
    );
    assert.strictEqual(advance.gatePassed, true, 'gatePassed should be true');
    assert.ok(typeof advance.timestamp === 'string', 'timestamp should be a string');
  });
});
