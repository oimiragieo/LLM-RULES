/**
 * @file variable-quoting-validator.test.cjs
 * @description Tests for variable-quoting-validator.cjs hook (Phase 2 - ADR-077)
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude/hooks/safety/variable-quoting-validator.cjs');

describe('variable-quoting-validator.cjs', () => {
  let validator;

  before(async () => {
    // Hook should exist after implementation
    assert.ok(fs.existsSync(HOOK_PATH), `Hook file not found: ${HOOK_PATH}`);
    validator = require(HOOK_PATH);
    assert.ok(typeof validator.handler === 'function', 'Hook missing handler function');
  });

  describe('Unquoted Variable Detection', () => {
    it('should WARN on unquoted variable: cd $PROJECT_ROOT', async () => {
      const input = {
        command: 'cd $PROJECT_ROOT && find tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode (default)');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(
        result.warning.includes('$PROJECT_ROOT') || result.warning.includes('unquoted'),
        'Warning should mention unquoted variable'
      );
    });

    it('should WARN on unquoted braced variable: ${PROJECT_ROOT}', async () => {
      const input = {
        command: 'cd ${PROJECT_ROOT} && find tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(result.warning.includes('PROJECT_ROOT'), 'Warning should mention variable name');
    });

    it('should WARN on multiple unquoted variables', async () => {
      const input = {
        command: 'cd $DIR && find $PATH -name $PATTERN',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(
        result.warning.includes('$DIR') || result.warning.includes('multiple'),
        'Warning should mention multiple variables'
      );
    });

    it('should PASS on quoted variable: cd "$PROJECT_ROOT"', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow quoted variable');
      assert.ok(!result.warning, 'Should not warn on quoted variable');
    });

    it("should PASS on single-quoted variable: cd '$PROJECT_ROOT'", async () => {
      const input = {
        command: "cd '$PROJECT_ROOT' && find tests/",
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow single-quoted variable');
      assert.ok(!result.warning, 'Should not warn on single-quoted variable');
    });

    it('should PASS on quoted braced variable: cd "${PROJECT_ROOT}"', async () => {
      const input = {
        command: 'cd "${PROJECT_ROOT}" && find tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow quoted braced variable');
      assert.ok(!result.warning, 'Should not warn on quoted braced variable');
    });
  });

  describe('Dangerous Context Detection', () => {
    it('should WARN HIGH priority on: cd $VAR (dangerous context)', async () => {
      const input = {
        command: 'cd $USER_INPUT && ls',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(
        result.warning.includes('cd') || result.warning.includes('dangerous'),
        'Warning should mention dangerous context'
      );
    });

    it('should WARN HIGH priority on: find $VAR (dangerous context)', async () => {
      const input = {
        command: 'find $SEARCH_DIR -name "*.txt"',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(result.warning.includes('find'), 'Warning should mention find command');
    });

    it('should WARN HIGH priority on: rm $VAR (dangerous context)', async () => {
      const input = {
        command: 'rm -rf $TEMP_DIR',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning');
      assert.ok(result.warning.includes('rm'), 'Warning should mention rm command');
    });

    it('should WARN lower priority on: echo $VAR (safe context)', async () => {
      const input = {
        command: 'echo $MESSAGE',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      // echo is safer, may still warn but lower priority
      if (result.warning) {
        assert.ok(!result.warning.includes('HIGH'), 'Should not be HIGH priority for echo');
      }
    });
  });

  describe('Environment Variable Override', () => {
    it('should respect VARIABLE_QUOTING_VALIDATOR=off', async () => {
      const originalEnv = process.env.VARIABLE_QUOTING_VALIDATOR;
      process.env.VARIABLE_QUOTING_VALIDATOR = 'off';

      const input = {
        command: 'cd $PROJECT_ROOT && find $DIR',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow when validator is off');
      assert.ok(!result.warning, 'Should not warn when validator is off');

      process.env.VARIABLE_QUOTING_VALIDATOR = originalEnv;
    });

    it('should block in block mode', async () => {
      const originalEnv = process.env.VARIABLE_QUOTING_VALIDATOR;
      process.env.VARIABLE_QUOTING_VALIDATOR = 'block';

      const input = {
        command: 'cd $PROJECT_ROOT && find tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, false, 'Should block in block mode');
      assert.ok(result.reason, 'Should provide blocking reason');

      process.env.VARIABLE_QUOTING_VALIDATOR = originalEnv;
    });

    it('should warn in warn mode (default)', async () => {
      const originalEnv = process.env.VARIABLE_QUOTING_VALIDATOR;
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';

      const input = {
        command: 'cd $PROJECT_ROOT && find tests/',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should provide warning in warn mode');

      process.env.VARIABLE_QUOTING_VALIDATOR = originalEnv;
    });
  });

  describe('Edge Cases', () => {
    // Ensure clean environment for this suite
    before(() => {
      delete process.env.VARIABLE_QUOTING_VALIDATOR;
    });

    it('should ignore $(...) command substitution (separate validator)', async () => {
      const input = {
        command: 'cd "$(pwd)" && find tests/',
      };

      const result = await validator.handler(input);

      // Command substitution is quoted, should pass
      assert.strictEqual(result.allowed, true, 'Should allow quoted command substitution');
    });

    it('should ignore $$ (process ID) special variable', async () => {
      const input = {
        command: 'echo $$ > /tmp/pid',
      };

      const result = await validator.handler(input);

      // Special shell variables like $$ are safe unquoted
      assert.strictEqual(result.allowed, true, 'Should allow special variables');
      // Should not warn on special shell variables
      assert.ok(!result.warning || !result.warning.includes('$$'), 'Should not warn on $$');
    });

    it('should ignore $? (exit status) special variable', async () => {
      const input = {
        command: 'test -f file.txt; echo $?',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow exit status variable');
    });

    it('should handle mixed quoted and unquoted variables', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find $DIR -name "*.txt"',
      };

      const result = await validator.handler(input);

      assert.strictEqual(result.allowed, true, 'Should allow in warn mode');
      assert.ok(result.warning, 'Should warn about unquoted $DIR');
      assert.ok(!result.warning.includes('PROJECT_ROOT'), 'Should not warn about quoted variable');
    });
  });
});
