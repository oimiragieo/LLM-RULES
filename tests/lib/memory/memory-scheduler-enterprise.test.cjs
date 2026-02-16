'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('path');

const { runDailyMaintenance, runWeeklyMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');

test('MemoryScheduler runDailyMaintenance includes taskRecovery', async () => {
  const tmpDir = path.join(PROJECT_ROOT, '.tmp', `scheduler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  
  // Mock necessary files and dirs
  const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
  fs.mkdirSync(path.join(memoryDir, 'stm'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'ltm'), { recursive: true });
  
  try {
    const result = await runDailyMaintenance(tmpDir);
    
    assert.equal(result.maintenanceType, 'daily');
    const recoveryTask = result.tasks.find(t => t.type === 'taskRecovery');
    assert.ok(recoveryTask, 'Should contain taskRecovery task');
    assert.equal(recoveryTask.success, true);
    
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('MemoryScheduler runWeeklyMaintenance includes vectorMaintenance', async () => {
  const tmpDir = path.join(PROJECT_ROOT, '.tmp', `scheduler-weekly-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  
  // Mock necessary files and dirs
  const memoryDir = path.join(tmpDir, '.claude', 'context', 'memory');
  fs.mkdirSync(path.join(memoryDir, 'stm'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(memoryDir, 'ltm'), { recursive: true });
  
  try {
    const result = await runWeeklyMaintenance(tmpDir);
    
    assert.equal(result.maintenanceType, 'weekly');
    const vectorTask = result.tasks.find(t => t.type === 'vectorMaintenance');
    assert.ok(vectorTask, 'Should contain vectorMaintenance task');
    // It might be 'success: true' even if it skips actual optimization due to mock mode or no table
    assert.equal(vectorTask.success, true);
    
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
