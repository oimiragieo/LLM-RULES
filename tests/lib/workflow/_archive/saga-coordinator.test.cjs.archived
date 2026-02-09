#!/usr/bin/env node
/**
 * Saga Coordinator Tests
 * ======================
 *
 * Tests for saga-coordinator.cjs following TDD principles.
 * Must be run with: node .claude/lib/saga-coordinator.test.cjs
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Test Framework
const tests = [];
let currentDescribe = '';

function describe(name, fn) {
  currentDescribe = name;
  fn();
  currentDescribe = '';
}

function it(name, fn) {
  tests.push({
    name: currentDescribe ? `${currentDescribe} > ${name}` : name,
    fn,
  });
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}\nExpected: ${JSON.stringify(expected, null, 2)}\nActual: ${JSON.stringify(actual, null, 2)}`
    );
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(message || 'Expected value to be truthy');
  }
}

function assertFalse(value, message = '') {
  if (value) {
    throw new Error(message || 'Expected value to be falsy');
  }
}

function assertThrows(fn, expectedMessage) {
  let threw = false;
  let actualMessage = '';
  try {
    fn();
  } catch (e) {
    threw = true;
    actualMessage = e.message;
  }
  if (!threw) {
    throw new Error(`Expected function to throw, but it did not`);
  }
  if (expectedMessage && !actualMessage.includes(expectedMessage)) {
    throw new Error(
      `Expected error message to include "${expectedMessage}", but got "${actualMessage}"`
    );
  }
}

async function assertThrowsAsync(fn, expectedMessage) {
  let threw = false;
  let actualMessage = '';
  try {
    await fn();
  } catch (e) {
    threw = true;
    actualMessage = e.message;
  }
  if (!threw) {
    throw new Error(`Expected function to throw, but it did not`);
  }
  if (expectedMessage && !actualMessage.includes(expectedMessage)) {
    throw new Error(
      `Expected error message to include "${expectedMessage}", but got "${actualMessage}"`
    );
  }
}

// =============================================================================
// Test Setup
// =============================================================================

let testDir;
let backupDir;

function setup() {
  testDir = path.join(os.tmpdir(), `saga-test-${Date.now()}`);
  backupDir = path.join(testDir, 'backups');
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
}

function cleanup() {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

// =============================================================================
// Tests
// =============================================================================

// Import after defining test helpers
let SagaCoordinator;
let BackupManager;
let COMPENSATING_ACTIONS;
let registerCompensatingAction;

describe('SagaCoordinator', () => {
  it('should create a new instance with default options', () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });
    assertTrue(saga !== undefined, 'SagaCoordinator instance should exist');
    assertEqual(saga.getTransaction(), null, 'No transaction should be active initially');
    cleanup();
  });

  it('should begin a new transaction', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });
    const txn = await saga.begin('wf-test-123');
    assertTrue(txn.id.startsWith('txn-'), 'Transaction ID should start with txn-');
    assertEqual(txn.workflowId, 'wf-test-123', 'Workflow ID should match');
    assertEqual(txn.status, 'pending', 'Status should be pending');
    assertTrue(Array.isArray(txn.actions), 'Actions should be an array');
    assertEqual(txn.actions.length, 0, 'Actions should be empty initially');
    cleanup();
  });

  it('should record an action with compensating function', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });
    await saga.begin('wf-test-123');

    const action = {
      stepId: 'create_file',
      type: 'file:create',
      path: '/test/file.txt',
      compensate: async ctx => fs.unlinkSync(ctx.path),
    };

    saga.record(action);

    const txn = saga.getTransaction();
    assertEqual(txn.actions.length, 1, 'Should have one action');
    assertEqual(txn.actions[0].stepId, 'create_file', 'Action stepId should match');
    assertEqual(txn.actions[0].type, 'file:create', 'Action type should match');
    cleanup();
  });

  it('should commit a transaction', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });
    await saga.begin('wf-test-123');
    saga.record({ stepId: 'step1', type: 'test', compensate: async () => {} });

    await saga.commit();

    const txn = saga.getTransaction();
    assertEqual(txn.status, 'committed', 'Status should be committed');
    cleanup();
  });

  it('should rollback actions in reverse order', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });
    await saga.begin('wf-test-123');

    const order = [];

    saga.record({
      stepId: 'step1',
      type: 'test',
      compensate: async () => order.push('step1'),
    });

    saga.record({
      stepId: 'step2',
      type: 'test',
      compensate: async () => order.push('step2'),
    });

    saga.record({
      stepId: 'step3',
      type: 'test',
      compensate: async () => order.push('step3'),
    });

    await saga.rollback();

    assertDeepEqual(
      order,
      ['step3', 'step2', 'step1'],
      'Compensations should execute in reverse order'
    );
    const txn = saga.getTransaction();
    assertEqual(txn.status, 'rolled_back', 'Status should be rolled_back');
    cleanup();
  });

  it('should throw when recording without active transaction', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });

    assertThrows(() => {
      saga.record({ stepId: 'test', type: 'test', compensate: async () => {} });
    }, 'No active transaction');
    cleanup();
  });

  it('should throw when committing without active transaction', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });

    await assertThrowsAsync(async () => {
      await saga.commit();
    }, 'No active transaction');
    cleanup();
  });

  it('should throw when rolling back without active transaction', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });

    await assertThrowsAsync(async () => {
      await saga.rollback();
    }, 'No active transaction');
    cleanup();
  });

  it('should return transaction log', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });

    await saga.begin('wf-1');
    await saga.commit();

    await saga.begin('wf-2');
    await saga.rollback();

    const log = saga.getLog();
    assertEqual(log.length, 2, 'Should have 2 transactions in log');
    assertEqual(log[0].workflowId, 'wf-1', 'First transaction workflow ID');
    assertEqual(log[0].status, 'committed', 'First transaction status');
    assertEqual(log[1].workflowId, 'wf-2', 'Second transaction workflow ID');
    assertEqual(log[1].status, 'rolled_back', 'Second transaction status');
    cleanup();
  });
});

describe('BackupManager', () => {
  it('should create a backup of an existing file', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    // Create test file
    const testFile = path.join(testDir, 'original.txt');
    fs.writeFileSync(testFile, 'original content');

    const backupId = await manager.createBackup(testFile);

    assertTrue(backupId.startsWith('backup-'), 'Backup ID should start with backup-');

    // Verify backup exists
    const backups = await manager.listBackups();
    assertEqual(backups.length, 1, 'Should have one backup');
    assertEqual(backups[0].id, backupId, 'Backup ID should match');
    cleanup();
  });

  it('should restore a file from backup', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    // Create and modify test file
    const testFile = path.join(testDir, 'to-restore.txt');
    fs.writeFileSync(testFile, 'original content');

    const backupId = await manager.createBackup(testFile);

    // Modify the file
    fs.writeFileSync(testFile, 'modified content');
    assertEqual(fs.readFileSync(testFile, 'utf-8'), 'modified content', 'File should be modified');

    // Restore
    await manager.restoreBackup(backupId);

    assertEqual(fs.readFileSync(testFile, 'utf-8'), 'original content', 'File should be restored');
    cleanup();
  });

  it('should delete a backup', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    const testFile = path.join(testDir, 'to-delete.txt');
    fs.writeFileSync(testFile, 'content');

    const backupId = await manager.createBackup(testFile);
    let backups = await manager.listBackups();
    assertEqual(backups.length, 1, 'Should have one backup');

    await manager.deleteBackup(backupId);

    backups = await manager.listBackups();
    assertEqual(backups.length, 0, 'Should have no backups after deletion');
    cleanup();
  });

  it('should list backups filtered by workflow ID', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    const file1 = path.join(testDir, 'file1.txt');
    const file2 = path.join(testDir, 'file2.txt');
    fs.writeFileSync(file1, 'content1');
    fs.writeFileSync(file2, 'content2');

    await manager.createBackup(file1, 'wf-1');
    await manager.createBackup(file2, 'wf-2');
    await manager.createBackup(file1, 'wf-1');

    const wf1Backups = await manager.listBackups('wf-1');
    assertEqual(wf1Backups.length, 2, 'Should have 2 backups for wf-1');

    const wf2Backups = await manager.listBackups('wf-2');
    assertEqual(wf2Backups.length, 1, 'Should have 1 backup for wf-2');
    cleanup();
  });

  it('should throw when creating backup of non-existent file', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    await assertThrowsAsync(async () => {
      await manager.createBackup('/non/existent/file.txt');
    }, 'does not exist');
    cleanup();
  });

  it('should throw when restoring non-existent backup', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    await assertThrowsAsync(async () => {
      await manager.restoreBackup('backup-nonexistent');
    }, 'not found');
    cleanup();
  });
});

describe('COMPENSATING_ACTIONS', () => {
  it('should have file:create compensation that deletes file', async () => {
    setup();

    const testFile = path.join(testDir, 'created.txt');
    fs.writeFileSync(testFile, 'created');
    assertTrue(fs.existsSync(testFile), 'File should exist');

    await COMPENSATING_ACTIONS['file:create']({ filePath: testFile });

    assertFalse(fs.existsSync(testFile), 'File should be deleted');
    cleanup();
  });

  it('should have file:modify compensation that restores backup', async () => {
    setup();
    const manager = new BackupManager({ backupDir });

    const testFile = path.join(testDir, 'modified.txt');
    fs.writeFileSync(testFile, 'original');

    // Create backup and modify
    const backupId = await manager.createBackup(testFile);
    fs.writeFileSync(testFile, 'modified');

    await COMPENSATING_ACTIONS['file:modify']({
      filePath: testFile,
      backupId,
      backupManager: manager,
    });

    assertEqual(fs.readFileSync(testFile, 'utf-8'), 'original', 'File should be restored');
    cleanup();
  });

  it('should have directory:create compensation that removes directory', async () => {
    setup();

    const testSubDir = path.join(testDir, 'subdir');
    fs.mkdirSync(testSubDir, { recursive: true });
    assertTrue(fs.existsSync(testSubDir), 'Directory should exist');

    await COMPENSATING_ACTIONS['directory:create']({ dirPath: testSubDir });

    assertFalse(fs.existsSync(testSubDir), 'Directory should be removed');
    cleanup();
  });
});

describe('registerCompensatingAction', () => {
  it('should register a new compensating action', () => {
    setup();

    const customAction = async ctx => {
      return `cleaned up ${ctx.resource}`;
    };

    registerCompensatingAction('custom:cleanup', customAction);

    assertTrue(
      COMPENSATING_ACTIONS['custom:cleanup'] !== undefined,
      'Custom action should be registered'
    );
    cleanup();
  });
});

describe('SagaCoordinator integration with BackupManager', () => {
  it('should backup file before modification and restore on rollback', async () => {
    setup();
    const saga = new SagaCoordinator({ backupDir });
    const manager = saga.backupManager;

    const testFile = path.join(testDir, 'integration-test.txt');
    fs.writeFileSync(testFile, 'original content');

    await saga.begin('wf-integration');

    // Backup and record action
    const backupId = await saga.backup(testFile);

    // Simulate file modification
    fs.writeFileSync(testFile, 'modified content');

    saga.record({
      stepId: 'modify_file',
      type: 'file:modify',
      path: testFile,
      backupId,
      compensate: async ctx => {
        await manager.restoreBackup(ctx.backupId);
      },
    });

    // Rollback should restore file
    await saga.rollback();

    assertEqual(
      fs.readFileSync(testFile, 'utf-8'),
      'original content',
      'File should be restored after rollback'
    );
    cleanup();
  });
});

// =============================================================================
// Test Runner
// =============================================================================

async function runTests() {
  // Import module
  try {
    const mod = require('../../../.claude/lib/workflow/saga-coordinator.cjs');
    SagaCoordinator = mod.SagaCoordinator;
    BackupManager = mod.BackupManager;
    COMPENSATING_ACTIONS = mod.COMPENSATING_ACTIONS;
    registerCompensatingAction = mod.registerCompensatingAction;
  } catch (e) {
    console.error('Failed to import saga-coordinator.cjs:', e.message);
    console.error('Make sure the module exists and exports the required components.');
    process.exit(1);
  }

  console.log('\n=== Saga Coordinator Tests ===\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`  [PASS] ${test.name}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] ${test.name}`);
      console.log(`         ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
