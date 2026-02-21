#!/usr/bin/env node
/**
 * Tests for post-completion-chain failure signal emission (Self-Healing Backstop)
 *
 * Verifies that when a TaskUpdate(completed) contains underdelivery metadata,
 * the hook emits a structured entry to failure-signals.jsonl.
 *
 * Test scenarios:
 * 1. Underdelivery signal emitted - deliveredCount < requestedCount
 * 2. No signal on success - deliveredCount >= requestedCount
 * 3. No signal when counts missing - no requestedCount/deliveredCount in metadata
 * 4. Signal schema - entry has correct fields
 * 5. Non-blocking - hook exits 0 even when underdelivery detected
 * 6. Append not overwrite - multiple underdeliveries append to the file
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
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

// Use a tmp dir for signal file isolation so tests don't pollute production runtime
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-signals-test-'));
const SIGNAL_FILE = path.join(TMP_DIR, 'failure-signals.jsonl');

// Minimal workflow state used across tests
function makeWorkflowState(taskId = '50') {
  return {
    workflowId: 'wf-signal-test',
    currentPhase: 'PHASE_2_IMPLEMENT',
    phases: {
      PHASE_1_DESIGN: {
        status: 'completed',
        gate: { passed: true },
      },
      PHASE_2_IMPLEMENT: {
        status: 'in_progress',
        agents: {
          developer: { taskId, status: 'in_progress' },
        },
      },
      PHASE_3_REVIEW: { status: 'pending' },
    },
    artifacts: {
      implementationPlan: '.claude/context/plans/test-plan-signals.md',
    },
  };
}

function setupWorkflow(taskId = '50') {
  fs.mkdirSync(path.dirname(WORKFLOW_STATE_FILE), { recursive: true });
  fs.writeFileSync(WORKFLOW_STATE_FILE, JSON.stringify(makeWorkflowState(taskId), null, 2));

  // Create dummy plan artifact so the gate can pass if needed
  const planPath = path.join(PROJECT_ROOT, '.claude/context/plans/test-plan-signals.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '# Test Plan\n\n## Tasks\n\n- [x] Task 1\n');
}

function cleanupWorkflow() {
  [WORKFLOW_STATE_FILE, PHASE_ADVANCE_FILE].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  const planPath = path.join(PROJECT_ROOT, '.claude/context/plans/test-plan-signals.md');
  if (fs.existsSync(planPath)) fs.unlinkSync(planPath);

  if (fs.existsSync(SIGNAL_FILE)) fs.unlinkSync(SIGNAL_FILE);
}

function setSignalFileEnv() {
  process.env.FAILURE_SIGNALS_FILE = SIGNAL_FILE;
}

function clearSignalFileEnv() {
  delete process.env.FAILURE_SIGNALS_FILE;
}

// ─── Test 1: Underdelivery signal emitted ─────────────────────────────────────
async function testUnderdeliverySignalEmitted() {
  cleanupWorkflow();
  setSignalFileEnv();
  setupWorkflow('50');
  console.log('\n=== Test 1: Underdelivery signal emitted ===');

  const hookData = {
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
  };

  await processTaskCompletion(hookData);

  assert(fs.existsSync(SIGNAL_FILE), 'failure-signals.jsonl should exist after underdelivery');

  if (fs.existsSync(SIGNAL_FILE)) {
    const lines = fs
      .readFileSync(SIGNAL_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim());
    assert(lines.length >= 1, 'failure-signals.jsonl should have at least one entry');

    if (lines.length >= 1) {
      const entry = JSON.parse(lines[0]);
      assert(typeof entry.timestamp === 'string', 'Entry should have a timestamp');
      assert(entry.taskId === '50', 'Entry taskId should match the completed task');
      assert(
        entry.signal === 'quantitative-underdelivery',
        'Entry signal should be quantitative-underdelivery'
      );
      assert(entry.requestedCount === 4, 'Entry requestedCount should be 4');
      assert(entry.deliveredCount === 1, 'Entry deliveredCount should be 1');
      assert(typeof entry.ratio === 'number', 'Entry ratio should be a number');
    }
  }

  clearSignalFileEnv();
}

// ─── Test 2: No signal on success (deliveredCount >= requestedCount) ───────────
async function testNoSignalOnSuccess() {
  cleanupWorkflow();
  setSignalFileEnv();
  setupWorkflow('50');
  console.log('\n=== Test 2: No signal on success ===');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '50',
        status: 'completed',
        metadata: {
          summary: 'All 4 items delivered',
          deliveredCount: 4,
          requestedCount: 4,
        },
      },
    },
  };

  await processTaskCompletion(hookData);

  // Signal file should NOT exist (or have 0 lines)
  const hasSignal =
    fs.existsSync(SIGNAL_FILE) &&
    fs
      .readFileSync(SIGNAL_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim()).length > 0;

  assert(!hasSignal, 'No failure signal should be emitted when deliveredCount >= requestedCount');

  clearSignalFileEnv();
}

// ─── Test 3: No signal when counts missing ──────────────────────────────────
async function testNoSignalWhenCountsMissing() {
  cleanupWorkflow();
  setSignalFileEnv();
  setupWorkflow('50');
  console.log('\n=== Test 3: No signal when counts missing ===');

  const hookData = {
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
  };

  await processTaskCompletion(hookData);

  const hasSignal =
    fs.existsSync(SIGNAL_FILE) &&
    fs
      .readFileSync(SIGNAL_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim()).length > 0;

  assert(!hasSignal, 'No failure signal should be emitted when requestedCount/deliveredCount are absent');

  clearSignalFileEnv();
}

// ─── Test 4: Signal schema validation ───────────────────────────────────────
async function testSignalSchema() {
  cleanupWorkflow();
  setSignalFileEnv();
  setupWorkflow('51');
  console.log('\n=== Test 4: Signal schema ===');

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '51',
        status: 'completed',
        metadata: {
          summary: 'Partial',
          deliveredCount: 2,
          requestedCount: 5,
        },
      },
    },
  };

  await processTaskCompletion(hookData);

  assert(fs.existsSync(SIGNAL_FILE), 'failure-signals.jsonl should exist');

  if (fs.existsSync(SIGNAL_FILE)) {
    const lines = fs
      .readFileSync(SIGNAL_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim());

    assert(lines.length >= 1, 'Should have at least one line');

    if (lines.length >= 1) {
      let entry;
      try {
        entry = JSON.parse(lines[0]);
      } catch (_e) {
        assert(false, `Line should be valid JSON: ${_e.message}`);
        clearSignalFileEnv();
        return;
      }

      // Validate required schema fields
      assert(typeof entry.timestamp === 'string', 'Schema: timestamp must be a string');
      assert(typeof entry.taskId === 'string', 'Schema: taskId must be a string');
      assert(
        entry.signal === 'quantitative-underdelivery',
        'Schema: signal must be quantitative-underdelivery'
      );
      assert(typeof entry.requestedCount === 'number', 'Schema: requestedCount must be a number');
      assert(typeof entry.deliveredCount === 'number', 'Schema: deliveredCount must be a number');
      assert(typeof entry.ratio === 'number', 'Schema: ratio must be a number');

      // Validate ratio is correct
      const expectedRatio = 2 / 5;
      assert(
        Math.abs(entry.ratio - expectedRatio) < 0.001,
        `Schema: ratio should be ${expectedRatio}, got ${entry.ratio}`
      );
    }
  }

  clearSignalFileEnv();
}

// ─── Test 5: Non-blocking — hook must not crash and must return result ────────
async function testNonBlocking() {
  cleanupWorkflow();
  setSignalFileEnv();
  setupWorkflow('50');
  console.log('\n=== Test 5: Non-blocking ===');

  // Make the signal file path unwritable by pointing to a non-existent deep path
  // We simulate a signal emission error by using a bad path
  const badPath = path.join(TMP_DIR, 'nonexistent-subdir', 'impossible', 'failure-signals.jsonl');
  process.env.FAILURE_SIGNALS_FILE = badPath;

  const hookData = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '50',
        status: 'completed',
        metadata: {
          summary: 'Partial',
          deliveredCount: 1,
          requestedCount: 4,
        },
      },
    },
  };

  let threw = false;
  try {
    await processTaskCompletion(hookData);
  } catch (_e) {
    threw = true;
  }

  assert(!threw, 'Hook must not throw even when signal emission fails');

  clearSignalFileEnv();
}

// ─── Test 6: Append not overwrite ───────────────────────────────────────────
async function testAppendNotOverwrite() {
  cleanupWorkflow();
  setSignalFileEnv();
  console.log('\n=== Test 6: Append not overwrite ===');

  // First underdelivery: taskId '60'
  setupWorkflow('60');
  const hookData1 = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '60',
        status: 'completed',
        metadata: {
          summary: 'Partial first',
          deliveredCount: 1,
          requestedCount: 3,
        },
      },
    },
  };

  await processTaskCompletion(hookData1);

  // Count lines after first signal
  const linesAfterFirst = fs.existsSync(SIGNAL_FILE)
    ? fs
        .readFileSync(SIGNAL_FILE, 'utf8')
        .split('\n')
        .filter(l => l.trim()).length
    : 0;

  assert(linesAfterFirst === 1, `Should have 1 line after first underdelivery, got ${linesAfterFirst}`);

  // Second underdelivery: reset workflow with different taskId
  cleanupWorkflow();
  // Keep signal file - only cleanup workflow state
  if (!fs.existsSync(SIGNAL_FILE)) {
    // Recreate if cleanup deleted it
    fs.writeFileSync(SIGNAL_FILE, '');
  }

  // We need to write the first signal back since cleanupWorkflow deletes it
  // Actually, let's not call cleanupWorkflow fully - just reset workflow state
  [WORKFLOW_STATE_FILE, PHASE_ADVANCE_FILE].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  const planPath = path.join(PROJECT_ROOT, '.claude/context/plans/test-plan-signals.md');
  if (fs.existsSync(planPath)) fs.unlinkSync(planPath);

  // Re-run Test 1 first to get back first signal
  setSignalFileEnv();
  setupWorkflow('60');
  await processTaskCompletion(hookData1);

  const _linesAfterFirstAgain = fs.existsSync(SIGNAL_FILE)
    ? fs
        .readFileSync(SIGNAL_FILE, 'utf8')
        .split('\n')
        .filter(l => l.trim()).length
    : 0;

  // Now set up second task and emit second signal (re-setup with taskId '61')
  // Reset workflow state for taskId '61'
  [WORKFLOW_STATE_FILE, PHASE_ADVANCE_FILE].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  if (fs.existsSync(planPath)) fs.unlinkSync(planPath);

  setupWorkflow('61');
  const hookData2 = {
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: '61',
        status: 'completed',
        metadata: {
          summary: 'Partial second',
          deliveredCount: 2,
          requestedCount: 5,
        },
      },
    },
  };

  await processTaskCompletion(hookData2);

  const linesAfterSecond = fs.existsSync(SIGNAL_FILE)
    ? fs
        .readFileSync(SIGNAL_FILE, 'utf8')
        .split('\n')
        .filter(l => l.trim()).length
    : 0;

  assert(
    linesAfterSecond === 2,
    `Should have 2 lines after two underdeliveries (appended, not overwritten), got ${linesAfterSecond}`
  );

  if (linesAfterSecond === 2) {
    const lines = fs
      .readFileSync(SIGNAL_FILE, 'utf8')
      .split('\n')
      .filter(l => l.trim());
    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    assert(entry1.taskId === '60', 'First entry should be taskId 60');
    assert(entry2.taskId === '61', 'Second entry should be taskId 61');
  }

  clearSignalFileEnv();
}

// ─── Run all tests ───────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n========================================');
  console.log('Post-Completion Chain — Failure Signals Tests');
  console.log('========================================');

  try {
    await testUnderdeliverySignalEmitted();
    await testNoSignalOnSuccess();
    await testNoSignalWhenCountsMissing();
    await testSignalSchema();
    await testNonBlocking();
    await testAppendNotOverwrite();

    console.log('\n========================================');
    console.log(`Tests Passed: ${testsPass}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('========================================\n');

    // Final cleanup
    cleanupWorkflow();
    clearSignalFileEnv();
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    } catch (_) {
      // Best-effort cleanup
    }

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nTest execution error:', error.message);
    console.error(error.stack);
    cleanupWorkflow();
    clearSignalFileEnv();
    process.exit(1);
  }
}

runTests();
