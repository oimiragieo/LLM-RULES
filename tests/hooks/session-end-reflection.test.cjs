#!/usr/bin/env node
/**
 * Tests for session-end-reflection.cjs hook
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
const TEST_QUEUE_FILE = path.join(__dirname, '../../context/test-session-reflection-queue.jsonl');

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
  hook = require('../../.claude/hooks/reflection/session-end-reflection.cjs');
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

describe('session-end-reflection.cjs', () => {
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
    it('should return true for Stop event', () => {
      const input = {
        event: 'Stop',
        session_id: 'session-123',
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });

    it('should return true for SessionEnd event', () => {
      const input = {
        event: 'SessionEnd',
        session_id: 'session-123',
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });

    it('should return false for other events', () => {
      const input = {
        event: 'UserPromptSubmit',
        session_id: 'session-123',
      };
      assertEqual(hook.shouldTriggerReflection(input), false);
    });

    it('should return false when input is null', () => {
      assertEqual(hook.shouldTriggerReflection(null), false);
    });

    it('should handle event_type field as alternative', () => {
      const input = {
        event_type: 'Stop',
        session_id: 'session-123',
      };
      assertEqual(hook.shouldTriggerReflection(input), true);
    });
  });

  describe('queueReflection()', () => {
    it('should create queue file if it does not exist', () => {
      cleanupTestQueue();
      hook.queueReflection(
        {
          context: 'session_end',
          trigger: 'session_end',
          timestamp: '2026-01-25T00:00:00Z',
        },
        TEST_QUEUE_FILE
      );

      assert(fs.existsSync(TEST_QUEUE_FILE), 'Queue file should be created');
      cleanupTestQueue();
    });

    it('should append session end entry to queue file', () => {
      cleanupTestQueue();
      const entry = {
        context: 'session_end',
        trigger: 'session_end',
        sessionId: 'session-123',
        timestamp: '2026-01-25T00:00:00Z',
      };

      hook.queueReflection(entry, TEST_QUEUE_FILE);

      const entries = readTestQueue();
      assertEqual(entries.length, 1, 'Should have 1 entry');
      assertEqual(entries[0].trigger, 'session_end');
      assertEqual(entries[0].sessionId, 'session-123');
      cleanupTestQueue();
    });

    it('should not write when disabled', () => {
      cleanupTestQueue();
      const originalMode = process.env.REFLECTION_HOOK_MODE;
      process.env.REFLECTION_HOOK_MODE = 'off';

      hook.queueReflection({ context: 'session_end', trigger: 'session_end' }, TEST_QUEUE_FILE);

      assert(!fs.existsSync(TEST_QUEUE_FILE), 'Queue file should not be created when disabled');

      process.env.REFLECTION_HOOK_MODE = originalMode;
      if (originalMode === undefined) delete process.env.REFLECTION_HOOK_MODE;
    });
  });

  describe('createReflectionEntry()', () => {
    it('should create entry with session context', () => {
      const input = {
        event: 'Stop',
        session_id: 'session-abc123',
      };

      const entry = hook.createReflectionEntry(input);

      assertEqual(entry.context, 'session_end');
      assertEqual(entry.trigger, 'session_end');
      assertEqual(entry.sessionId, 'session-abc123');
      assertEqual(entry.priority, 'low');
      assert(entry.timestamp, 'Should have timestamp');
    });

    it('should include scope as "all_unreflected_tasks"', () => {
      const input = {
        event: 'SessionEnd',
        session_id: 'session-xyz',
      };

      const entry = hook.createReflectionEntry(input);

      assertEqual(entry.scope, 'all_unreflected_tasks');
    });
  });

  describe('getSessionStats()', () => {
    it('should return session statistics when available', () => {
      const input = {
        event: 'Stop',
        session_id: 'session-123',
        stats: {
          tool_calls: 45,
          errors: 2,
          tasks_completed: 3,
        },
      };

      const stats = hook.getSessionStats(input);

      assertEqual(stats.toolCalls, 45);
      assertEqual(stats.errors, 2);
      assertEqual(stats.tasksCompleted, 3);
    });

    it('should return default stats when not available', () => {
      const input = {
        event: 'Stop',
        session_id: 'session-123',
      };

      const stats = hook.getSessionStats(input);

      assertEqual(stats.toolCalls, 0);
      assertEqual(stats.errors, 0);
      assertEqual(stats.tasksCompleted, 0);
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
