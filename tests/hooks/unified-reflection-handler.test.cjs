#!/usr/bin/env node
/**
 * Tests for unified-reflection-handler.cjs
 *
 * PERF-003: Hook consolidation for reflection/memory hooks
 *
 * TDD: Write failing tests first, then implement to pass
 *
 * Consolidates:
 * - task-completion-reflection.cjs (archived)
 * - error-recovery-reflection.cjs (archived)
 * - session-end-reflection.cjs (archived)
 * - session-memory-extractor.cjs
 * - session-end-recorder.cjs
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Test framework
let passed = 0;
let failed = 0;
const pending = [];

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

function it(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(
        result.then(
          () => {
            console.log(`  [PASS] ${name}`);
            passed++;
          },
          err => {
            console.log(`  [FAIL] ${name}`);
            console.log(`         ${err.message}`);
            failed++;
          }
        )
      );
      return;
    }

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

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `Expected ${expectedStr}, got ${actualStr}`);
  }
}

const TEST_QUEUE_FILE = path.join(
  __dirname,
  '../../.claude/context/test-unified-reflection-queue.jsonl'
);
function cleanupTestQueue() {
  if (fs.existsSync(TEST_QUEUE_FILE)) {
    fs.unlinkSync(TEST_QUEUE_FILE);
  }
}

function _readTestQueue() {
  if (!fs.existsSync(TEST_QUEUE_FILE)) return [];
  const content = fs.readFileSync(TEST_QUEUE_FILE, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map(line => JSON.parse(line));
}

// Import the module under test
let hook;
try {
  hook = require('../../.claude/hooks/reflection/unified-reflection-handler.cjs');
} catch (e) {
  console.log('WARNING: Module not implemented yet. Tests will fail.\n');
  console.log('Error:', e.message);
  hook = {
    isEnabled: () => false,
    detectEventType: () => null,
    shouldHandle: () => false,
    handleTaskCompletion: () => null,
    handleErrorRecovery: () => null,
    handleSessionEnd: () => null,
    handleMemoryExtraction: () => null,
    queueReflection: () => {},
    main: async () => {},
    QUEUE_FILE: TEST_QUEUE_FILE,
  };
}

// Override queue file for testing
let originalQueueFile;
try {
  originalQueueFile = hook.QUEUE_FILE;
  hook.QUEUE_FILE = TEST_QUEUE_FILE;
} catch (_e) {
  // Ignore if not settable
}

// ============================================================
// TESTS
// ============================================================

// Save original env vars at module level for cleanup
const origReflectionEnabled = process.env.REFLECTION_ENABLED;
const origReflectionMode = process.env.REFLECTION_HOOK_MODE;

describe('unified-reflection-handler.cjs', () => {
  describe('isEnabled()', () => {
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

    // Restore
    if (origReflectionEnabled !== undefined) {
      process.env.REFLECTION_ENABLED = origReflectionEnabled;
    } else {
      delete process.env.REFLECTION_ENABLED;
    }
    if (origReflectionMode !== undefined) {
      process.env.REFLECTION_HOOK_MODE = origReflectionMode;
    } else {
      delete process.env.REFLECTION_HOOK_MODE;
    }
  });

  describe('detectEventType()', () => {
    it('should detect task_completion for TaskUpdate with status=completed', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '42', status: 'completed' },
      };
      assertEqual(hook.detectEventType(input), 'task_completion');
    });

    // PERF-003 #2: Now tracks all TaskUpdate calls (was task-update-tracker.cjs)
    it('should detect task_update for TaskUpdate with status=in_progress', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '42', status: 'in_progress' },
      };
      assertEqual(hook.detectEventType(input), 'task_update');
    });

    it('should detect task_completion for TaskUpdate with task_id alias', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { task_id: '42', status: 'completed' },
      };
      assertEqual(hook.detectEventType(input), 'task_completion');
    });

    it('should detect error_recovery for Bash with non-zero exit code', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'failing-command' },
        tool_output: { exit_code: 1, stderr: 'command not found' },
      };
      assertEqual(hook.detectEventType(input), 'error_recovery');
    });

    it('should detect error_recovery for Bash with exit_code 0 but error field', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'some-command' },
        tool_output: { exit_code: 0, error: 'Some error occurred' },
      };
      assertEqual(hook.detectEventType(input), 'error_recovery');
    });

    it('should return null for Bash with exit_code 0 and no error', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'successful-command' },
        tool_output: { exit_code: 0, stdout: 'success' },
      };
      assertEqual(hook.detectEventType(input), null);
    });

    it('should detect memory_extraction for Task tool', () => {
      const input = {
        tool_name: 'Task',
        tool_input: { prompt: 'Do something' },
        tool_output: 'Task completed with pattern: use TDD for all code changes',
      };
      assertEqual(hook.detectEventType(input), 'memory_extraction');
    });

    it('should return null for Task tool with short output', () => {
      const input = {
        tool_name: 'Task',
        tool_input: { prompt: 'Do something' },
        tool_output: 'Done',
      };
      assertEqual(hook.detectEventType(input), null);
    });

    it('should detect session_end for Stop event', () => {
      const input = {
        event: 'Stop',
      };
      assertEqual(hook.detectEventType(input), 'session_end');
    });

    it('should detect session_end for SessionEnd event', () => {
      const input = {
        event: 'SessionEnd',
      };
      assertEqual(hook.detectEventType(input), 'session_end');
    });

    it('should detect session_end for event_type field (alternative format)', () => {
      const input = {
        event_type: 'SessionEnd',
      };
      assertEqual(hook.detectEventType(input), 'session_end');
    });

    it('should return null for other tools', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/some/path' },
      };
      assertEqual(hook.detectEventType(input), null);
    });

    it('should return null for null input', () => {
      assertEqual(hook.detectEventType(null), null);
    });

    it('should handle alternative input format (tool/input vs tool_name/tool_input)', () => {
      const input = {
        tool: 'TaskUpdate',
        input: { taskId: '42', status: 'completed' },
      };
      assertEqual(hook.detectEventType(input), 'task_completion');
    });
  });

  describe('handleTaskCompletion()', () => {
    it('should create reflection entry with required fields', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '42', status: 'completed' },
      };

      const entry = hook.handleTaskCompletion(input);

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

      const entry = hook.handleTaskCompletion(input);

      assertEqual(entry.summary, 'Completed auth feature');
    });

    it('should include fallback summary when metadata summary is missing', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '77',
          status: 'completed',
        },
      };

      const entry = hook.handleTaskCompletion(input);

      assert(entry.summary, 'Should include a non-empty summary');
      assertEqual(entry.summary, 'Task 77 completed without summary metadata');
    });
  });

  // PERF-003 #2: Tests for TaskUpdate tracking (consolidated from task-update-tracker.cjs)
  describe('handleTaskUpdate()', () => {
    it('should exist as exported function', () => {
      assert(typeof hook.handleTaskUpdate === 'function', 'handleTaskUpdate should be exported');
    });

    it('should not throw when called with valid input', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '99', status: 'in_progress' },
      };
      // Should not throw
      hook.handleTaskUpdate(input);
    });

    it('should not throw when task_id alias is used', () => {
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { task_id: '100', status: 'in_progress' },
      };
      hook.handleTaskUpdate(input);
    });
  });

  describe('handleErrorRecovery()', () => {
    it('should create reflection entry for Bash error', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_output: { exit_code: 1, stderr: 'Test failed' },
      };

      const entry = hook.handleErrorRecovery(input);

      assertEqual(entry.trigger, 'error');
      assertEqual(entry.context, 'error_recovery');
      assertEqual(entry.tool, 'Bash');
      assertEqual(entry.command, 'npm test');
      assertEqual(entry.exitCode, 1);
      assert(entry.timestamp, 'Should have timestamp');
    });

    it('should include error message from stderr', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'failing-cmd' },
        tool_output: { exit_code: 2, stderr: 'command not found' },
      };

      const entry = hook.handleErrorRecovery(input);

      assertEqual(entry.error, 'command not found');
    });

    it('should include file_path if present in tool_input', () => {
      const input = {
        tool_name: 'Edit',
        tool_input: { file_path: '/some/file.js' },
        tool_output: { error: 'File not found' },
      };

      const entry = hook.handleErrorRecovery(input);

      assertEqual(entry.filePath, '/some/file.js');
    });
  });

  describe('handleSessionEnd()', () => {
    it('should create reflection entry for session end', () => {
      const input = {
        event: 'SessionEnd',
        session_id: 'session-123',
      };

      const result = hook.handleSessionEnd(input);

      assertEqual(result.reflection.trigger, 'session_end');
      assertEqual(result.reflection.context, 'session_end');
      assertEqual(result.reflection.sessionId, 'session-123');
      assertEqual(result.reflection.scope, 'all_unreflected_tasks');
      assert(result.reflection.timestamp, 'Should have timestamp');
    });

    it('should also return session data for memory recording', () => {
      const input = {
        event: 'SessionEnd',
        session_id: 'session-456',
        stats: { tool_calls: 10, errors: 2, tasks_completed: 3 },
      };

      const result = hook.handleSessionEnd(input);

      // Check reflection entry
      assertEqual(result.reflection.context, 'session_end');

      // Check session data for memory recording
      assert(result.sessionData, 'Should have sessionData');
      assert(result.sessionData.session_id, 'Session data should have session_id');
      assert(result.sessionData.timestamp, 'Session data should have timestamp');
    });

    it('should extract session stats', () => {
      const input = {
        event: 'SessionEnd',
        stats: { tool_calls: 50, errors: 5, tasks_completed: 10 },
      };

      const result = hook.handleSessionEnd(input);

      assertDeepEqual(result.reflection.stats, {
        toolCalls: 50,
        errors: 5,
        tasksCompleted: 10,
      });
    });

    it('should gather session insights from active_context.md (fallback)', () => {
      const activeContextPath = path.join(
        __dirname,
        '../..',
        '.claude',
        'context',
        'memory',
        'active_context.md'
      );

      const original = fs.existsSync(activeContextPath)
        ? fs.readFileSync(activeContextPath, 'utf8')
        : null;

      try {
        fs.mkdirSync(path.dirname(activeContextPath), { recursive: true });
        fs.writeFileSync(
          activeContextPath,
          [
            'Session summary line.',
            '',
            '## Tasks Completed',
            '- Did A',
            '',
            '## Patterns',
            '- Use Zod schemas',
            '',
            '## Gotchas',
            '- Watch out for Windows path casing',
          ].join('\n'),
          'utf8'
        );

        const result = hook.handleSessionEnd({ event: 'SessionEnd', session_id: 'session-xyz' });
        assertEqual(result.sessionData.summary, 'Session summary line.');
        assertDeepEqual(result.sessionData.tasks_completed, ['Did A']);
        assertDeepEqual(result.sessionData.patterns_found, ['Use Zod schemas']);
        assertDeepEqual(result.sessionData.gotchas_encountered, [
          'Watch out for Windows path casing',
        ]);
      } finally {
        if (original === null) {
          try {
            fs.unlinkSync(activeContextPath);
          } catch (_e) {
            // ignore
          }
        } else {
          fs.writeFileSync(activeContextPath, original, 'utf8');
        }
      }
    });
  });
});
// ============================================================

Promise.allSettled(pending).then(() => {
  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  // Cleanup
  cleanupTestQueue();
  try {
    hook.QUEUE_FILE = originalQueueFile;
  } catch (_e) {
    // Ignore
  }

  // Restore env
  if (origReflectionEnabled !== undefined) {
    process.env.REFLECTION_ENABLED = origReflectionEnabled;
  } else {
    delete process.env.REFLECTION_ENABLED;
  }
  if (origReflectionMode !== undefined) {
    process.env.REFLECTION_HOOK_MODE = origReflectionMode;
  } else {
    delete process.env.REFLECTION_HOOK_MODE;
  }

  process.exit(failed > 0 ? 1 : 0);
});
