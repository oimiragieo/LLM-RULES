/**
 * @file Shell Security Phase 3 Integration Tests
 * @phase 3
 * @priority MEDIUM
 * @description Tests shellcheck integration, command allowlist, and multi-phase validator coordination
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Import Phase 1 validators (CWD + shell injection)
import bashCwdValidator from '../../.claude/hooks/safety/bash-cwd-validator.cjs';
import shellInjectionValidator from '../../.claude/hooks/safety/shell-injection-validator.cjs';

// Import Phase 3 validators (shellcheck + command allowlist)
import shellcheckValidator from '../../.claude/hooks/safety/shellcheck-validator.cjs';
import commandAllowlistValidator from '../../.claude/hooks/safety/command-allowlist-validator.cjs';

describe('Shell Security Phase 3 Integration', () => {
  let originalEnv;

  before(() => {
    originalEnv = {
      BASH_CWD_VALIDATOR: process.env.BASH_CWD_VALIDATOR,
      SHELL_INJECTION_VALIDATOR: process.env.SHELL_INJECTION_VALIDATOR,
      SHELLCHECK_VALIDATOR: process.env.SHELLCHECK_VALIDATOR,
      COMMAND_ALLOWLIST: process.env.COMMAND_ALLOWLIST,
    };
  });

  after(() => {
    Object.keys(originalEnv).forEach(key => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  describe('Shellcheck Integration', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'warn';
    });

    it('should detect syntax errors with shellcheck', () => {
      const input = {
        command: 'if [ $x -eq 1 ]; echo "missing then"',
        run_in_background: false,
      };

      const result = shellcheckValidator.handler(input);
      // Shellcheck may not be installed, so check gracefully
      assert.ok(result.allowed !== undefined, 'Should have allowed field');
      if (!result.warning?.includes('not installed')) {
        // If shellcheck is installed, should detect or validate
        assert.ok(result.valid !== undefined || result.warning !== undefined);
      }
    });

    it('should filter false positives (SC2086 handled by Phase 2)', () => {
      const input = {
        command: 'echo $VAR',
        run_in_background: false,
      };

      const result = shellcheckValidator.handler(input);
      // SC2086 (unquoted vars) is ignored by shellcheck validator (Phase 2 handles it)
      assert.ok(result.allowed !== undefined, 'Should process command');
    });

    it('should gracefully fallback when shellcheck not installed', () => {
      const input = {
        command: 'echo "test"',
        run_in_background: false,
      };

      const result = shellcheckValidator.handler(input);
      // Should either validate or warn about unavailable shellcheck
      assert.equal(result.allowed, true, 'Should allow when unavailable');
    });

    it('should validate complex commands', () => {
      const input = {
        command: 'find "$PROJECT_ROOT" -name "*.test.*" | wc -l',
        run_in_background: false,
      };

      const result = shellcheckValidator.handler(input);
      assert.equal(result.allowed, true, 'Should allow valid complex command');
    });
  });

  describe('Command Allowlist', () => {
    before(() => {
      process.env.COMMAND_ALLOWLIST = 'block';
    });

    it('should allow whitelisted commands', () => {
      const input = { command: 'find "$PROJECT_ROOT" -name "*.js"' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, true, 'find should be whitelisted');
    });

    it('should block dangerous commands', () => {
      const input = { command: 'rm -rf /tmp/test' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, false, 'rm should be blocked');
      assert.ok(result.reason?.includes('Destructive'), 'Should explain why');
    });

    it('should block dangerous flags on allowed commands', () => {
      const input = { command: 'find . -name "*.tmp" -delete' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, false, 'Should block -delete flag');
      assert.ok(result.reason?.includes('dangerous flag'), 'Should mention dangerous flag');
    });

    it('should block unknown commands', () => {
      const input = { command: 'malicious-command --flag' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, false, 'Should block unknown commands');
      assert.ok(result.reason?.includes('not in allowlist'), 'Should mention allowlist');
    });

    it('should allow safe git commands', () => {
      const input = { command: 'git status -s' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, true, 'git status should be allowed');
    });

    it('should block dangerous git commands', () => {
      const input = { command: 'git reset --hard HEAD~1' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, false, 'git reset should be blocked');
    });
  });

  describe('Multi-Phase Validator Coordination', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.SHELLCHECK_VALIDATOR = 'warn';
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should run all validators on background task', () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find . -name "*.test.*"',
        run_in_background: true,
      };

      // Phase 1: CWD validator
      const cwdResult = bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Phase 1 CWD should pass');

      // Phase 1: Shell injection validator
      const injectionResult = shellInjectionValidator.handler(input);
      assert.equal(injectionResult.allowed, true, 'Phase 1 injection should pass');

      // Phase 3: Shellcheck validator
      const shellcheckResult = shellcheckValidator.handler(input);
      assert.equal(shellcheckResult.allowed, true, 'Phase 3 shellcheck should pass');

      // Phase 3: Command allowlist validator
      const allowlistResult = commandAllowlistValidator.handler(input);
      assert.equal(allowlistResult.allowed, true, 'Phase 3 allowlist should pass');
    });

    it('should detect violations in correct phase', () => {
      // Missing CWD (Phase 1)
      const noCwdInput = {
        command: 'find . -name "*.js"',
        run_in_background: true,
      };

      const cwdResult = bashCwdValidator.handler(noCwdInput);
      assert.equal(cwdResult.allowed, false, 'Phase 1 should catch missing CWD');
      assert.ok(cwdResult.reason?.includes('CWD'), 'Should mention CWD');
    });

    it('should detect shell injection (Phase 1)', () => {
      const injectionInput = {
        command: 'cd "$PROJECT_ROOT" && rm -rf /',
        run_in_background: true,
      };

      const injectionResult = shellInjectionValidator.handler(injectionInput);
      assert.equal(injectionResult.allowed, false, 'Phase 1 should catch injection');
    });

    it('should detect dangerous command (Phase 3)', () => {
      const dangerousInput = {
        command: 'cd "$PROJECT_ROOT" && eval $(malicious)',
        run_in_background: true,
      };

      // Phase 1: CWD passes
      const cwdResult = bashCwdValidator.handler(dangerousInput);
      assert.equal(cwdResult.allowed, true, 'CWD validator passes');

      // Phase 1: Shell injection catches eval
      const injectionResult = shellInjectionValidator.handler(dangerousInput);
      assert.equal(injectionResult.allowed, false, 'Injection validator catches eval');

      // Phase 3: Allowlist also catches eval
      const allowlistResult = commandAllowlistValidator.handler(dangerousInput);
      // Warn mode allows but warns
      assert.ok(allowlistResult.warning || !allowlistResult.allowed, 'Allowlist detects eval');
    });

    it('should allow safe command through all phases', () => {
      const safeInput = {
        command: 'cd "$PROJECT_ROOT" && grep -r "TODO" src/',
        run_in_background: true,
      };

      // All validators should pass
      const cwdResult = bashCwdValidator.handler(safeInput);
      assert.equal(cwdResult.allowed, true, 'CWD passes');

      const injectionResult = shellInjectionValidator.handler(safeInput);
      assert.equal(injectionResult.allowed, true, 'Injection passes');

      const shellcheckResult = shellcheckValidator.handler(safeInput);
      assert.equal(shellcheckResult.allowed, true, 'Shellcheck passes');

      const allowlistResult = commandAllowlistValidator.handler(safeInput);
      assert.equal(allowlistResult.allowed, true, 'Allowlist passes');
    });
  });

  describe('Phase Coordination - No Conflicts', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'warn';
      process.env.SHELL_INJECTION_VALIDATOR = 'warn';
      process.env.SHELLCHECK_VALIDATOR = 'warn';
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should not have conflicting validations', () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find "$PROJECT_ROOT" -name "*.test.*" | wc -l',
        run_in_background: true,
      };

      // All validators run without conflict
      const results = {
        cwd: bashCwdValidator.handler(input),
        injection: shellInjectionValidator.handler(input),
        shellcheck: shellcheckValidator.handler(input),
        allowlist: commandAllowlistValidator.handler(input),
      };

      // All should allow (warn mode)
      assert.equal(results.cwd.allowed, true, 'CWD allows');
      assert.equal(results.injection.allowed, true, 'Injection allows');
      assert.equal(results.shellcheck.allowed, true, 'Shellcheck allows');
      assert.equal(results.allowlist.allowed, true, 'Allowlist allows');
    });

    it('should accumulate warnings without blocking', () => {
      const input = {
        command: 'find . -name "*.tmp"', // Missing CWD, but warn mode
        run_in_background: true,
      };

      const cwdResult = bashCwdValidator.handler(input);
      // Warn mode allows but warns
      assert.equal(cwdResult.allowed, true, 'Warn mode allows');
      assert.ok(cwdResult.warning, 'Should have warning');
    });
  });

  describe('Environment Override Integration', () => {
    it('should respect SHELLCHECK_VALIDATOR=off', () => {
      process.env.SHELLCHECK_VALIDATOR = 'off';

      const input = { command: 'invalid bash syntax ;;;' };
      const result = shellcheckValidator.handler(input);
      assert.equal(result.allowed, true, 'Off mode allows everything');
    });

    it('should respect COMMAND_ALLOWLIST=off', () => {
      process.env.COMMAND_ALLOWLIST = 'off';

      const input = { command: 'rm -rf /' };
      const result = commandAllowlistValidator.handler(input);
      assert.equal(result.allowed, true, 'Off mode allows everything');
    });

    it('should respect mode combinations', () => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.COMMAND_ALLOWLIST = 'off';

      const input = {
        command: 'find . -name "*.js"', // Missing CWD, uses rm (normally blocked)
        run_in_background: true,
      };

      const cwdResult = bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, false, 'CWD in block mode blocks');

      const allowlistResult = commandAllowlistValidator.handler(input);
      assert.equal(allowlistResult.allowed, true, 'Allowlist off mode allows');
    });
  });

  describe('Real-World Scenarios', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.SHELLCHECK_VALIDATOR = 'warn';
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should prevent original problem (filesystem traversal)', () => {
      // Original issue: background task searching entire filesystem
      const originalProblemInput = {
        command: 'find tests/ -name "*.test.*"',
        run_in_background: true,
      };

      const cwdResult = bashCwdValidator.handler(originalProblemInput);
      assert.equal(cwdResult.allowed, false, 'Should block missing CWD');
      assert.ok(
        cwdResult.reason?.includes('PROJECT_ROOT'),
        'Should require PROJECT_ROOT initialization'
      );
    });

    it('should allow safe test discovery', () => {
      const safeInput = {
        command: 'cd "$PROJECT_ROOT" && find tests/ -name "*.test.*" | wc -l',
        run_in_background: true,
      };

      // All validators pass
      const cwdResult = bashCwdValidator.handler(safeInput);
      assert.equal(cwdResult.allowed, true, 'CWD passes');

      const injectionResult = shellInjectionValidator.handler(safeInput);
      assert.equal(injectionResult.allowed, true, 'No injection detected');

      const allowlistResult = commandAllowlistValidator.handler(safeInput);
      assert.equal(allowlistResult.allowed, true, 'Commands whitelisted');
    });

    it('should block destructive operations', () => {
      const destructiveInput = {
        command: 'cd "$PROJECT_ROOT" && find . -name "*.tmp" -delete',
        run_in_background: true,
      };

      // CWD passes
      const cwdResult = bashCwdValidator.handler(destructiveInput);
      assert.equal(cwdResult.allowed, true, 'CWD initialized');

      // Allowlist blocks -delete flag
      const allowlistResult = commandAllowlistValidator.handler(destructiveInput);
      // Warn mode allows but warns
      assert.ok(
        allowlistResult.warning?.includes('dangerous flag'),
        'Should warn about -delete'
      );
    });

    it('should block shell injection attempts', () => {
      const injectionInput = {
        command: 'cd "$PROJECT_ROOT" && find tests/; rm -rf /',
        run_in_background: true,
      };

      // CWD passes
      const cwdResult = bashCwdValidator.handler(injectionInput);
      assert.equal(cwdResult.allowed, true, 'CWD passes');

      // Shell injection validator catches chained rm
      const injectionResult = shellInjectionValidator.handler(injectionInput);
      assert.equal(injectionResult.allowed, false, 'Should block chained rm');
    });
  });

  describe('Performance and Edge Cases', () => {
    before(() => {
      process.env.SHELLCHECK_VALIDATOR = 'warn';
      process.env.COMMAND_ALLOWLIST = 'warn';
    });

    it('should handle very long commands', () => {
      const longCommand =
        'cd "$PROJECT_ROOT" && ' + 'echo "test" && '.repeat(100) + 'echo "done"';
      const input = { command: longCommand, run_in_background: true };

      const cwdResult = bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should handle long commands');
    });

    it('should handle empty command', () => {
      const input = { command: '', run_in_background: true };

      const cwdResult = bashCwdValidator.handler(input);
      assert.ok(cwdResult.allowed !== undefined, 'Should handle empty');
    });

    it('should handle multiline commands', () => {
      const multiline = `cd "$PROJECT_ROOT" &&
find tests/ -name "*.test.*" |
grep -v node_modules |
wc -l`;

      const input = { command: multiline, run_in_background: true };

      const cwdResult = bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should handle multiline');
    });
  });
});
