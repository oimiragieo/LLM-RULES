#!/usr/bin/env node
/**
 * Tests for write-content-scanner.cjs hook
 *
 * Tests that the hook detects secrets and dangerous content in Write/Edit operations.
 */

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const assert = require('assert');

// Path to the hook
const HOOK_PATH = path.join(__dirname, '../../.claude/hooks/safety/write-content-scanner.cjs');

/**
 * Run hook with given input
 * @param {Object} input - Hook input object
 * @returns {{exitCode: number, stdout: string, stderr: string}}
 */
function runHook(input) {
  const inputJson = JSON.stringify(input);
  try {
    const result = execSync(`node "${HOOK_PATH}"`, {
      input: inputJson,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WRITE_CONTENT_SCANNER: 'block' },
    });
    return { exitCode: 0, output: result };
  } catch (err) {
    // Combine stdout and stderr into single output for easier assertion
    const output = (err.stdout || '') + (err.stderr || '');
    return {
      exitCode: err.status || 1,
      output,
    };
  }
}

// Test framework
let passed = 0;
let failed = 0;

function describe(suiteName, fn) {
  console.log(`\n${suiteName}`);
  fn();
}

function it(testName, fn) {
  try {
    fn();
    console.log(`  ✓ ${testName}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${testName}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

// Run tests
console.log('Running write-content-scanner tests...\n');

describe('write-content-scanner.cjs', () => {
  describe('API Key Detection', () => {
    it('should block Write with OpenAI API key', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'src/config.ts',
          content: 'const apiKey = "sk-abc123def456ghi789jkl012mno345pqr";',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(result.output.includes('OpenAI API Key'), 'Should detect OpenAI API key');
    });

    it('should block Edit with GitHub token', () => {
      const input = {
        tool_name: 'Edit',
        tool_input: {
          file_path: 'src/auth.ts',
          new_string: 'const token = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(result.output.includes('GitHub Token'), 'Should detect GitHub token');
    });

    it('should block AWS access key', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'config.js',
          content: 'const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(result.output.includes('AWS Access Key'), 'Should detect AWS key');
    });
  });

  describe('Private Key Detection', () => {
    it('should block RSA private key', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'private.key',
          content:
            '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(result.output.includes('Private Key'), 'Should detect RSA private key');
    });

    it('should block EC private key', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'ec.key',
          content: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE...\n-----END EC PRIVATE KEY-----',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(result.output.includes('Private Key'), 'Should detect EC private key');
    });
  });

  describe('Credentials Detection', () => {
    it('should block .env file content', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'config.ts',
          content: 'API_KEY=sk-test123\nSECRET=mysecret\nPASSWORD=admin123',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(
        result.output.includes('.env or credentials'),
        'Should detect env-style credentials'
      );
    });

    it('should block AWS secret key', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'aws-config.txt',
          content: 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 2, 'Should exit with code 2 (block)');
      assert.ok(result.output.includes('.env or credentials'), 'Should detect AWS secret');
    });
  });

  describe('Safe Content', () => {
    it('should allow normal code', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'src/utils.ts',
          content: 'export function formatDate(date: Date): string { return date.toISOString(); }',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 0, 'Should exit with code 0 (allow)');
    });

    it('should allow memory files', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: '.claude/context/memory/learnings.md',
          content:
            'API_KEY pattern detected in production code - this is a learning note, not actual secret',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 0, 'Should allow memory files');
    });

    it('should allow audit reports', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: '.claude/audit/security-report.md',
          content: 'Found hardcoded API_KEY in file.ts - sk-example123 (example for report)',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 0, 'Should allow audit reports');
    });

    it('should allow test fixtures', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'tests/fixtures/api-keys.ts',
          content: 'export const FAKE_API_KEY = "sk-test123fake";',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 0, 'Should allow test fixtures');
    });
  });

  describe('Enforcement Modes', () => {
    it('should warn instead of block in warn mode', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'config.js',
          content: 'const key = "sk-dangerouskey123";',
        },
      };

      try {
        const result = execSync(`node "${HOOK_PATH}"`, {
          input: JSON.stringify(input),
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, WRITE_CONTENT_SCANNER: 'warn' },
        });
        assert.ok(result !== undefined, 'Should exit with code 0 in warn mode');
      } catch (_err) {
        assert.fail('Should not block in warn mode');
      }
    });

    it('should skip check when mode is off', () => {
      const input = {
        tool_name: 'Write',
        tool_input: {
          file_path: 'config.js',
          content: 'const key = "sk-dangerouskey123";',
        },
      };

      const result = execSync(`node "${HOOK_PATH}"`, {
        input: JSON.stringify(input),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, WRITE_CONTENT_SCANNER: 'off' },
      });
      assert.ok(result !== undefined, 'Should exit cleanly when off');
    });
  });

  describe('Tool Filtering', () => {
    it('should ignore Read tool', () => {
      const input = {
        tool_name: 'Read',
        tool_input: {
          file_path: 'any-file.ts',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 0, 'Should ignore Read tool');
    });

    it('should ignore Bash tool', () => {
      const input = {
        tool_name: 'Bash',
        tool_input: {
          command: 'echo sk-fakekey',
        },
      };

      const result = runHook(input);
      assert.strictEqual(result.exitCode, 0, 'Should ignore Bash tool');
    });
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
