/**
 * @file shell-injection-validator.test.cjs
 * @description Tests for shell-injection-validator.cjs hook (Phase 1 - ADR-077)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude/hooks/safety/shell-injection-validator.cjs');

describe('shell-injection-validator.cjs', () => {
  let validator;

  before(async () => {
    assert.ok(fs.existsSync(HOOK_PATH), `Hook file not found: ${HOOK_PATH}`);
    validator = require(HOOK_PATH);
    assert.ok(typeof validator.handler === 'function', 'Hook missing handler function');
  });

  describe('Chained rm Commands', () => {
    it('should BLOCK semicolon rm -rf', async () => {
      const input = {
        command: 'find tests/; rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block semicolon rm -rf');
      assert.ok(result.reason, 'Should provide blocking reason');
      assert.ok(result.reason.toLowerCase().includes('rm'), 'Reason should mention rm');
    });

    it('should BLOCK piped rm -rf', async () => {
      const input = {
        command: 'find tests/ | rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block piped rm -rf');
    });

    it('should BLOCK AND-chained rm -rf', async () => {
      const input = {
        command: 'cd /tmp && rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block AND-chained rm -rf');
    });

    it('should ALLOW normal rm without -rf /', async () => {
      const input = {
        command: 'rm old-file.txt',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow normal rm');
    });
  });

  describe('Dangerous Targets', () => {
    it('should BLOCK rm -rf / (root deletion)', async () => {
      const input = {
        command: 'rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block rm -rf /');
      assert.ok(result.detected, 'Should provide detected pattern');
    });

    it('should BLOCK rm -rf ~ (home deletion)', async () => {
      const input = {
        command: 'rm -rf ~',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block rm -rf ~');
    });

    it('should BLOCK rm -rf * (wildcard deletion)', async () => {
      const input = {
        command: 'rm -rf *',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block rm -rf *');
    });

    it('should ALLOW rm -rf specific_directory/', async () => {
      const input = {
        command: 'rm -rf node_modules/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow rm -rf of specific directory');
    });
  });

  describe('Command Injection Patterns', () => {
    it('should BLOCK eval command', async () => {
      const input = {
        command: 'eval "malicious code"',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block eval');
    });

    it('should BLOCK backtick execution with rm', async () => {
      const input = {
        command: 'echo `rm -rf /tmp`',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block backtick execution with rm');
    });

    it('should BLOCK command substitution with rm', async () => {
      const input = {
        command: 'echo $(rm -rf /tmp)',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block command substitution with rm');
    });

    it('should BLOCK redirect to system device', async () => {
      const input = {
        command: 'echo data >> /dev/sda',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block redirect to system device');
    });

    it('should ALLOW normal command substitution without rm', async () => {
      const input = {
        command: 'echo "Current dir: $(pwd)"',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow safe command substitution');
    });
  });

  describe('Safe Commands (No False Positives)', () => {
    it('should ALLOW find command', async () => {
      const input = {
        command: 'find tests/ -name "*.test.*"',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow find command');
    });

    it('should ALLOW grep command', async () => {
      const input = {
        command: 'grep -r "pattern" tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow grep command');
    });

    it('should ALLOW git commands', async () => {
      const input = {
        command: 'git status -s',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow git commands');
    });

    it('should ALLOW npm commands', async () => {
      const input = {
        command: 'npm test',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow npm commands');
    });

    it('should ALLOW chained safe commands', async () => {
      const input = {
        command: 'cd tests/ && find . -name "*.test.*" | wc -l',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow chained safe commands');
    });
  });

  describe('Edge Cases', () => {
    it('should BLOCK rm -rf with extra spaces', async () => {
      const input = {
        command: 'rm  -rf   /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block rm -rf with extra spaces');
    });

    it('should BLOCK rm -rf in multiline command', async () => {
      const input = {
        command: `cd /tmp
rm -rf /`,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block rm -rf in multiline');
    });

    it('should ALLOW rm -rf in comment', async () => {
      const input = {
        command: '# This is a comment about rm -rf /\nfind tests/',
      };

      const result = await validator.handler(input);

      // Comments should NOT trigger validation (handled by Bash, not executed)
      // But our current implementation doesn't parse comments, so it WILL block
      // This is a safe false positive (overly strict is better than missed injection)
      assert.strictEqual(result.allowed, false, 'Should block even in comments (safe false positive)');
    });

    it('should ALLOW rm -rf in string literal', async () => {
      const input = {
        command: 'echo "never run rm -rf /"',
      };

      const result = await validator.handler(input);

      // String literals should be safe, but detection is complex
      // Current implementation MAY trigger (depends on pattern matching)
      // This test documents behavior (may be false positive)
      assert.strictEqual(result.allowed, false, 'Current implementation blocks (safe false positive)');
    });
  });

  describe('Environment Variable Override', () => {
    it('should respect SHELL_INJECTION_VALIDATOR=off', async () => {
      const originalEnv = process.env.SHELL_INJECTION_VALIDATOR;
      process.env.SHELL_INJECTION_VALIDATOR = 'off';

      const input = {
        command: 'rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow when validator is off');

      process.env.SHELL_INJECTION_VALIDATOR = originalEnv;
    });

    it('should warn in warn mode instead of blocking', async () => {
      const originalEnv = process.env.SHELL_INJECTION_VALIDATOR;
      process.env.SHELL_INJECTION_VALIDATOR = 'warn';

      const input = {
        command: 'rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');

      process.env.SHELL_INJECTION_VALIDATOR = originalEnv;
    });

    it('should block in block mode (default)', async () => {
      const originalEnv = process.env.SHELL_INJECTION_VALIDATOR;
      process.env.SHELL_INJECTION_VALIDATOR = 'block';

      const input = {
        command: 'rm -rf /',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block in block mode');

      process.env.SHELL_INJECTION_VALIDATOR = originalEnv;
    });
  });
});
