/**
 * Checkpoint Manager Test Suite (SPEC-003)
 *
 * Tests workflow state checkpointing with crash recovery.
 *
 * TDD Cycle: RED phase - all tests should fail initially
 */

const { test, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');

// NOTE: This will fail until we implement checkpoint-manager.cjs
const checkpointManager = require('../.claude/lib/workflow/checkpoint-manager.cjs');

const TEST_ROOT = path.join(__dirname, '../.claude/context/workflows/checkpoints-test');

/**
 * Test Suite Organization:
 * 1. Save/Load Basic (3 tests)
 * 2. State Integrity (3 tests)
 * 3. Recovery Protocol (3 tests)
 * 4. Performance (2 tests)
 * 5. Edge Cases (4 tests)
 * Total: 15 tests
 */

async function setupTest() {
  try {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  } catch (_err) {
    // Ignore
  }
  await fs.mkdir(TEST_ROOT, { recursive: true });
}

async function teardownTest() {
  await fs.rm(TEST_ROOT, { recursive: true, force: true });
}

// ========== Category 1: Save/Load Basic (3 tests) ==========

test('should save checkpoint with all required fields', async () => {
  await setupTest();

  const workflowId = 'test-workflow-001';
  const stepId = 'step-1';
  const state = { files: ['file1.js'], phase: 'implementation' };

  await checkpointManager.save({ workflowId, stepId, state }, TEST_ROOT);

  // Verify file exists
  const checkpointPath = path.join(TEST_ROOT, `${workflowId}.json`);
  const exists = await fs
    .access(checkpointPath)
    .then(() => true)
    .catch(() => false);
  assert.strictEqual(exists, true, 'Checkpoint file should exist');

  // Verify content
  const content = await fs.readFile(checkpointPath, 'utf8');
  const checkpoint = JSON.parse(content);

  assert.strictEqual(checkpoint.workflowId, workflowId);
  assert.strictEqual(checkpoint.stepId, stepId);
  assert.deepStrictEqual(checkpoint.state, state);
  assert.ok(checkpoint.timestamp, 'Should have timestamp');
  assert.ok(checkpoint.checksum, 'Should have checksum for integrity');
  assert.strictEqual(typeof checkpoint.stepNumber, 'number', 'Should have step number');

  await teardownTest();
});

test('should overwrite existing checkpoint for same workflow', async () => {
  await setupTest();

  const workflowId = 'test-workflow-002';

  // Save first checkpoint
  await checkpointManager.save({ workflowId, stepId: 'step-1', state: { count: 1 } }, TEST_ROOT);

  // Save second checkpoint (should overwrite)
  await checkpointManager.save({ workflowId, stepId: 'step-2', state: { count: 2 } }, TEST_ROOT);

  const checkpoint = await checkpointManager.load({ workflowId }, TEST_ROOT);
  assert.strictEqual(checkpoint.stepId, 'step-2', 'Should load latest checkpoint');
  assert.strictEqual(checkpoint.state.count, 2);

  await teardownTest();
});

test('should save checkpoint in <100ms', async () => {
  await setupTest();

  const workflowId = 'test-workflow-perf';
  const state = { data: 'x'.repeat(1000) }; // 1KB state

  const start = Date.now();
  await checkpointManager.save({ workflowId, stepId: 'step-1', state }, TEST_ROOT);
  const duration = Date.now() - start;

  assert.ok(duration < 100, `Save should be <100ms, was ${duration}ms`);

  await teardownTest();
});

test('should load checkpoint with correct structure', async () => {
  await setupTest();

  const workflowId = 'test-workflow-003';
  const stepId = 'step-1';
  const state = { files: ['file1.js'], vars: { count: 42 } };

  await checkpointManager.save({ workflowId, stepId, state }, TEST_ROOT);
  const loaded = await checkpointManager.load({ workflowId }, TEST_ROOT);

  assert.strictEqual(loaded.workflowId, workflowId);
  assert.strictEqual(loaded.stepId, stepId);
  assert.deepStrictEqual(loaded.state, state);
  assert.ok(loaded.timestamp);
  assert.ok(loaded.checksum);
  assert.strictEqual(typeof loaded.stepNumber, 'number');

  await teardownTest();
});

test('should return null if checkpoint does not exist', async () => {
  await setupTest();

  const workflowId = 'non-existent-workflow';
  const loaded = await checkpointManager.load({ workflowId }, TEST_ROOT);

  assert.strictEqual(loaded, null, 'Should return null for missing checkpoint');

  await teardownTest();
});

test('should load checkpoint in <50ms', async () => {
  await setupTest();

  const workflowId = 'test-workflow-load-perf';
  const stepId = 'step-1';
  const state = { data: 'test' };
  await checkpointManager.save({ workflowId, stepId, state }, TEST_ROOT);

  const start = Date.now();
  await checkpointManager.load({ workflowId }, TEST_ROOT);
  const duration = Date.now() - start;

  assert.ok(duration < 50, `Load should be <50ms, was ${duration}ms`);

  await teardownTest();
});

// ========== Category 2: State Integrity (3 tests) ==========

test('should detect corrupted checkpoint (modified state)', async () => {
  await setupTest();

  const workflowId = 'test-workflow-corrupt';
  const stepId = 'step-1';
  const state = { count: 1 };
  await checkpointManager.save({ workflowId, stepId, state }, TEST_ROOT);

  // Manually corrupt checkpoint
  const checkpointPath = path.join(TEST_ROOT, `${workflowId}.json`);
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
  checkpoint.state.count = 999; // Modify state without updating checksum
  await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

  // Verify corruption detection
  const isValid = await checkpointManager.verify({ workflowId }, TEST_ROOT);
  assert.strictEqual(isValid, false, 'Should detect corrupted checkpoint');

  await teardownTest();
});

test('should verify valid checkpoint', async () => {
  await setupTest();

  const workflowId = 'test-workflow-valid';
  const stepId = 'step-1';
  const state = { data: 'valid' };
  await checkpointManager.save({ workflowId, stepId, state }, TEST_ROOT);

  const isValid = await checkpointManager.verify({ workflowId }, TEST_ROOT);
  assert.strictEqual(isValid, true, 'Should verify valid checkpoint');

  await teardownTest();
});

test('should return false for missing checkpoint on verify', async () => {
  await setupTest();

  const workflowId = 'missing-workflow';
  const isValid = await checkpointManager.verify({ workflowId }, TEST_ROOT);
  assert.strictEqual(isValid, false, 'Should return false for missing checkpoint');

  await teardownTest();
});

// ========== Category 3: Recovery Protocol (3 tests) ==========

test('should recover workflow from last checkpoint', async () => {
  await setupTest();

  const workflowId = 'test-workflow-recover';

  // Simulate workflow execution
  await checkpointManager.save(
    { workflowId, stepId: 'step-1', state: { files: ['file1.js'] } },
    TEST_ROOT
  );
  await checkpointManager.save(
    { workflowId, stepId: 'step-2', state: { files: ['file1.js', 'file2.js'] } },
    TEST_ROOT
  );
  await checkpointManager.save(
    { workflowId, stepId: 'step-3', state: { files: ['file1.js', 'file2.js', 'file3.js'] } },
    TEST_ROOT
  );

  // Recover
  const recovered = await checkpointManager.recover({ workflowId }, TEST_ROOT);

  assert.strictEqual(recovered.stepId, 'step-3', 'Should recover from last checkpoint');
  assert.strictEqual(recovered.state.files.length, 3);
  assert.strictEqual(recovered.nextStep, 'step-4', 'Should suggest next step');

  await teardownTest();
});

test('should return null if no checkpoint to recover', async () => {
  await setupTest();

  const workflowId = 'workflow-no-checkpoint';
  const recovered = await checkpointManager.recover({ workflowId }, TEST_ROOT);

  assert.strictEqual(recovered, null, 'Should return null if no checkpoint exists');

  await teardownTest();
});

test('should recover in <2 seconds', async () => {
  await setupTest();

  const workflowId = 'test-workflow-recover-perf';

  // Create multiple checkpoints
  for (let i = 1; i <= 10; i++) {
    await checkpointManager.save(
      { workflowId, stepId: `step-${i}`, state: { step: i } },
      TEST_ROOT
    );
  }

  const start = Date.now();
  await checkpointManager.recover({ workflowId }, TEST_ROOT);
  const duration = Date.now() - start;

  assert.ok(duration < 2000, `Recovery should be <2s, was ${duration}ms`);

  await teardownTest();
});

// ========== Category 4: Exists Check (1 test) ==========

test('should check if checkpoint exists', async () => {
  await setupTest();

  const workflowId = 'test-workflow-exists';

  // Before save
  let exists = await checkpointManager.exists({ workflowId }, TEST_ROOT);
  assert.strictEqual(exists, false, 'Should return false before save');

  // After save
  await checkpointManager.save(
    { workflowId, stepId: 'step-1', state: { data: 'test' } },
    TEST_ROOT
  );
  exists = await checkpointManager.exists({ workflowId }, TEST_ROOT);
  assert.strictEqual(exists, true, 'Should return true after save');

  await teardownTest();
});

// ========== Category 5: Clear Checkpoint (1 test) ==========

test('should clear checkpoint after workflow completion', async () => {
  await setupTest();

  const workflowId = 'test-workflow-clear';
  await checkpointManager.save(
    { workflowId, stepId: 'step-1', state: { data: 'test' } },
    TEST_ROOT
  );

  // Verify exists
  let exists = await checkpointManager.exists({ workflowId }, TEST_ROOT);
  assert.strictEqual(exists, true);

  // Clear
  await checkpointManager.clear({ workflowId }, TEST_ROOT);

  // Verify cleared
  exists = await checkpointManager.exists({ workflowId }, TEST_ROOT);
  assert.strictEqual(exists, false, 'Checkpoint should be cleared');

  await teardownTest();
});

// ========== Category 6: Edge Cases (4 tests) ==========

test('should handle large state objects (>10KB)', async () => {
  await setupTest();

  const workflowId = 'test-workflow-large';
  const largeState = {
    files: Array(100).fill('file.js'),
    data: 'x'.repeat(10000),
  };

  await checkpointManager.save({ workflowId, stepId: 'step-1', state: largeState }, TEST_ROOT);
  const loaded = await checkpointManager.load({ workflowId }, TEST_ROOT);

  assert.deepStrictEqual(loaded.state, largeState);

  await teardownTest();
});

test('should handle special characters in workflow ID', async () => {
  await setupTest();

  const workflowId = 'workflow-with_special-chars.123';
  await checkpointManager.save(
    { workflowId, stepId: 'step-1', state: { data: 'test' } },
    TEST_ROOT
  );

  const loaded = await checkpointManager.load({ workflowId }, TEST_ROOT);
  assert.strictEqual(loaded.workflowId, workflowId);

  await teardownTest();
});

test('should handle empty state object', async () => {
  await setupTest();

  const workflowId = 'test-workflow-empty';
  await checkpointManager.save({ workflowId, stepId: 'step-1', state: {} }, TEST_ROOT);

  const loaded = await checkpointManager.load({ workflowId }, TEST_ROOT);
  assert.deepStrictEqual(loaded.state, {});

  await teardownTest();
});

test('should handle concurrent saves (last write wins)', async () => {
  await setupTest();

  const workflowId = 'test-workflow-concurrent';

  // Simulate concurrent saves
  await Promise.all([
    checkpointManager.save({ workflowId, stepId: 'step-1', state: { value: 1 } }, TEST_ROOT),
    checkpointManager.save({ workflowId, stepId: 'step-2', state: { value: 2 } }, TEST_ROOT),
    checkpointManager.save({ workflowId, stepId: 'step-3', state: { value: 3 } }, TEST_ROOT),
  ]);

  const loaded = await checkpointManager.load({ workflowId }, TEST_ROOT);
  // One of them should have won (non-deterministic which one)
  assert.ok(['step-1', 'step-2', 'step-3'].includes(loaded.stepId));
  assert.ok([1, 2, 3].includes(loaded.state.value));

  await teardownTest();
});
