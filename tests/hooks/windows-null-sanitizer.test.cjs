#!/usr/bin/env node
/**
 * Windows Null Sanitizer Test Suite
 * ==================================
 *
 * TDD tests for windows-null-sanitizer.cjs.
 *
 * The sanitizer now handles two distinct Windows environments:
 * - Git Bash (MINGW): /dev/null works, NUL creates literal file -> convert NUL to /dev/null
 * - cmd.exe/PowerShell: NUL works, /dev/null creates literal file -> convert /dev/null to NUL
 *
 * On Unix: no conversion (pass through).
 *
 * Exit codes: 0 = allow (with optional modified command)
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Import the module under test
const sanitizer = require('../../.claude/hooks/safety/windows-null-sanitizer.cjs');

describe('windows-null-sanitizer', () => {
  describe('module exports', () => {
    it('should export sanitizeNullDevice function', () => {
      assert.strictEqual(typeof sanitizer.sanitizeNullDevice, 'function');
    });

    it('should export main function', () => {
      assert.strictEqual(typeof sanitizer.main, 'function');
    });
  });

  describe('sanitizeNullDevice', () => {
    it('should be callable', () => {
      assert.doesNotThrow(() => {
        sanitizer.sanitizeNullDevice('echo test');
      });
    });

    it('should handle empty string', () => {
      const result = sanitizer.sanitizeNullDevice('');
      assert.strictEqual(result, '');
    });

    it('should handle whitespace-only string', () => {
      const result = sanitizer.sanitizeNullDevice('   ');
      assert.strictEqual(result, '   ');
    });

    it('should handle command without any null device reference', () => {
      const input = 'echo hello world';
      const result = sanitizer.sanitizeNullDevice(input);
      assert.strictEqual(result, input);
    });

    // Platform-specific tests
    if (process.platform === 'win32') {
      describe('on Windows', () => {
        // Save original env
        let savedMSYSTEM;
        let savedMINGW_PREFIX;
        let savedSHELL;
        let savedTERM_PROGRAM;

        beforeEach(() => {
          savedMSYSTEM = process.env.MSYSTEM;
          savedMINGW_PREFIX = process.env.MINGW_PREFIX;
          savedSHELL = process.env.SHELL;
          savedTERM_PROGRAM = process.env.TERM_PROGRAM;
        });

        afterEach(() => {
          // Restore original env
          if (savedMSYSTEM !== undefined) process.env.MSYSTEM = savedMSYSTEM;
          else delete process.env.MSYSTEM;
          if (savedMINGW_PREFIX !== undefined) process.env.MINGW_PREFIX = savedMINGW_PREFIX;
          else delete process.env.MINGW_PREFIX;
          if (savedSHELL !== undefined) process.env.SHELL = savedSHELL;
          else delete process.env.SHELL;
          if (savedTERM_PROGRAM !== undefined) process.env.TERM_PROGRAM = savedTERM_PROGRAM;
          else delete process.env.TERM_PROGRAM;
        });

        describe('in Git Bash (MINGW) - converts NUL to /dev/null', () => {
          // Git Bash is already the active shell in this test environment,
          // so we just verify the behavior.

          it('should convert > nul to > /dev/null', () => {
            const result = sanitizer.sanitizeNullDevice('echo test > nul');
            assert.strictEqual(result, 'echo test > /dev/null');
          });

          it('should convert > NUL to > /dev/null', () => {
            const result = sanitizer.sanitizeNullDevice('echo test > NUL');
            assert.strictEqual(result, 'echo test > /dev/null');
          });

          it('should convert 2>nul to 2>/dev/null', () => {
            const result = sanitizer.sanitizeNullDevice('command 2>nul');
            assert.strictEqual(result, 'command 2>/dev/null');
          });

          it('should convert 2> nul to 2> /dev/null', () => {
            const result = sanitizer.sanitizeNullDevice('command 2> nul');
            assert.strictEqual(result, 'command 2> /dev/null');
          });

          it('should convert > nul 2>&1 correctly', () => {
            const result = sanitizer.sanitizeNullDevice('cmd > nul 2>&1');
            assert.strictEqual(result, 'cmd > /dev/null 2>&1');
          });

          it('should convert > null (typo) to > /dev/null', () => {
            const result = sanitizer.sanitizeNullDevice('echo test > null');
            assert.strictEqual(result, 'echo test > /dev/null');
          });

          it('should leave /dev/null unchanged', () => {
            const result = sanitizer.sanitizeNullDevice('echo test > /dev/null');
            assert.strictEqual(result, 'echo test > /dev/null');
          });

          it('should leave command without redirects unchanged', () => {
            const result = sanitizer.sanitizeNullDevice('echo hello world');
            assert.strictEqual(result, 'echo hello world');
          });

          it('should handle mixed case NuL', () => {
            const result = sanitizer.sanitizeNullDevice('echo test > NuL');
            assert.strictEqual(result, 'echo test > /dev/null');
          });
        });
      });
    } else {
      describe('on non-Windows', () => {
        it('should return command unchanged', () => {
          const input = 'echo test > /dev/null';
          const result = sanitizer.sanitizeNullDevice(input);
          assert.strictEqual(result, input);
        });

        it('should return nul redirect unchanged', () => {
          const input = 'echo test > nul';
          const result = sanitizer.sanitizeNullDevice(input);
          assert.strictEqual(result, input);
        });
      });
    }
  });
});
