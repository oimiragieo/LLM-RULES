#!/usr/bin/env node
/**
 * Tests for error-recovery-reflection.cjs hook
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
const TEST_QUEUE_FILE = path.join(__dirname, '../../context/test-error-reflection-queue.jsonl');

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
  hook = require('../../.claude/hooks/reflection/error-recovery-reflection.cjs');
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

describe('error-recovery-reflection.cjs', () => {
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

    // Cleanup
    process.env.REFLECTION_ENABLED = originalEnabled;
    process.env.REFLECTION_HOOK_MODE = originalMode;
    if (originalEnabled === undefined) delete process.env.REFLECTION_ENABLED;
    if (originalMode === undefined) delete process.env.REFLECTION_HOOK_MODE;
  });

  describe('shouldTriggerReflection()', () => {
    it('should return true for Bash with non-zero exit code', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_output: { exit_code: 1, stderr: 'Test failed' },
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });

    it('should return false for Bash with exit code 0', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_output: { exit_code: 0 },
      };
      assertEqual(hook.shouldTriggerReflection(input), false);
    });

    it('should return true when tool_output contains error field', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/nonexistent' },
        tool_output: { error: 'File not found' },
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });

    it('should return false for successful tool calls', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/some/path' },
        tool_output: { content: 'file content' },
      };
      assertEqual(hook.shouldTriggerReflection(input), false);
    });

    it('should return false when input is null', () => {
      assertEqual(hook.shouldTriggerReflection(null), false);
    });

    it('should detect errors in alternative result format', () => {
      const input = {
        tool: 'Bash',
        input: { command: 'failing-command' },
        result: { exit_code: 127, stderr: 'command not found' },
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });
  });

  describe('queueReflection()', () => {
    it('should create queue file if it does not exist', () => {
      cleanupTestQueue();
      hook.queueReflection(
        {
          context: 'error_recovery',
          trigger: 'error',
          timestamp: '2026-01-25T00:00:00Z',
        },
        TEST_QUEUE_FILE
      );

      assert(fs.existsSync(TEST_QUEUE_FILE), 'Queue file should be created');
      cleanupTestQueue();
    });

    it('should append error entry to queue file', () => {
      cleanupTestQueue();
      const entry = {
        context: 'error_recovery',
        trigger: 'error',
        command: 'npm test',
        error: 'Test failed',
        timestamp: '2026-01-25T00:00:00Z',
      };

      hook.queueReflection(entry, TEST_QUEUE_FILE);

      const entries = readTestQueue();
      assertEqual(entries.length, 1, 'Should have 1 entry');
      assertEqual(entries[0].trigger, 'error');
      assertEqual(entries[0].context, 'error_recovery');
      cleanupTestQueue();
    });

    it('should not write when disabled', () => {
      cleanupTestQueue();
      const originalMode = process.env.REFLECTION_HOOK_MODE;
      process.env.REFLECTION_HOOK_MODE = 'off';

      hook.queueReflection({ context: 'error_recovery', trigger: 'error' }, TEST_QUEUE_FILE);

      assert(!fs.existsSync(TEST_QUEUE_FILE), 'Queue file should not be created when disabled');

      process.env.REFLECTION_HOOK_MODE = originalMode;
      if (originalMode === undefined) delete process.env.REFLECTION_HOOK_MODE;
    });
  });

  describe('createReflectionEntry()', () => {
    it('should create entry for Bash error with command and stderr', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_output: { exit_code: 1, stderr: 'FAILED: 3 tests failed' },
      };

      const entry = hook.createReflectionEntry(input);

      assertEqual(entry.context, 'error_recovery');
      assertEqual(entry.trigger, 'error');
      assertEqual(entry.tool, 'Bash');
      assertEqual(entry.command, 'npm test');
      assertEqual(entry.error, 'FAILED: 3 tests failed');
      assertEqual(entry.exitCode, 1);
      assertEqual(entry.priority, 'medium');
      assert(entry.timestamp, 'Should have timestamp');
    });

    it('should create entry for tool error', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/missing/file.txt' },
        tool_output: { error: 'ENOENT: file not found' },
      };

      const entry = hook.createReflectionEntry(input);

      assertEqual(entry.context, 'error_recovery');
      assertEqual(entry.trigger, 'error');
      assertEqual(entry.tool, 'Read');
      assertEqual(entry.error, 'ENOENT: file not found');
      assertEqual(entry.priority, 'medium');
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
