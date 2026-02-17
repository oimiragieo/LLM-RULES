/**
 * Tests: post-completion-chain env-based path resolution (Task 31)
 * =================================================================
 *
 * Test 1 – WORKFLOW_STATE_FILE env resolution:
 *   - Set WORKFLOW_STATE_FILE to a temp path with a valid workflow state
 *   - Run processTaskCompletion with a completion that matches an agent
 *   - Assert phase advances and that the FILE AT WORKFLOW_STATE_FILE was updated
 *     (not a file under process.cwd())
 *
 * Test 2 – Different cwd:
 *   - Run from a different process.cwd() than the project root
 *   - With WORKFLOW_STATE_FILE set to the correct project workflow-state path
 *   - Assert behavior is the same as when cwd is project root
 */

'use strict';

const assert = require('node:assert');
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTempDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcc-env-test-'));
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

/**
 * Build a minimal valid workflow state with a single in-progress agent in PHASE_2_IMPLEMENT.
 * Uses createWorkflow to produce a schema-valid base, then patches it for the test scenario.
 */
function buildWorkflowStateWithAgent(stateFile, taskId) {
  const { createWorkflow } = require(
    `${PROJECT_ROOT}/.claude/lib/workflow/workflow-state-manager.cjs`
  );
  const { atomicWriteJSONSync } = require(`${PROJECT_ROOT}/.claude/lib/utils/atomic-write.cjs`);

  const workflowId = createWorkflow('env-path-test', 'LOW', stateFile);

  const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  raw.currentPhase = 'PHASE_2_IMPLEMENT';
  raw.phases.PHASE_2_IMPLEMENT.status = 'in_progress';
  raw.phases.PHASE_2_IMPLEMENT.agents = {
    developer: {
      taskId,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      completedAt: null,
      artifacts: [],
      metadata: {},
    },
  };
  atomicWriteJSONSync(stateFile, raw);
  return workflowId;
}

/**
 * Clear the post-completion-chain module from cache so env vars take effect
 * on each require (module reads env vars at load time).
 */
function requireFreshChain() {
  const chainPath = require.resolve(
    `${PROJECT_ROOT}/.claude/hooks/workflow/post-completion-chain.cjs`
  );
  delete require.cache[chainPath];

  // Also clear the shared path-helper module if it exists
  try {
    const helperPath = require.resolve(`${PROJECT_ROOT}/.claude/lib/utils/workflow-paths.cjs`);
    delete require.cache[helperPath];
  } catch (_e) {
    // not yet created – that's fine
  }

  return require(chainPath);
}

/**
 * Build a hook input object for a completed TaskUpdate.
 */
function makeHookData(taskId) {
  return {
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId,
      status: 'completed',
    },
  };
}

// ─── Suite 1: WORKFLOW_STATE_FILE env resolution ─────────────────────────────

describe('post-completion-chain: WORKFLOW_STATE_FILE env resolution', () => {
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

    // Set env vars BEFORE requiring the chain module
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

  it('Test 1: uses WORKFLOW_STATE_FILE env path, not a path under process.cwd()', async () => {
    const taskId = 'task-env-test-1';
    buildWorkflowStateWithAgent(stateFile, taskId);

    const { processTaskCompletion } = requireFreshChain();

    // Act
    await processTaskCompletion(makeHookData(taskId));

    // Assert: the state file at the env-var path is updated
    assert.ok(
      fs.existsSync(stateFile),
      'workflow-state.json must exist at WORKFLOW_STATE_FILE path'
    );

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(
      saved.currentPhase,
      'PHASE_3_REVIEW',
      'phase should advance to PHASE_3_REVIEW using env-specified file'
    );

    // Assert: the file is in the temp dir (NOT under process.cwd())
    const cwdStatePath = path.join(
      process.cwd(),
      '.claude',
      'context',
      'runtime',
      'workflow-state.json'
    );
    assert.ok(stateFile !== cwdStatePath, 'stateFile path must differ from cwd-based default path');
    // The cwd-based default path must NOT have been written to
    if (fs.existsSync(cwdStatePath)) {
      const cwdSaved = JSON.parse(fs.readFileSync(cwdStatePath, 'utf8'));
      // If it exists pre-existing, its currentPhase must not have changed to PHASE_3_REVIEW
      // due to THIS test run (we can only verify if it existed before and didn't change,
      // but we primarily care that the env-path file was updated).
      // The definitive assertion is that the env-path file was correctly updated.
      assert.ok(
        cwdSaved.currentPhase === undefined ||
          cwdSaved.currentPhase !== 'PHASE_3_REVIEW' ||
          stateFile === cwdStatePath,
        'if cwd state file exists, it should not have been changed by this test (env-path file was used)'
      );
    }

    // phase-advance.json should also be at the env path
    assert.ok(
      fs.existsSync(phaseAdvanceFile),
      'phase-advance.json must be written at PHASE_ADVANCE_FILE env path'
    );

    const advance = JSON.parse(fs.readFileSync(phaseAdvanceFile, 'utf8'));
    assert.strictEqual(
      advance.advanceTo,
      'PHASE_3_REVIEW',
      'phase-advance should target PHASE_3_REVIEW'
    );
  });
});

