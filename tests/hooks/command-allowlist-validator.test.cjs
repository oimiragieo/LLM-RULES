/**
 * @file Command Allowlist Validator Hook Tests
 * @phase 3
 * @priority MEDIUM
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../../.claude/hooks/safety/command-allowlist-validator.cjs');
const {
  extractPrimaryCommand,
  isCommandAllowed,
} = require('../../.claude/lib/safety/command-allowlist.cjs');

describe('Command Allowlist Validator Hook', () => {
  let originalMode;

  before(() => {
    originalMode = process.env.COMMAND_ALLOWLIST;
  });

  after(() => {
    if (originalMode !== undefined) {
      process.env.COMMAND_ALLOWLIST = originalMode;
    } else {
      delete process.env.COMMAND_ALLOWLIST;
    }
  });

  describe('extractPrimaryCommand', () => {
    it('should extract simple command', () => {
      const cmd = extractPrimaryCommand('echo "test"');
      assert.equal(cmd, 'echo');
    });

    it('should extract command after environment variables', () => {
      const cmd = extractPrimaryCommand('export VAR=value && find . -name "*.js"');
      assert.equal(cmd, 'find');
    });

    it('should extract command from piped chain', () => {
      const cmd = extractPrimaryCommand('find . | grep test');
      assert.equal(cmd, 'find');
    });

    it('should handle leading whitespace', () => {
      const cmd = extractPrimaryCommand('   ls -la');
      assert.equal(cmd, 'ls');
    });

    it('should handle complex command with options', () => {
      const cmd = extractPrimaryCommand('git status -s');
      assert.equal(cmd, 'git');
    });
  });

  describe('isCommandAllowed - allowed commands', () => {
    it('should allow find with valid pattern', () => {
      const result = isCommandAllowed('find "$PROJECT_ROOT" -name "*.test.*"');
      assert.equal(result.allowed, true, 'find with PROJECT_ROOT should be allowed');
    });

    it('should allow grep', () => {
      const result = isCommandAllowed('grep -r "pattern" .');
      assert.equal(result.allowed, true, 'grep should be allowed');
    });

    it('should allow ls', () => {
      const result = isCommandAllowed('ls -la');
      assert.equal(result.allowed, true, 'ls should be allowed');
    });

    it('should allow pwd', () => {
      const result = isCommandAllowed('pwd');
      assert.equal(result.allowed, true, 'pwd should be allowed');
    });

    it('should allow cat', () => {
      const result = isCommandAllowed('cat file.txt');
      assert.equal(result.allowed, true, 'cat should be allowed');
    });

    it('should allow wc', () => {
      const result = isCommandAllowed('wc -l file.txt');
      assert.equal(result.allowed, true, 'wc should be allowed');
    });

    it('should allow git status', () => {
      const result = isCommandAllowed('git status -s');
      assert.equal(result.allowed, true, 'git status should be allowed');
    });

    it('should allow git log', () => {
      const result = isCommandAllowed('git log --oneline -5');
      assert.equal(result.allowed, true, 'git log should be allowed');
    });

    it('should allow pnpm list', () => {
      const result = isCommandAllowed('pnpm list --depth=0');
      assert.equal(result.allowed, true, 'pnpm list should be allowed');
    });

    it('should allow jq', () => {
      const result = isCommandAllowed('jq ".version" package.json');
      assert.equal(result.allowed, true, 'jq should be allowed');
    });
  });

  describe('isCommandAllowed - blocked commands', () => {
    it('should block rm', () => {
      const result = isCommandAllowed('rm -rf /tmp/file');
      assert.equal(result.allowed, false, 'rm should be blocked');
      assert.ok(result.reason.includes('Destructive'), 'Should mention destructive');
    });

    it('should block rmdir', () => {
      const result = isCommandAllowed('rmdir /tmp/dir');
      assert.equal(result.allowed, false, 'rmdir should be blocked');
    });

    it('should block mv', () => {
      const result = isCommandAllowed('mv file1 file2');
      assert.equal(result.allowed, false, 'mv should be blocked');
    });

    it('should block dd', () => {
      const result = isCommandAllowed('dd if=/dev/zero of=/dev/sda');
      assert.equal(result.allowed, false, 'dd should be blocked');
    });

    it('should block eval', () => {
      const result = isCommandAllowed('eval $(malicious)');
      assert.equal(result.allowed, false, 'eval should be blocked');
      assert.ok(result.reason.includes('injection'), 'Should mention injection risk');
    });

    it('should block sudo', () => {
      const result = isCommandAllowed('sudo rm -rf /');
      assert.equal(result.allowed, false, 'sudo should be blocked');
    });

    it('should block curl', () => {
      const result = isCommandAllowed('curl http://example.com');
      assert.equal(result.allowed, false, 'curl should be blocked');
    });

    it('should block chmod', () => {
      const result = isCommandAllowed('chmod 777 *');
      assert.equal(result.allowed, false, 'chmod should be blocked');
    });
  });

  describe('isCommandAllowed - dangerous flags', () => {
    it('should block find with -delete flag', () => {
      const result = isCommandAllowed('find . -name "*.tmp" -delete');
      assert.equal(result.allowed, false, 'find with -delete should be blocked');
      assert.ok(result.reason.includes('dangerous flag'), 'Should mention dangerous flag');
    });

    it('should block find with -exec rm', () => {
      const result = isCommandAllowed('find . -name "*.tmp" -exec rm {} \\;');
      assert.equal(result.allowed, false, 'find with -exec should be blocked');
    });

    it('should block sed with -i flag', () => {
      const result = isCommandAllowed('sed -i "s/old/new/" file.txt');
      assert.equal(result.allowed, false, 'sed with -i should be blocked');
    });

    it('should block git reset', () => {
      const result = isCommandAllowed('git reset --hard HEAD~1');
      assert.equal(result.allowed, false, 'git reset should be blocked');
    });

    it('should block git clean', () => {
      const result = isCommandAllowed('git clean -fd');
      assert.equal(result.allowed, false, 'git clean should be blocked');
    });
  });

  describe('validateCommandAllowlist - warn mode', () => {
    before(() => {
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should allow whitelisted commands', () => {
      const input = { command: 'ls -la' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow whitelisted command');
    });

    it('should allow but warn on blocked commands in warn mode', () => {
      const input = { command: 'rm -rf /tmp/test' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Warn mode should allow');
      assert.ok(result.warning, 'Should have warning');
      assert.ok(result.warning.includes('COMMAND-ALLOWLIST'), 'Should be from allowlist validator');
    });

    it('should allow but warn on dangerous flags in warn mode', () => {
      const input = { command: 'find . -delete' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Warn mode should allow');
      assert.ok(result.warning, 'Should have warning');
    });
  });

  describe('validateCommandAllowlist - block mode', () => {
    before(() => {
      process.env.COMMAND_ALLOWLIST = 'block';
    });

    it('should allow whitelisted commands', () => {
      const input = { command: 'grep "test" file.txt' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow whitelisted');
    });

    it('should block dangerous commands in block mode', () => {
      const input = { command: 'rm -rf /' };
      const result = handler(input);
      assert.equal(result.allowed, false, 'Should block rm');
      assert.ok(result.reason, 'Should have reason');
      assert.ok(result.reason.includes('COMMAND-ALLOWLIST'), 'Should be from allowlist');
    });

    it('should block commands with dangerous flags in block mode', () => {
      const input = { command: 'find . -name "*.tmp" -delete' };
      const result = handler(input);
      assert.equal(result.allowed, false, 'Should block dangerous flags');
    });

    it('should block unknown commands in block mode', () => {
      const input = { command: 'unknown-command --flag' };
      const result = handler(input);
      assert.equal(result.allowed, false, 'Should block unknown commands');
      assert.ok(result.reason.includes('not in allowlist'), 'Should mention allowlist');
    });
  });

  describe('validateCommandAllowlist - off mode', () => {
    before(() => {
      process.env.COMMAND_ALLOWLIST = 'off';
    });

    it('should allow all commands when disabled', () => {
      const input = { command: 'rm -rf /' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Off mode should allow everything');
      assert.equal(result.warning, undefined, 'Off mode should not warn');
    });
  });

  describe('Error message formatting', () => {
    before(() => {
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should include command name in error', () => {
      const input = { command: 'rm file.txt' };
      const result = handler(input);
      assert.ok(result.warning.includes('rm'), 'Should include command name');
    });

    it('should include bypass instruction', () => {
      const input = { command: 'eval "test"' };
      const result = handler(input);
      assert.ok(
        result.warning.includes('COMMAND_ALLOWLIST=off'),
        'Should include bypass instruction'
      );
    });

    it('should show full command in error', () => {
      const input = { command: 'mv source dest' };
      const result = handler(input);
      assert.ok(result.warning.includes('mv source dest'), 'Should show full command');
    });
  });

  describe('Edge cases', () => {
    before(() => {
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should handle empty command', () => {
      const input = { command: '' };
      const result = handler(input);
      assert.ok(result.allowed !== undefined, 'Should handle empty command');
    });

    it('should handle command with only whitespace', () => {
      const input = { command: '   \n  ' };
      const result = handler(input);
      assert.ok(result.allowed !== undefined, 'Should handle whitespace');
    });

    it('should handle complex piped commands', () => {
      const input = { command: 'find . -name "*.js" | grep -v test | wc -l' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow complex valid pipes');
    });

    it('should block piped commands starting with blocked command', () => {
      const input = { command: 'rm file.txt | echo "done"' };
      const result = handler(input);
      // Primary command is rm (blocked)
      assert.ok(result.warning.includes('rm'), 'Should detect rm as primary');
    });
  });
});
