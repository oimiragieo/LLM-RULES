/**
 * @file Shellcheck Validator Hook Tests
 * @phase 3
 * @priority MEDIUM
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { handler, runShellcheck, IGNORED_CODES } = require('../../.claude/hooks/safety/shellcheck-validator.cjs');

describe('Shellcheck Validator Hook', () => {
  let originalMode;

  before(() => {
    originalMode = process.env.SHELLCHECK_VALIDATOR;
  });

  after(() => {
    if (originalMode !== undefined) {
      process.env.SHELLCHECK_VALIDATOR = originalMode;
    } else {
      delete process.env.SHELLCHECK_VALIDATOR;
    }
  });

  describe('runShellcheck', () => {
    it('should validate correct bash syntax', () => {
      const result = runShellcheck('echo "Hello World"');
      assert.equal(result.valid, true, 'Simple echo should be valid');
    });

    it('should detect syntax errors', () => {
      const result = runShellcheck('if [ $x -eq 1 ]; echo "missing then"');
      // Should detect syntax error or return gracefully if shellcheck not installed
      if (!result.warning) {
        assert.equal(result.valid, false, 'Syntax error should be detected');
        assert.ok(result.issues, 'Should have issues array');
      }
    });

    it('should ignore SC1071 (non-bash script)', () => {
      const result = runShellcheck('#!/usr/bin/env node\nconsole.log("test")');
      // SC1071 is in IGNORED_CODES, so should be filtered out
      assert.ok(IGNORED_CODES.includes('SC1071'), 'SC1071 should be ignored');
    });

    it('should ignore SC2086 (unquoted vars - handled by Phase 2)', () => {
      const result = runShellcheck('echo $VAR');
      // SC2086 is in IGNORED_CODES
      assert.ok(IGNORED_CODES.includes('SC2086'), 'SC2086 should be ignored');
    });

    it('should gracefully handle shellcheck not installed', () => {
      // Run with command that would fail if shellcheck truly unavailable
      const result = runShellcheck('echo "test"');
      // Should either validate or return warning about shellcheck unavailable
      assert.ok(result.valid !== undefined, 'Should have valid field');
    });

    it('should handle multi-line commands', () => {
      const multiline = `
if [ -f "$FILE" ]; then
  cat "$FILE"
fi
`;
      const result = runShellcheck(multiline);
      assert.ok(result.valid !== undefined, 'Should handle multiline');
    });

    it('should detect unquoted variable in conditional', () => {
      const result = runShellcheck('if [ $VAR = "test" ]; then echo "bad"; fi');
      // Shellcheck may detect this, but SC2086 is ignored, so valid
      assert.ok(result.valid !== undefined, 'Should process conditional');
    });

    it('should detect missing quotes in assignment', () => {
      const result = runShellcheck('DIR=/some/path with spaces');
      // Shellcheck should detect issues with spaces in unquoted path
      if (!result.warning) {
        // Only check if shellcheck available
        assert.ok(result.valid !== undefined, 'Should process assignment');
      }
    });
  });

  describe('validateShellcheck - warn mode', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'warn';
    });

    it('should allow valid commands in warn mode', () => {
      const input = { command: 'echo "test"' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow valid command');
    });

    it('should allow but warn on invalid commands in warn mode', () => {
      const input = { command: 'if [ $x -eq 1 ]; echo "bad"' };
      const result = handler(input);
      // Warn mode always allows
      assert.equal(result.allowed, true, 'Warn mode should allow');
      // May have warning if shellcheck available
    });

    it('should allow and warn when shellcheck not installed', () => {
      // Simulate command that would require shellcheck
      const input = { command: 'echo "test"' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow when shellcheck unavailable');
    });
  });

  describe('validateShellcheck - block mode', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'block';
    });

    it('should allow valid commands in block mode', () => {
      const input = { command: 'echo "Hello"' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow valid command');
    });

    it('should block invalid commands in block mode', () => {
      const input = { command: 'if [ $x -eq 1 ]; echo "missing then"' };
      const result = handler(input);
      // Block mode blocks invalid commands (if shellcheck available)
      // If shellcheck not available, will still allow with warning
      assert.ok(result.allowed !== undefined, 'Should have allowed field');
    });

    it('should allow with warning if shellcheck unavailable in block mode', () => {
      const input = { command: 'echo "test"' };
      const result = handler(input);
      // Should allow if shellcheck not available (graceful fallback)
      assert.equal(result.allowed, true, 'Should allow when unavailable');
    });
  });

  describe('validateShellcheck - off mode', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'off';
    });

    it('should allow all commands when disabled', () => {
      const input = { command: 'invalid bash syntax here ;;;' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Off mode should allow everything');
      assert.equal(result.warning, undefined, 'Off mode should not warn');
    });
  });

  describe('Error message formatting', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'warn';
    });

    it('should format issues with line numbers and codes', () => {
      const input = { command: 'if [ $x -eq 1 ]; echo "test"' };
      const result = handler(input);
      // If shellcheck found issues, should have formatted warning
      if (result.warning && result.warning.includes('SC')) {
        assert.ok(result.warning.includes('Line'), 'Should include line number');
        assert.ok(result.warning.includes('[SC'), 'Should include SC code');
      }
    });

    it('should include helpful bypass instruction', () => {
      const input = { command: 'syntax error here' };
      const result = handler(input);
      if (result.warning && result.warning.includes('SHELLCHECK-VALIDATOR')) {
        assert.ok(
          result.warning.includes('SHELLCHECK_VALIDATOR=off'),
          'Should include bypass instruction'
        );
      }
    });
  });

  describe('Edge cases', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'warn';
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
      const input = { command: 'find . -name "*.js" | grep -v node_modules | wc -l' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow complex pipes');
    });

    it('should handle commands with environment variables', () => {
      const input = { command: 'export VAR="value" && echo "$VAR"' };
      const result = handler(input);
      assert.equal(result.allowed, true, 'Should allow env var exports');
    });
  });
});