// ─── Suite 1b: Dynamic resolution (env set AFTER module load) ────────────────

describe('post-completion-chain: dynamic path resolution (env set after module load)', () => {
  let tmp;
  let stateFile;
  let phaseAdvanceFile;
  let savedEnv;

  beforeEach(() => {
    tmp = makeTempDir();
    stateFile = path.join(tmp.dir, 'workflow-state-dynamic.json');
    phaseAdvanceFile = path.join(tmp.dir, 'phase-advance-dynamic.json');

    savedEnv = {
      WORKFLOW_STATE_FILE: process.env.WORKFLOW_STATE_FILE,
      PHASE_ADVANCE_FILE: process.env.PHASE_ADVANCE_FILE,
    };

    // Intentionally clear env vars before requiring the module
    delete process.env.WORKFLOW_STATE_FILE;
    delete process.env.PHASE_ADVANCE_FILE;
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

  it('Test 1b: env vars set AFTER module load are honoured (dynamic resolution)', async () => {
    // Load module WITHOUT env vars set (simulates module being cached from a prior require)
    const chainPath = require.resolve(
      `${PROJECT_ROOT}/.claude/hooks/workflow/post-completion-chain.cjs`
    );
    delete require.cache[chainPath];
    try {
      const helperPath = require.resolve(`${PROJECT_ROOT}/.claude/lib/utils/workflow-paths.cjs`);
      delete require.cache[helperPath];
    } catch (_e) {
      // not yet created – fine
    }

    // Require WITHOUT env vars set
    const { processTaskCompletion } = require(chainPath);

    // NOW set env vars (after module load)
    process.env.WORKFLOW_STATE_FILE = stateFile;
    process.env.PHASE_ADVANCE_FILE = phaseAdvanceFile;

    const taskId = 'task-dynamic-1b';
    buildWorkflowStateWithAgent(stateFile, taskId);

    // Act
    await processTaskCompletion(makeHookData(taskId));

    // Assert: state file at the env-path was updated
    assert.ok(
      fs.existsSync(stateFile),
      'workflow-state.json must exist at the WORKFLOW_STATE_FILE path set after module load'
    );

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(
      saved.currentPhase,
      'PHASE_3_REVIEW',
      'phase should advance using env-path set after module load (dynamic resolution required)'
    );
  });
});

// ─── Suite 2: Different cwd does not affect path resolution ──────────────────

describe('post-completion-chain: different cwd does not affect path resolution', () => {
  let tmp;
  let stateFile;
  let phaseAdvanceFile;
  let savedEnv;
  let savedCwd;

  beforeEach(() => {
    tmp = makeTempDir();
    stateFile = path.join(tmp.dir, 'workflow-state.json');
    phaseAdvanceFile = path.join(tmp.dir, 'phase-advance.json');

    savedCwd = process.cwd();
    savedEnv = {
      WORKFLOW_STATE_FILE: process.env.WORKFLOW_STATE_FILE,
      PHASE_ADVANCE_FILE: process.env.PHASE_ADVANCE_FILE,
    };

    // Set env vars BEFORE requiring the chain module
    process.env.WORKFLOW_STATE_FILE = stateFile;
    process.env.PHASE_ADVANCE_FILE = phaseAdvanceFile;

    // Change cwd to a different directory (the temp dir itself, which is NOT project root)
    process.chdir(tmp.dir);
  });

  afterEach(() => {
    // Restore cwd first
    process.chdir(savedCwd);

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

  it('Test 2: behavior is identical when cwd differs from project root, given WORKFLOW_STATE_FILE is set', async () => {
    const taskId = 'task-cwd-test-2';
    buildWorkflowStateWithAgent(stateFile, taskId);

    // cwd is now tmp.dir (not project root)
    assert.notStrictEqual(
      process.cwd(),
      PROJECT_ROOT,
      'cwd must differ from project root for this test'
    );

    const { processTaskCompletion } = requireFreshChain();

    // Act from a different cwd
    await processTaskCompletion(makeHookData(taskId));

    // Assert: state file was updated correctly despite wrong cwd
    assert.ok(
      fs.existsSync(stateFile),
      'workflow-state.json must exist at WORKFLOW_STATE_FILE path'
    );

    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.strictEqual(
      saved.currentPhase,
      'PHASE_3_REVIEW',
      'phase should advance to PHASE_3_REVIEW even when cwd is not project root'
    );

    // phase-advance file should be at the env-specified path
    assert.ok(
      fs.existsSync(phaseAdvanceFile),
      'phase-advance.json must be written at PHASE_ADVANCE_FILE env path'
    );

    const advance = JSON.parse(fs.readFileSync(phaseAdvanceFile, 'utf8'));
    assert.strictEqual(
      advance.advanceTo,
      'PHASE_3_REVIEW',
      'phase-advance should target PHASE_3_REVIEW'
    );
  });
});
