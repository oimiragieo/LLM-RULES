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

      assert.strictEqual(
        result.allowed,
        true,
        'Should allow when dangerous text appears in comment'
      );
    });

    it('should ALLOW rm -rf in string literal', async () => {
      const input = {
        command: 'echo "never run rm -rf /"',
      };

      const result = await validator.handler(input);

      assert.strictEqual(
        result.allowed,
        true,
        'Should allow when dangerous text appears only in a quoted string literal'
      );
    });

    it('should BLOCK encoded payload decoded and executed in command substitution', async () => {
      const input = {
        command: 'echo $(echo "cm0gLXJmIC8=" | base64 -d | sh)',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block base64 decode + shell execution');
      assert.ok(result.reason, 'Should provide blocking reason');
    });

    it('should BLOCK encoded payload decoded and executed in backticks', async () => {
      const input = {
        command: 'echo `echo cm0gLXJmIC8= | base64 -d | bash`',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block backtick decode + execution');
    });

    it('should BLOCK printf hex decode piped to sh in command substitution', async () => {
      const input = {
        command: "echo $(printf '\\\\x72\\\\x6d\\\\x20\\\\x2d\\\\x72\\\\x66\\\\x20\\\\x2f' | sh)",
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block printf hex decode piped to sh');
    });

    it('should BLOCK xxd hex decode piped to bash in command substitution', async () => {
      const input = {
        command: 'echo $(echo 726d202d7266202f | xxd -r -p | bash)',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block xxd hex decode piped to bash');
    });

    it('should BLOCK perl pack hex decode piped to env sh in command substitution', async () => {
      const input = {
        command: 'echo $(perl -e \'print pack("H*","726d202d7266202f")\' | env sh)',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block perl hex decode piped to env sh');
    });

    it('should BLOCK decode chain piped to $SHELL in command substitution', async () => {
      const input = {
        command: 'echo $(echo "cm0gLXJmIC8=" | base64 -d | $SHELL)',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block decode chain piped to $SHELL');
    });

    it('should BLOCK indirect shell execution via bash -c in command substitution', async () => {
      const input = {
        command: 'echo $(echo "cm0gLXJmIC8=" | base64 -d; bash -c "$(cat)")',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block bash -c indirect execution chain');
    });

    it('should BLOCK python fromhex decode piped to sh', async () => {
      const input = {
        command:
          'python -c "import binascii; print(binascii.unhexlify(\'726d202d7266202f\').decode())" | sh',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block python fromhex decode piped to sh');
    });

    it('should BLOCK multi-line heredoc decode chain piped to bash', async () => {
      const input = {
        command: `cat <<'EOF' | bash
echo cm0gLXJmIC8= | base64 -d
EOF`,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block heredoc decode chain piped to bash');
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
