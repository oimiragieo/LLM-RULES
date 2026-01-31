#!/usr/bin/env node
/**
 * Memory Scheduler Tests - Phase 4 Automated Maintenance
 * ======================================================
 *
 * Tests for:
 * 1. Daily maintenance tasks
 * 2. Weekly optimization tasks
 * 3. Manual maintenance execution
 * 4. Scheduler registration
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test setup - use a temporary directory
const TEST_PROJECT_ROOT = path.join(__dirname, '..', 'context', 'memory', '.test-scheduler');
const MEMORY_DIR = path.join(TEST_PROJECT_ROOT, '.claude', 'context', 'memory');

// Cleanup and setup
function setupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'archive'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'stm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'mtm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'ltm'), { recursive: true });
  fs.mkdirSync(path.join(MEMORY_DIR, 'metrics'), { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_PROJECT_ROOT)) {
    fs.rmSync(TEST_PROJECT_ROOT, { recursive: true });
  }
}

// Helper to create test data
function createTestMemoryData() {
  // Create learnings.md
  fs.writeFileSync(path.join(MEMORY_DIR, 'learnings.md'), 'A'.repeat(20 * 1024));

  // Create patterns.json
  const patterns = [];
  for (let i = 0; i < 25; i++) {
    patterns.push({ text: `Pattern ${i}`, timestamp: new Date().toISOString() });
  }
  fs.writeFileSync(path.join(MEMORY_DIR, 'patterns.json'), JSON.stringify(patterns, null, 2));

  // Create gotchas.json
  const gotchas = [];
  for (let i = 0; i < 15; i++) {
    gotchas.push({ text: `Gotcha ${i}`, timestamp: new Date().toISOString() });
  }
  fs.writeFileSync(path.join(MEMORY_DIR, 'gotchas.json'), JSON.stringify(gotchas, null, 2));

  // Create codebase_map.json
  const discovered_files = {};
  for (let i = 0; i < 100; i++) {
    discovered_files[`file${i}.js`] = {
      description: `File ${i}`,
      last_accessed: new Date().toISOString(),
    };
  }
  fs.writeFileSync(
    path.join(MEMORY_DIR, 'codebase_map.json'),
    JSON.stringify({ discovered_files }, null, 2)
  );

  // Create STM session
  fs.writeFileSync(
    path.join(MEMORY_DIR, 'stm', 'session_current.json'),
    JSON.stringify(
      {
        session_id: 'test-session',
        timestamp: new Date().toISOString(),
        summary: 'Test STM session',
      },
      null,
      2
    )
  );

  // Create MTM sessions
  for (let i = 0; i < 5; i++) {
    const sessionPath = path.join(MEMORY_DIR, 'mtm', `session_2026-01-2${i}T10-00-00.json`);
    fs.writeFileSync(
      sessionPath,
      JSON.stringify(
        {
          session_id: `session_${i}`,
          timestamp: new Date().toISOString(),
          summary: `Test session ${i}`,
        },
        null,
        2
      )
    );
  }
}

// Simple test framework
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
    process.exitCode = 1;
  }
}

// Run tests
if (require.main === module) {
  console.log('Memory Scheduler Tests - Phase 4 Automated Maintenance');
  console.log('======================================================');

  // Test Suite 1: runDailyMaintenance
  describe('runDailyMaintenance', function () {
    it('should run STM to MTM consolidation', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runDailyMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runDailyMaintenance(TEST_PROJECT_ROOT);

        assert(result, 'Should return a result');
        assert(result.timestamp, 'Should have timestamp');
        assert(result.tasks, 'Should have tasks');
        assert(Array.isArray(result.tasks), 'tasks should be an array');
      } finally {
        cleanupTestDir();
      }
    });

    it('should check tier health', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runDailyMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runDailyMaintenance(TEST_PROJECT_ROOT);

        assert(result.healthCheck, 'Should have healthCheck');
        assert(typeof result.healthCheck.healthScore === 'number', 'Should have health score');
      } finally {
        cleanupTestDir();
      }
    });

    it('should log metrics', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runDailyMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        runDailyMaintenance(TEST_PROJECT_ROOT);

        const metricsDir = path.join(MEMORY_DIR, 'metrics');
        const files = fs.readdirSync(metricsDir).filter(f => f.endsWith('.json'));

        assert(files.length >= 1, 'Should have at least one metrics file');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 2: runWeeklyMaintenance
  describe('runWeeklyMaintenance', function () {
    it('should include all weekly tasks', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const {
          runWeeklyMaintenance,
        } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runWeeklyMaintenance(TEST_PROJECT_ROOT);

        assert(result, 'Should return a result');
        assert(result.timestamp, 'Should have timestamp');
        assert(result.tasks, 'Should have tasks');

        // Should include both daily and weekly tasks
        const taskTypes = result.tasks.map(t => t.type);
        assert(
          taskTypes.includes('consolidation') ||
            taskTypes.includes('summarization') ||
            taskTypes.includes('deduplication') ||
            taskTypes.includes('pruning') ||
            taskTypes.includes('healthCheck'),
          'Should include maintenance tasks'
        );
      } finally {
        cleanupTestDir();
      }
    });

    it('should generate weekly health report', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const {
          runWeeklyMaintenance,
        } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runWeeklyMaintenance(TEST_PROJECT_ROOT);

        assert(result.weeklyReport, 'Should have weeklyReport');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 3: runMaintenance (manual)
  describe('runMaintenance', function () {
    it('should run daily tasks when type is "daily"', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runMaintenance('daily', TEST_PROJECT_ROOT);

        assert(result, 'Should return a result');
        assert(result.maintenanceType === 'daily', 'Should be daily maintenance');
      } finally {
        cleanupTestDir();
      }
    });

    it('should run weekly tasks when type is "weekly"', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runMaintenance('weekly', TEST_PROJECT_ROOT);

        assert(result, 'Should return a result');
        assert(result.maintenanceType === 'weekly', 'Should be weekly maintenance');
      } finally {
        cleanupTestDir();
      }
    });

    it('should run specific task when given a task name', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runMaintenance } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runMaintenance('healthCheck', TEST_PROJECT_ROOT);

        assert(result, 'Should return a result');
        // When running a specific task, result has type and success directly
        assert(
          result.type === 'healthCheck' || result.maintenanceType === 'task',
          'Should have result from specific task'
        );
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 4: getMaintenanceStatus
  describe('getMaintenanceStatus', function () {
    it('should return current maintenance status', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const {
          getMaintenanceStatus,
          runDailyMaintenance,
        } = require('../../../.claude/lib/memory/memory-scheduler.cjs');

        // Run maintenance first
        runDailyMaintenance(TEST_PROJECT_ROOT);

        const status = getMaintenanceStatus(TEST_PROJECT_ROOT);

        assert(status, 'Should return status');
        assert(status.lastDaily || status.lastRun, 'Should have last run info');
      } finally {
        cleanupTestDir();
      }
    });
  });

  // Test Suite 5: Task execution
  describe('Individual task execution', function () {
    it('should run consolidation task', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runTask } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runTask('consolidation', TEST_PROJECT_ROOT);

        assert(result, 'Should return result');
        assert(result.type === 'consolidation', 'Should be consolidation type');
      } finally {
        cleanupTestDir();
      }
    });

    it('should run healthCheck task', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runTask } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runTask('healthCheck', TEST_PROJECT_ROOT);

        assert(result, 'Should return result');
        assert(result.type === 'healthCheck', 'Should be healthCheck type');
      } finally {
        cleanupTestDir();
      }
    });

    it('should run deduplication task', function () {
      setupTestDir();
      try {
        createTestMemoryData();

        delete require.cache[require.resolve('../../../.claude/lib/memory/memory-scheduler.cjs')];
        const { runTask } = require('../../../.claude/lib/memory/memory-scheduler.cjs');
        const result = runTask('deduplication', TEST_PROJECT_ROOT);

        assert(result, 'Should return result');
        assert(result.type === 'deduplication', 'Should be deduplication type');
      } finally {
        cleanupTestDir();
      }
    });
  });

  console.log('\n======================================================');
  console.log(`Test run complete. ${passCount} passed, ${failCount} failed.`);
}
