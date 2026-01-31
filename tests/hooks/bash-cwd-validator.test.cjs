/**
 * @file bash-cwd-validator.test.cjs
 * @description Tests for bash-cwd-validator.cjs hook (Phase 1 - ADR-077)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude/hooks/safety/bash-cwd-validator.cjs');

describe('bash-cwd-validator.cjs', () => {
  let validator;

  before(async () => {
    // Hook should exist after implementation
    assert.ok(fs.existsSync(HOOK_PATH), `Hook file not found: ${HOOK_PATH}`);
    validator = require(HOOK_PATH);
    assert.ok(typeof validator.handler === 'function', 'Hook missing handler function');
  });

  describe('Background Task CWD Validation', () => {
    it('should BLOCK background task without cd "$PROJECT_ROOT"', async () => {
      const input = {
        command: 'find tests/ -name "*.test.*"',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block command without CWD');
      assert.ok(result.reason, 'Should provide blocking reason');
      assert.ok(
        result.reason.includes('cd "$PROJECT_ROOT"') || result.reason.includes('CWD'),
        'Reason should mention CWD requirement'
      );
    });

    it('should PASS background task with cd "$PROJECT_ROOT"', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find tests/ -name "*.test.*"',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow command with CWD');
    });

    it('should PASS background task with cd "$PROJECT_ROOT" || exit 1 pattern', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*"',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow CWD with error handling');
    });

    it('should PASS background task with cd $PROJECT_ROOT (unquoted but present)', async () => {
      const input = {
        command: 'cd $PROJECT_ROOT && find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(
        result.allowed,
        true,
        'Should allow unquoted CWD (quoting checked by separate validator)'
      );
    });

    it('should PASS foreground task without CWD (not background)', async () => {
      const input = {
        command: 'find tests/ -name "*.test.*"',
        run_in_background: false,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow foreground task without CWD');
    });

    it('should PASS foreground task with undefined run_in_background (default false)', async () => {
      const input = {
        command: 'find tests/ -name "*.test.*"',
        // run_in_background is undefined
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow when run_in_background is undefined');
    });
  });

  describe('CWD Pattern Matching', () => {
    it("should detect cd with single quotes: cd '$PROJECT_ROOT'", async () => {
      const input = {
        command: "cd '$PROJECT_ROOT' && find tests/",
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow CWD with single quotes');
    });

    it('should detect cd without quotes: cd $PROJECT_ROOT', async () => {
      const input = {
        command: 'cd $PROJECT_ROOT && find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(
        result.allowed,
        true,
        'Should allow CWD without quotes (quoting validator handles this)'
      );
    });

    it('should BLOCK cd to different directory', async () => {
      const input = {
        command: 'cd /tmp && find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block cd to non-PROJECT_ROOT directory');
    });

    it('should BLOCK cd to relative path', async () => {
      const input = {
        command: 'cd tests/ && find . -name "*.test.*"',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(
        result.allowed,
        false,
        'Should block cd to relative path (not PROJECT_ROOT)'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiline commands', async () => {
      const input = {
        command: `cd "$PROJECT_ROOT" || exit 1
find tests/ -name "*.test.*"`,
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should handle multiline commands with CWD');
    });

    it('should handle commands with comments', async () => {
      const input = {
        command: '# Change to project root\ncd "$PROJECT_ROOT" && find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should handle commands with comments');
    });

    it('should BLOCK if cd "$PROJECT_ROOT" appears in middle of command', async () => {
      const input = {
        command: 'echo "starting" && cd "$PROJECT_ROOT" && find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      // CWD MUST be at start of command (after optional whitespace/comments)
      assert.strictEqual(result.allowed, false, 'Should block if CWD not at start');
    });

    it('should PASS if cd "$PROJECT_ROOT" is first substantive command', async () => {
      const input = {
        command: '  \n  cd "$PROJECT_ROOT" && find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow CWD after leading whitespace');
    });
  });

  describe('Environment Variable Override', () => {
    it('should respect BASH_CWD_VALIDATOR=off', async () => {
      const originalEnv = process.env.BASH_CWD_VALIDATOR;
      process.env.BASH_CWD_VALIDATOR = 'off';

      const input = {
        command: 'find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow when validator is off');

      process.env.BASH_CWD_VALIDATOR = originalEnv;
    });

    it('should warn in warn mode instead of blocking', async () => {
      const originalEnv = process.env.BASH_CWD_VALIDATOR;
      process.env.BASH_CWD_VALIDATOR = 'warn';

      const input = {
        command: 'find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(result.warning.includes('CWD'), 'Warning should mention CWD');

      process.env.BASH_CWD_VALIDATOR = originalEnv;
    });

    it('should block in block mode (default)', async () => {
      const originalEnv = process.env.BASH_CWD_VALIDATOR;
      process.env.BASH_CWD_VALIDATOR = 'block';

      const input = {
        command: 'find tests/',
        run_in_background: true,
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block in block mode');

      process.env.BASH_CWD_VALIDATOR = originalEnv;
    });
  });
});
