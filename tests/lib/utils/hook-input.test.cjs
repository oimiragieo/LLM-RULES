#!/usr/bin/env node
/**
 * Hook Input Parser Tests
 * =======================
 *
 * TDD tests for the hook-input.cjs module.
 * Tests cover: parseHookInput, isEnabled, auditLog, extractFilePath
 *
 * This module addresses PERF-006: parseHookInput() duplicated in 40+ hooks.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// The module we're testing
let hookInput;
try {
  hookInput = require('../../../.claude/lib/utils/hook-input.cjs');
} catch (_err) {
  // Module doesn't exist yet - expected in RED phase
  hookInput = null;
}

describe('hook-input', () => {
  let testDir;
  let originalArgv;
  let originalEnv;

  beforeEach(() => {
    // Create temp directory for test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-input-test-'));

    // Save original process values
    originalArgv = process.argv.slice();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore process values
    process.argv = originalArgv;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }

    // Clean up temp directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('module exports', () => {
    it('should export parseHookInputSync function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(
        typeof hookInput.parseHookInputSync,
        'function',
        'parseHookInputSync should be a function'
      );
    });

    it('should export parseHookInputAsync function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(
        typeof hookInput.parseHookInputAsync,
        'function',
        'parseHookInputAsync should be a function'
      );
    });

    it('should export isEnabled function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(typeof hookInput.isEnabled, 'function', 'isEnabled should be a function');
    });

    it('should export auditLog function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(typeof hookInput.auditLog, 'function', 'auditLog should be a function');
    });

    it('should export extractFilePath function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(
        typeof hookInput.extractFilePath,
        'function',
        'extractFilePath should be a function'
      );
    });

    it('should export validateHookInput function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(
        typeof hookInput.validateHookInput,
        'function',
        'validateHookInput should be a function'
      );
    });
  });

  describe('parseHookInputSync', () => {
    it('should parse JSON from argv[2]', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const testData = { tool_name: 'Edit', tool_input: { file_path: '/test.js' } };
      process.argv[2] = JSON.stringify(testData);

      const result = hookInput.parseHookInputSync();
      assert.deepStrictEqual(result.tool_name, testData.tool_name);
      assert.deepStrictEqual(result.tool_input.file_path, testData.tool_input.file_path);
    });

    it('should return null for invalid JSON', () => {
      assert.ok(hookInput, 'Module should be loadable');

      process.argv[2] = 'not valid json {{{';

      const result = hookInput.parseHookInputSync();
      assert.strictEqual(result, null, 'Should return null for invalid JSON');
    });

    it('should return null when argv[2] is undefined', () => {
      assert.ok(hookInput, 'Module should be loadable');

      delete process.argv[2];

      const result = hookInput.parseHookInputSync();
      assert.strictEqual(result, null, 'Should return null when no argv[2]');
    });

    it('should strip prototype pollution keys', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const maliciousData = {
        tool_name: 'Edit',
        __proto__: { polluted: true },
        constructor: { malicious: true },
      };
      process.argv[2] = JSON.stringify(maliciousData);

      const result = hookInput.parseHookInputSync();
      assert.strictEqual(result.tool_name, 'Edit');
      assert.strictEqual(result.polluted, undefined, '__proto__ should be stripped');
      assert.strictEqual(result.malicious, undefined, 'constructor should be stripped');
    });
  });

  describe('validateHookInput', () => {
    it('should validate and sanitize hook input JSON', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const input = JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: '/test.js', content: 'hello' },
      });

      const result = hookInput.validateHookInput(input);
      assert.strictEqual(result.tool_name, 'Write');
      assert.deepStrictEqual(result.tool_input.file_path, '/test.js');
    });

    it('should return null for non-string input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.validateHookInput(null);
      assert.strictEqual(result, null);
    });

    it('should return null for empty string', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.validateHookInput('');
      assert.strictEqual(result, null);
    });

    it('should return null for arrays', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.validateHookInput(JSON.stringify([1, 2, 3]));
      assert.strictEqual(result, null, 'Arrays should not be valid hook input');
    });

    it('should strip unknown properties', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const input = JSON.stringify({
        tool_name: 'Edit',
        tool_input: {},
        unknown_malicious_key: 'attack',
        __proto__: { hack: true },
      });

      const result = hookInput.validateHookInput(input);
      assert.strictEqual(result.tool_name, 'Edit');
      assert.strictEqual(result.unknown_malicious_key, undefined);
    });

    it('should deep copy nested objects', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const input = JSON.stringify({
        tool_name: 'Edit',
        tool_input: {
          file_path: '/test.js',
          nested: { deep: { value: 1 } },
        },
      });

      const result = hookInput.validateHookInput(input);

      // Modify the result
      result.tool_input.nested.deep.value = 999;

      // Parse again - should not be affected
      const result2 = hookInput.validateHookInput(input);
      assert.strictEqual(result2.tool_input.nested.deep.value, 1, 'Should be deep copied');
    });
  });

  describe('extractFilePath', () => {
    it('should extract file_path from tool_input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.extractFilePath({ file_path: '/test.js' });
      assert.strictEqual(result, '/test.js');
    });

    it('should extract filePath (camelCase) from tool_input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.extractFilePath({ filePath: '/test.ts' });
      assert.strictEqual(result, '/test.ts');
    });

    it('should extract path from tool_input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.extractFilePath({ path: '/test.py' });
      assert.strictEqual(result, '/test.py');
    });

    it('should extract notebook_path from tool_input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.extractFilePath({ notebook_path: '/notebook.ipynb' });
      assert.strictEqual(result, '/notebook.ipynb');
    });

    it('should return null for empty or null input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      assert.strictEqual(hookInput.extractFilePath(null), null);
      assert.strictEqual(hookInput.extractFilePath(undefined), null);
      assert.strictEqual(hookInput.extractFilePath({}), null);
    });

    it('should prioritize file_path over other keys', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const result = hookInput.extractFilePath({
        file_path: '/priority.js',
        path: '/fallback.js',
        filePath: '/camel.js',
      });
      assert.strictEqual(result, '/priority.js');
    });
  });

  describe('isEnabled', () => {
    it('should return true when env var is not set (default)', () => {
      assert.ok(hookInput, 'Module should be loadable');

      delete process.env.TEST_ENFORCEMENT;
      const result = hookInput.isEnabled('TEST_ENFORCEMENT', 'block');
      assert.strictEqual(result, true, 'Should be enabled by default when block mode');
    });

    it('should return false when env var is "off"', () => {
      assert.ok(hookInput, 'Module should be loadable');

      process.env.TEST_ENFORCEMENT = 'off';
      const result = hookInput.isEnabled('TEST_ENFORCEMENT', 'block');
      assert.strictEqual(result, false, 'Should be disabled when off');
    });

    it('should return true when env var is "block"', () => {
      assert.ok(hookInput, 'Module should be loadable');

      process.env.TEST_ENFORCEMENT = 'block';
      const result = hookInput.isEnabled('TEST_ENFORCEMENT', 'block');
      assert.strictEqual(result, true, 'Should be enabled when block');
    });

    it('should return true when env var is "warn"', () => {
      assert.ok(hookInput, 'Module should be loadable');

      process.env.TEST_ENFORCEMENT = 'warn';
      const result = hookInput.isEnabled('TEST_ENFORCEMENT', 'block');
      assert.strictEqual(result, true, 'Should be enabled when warn (just not blocking)');
    });

    it('should use default mode when env var not set', () => {
      assert.ok(hookInput, 'Module should be loadable');

      delete process.env.TEST_CUSTOM_DEFAULT;
      const result = hookInput.isEnabled('TEST_CUSTOM_DEFAULT', 'warn');
      assert.strictEqual(result, true, 'Should use provided default');
    });
  });

  describe('getEnforcementMode', () => {
    it('should return env var value when set', () => {
      assert.ok(hookInput, 'Module should be loadable');

      process.env.TEST_MODE = 'warn';
      const result = hookInput.getEnforcementMode('TEST_MODE', 'block');
      assert.strictEqual(result, 'warn');
    });

    it('should return default when env var not set', () => {
      assert.ok(hookInput, 'Module should be loadable');

      delete process.env.UNSET_MODE;
      const result = hookInput.getEnforcementMode('UNSET_MODE', 'block');
      assert.strictEqual(result, 'block');
    });

    it('should return default for invalid mode values', () => {
      assert.ok(hookInput, 'Module should be loadable');

      process.env.INVALID_MODE = 'invalid_value';
      const result = hookInput.getEnforcementMode('INVALID_MODE', 'block');
      assert.strictEqual(result, 'block', 'Should return default for invalid values');
    });
  });

  describe('formatResult', () => {
    it('should emit deny decision for block results', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const output = JSON.parse(hookInput.formatResult('block', 'blocked for policy'));
      assert.strictEqual(output.permissionDecision, 'deny');
      assert.strictEqual(output.permissionDecisionReason, 'blocked for policy');
      assert.strictEqual(output.result, 'block');
      assert.strictEqual(output.message, 'blocked for policy');
    });

    it('should emit allow decision for warn results', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const output = JSON.parse(hookInput.formatResult('warn', 'warning only'));
      assert.strictEqual(output.permissionDecision, 'allow');
      assert.strictEqual(output.permissionDecisionReason, 'warning only');
      assert.strictEqual(output.result, 'warn');
      assert.strictEqual(output.message, 'warning only');
    });

    it('should preserve object-style allow payloads from legacy hooks', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const output = JSON.parse(hookInput.formatResult({ allow: true, message: 'ok' }));
      assert.strictEqual(output.allow, true);
      assert.strictEqual(output.permissionDecision, 'allow');
      assert.strictEqual(output.permissionDecisionReason, 'ok');
      assert.strictEqual(output.message, 'ok');
    });
  });

  describe('auditLog', () => {
    it('should output JSON to stderr', () => {
      assert.ok(hookInput, 'Module should be loadable');

      // Capture stderr
      let captured = '';
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => {
        captured += chunk;
        return true;
      };

      hookInput.auditLog('test-hook', 'test_event', { key: 'value' });

      process.stderr.write = originalStderr;

      // Parse captured output
      const parsed = JSON.parse(captured.trim());
      assert.strictEqual(parsed.hook, 'test-hook');
      assert.strictEqual(parsed.event, 'test_event');
      assert.strictEqual(parsed.key, 'value');
      assert.ok(parsed.timestamp, 'Should have timestamp');
    });

    it('should include timestamp in ISO format', () => {
      assert.ok(hookInput, 'Module should be loadable');

      let captured = '';
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => {
        captured += chunk;
        return true;
      };

      hookInput.auditLog('hook', 'event', {});

      process.stderr.write = originalStderr;

      const parsed = JSON.parse(captured.trim());
      // Validate ISO date format
      const date = new Date(parsed.timestamp);
      assert.ok(!isNaN(date.getTime()), 'Timestamp should be valid ISO date');
    });
  });

  describe('auditSecurityOverride (SEC-AUDIT-016)', () => {
    it('should export auditSecurityOverride function', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.strictEqual(
        typeof hookInput.auditSecurityOverride,
        'function',
        'auditSecurityOverride should be a function'
      );
    });

    it('should output JSON to stderr with SECURITY_OVERRIDE type', () => {
      assert.ok(hookInput, 'Module should be loadable');

      // Capture stderr
      let captured = '';
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => {
        captured += chunk;
        return true;
      };

      hookInput.auditSecurityOverride(
        'routing-guard',
        'ROUTER_BASH_GUARD',
        'off',
        'Router can use any Bash command'
      );

      process.stderr.write = originalStderr;

      // Parse captured output
      const parsed = JSON.parse(captured.trim());
      assert.strictEqual(parsed.type, 'SECURITY_OVERRIDE');
      assert.strictEqual(parsed.hook, 'routing-guard');
      assert.strictEqual(parsed.envVar, 'ROUTER_BASH_GUARD');
      assert.strictEqual(parsed.value, 'off');
      assert.strictEqual(parsed.impact, 'Router can use any Bash command');
      assert.ok(parsed.timestamp, 'Should have timestamp');
      assert.ok(parsed.pid, 'Should have process ID');
    });

    it('should include timestamp in ISO format', () => {
      assert.ok(hookInput, 'Module should be loadable');

      let captured = '';
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => {
        captured += chunk;
        return true;
      };

      hookInput.auditSecurityOverride('test-hook', 'TEST_VAR', 'warn', 'Test impact');

      process.stderr.write = originalStderr;

      const parsed = JSON.parse(captured.trim());
      // Validate ISO date format
      const date = new Date(parsed.timestamp);
      assert.ok(!isNaN(date.getTime()), 'Timestamp should be valid ISO date');
    });

    it('should include process ID for correlation', () => {
      assert.ok(hookInput, 'Module should be loadable');

      let captured = '';
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => {
        captured += chunk;
        return true;
      };

      hookInput.auditSecurityOverride('test-hook', 'TEST_VAR', 'off', 'Test impact');

      process.stderr.write = originalStderr;

      const parsed = JSON.parse(captured.trim());
      assert.strictEqual(parsed.pid, process.pid, 'Should include actual process ID');
    });

    it('should distinguish from regular auditLog by type field', () => {
      assert.ok(hookInput, 'Module should be loadable');

      let captured = '';
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = chunk => {
        captured += chunk;
        return true;
      };

      // Call both audit functions
      hookInput.auditSecurityOverride('test-hook', 'TEST_VAR', 'off', 'Security override');
      hookInput.auditLog('test-hook', 'regular_event', { data: 'value' });

      process.stderr.write = originalStderr;

      // Parse both lines
      const lines = captured.trim().split('\n');
      const securityLog = JSON.parse(lines[0]);
      const regularLog = JSON.parse(lines[1]);

      // Security override has type field
      assert.strictEqual(securityLog.type, 'SECURITY_OVERRIDE');
      // Regular auditLog has event field but no type field
      assert.strictEqual(regularLog.event, 'regular_event');
      assert.strictEqual(regularLog.type, undefined, 'Regular auditLog should not have type field');
    });
  });

  describe('ALLOWED_HOOK_INPUT_KEYS', () => {
    it('should export allowed keys constant', () => {
      assert.ok(hookInput, 'Module should be loadable');
      assert.ok(Array.isArray(hookInput.ALLOWED_HOOK_INPUT_KEYS), 'Should be an array');
      assert.ok(hookInput.ALLOWED_HOOK_INPUT_KEYS.includes('tool_name'));
      assert.ok(hookInput.ALLOWED_HOOK_INPUT_KEYS.includes('tool_input'));
      assert.ok(hookInput.ALLOWED_HOOK_INPUT_KEYS.includes('tool'));
      assert.ok(hookInput.ALLOWED_HOOK_INPUT_KEYS.includes('input'));
    });
  });

  describe('integration with real hook patterns', () => {
    it('should handle Edit tool input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const editInput = JSON.stringify({
        tool_name: 'Edit',
        tool_input: {
          file_path: '/project/src/index.js',
          old_string: 'console.log',
          new_string: 'console.error',
        },
      });

      const result = hookInput.validateHookInput(editInput);
      assert.strictEqual(result.tool_name, 'Edit');
      assert.strictEqual(hookInput.extractFilePath(result.tool_input), '/project/src/index.js');
    });

    it('should handle Write tool input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const writeInput = JSON.stringify({
        tool_name: 'Write',
        tool_input: {
          file_path: '/project/new-file.ts',
          content: 'export const hello = "world";',
        },
      });

      const result = hookInput.validateHookInput(writeInput);
      assert.strictEqual(result.tool_name, 'Write');
      assert.strictEqual(hookInput.extractFilePath(result.tool_input), '/project/new-file.ts');
    });

    it('should handle Task tool input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const taskInput = JSON.stringify({
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'developer',
          description: 'Fix login bug',
          prompt: 'You are DEVELOPER...',
        },
      });

      const result = hookInput.validateHookInput(taskInput);
      assert.strictEqual(result.tool_name, 'Task');
      assert.strictEqual(result.tool_input.subagent_type, 'developer');
    });

    it('should handle TaskCreate tool input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const taskCreateInput = JSON.stringify({
        tool_name: 'TaskCreate',
        tool_input: {
          subject: 'Fix bug',
          description: 'Fix the login bug',
          activeForm: 'Fixing bug',
        },
      });

      const result = hookInput.validateHookInput(taskCreateInput);
      assert.strictEqual(result.tool_name, 'TaskCreate');
      assert.strictEqual(result.tool_input.subject, 'Fix bug');
    });

    it('should handle NotebookEdit tool input', () => {
      assert.ok(hookInput, 'Module should be loadable');

      const notebookInput = JSON.stringify({
        tool_name: 'NotebookEdit',
        tool_input: {
          notebook_path: '/project/analysis.ipynb',
          cell_index: 5,
          new_source: 'import pandas as pd',
        },
      });

      const result = hookInput.validateHookInput(notebookInput);
      assert.strictEqual(result.tool_name, 'NotebookEdit');
      assert.strictEqual(hookInput.extractFilePath(result.tool_input), '/project/analysis.ipynb');
    });
  });
});
