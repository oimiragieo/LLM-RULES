#!/usr/bin/env node
/**
 * Tests for Task Dead Letter Queue (Phase 3)
 * 
 * Verifies that failed tasks are moved to a DLQ for inspection
 * instead of being silently deleted by the cleanup manager.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const TaskCleanupManager = require('../../../.claude/lib/workflow/task-cleanup-manager.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

const TEST_DLQ = path.join(PROJECT_ROOT, '.claude', 'tmp', 'dlq-test.jsonl');

async function testDLQ() {
  console.log('Task DLQ Resilience Tests');
  console.log('=========================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // Ensure clean state
  if (fs.existsSync(TEST_DLQ)) fs.unlinkSync(TEST_DLQ);
  if (!fs.existsSync(path.dirname(TEST_DLQ))) fs.mkdirSync(path.dirname(TEST_DLQ), { recursive: true });

  await test('should archive failed tasks to DLQ before deletion', async () => {
    const manager = new TaskCleanupManager({
      retentionMs: 0, // Cleanup immediately
      interval: 1000,
      // Inject our custom DLQ path via config if supported, or we mock the method
    });

    // Mock/Inject DLQ writer since we haven't implemented it yet
    manager.dlqPath = TEST_DLQ; // We will add this property support
    manager.enableDLQ = true;

    const failedTask = {
      id: 'task-failed-1',
      status: 'failed',
      error: 'Simulated crash',
      createdAt: Date.now() - 1000,
      completedAt: Date.now() - 1000
    };

    manager.addTask(failedTask);

    // Run cleanup
    await manager.runCleanup();

    // Verify task is gone from active store
    const tasks = await manager.getTaskList();
    if (tasks.find(t => t.id === failedTask.id)) {
      throw new Error('Task was not removed from active store');
    }

    // Verify task is in DLQ
    if (!fs.existsSync(TEST_DLQ)) {
      throw new Error('DLQ file was not created');
    }
    const lines = fs.readFileSync(TEST_DLQ, 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    
    if (entry.id !== failedTask.id) throw new Error('DLQ entry ID mismatch');
    if (entry.reason !== 'cleanup_failed_task') throw new Error('DLQ reason mismatch');
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testDLQ();
