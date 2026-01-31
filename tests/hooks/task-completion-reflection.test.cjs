#!/usr/bin/env node
/**
 * Tests for task-completion-reflection.cjs hook
 *
 * TDD: Write failing tests first, then implement to pass
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Test framework
let passed = 0;
let failed = 0;

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Test setup/teardown helpers
const TEST_QUEUE_FILE = path.join(__dirname, '../../context/test-reflection-queue.jsonl');

function cleanupTestQueue() {
  if (fs.existsSync(TEST_QUEUE_FILE)) {
    fs.unlinkSync(TEST_QUEUE_FILE);
  }
}

function readTestQueue() {
  if (!fs.existsSync(TEST_QUEUE_FILE)) return [];
  const content = fs.readFileSync(TEST_QUEUE_FILE, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}

// Import the module (will fail until implemented)
let hook;
try {
  hook = require('../../.claude/hooks/reflection/task-completion-reflection.cjs');
} catch (_e) {
  console.log('WARNING: Module not implemented yet. Tests will fail.\n');
  hook = {
    isEnabled: () => false,
    queueReflection: () => {},
    parseHookInput: async () => null,
    shouldTriggerReflection: () => false,
    main: async () => {},
  };
}

// Override queue file for testing
const originalQueueFile = hook.QUEUE_FILE;
hook.QUEUE_FILE = TEST_QUEUE_FILE;

// ============================================================
// TESTS
// ============================================================

describe('task-completion-reflection.cjs', () => {
  describe('isEnabled()', () => {
    const originalEnabled = process.env.REFLECTION_ENABLED;
    const originalMode = process.env.REFLECTION_HOOK_MODE;

    it('should return true when REFLECTION_ENABLED is not set (default)', () => {
      delete process.env.REFLECTION_ENABLED;
      delete process.env.REFLECTION_HOOK_MODE;
      assertEqual(hook.isEnabled(), true, 'Should be enabled by default');
    });

    it('should return false when REFLECTION_ENABLED is "false"', () => {
      process.env.REFLECTION_ENABLED = 'false';
      delete process.env.REFLECTION_HOOK_MODE;
      assertEqual(hook.isEnabled(), false, 'Should be disabled when env is false');
    });

    it('should return false when REFLECTION_HOOK_MODE is "off"', () => {
      delete process.env.REFLECTION_ENABLED;
      process.env.REFLECTION_HOOK_MODE = 'off';
      assertEqual(hook.isEnabled(), false, 'Should be disabled when mode is off');
    });

    it('should return true when REFLECTION_HOOK_MODE is "warn"', () => {
      delete process.env.REFLECTION_ENABLED;
      process.env.REFLECTION_HOOK_MODE = 'warn';
      assertEqual(hook.isEnabled(), true, 'Should be enabled in warn mode');
    });

    // Cleanup
    process.env.REFLECTION_ENABLED = originalEnabled;
    process.env.REFLECTION_HOOK_MODE = originalMode;
    if (originalEnabled === undefined) delete process.env.REFLECTION_ENABLED;
    if (originalMode === undefined) delete process.env.REFLECTION_HOOK_MODE;
  });

  describe('shouldTriggerReflection()', () => {
    it('should return true for TaskUpdate with status="completed"', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '42', status: 'completed' },
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });

    it('should return false for TaskUpdate with status="in_progress"', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '42', status: 'in_progress' },
      };
      assertEqual(hook.shouldTriggerReflection(input), false);
    });

    it('should return false for other tools', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/some/path' },
      };
      assertEqual(hook.shouldTriggerReflection(input), false);
    });

    it('should return false when input is null', () => {
      assertEqual(hook.shouldTriggerReflection(null), false);
    });

    it('should handle alternative input format (tool/input instead of tool_name/tool_input)', () => {
      const input = {
        tool: 'TaskUpdate',
        input: { taskId: '42', status: 'completed' },
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });
  });

  describe('queueReflection()', () => {
    it('should create queue file if it does not exist', () => {
      cleanupTestQueue();
      hook.queueReflection(
        {
          taskId: '1',
          trigger: 'task_completion',
          timestamp: '2026-01-25T00:00:00Z',
        },
        TEST_QUEUE_FILE
      );

      assert(fs.existsSync(TEST_QUEUE_FILE), 'Queue file should be created');
      cleanupTestQueue();
    });

    it('should append entry to queue file', () => {
      cleanupTestQueue();
      const entry = {
        taskId: '42',
        trigger: 'task_completion',
        timestamp: '2026-01-25T00:00:00Z',
      };

      hook.queueReflection(entry, TEST_QUEUE_FILE);

      const entries = readTestQueue();
      assertEqual(entries.length, 1, 'Should have 1 entry');
      assertEqual(entries[0].taskId, '42');
      assertEqual(entries[0].trigger, 'task_completion');
      cleanupTestQueue();
    });

    it('should append multiple entries', () => {
      cleanupTestQueue();
      hook.queueReflection({ taskId: '1', trigger: 'task_completion' }, TEST_QUEUE_FILE);
      hook.queueReflection({ taskId: '2', trigger: 'task_completion' }, TEST_QUEUE_FILE);
      hook.queueReflection({ taskId: '3', trigger: 'task_completion' }, TEST_QUEUE_FILE);

      const entries = readTestQueue();
      assertEqual(entries.length, 3, 'Should have 3 entries');
      cleanupTestQueue();
    });

    it('should not write when disabled', () => {
      cleanupTestQueue();
      const originalMode = process.env.REFLECTION_HOOK_MODE;
      process.env.REFLECTION_HOOK_MODE = 'off';

      hook.queueReflection({ taskId: '1', trigger: 'task_completion' }, TEST_QUEUE_FILE);

      assert(!fs.existsSync(TEST_QUEUE_FILE), 'Queue file should not be created when disabled');

      process.env.REFLECTION_HOOK_MODE = originalMode;
      if (originalMode === undefined) delete process.env.REFLECTION_HOOK_MODE;
    });
  });

  describe('createReflectionEntry()', () => {
    it('should create entry with required fields', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '42', status: 'completed', metadata: { summary: 'Done' } },
      };

      const entry = hook.createReflectionEntry(input);

      assertEqual(entry.taskId, '42');
      assertEqual(entry.trigger, 'task_completion');
      assert(entry.timestamp, 'Should have timestamp');
      assertEqual(entry.priority, 'high');
    });

    it('should extract metadata summary if present', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '42',
          status: 'completed',
          metadata: { summary: 'Completed auth feature' },
        },
      };

      const entry = hook.createReflectionEntry(input);

      assertEqual(entry.summary, 'Completed auth feature');
    });
  });
});

// ============================================================
// RUN TESTS
// ============================================================

console.log('\n========================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

// Cleanup
cleanupTestQueue();
hook.QUEUE_FILE = originalQueueFile;

process.exit(failed > 0 ? 1 : 0);
