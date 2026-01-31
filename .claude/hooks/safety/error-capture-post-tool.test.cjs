#!/usr/bin/env node
// @ts-check
/**
 * Tests for Error Capture Post-Tool Hook
 *
 * Validates that the error capture hook properly captures errors,
 * generates error IDs, masks sensitive data, and classifies severity.
 *
 * @module hooks/safety/error-capture-post-tool.test
 */

'use strict';

const { describe, it, before, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// We'll require the actual module once implemented
let errorCapture;

// Mock error-writer to avoid file system side effects
const mockErrorWriter = {
  writeError: mock.fn(() => true),
  getActiveLogFile: mock.fn(() => 'errors-2026-01-29.jsonl'),
};

describe('error-capture-post-tool', () => {
  before(() => {
    // Clear any cached modules
    delete require.cache[require.resolve('./error-capture-post-tool.cjs')];
    errorCapture = require('./error-capture-post-tool.cjs');
  });

  beforeEach(() => {
    // Reset mocks
    mockErrorWriter.writeError.mock.resetCalls();
  });

  describe('postToolUse()', () => {
    it('should export postToolUse function', () => {
      assert.strictEqual(typeof errorCapture.postToolUse, 'function');
    });

    it('should pass through when no error', () => {
      const result = errorCapture.postToolUse(
        'Bash',
        { command: 'ls' },
        { content: 'output', error: null },
        {}
      );
      assert.deepStrictEqual(result.tool, 'Bash');
      assert.ok(!result.error);
    });

    it('should capture error when result has error field', () => {
      const result = errorCapture.postToolUse(
        'Bash',
        { command: 'npm test' },
        { error: { message: 'Command failed', code: 1 } },
        { taskId: '42' }
      );
      // Should still pass through (fail-open)
      assert.deepStrictEqual(result.tool, 'Bash');
    });

    it('should generate valid error ID in ERR-XXXXXXXX format', () => {
      const errorId = errorCapture.generateErrorId();
      assert.ok(/^ERR-[A-Z0-9]{8}$/.test(errorId), `Invalid error ID format: ${errorId}`);
    });

    it('should generate unique error IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(errorCapture.generateErrorId());
      }
      assert.strictEqual(ids.size, 100, 'Error IDs are not unique');
    });
  });

  describe('classifyCategory()', () => {
    it('should export classifyCategory function', () => {
      assert.strictEqual(typeof errorCapture.classifyCategory, 'function');
    });

    it('should return TOOL_FAILURE for tool errors', () => {
      assert.strictEqual(
        errorCapture.classifyCategory({ message: 'Command failed' }, 'Bash'),
        'TOOL_FAILURE'
      );
    });

    it('should return SECURITY_VIOLATION for security errors', () => {
      assert.strictEqual(
        errorCapture.classifyCategory({ message: 'SEC-001: Path traversal detected' }, 'Write'),
        'SECURITY_VIOLATION'
      );
    });

    it('should return VALIDATION_ERROR for validation errors', () => {
      assert.strictEqual(
        errorCapture.classifyCategory({ message: 'Schema validation failed' }, 'TaskCreate'),
        'VALIDATION_ERROR'
      );
    });

    it('should return TIMEOUT_ERROR for timeout errors', () => {
      assert.strictEqual(
        errorCapture.classifyCategory({ message: 'Operation timed out' }, 'Bash'),
        'TIMEOUT_ERROR'
      );
    });

    it('should return EXECUTION_ERROR for agent errors', () => {
      assert.strictEqual(
        errorCapture.classifyCategory({ message: 'Task spawn failed' }, 'Task'),
        'EXECUTION_ERROR'
      );
    });

    it('should return MEMORY_ERROR for memory-related errors', () => {
      assert.strictEqual(
        errorCapture.classifyCategory({ message: 'File not found: learnings.md' }, 'Read'),
        'MEMORY_ERROR'
      );
    });
  });

  describe('classifySeverity()', () => {
    it('should export classifySeverity function', () => {
      assert.strictEqual(typeof errorCapture.classifySeverity, 'function');
    });

    it('should return CRITICAL for security violations', () => {
      assert.strictEqual(errorCapture.classifySeverity('SECURITY_VIOLATION', {}), 'CRITICAL');
    });

    it('should return CRITICAL for data loss', () => {
      assert.strictEqual(
        errorCapture.classifySeverity('TOOL_FAILURE', { impact: { dataLoss: true } }),
        'CRITICAL'
      );
    });

    it('should return HIGH for execution errors', () => {
      assert.strictEqual(errorCapture.classifySeverity('EXECUTION_ERROR', {}), 'HIGH');
    });

    it('should return HIGH for task-blocking errors', () => {
      assert.strictEqual(
        errorCapture.classifySeverity('TOOL_FAILURE', { impact: { taskBlocked: true } }),
        'HIGH'
      );
    });

    it('should return MEDIUM for tool failures', () => {
      assert.strictEqual(errorCapture.classifySeverity('TOOL_FAILURE', {}), 'MEDIUM');
    });

    it('should return LOW for recoverable errors', () => {
      assert.strictEqual(
        errorCapture.classifySeverity('TOOL_FAILURE', {
          impact: { recoverable: true, userVisible: false },
        }),
        'LOW'
      );
    });
  });

  describe('buildErrorEntry()', () => {
    it('should export buildErrorEntry function', () => {
      assert.strictEqual(typeof errorCapture.buildErrorEntry, 'function');
    });

    it('should build valid error entry with all required fields', () => {
      const entry = errorCapture.buildErrorEntry(
        { message: 'Command failed', code: 1 },
        'Bash',
        { command: 'npm test' },
        { taskId: '42' }
      );

      // Check required fields
      assert.ok(entry.errorId, 'Missing errorId');
      assert.ok(entry.timestamp, 'Missing timestamp');
      assert.ok(entry.category, 'Missing category');
      assert.ok(entry.severity, 'Missing severity');
      assert.ok(entry.source, 'Missing source');
      assert.ok(entry.message, 'Missing message');
    });

    it('should mask sensitive data in tool input', () => {
      const entry = errorCapture.buildErrorEntry(
        { message: 'Auth failed' },
        'Bash',
        { command: 'export API_KEY=sk-abc123' },
        {}
      );

      // Check that sensitive data is masked
      assert.ok(!JSON.stringify(entry).includes('sk-abc123'));
    });

    it('should include correlation data when available', () => {
      // Set environment variable for session ID
      const originalSessionId = process.env.CLAUDE_SESSION_ID;
      process.env.CLAUDE_SESSION_ID = 'test-session-123';

      const entry = errorCapture.buildErrorEntry(
        { message: 'Error' },
        'Bash',
        {},
        { taskId: '42' }
      );

      // Restore environment
      process.env.CLAUDE_SESSION_ID = originalSessionId;

      assert.ok(entry.correlation, 'Missing correlation');
      assert.strictEqual(entry.correlation.sessionId, 'test-session-123');
    });

    it('should limit stack trace to 3 frames', () => {
      const error = new Error('Test error');
      // Simulate a long stack trace
      error.stack = `Error: Test error
    at function1 (/path/to/file1.js:10:5)
    at function2 (/path/to/file2.js:20:10)
    at function3 (/path/to/file3.js:30:15)
    at function4 (/path/to/file4.js:40:20)
    at function5 (/path/to/file5.js:50:25)`;

      const entry = errorCapture.buildErrorEntry(error, 'Bash', {}, {});

      assert.ok(entry.stack, 'Missing stack');
      assert.ok(entry.stack.length <= 3, `Stack has ${entry.stack.length} frames, expected <= 3`);
    });
  });

  describe('fail-open behavior', () => {
    it('should not throw even if internal processing fails', () => {
      // Pass invalid inputs that might cause internal errors
      assert.doesNotThrow(() => {
        errorCapture.postToolUse(null, null, null, null);
      });
    });

    it('should return valid result even on internal error', () => {
      const result = errorCapture.postToolUse(
        'InvalidTool',
        { invalid: 'data' },
        { error: { circular: {} } }, // Potential circular reference issue
        null
      );

      // Should still return something
      assert.ok(result !== undefined);
    });
  });

  describe('circuit breaker', () => {
    it('should export getCircuitState function', () => {
      assert.strictEqual(typeof errorCapture.getCircuitState, 'function');
    });

    it('should start in CLOSED state', () => {
      const state = errorCapture.getCircuitState();
      assert.strictEqual(state.state, 'CLOSED');
    });

    it('should track failure count', () => {
      const state = errorCapture.getCircuitState();
      assert.ok('failures' in state);
      assert.ok(typeof state.failures === 'number');
    });
  });
});
