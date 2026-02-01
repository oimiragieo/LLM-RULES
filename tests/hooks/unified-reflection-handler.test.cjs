#!/usr/bin/env node
/**
 * Tests for unified-reflection-handler.cjs
 *
 * PERF-003: Hook consolidation for reflection/memory hooks
 *
 * TDD: Write failing tests first, then implement to pass
 *
 * Consolidates:
 * - task-completion-reflection.cjs
 * - error-recovery-reflection.cjs
 * - session-end-reflection.cjs
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

// Test setup/teardown helpers
const TEST_QUEUE_FILE = path.join(__dirname, '../../context/test-unified-reflection-queue.jsonl');

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

  describe('Session Saving', () => {
    const projectRoot = path.join(__dirname, '../..');
    const memoryDir = path.join(projectRoot, '.claude', 'context', 'memory');
    const sessionsDir = path.join(memoryDir, 'sessions');
    const mtmDir = path.join(memoryDir, 'mtm');
    const activeContextPath = path.join(memoryDir, 'active_context.md');

    function listSessionFilesSafe() {
      if (!fs.existsSync(sessionsDir)) return [];
      return fs
        .readdirSync(sessionsDir)
        .filter(f => /^session_\d{3}\.json$/.test(f))
        .sort();
    }

    function listMtmFilesSafe() {
      if (!fs.existsSync(mtmDir)) return [];
      return fs
        .readdirSync(mtmDir)
        .filter(f => /^session_.*\.json$/.test(f))
        .sort();
    }

    it('should gather session insights from structured hook input (preferred)', () => {
      const insights = hook.gatherSessionInsights({
        summary: 'Structured summary',
        tasks_completed: ['T1'],
        patterns_found: ['P1'],
        gotchas_encountered: ['G1'],
        next_steps: ['N1'],
      });

      assertEqual(insights.summary, 'Structured summary');
      assertDeepEqual(insights.tasks_completed, ['T1']);
      assertDeepEqual(insights.patterns_found, ['P1']);
      assertDeepEqual(insights.gotchas_encountered, ['G1']);
      assertDeepEqual(insights.next_steps, ['N1']);
    });

    it('should extract tasks_completed from markdown', () => {
      const parsed = hook.parseSessionInsightsFromMarkdown(
        ['Summary.', '', '## Tasks Completed', '- A', '- B'].join('\n')
      );
      assertDeepEqual(parsed.tasks_completed, ['A', 'B']);
    });

    it('should extract patterns_found from markdown', () => {
      const parsed = hook.parseSessionInsightsFromMarkdown(
        ['Summary.', '', '## Patterns Found', '- Use foo', '- Use bar'].join('\n')
      );
      assertDeepEqual(parsed.patterns_found, ['Use foo', 'Use bar']);
    });

    it('should extract gotchas_encountered from markdown', () => {
      const parsed = hook.parseSessionInsightsFromMarkdown(
        ['Summary.', '', '## Gotchas', '- Avoid baz'].join('\n')
      );
      assertDeepEqual(parsed.gotchas_encountered, ['Avoid baz']);
    });

    it('should handle missing active_context.md gracefully', () => {
      const originalExists = fs.existsSync(activeContextPath);
      const backupPath = `${activeContextPath}.bak-test`;

      try {
        if (originalExists) {
          fs.renameSync(activeContextPath, backupPath);
        }

        const insights = hook.gatherSessionInsights();
        assertEqual(insights.summary, 'Session ended');
        assertDeepEqual(insights.tasks_completed, []);
      } finally {
        if (fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, activeContextPath);
        }
      }
    });

    it('should handle empty active_context.md gracefully', () => {
      const original = fs.existsSync(activeContextPath)
        ? fs.readFileSync(activeContextPath, 'utf8')
        : null;

      try {
        fs.mkdirSync(path.dirname(activeContextPath), { recursive: true });
        fs.writeFileSync(activeContextPath, '', 'utf8');

        const insights = hook.gatherSessionInsights();
        assertEqual(insights.summary, 'Session ended');
        assertDeepEqual(insights.tasks_completed, []);
        assertDeepEqual(insights.patterns_found, []);
        assertDeepEqual(insights.gotchas_encountered, []);
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

    it('should create a session file when recordSession called', () => {
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.mkdirSync(mtmDir, { recursive: true });

      const beforeSessions = new Set(listSessionFilesSafe());
      const beforeMtm = new Set(listMtmFilesSafe());

      // Avoid triggering pruning/summarization in real memory dirs.
      if (beforeSessions.size >= 50 || beforeMtm.size >= 10) {
        console.log(
          '  [SKIP] recordSession persistence assertions (existing memory dirs near capacity)'
        );
        return;
      }

      const sessionData = {
        session_id: `test-session-${Date.now()}`,
        summary: 'Test session persistence',
        tasks_completed: ['T1'],
        files_modified: [],
        discoveries: [],
        patterns_found: [],
        gotchas_encountered: [],
        decisions_made: [],
        next_steps: [],
        timestamp: new Date().toISOString(),
      };

      hook.recordSession(sessionData);

      const afterSessions = new Set(listSessionFilesSafe());
      const afterMtm = new Set(listMtmFilesSafe());

      const newSessions = [...afterSessions].filter(f => !beforeSessions.has(f));
      assert(newSessions.length >= 1, 'Expected new sessions/session_XXX.json file');

      const newMtm = [...afterMtm].filter(f => !beforeMtm.has(f));
      assert(newMtm.length >= 1, 'Expected new mtm/session_TIMESTAMP.json file');

      // Cleanup only files created by this test.
      for (const f of newSessions) {
        try {
          fs.unlinkSync(path.join(sessionsDir, f));
        } catch (_e) {
          // ignore
        }
      }
      for (const f of newMtm) {
        try {
          fs.unlinkSync(path.join(mtmDir, f));
        } catch (_e) {
          // ignore
        }
      }
    });
  });

  describe('handleMemoryExtraction()', () => {
    it('should extract patterns from Task output', () => {
      const input = {
        tool_name: 'Task',
        tool_output:
          'I used this pattern: Use TDD for all code changes. This best practice: always write failing test first.',
      };

      const result = hook.handleMemoryExtraction(input);

      assert(Array.isArray(result.patterns), 'Should have patterns array');
      assert(result.patterns.length > 0, 'Should extract at least one pattern');
    });

    it('should extract gotchas from Task output', () => {
      const input = {
        tool_name: 'Task',
        tool_output:
          "Gotcha: Windows paths need escaping. Warning: Don't use synchronous fs methods in hooks.",
      };

      const result = hook.handleMemoryExtraction(input);

      assert(Array.isArray(result.gotchas), 'Should have gotchas array');
      assert(result.gotchas.length > 0, 'Should extract at least one gotcha');
    });

    it('should extract file discoveries from Task output', () => {
      const input = {
        tool_name: 'Task',
        tool_output:
          'The file `router-state.cjs` handles all router state management. Module `hook-input.cjs` is the shared input parser.',
      };

      const result = hook.handleMemoryExtraction(input);

      assert(Array.isArray(result.discoveries), 'Should have discoveries array');
      assert(result.discoveries.length > 0, 'Should extract at least one discovery');
    });

    it('should limit extracted items to prevent memory bloat', () => {
      // Generate output with many patterns
      const manyPatterns = Array(10).fill('pattern: Use this approach for better code').join('. ');
      const input = {
        tool_name: 'Task',
        tool_output: manyPatterns,
      };

      const result = hook.handleMemoryExtraction(input);

      // Should limit to max 3 patterns (as per original implementation)
      assert(result.patterns.length <= 3, 'Should limit patterns to 3');
    });

    it('should return empty arrays for output with no extractable content', () => {
      const input = {
        tool_name: 'Task',
        tool_output: 'Task completed successfully.',
      };

      const result = hook.handleMemoryExtraction(input);

      assertDeepEqual(result.patterns, []);
      assertDeepEqual(result.gotchas, []);
      assertDeepEqual(result.discoveries, []);
    });
  });

  describe('queueReflection()', () => {
    // Reset env for these tests
    delete process.env.REFLECTION_ENABLED;
    delete process.env.REFLECTION_HOOK_MODE;

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
      process.env.REFLECTION_HOOK_MODE = 'off';

      hook.queueReflection({ taskId: '1', trigger: 'task_completion' }, TEST_QUEUE_FILE);

      assert(!fs.existsSync(TEST_QUEUE_FILE), 'Queue file should not be created when disabled');

      delete process.env.REFLECTION_HOOK_MODE;
    });
  });

  describe('PERF-003: Integration - event routing', () => {
    // Reset env for these tests
    delete process.env.REFLECTION_ENABLED;
    delete process.env.REFLECTION_HOOK_MODE;

    it('should route TaskUpdate(completed) to task_completion handler', () => {
      cleanupTestQueue();
      const input = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '99', status: 'completed' },
      };

      const eventType = hook.detectEventType(input);
      assertEqual(eventType, 'task_completion');

      // Verify handler produces correct entry
      const entry = hook.handleTaskCompletion(input);
      assertEqual(entry.taskId, '99');
      assertEqual(entry.trigger, 'task_completion');
    });

    it('should route Bash(error) to error_recovery handler', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: { command: 'npm run fail' },
        tool_output: { exit_code: 127, stderr: 'npm not found' },
      };

      const eventType = hook.detectEventType(input);
      assertEqual(eventType, 'error_recovery');

      // Verify handler produces correct entry
      const entry = hook.handleErrorRecovery(input);
      assertEqual(entry.tool, 'Bash');
      assertEqual(entry.command, 'npm run fail');
      assertEqual(entry.trigger, 'error');
    });

    it('should route SessionEnd to session_end handler', () => {
      const input = {
        event: 'SessionEnd',
        session_id: 'test-session',
      };

      const eventType = hook.detectEventType(input);
      assertEqual(eventType, 'session_end');

      // Verify handler produces correct result
      const result = hook.handleSessionEnd(input);
      assertEqual(result.reflection.trigger, 'session_end');
      assertEqual(result.reflection.sessionId, 'test-session');
    });

    it('should route Task(output) to memory_extraction handler', () => {
      const input = {
        tool_name: 'Task',
        tool_input: { prompt: 'Analyze this' },
        tool_output:
          'Pattern: Use TDD. Gotcha: Windows paths need escaping. File `test.js` handles tests.',
      };

      const eventType = hook.detectEventType(input);
      assertEqual(eventType, 'memory_extraction');

      // Verify handler extracts content
      const result = hook.handleMemoryExtraction(input);
      assert(Array.isArray(result.patterns), 'Should have patterns');
      assert(Array.isArray(result.gotchas), 'Should have gotchas');
      assert(Array.isArray(result.discoveries), 'Should have discoveries');
    });

    it('should not route unhandled events', () => {
      const input = {
        tool_name: 'Read',
        tool_input: { file_path: '/some/file.js' },
      };

      const eventType = hook.detectEventType(input);
      assertEqual(eventType, null, 'Read should not be handled');
    });
  });

  describe('SessionEnd activations', () => {
    it('should export SessionEnd activation helpers', () => {
      assertEqual(typeof hook.triggerEmbeddingGeneration, 'function');
      assertEqual(typeof hook.triggerMaintenance, 'function');
    });

    it('triggerEmbeddingGeneration should enqueue vector writes for modified memory files (stubbed)', async () => {
      const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
      const memoryFileRel = '.claude/context/memory/test-embeddings.md';
      const memoryFileAbs = path.resolve(PROJECT_ROOT, memoryFileRel);

      const chromaModulePath = path.resolve(PROJECT_ROOT, '.claude/lib/memory/chromadb-client.cjs');
      const embeddingsModulePath = path.resolve(
        PROJECT_ROOT,
        '.claude/tools/cli/generate-embeddings.cjs'
      );

      const chromaKey = require.resolve(chromaModulePath);
      const embeddingsKey = require.resolve(embeddingsModulePath);
      const originalChroma = require.cache[chromaKey];
      const originalEmbeddings = require.cache[embeddingsKey];

      const adds = [];

      try {
        fs.mkdirSync(path.dirname(memoryFileAbs), { recursive: true });
        fs.writeFileSync(memoryFileAbs, '## Section A\n\nHello\n\n## Section B\n\nWorld\n', 'utf8');

        require.cache[chromaKey] = {
          id: chromaKey,
          filename: chromaKey,
          loaded: true,
          exports: {
            MemoryVectorStore: class MemoryVectorStoreStub {
              async initialize() {}
              async isAvailable() {
                return true;
              }
              async getCollection() {
                return {
                  add: async payload => {
                    adds.push(payload);
                  },
                };
              }
            },
          },
        };

        require.cache[embeddingsKey] = {
          id: embeddingsKey,
          filename: embeddingsKey,
          loaded: true,
          exports: {
            chunkByHeaders: () => [
              { section: 'Section A', content: 'Hello', line: 1 },
              { section: 'Section B', content: 'World', line: 5 },
            ],
            extractMetadata: (_filePath, section, line) => ({
              filePath: 'test-embeddings.md',
              section,
              line,
              type: 'unknown',
              timestamp: '2026-02-01',
            }),
          },
        };

        await hook.triggerEmbeddingGeneration({ files_modified: [memoryFileRel] });

        assertEqual(adds.length, 1, 'Should add a single batch per file');
        assertEqual(adds[0].ids.length, 2, 'Should add two chunks');
        assertEqual(adds[0].metadatas[0].section, 'Section A');
        assertEqual(adds[0].metadatas[1].section, 'Section B');
      } finally {
        if (originalChroma) require.cache[chromaKey] = originalChroma;
        else delete require.cache[chromaKey];
        if (originalEmbeddings) require.cache[embeddingsKey] = originalEmbeddings;
        else delete require.cache[embeddingsKey];

        if (fs.existsSync(memoryFileAbs)) fs.unlinkSync(memoryFileAbs);
      }
    });

    it('triggerMaintenance should run daily and weekly maintenance when due (stubbed)', () => {
      const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
      const schedulerModulePath = path.resolve(
        PROJECT_ROOT,
        '.claude/lib/memory/memory-scheduler.cjs'
      );
      const schedulerKey = require.resolve(schedulerModulePath);
      const originalScheduler = require.cache[schedulerKey];

      const calls = { daily: 0, weekly: 0 };

      try {
        require.cache[schedulerKey] = {
          id: schedulerKey,
          filename: schedulerKey,
          loaded: true,
          exports: {
            runDailyMaintenance: () => {
              calls.daily++;
            },
            runWeeklyMaintenance: () => {
              calls.weekly++;
            },
            getMaintenanceStatus: () => ({
              lastWeekly: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            }),
          },
        };

        hook.triggerMaintenance();

        assertEqual(calls.daily, 1, 'Should run daily maintenance');
        assertEqual(calls.weekly, 1, 'Should run weekly maintenance when due');
      } finally {
        if (originalScheduler) require.cache[schedulerKey] = originalScheduler;
        else delete require.cache[schedulerKey];
      }
    });
  });
});

// ============================================================
// RUN TESTS
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
