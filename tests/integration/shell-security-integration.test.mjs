/**
 * @file Shell Security Integration Tests (Phase 1 + Phase 2)
 * @phase 2
 * @priority HIGH
 * @description Tests multi-hook coordination: CWD validator + shell injection + variable quoting
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Import Phase 1 validators (CWD + shell injection)
import bashCwdValidator from '../../.claude/hooks/safety/bash-cwd-validator.cjs';
import shellInjectionValidator from '../../.claude/hooks/safety/shell-injection-validator.cjs';

// Import Phase 2 validator (variable quoting)
import variableQuotingValidator from '../../.claude/hooks/safety/variable-quoting-validator.cjs';

describe('Shell Security Integration (Phase 1 + 2)', () => {
  let originalEnv;

  before(() => {
    originalEnv = {
      BASH_CWD_VALIDATOR: process.env.BASH_CWD_VALIDATOR,
      SHELL_INJECTION_VALIDATOR: process.env.SHELL_INJECTION_VALIDATOR,
      VARIABLE_QUOTING_VALIDATOR: process.env.VARIABLE_QUOTING_VALIDATOR,
    };
  });

  after(() => {
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  describe('Background Task with All Violations', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';
    });

    it('should block on missing CWD first (CWD validator)', async () => {
      const input = {
        command: 'find $DIR -name "*.test.*"',
        run_in_background: true,
      };

      // CWD validator blocks immediately
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, false, 'Should block missing CWD');
      assert.ok(cwdResult.reason.includes('CWD'), 'Should mention CWD requirement');

      // Variable quoting would also warn (but CWD blocks first)
      const quotingResult = await variableQuotingValidator.handler(input);
      assert.equal(quotingResult.allowed, true, 'Quoting is warn mode, allows with warning');
      assert.ok(quotingResult.warning, 'Should warn about unquoted $DIR');
    });

    it('should warn about unquoted variables even with CWD (quoting validator)', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find $DIR -name "*.test.*"',
        run_in_background: true,
      };

      // CWD validator passes
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should pass CWD check');

      // Variable quoting warns
      const quotingResult = await variableQuotingValidator.handler(input);
      assert.equal(quotingResult.allowed, true, 'Should allow in warn mode');
      assert.ok(quotingResult.warning, 'Should warn about $DIR');
      assert.ok(quotingResult.warning.includes('$DIR'), 'Should mention $DIR');
    });
  });

  describe('Background Task with CWD but Injection', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';
    });

    it('should pass CWD but block on injection pattern', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find tests/ && rm -rf /',
        run_in_background: true,
      };

      // CWD validator passes
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should pass CWD check');

      // Shell injection blocks
      const injectionResult = await shellInjectionValidator.handler(input);
      assert.equal(injectionResult.allowed, false, 'Should block rm -rf /');
      assert.ok(injectionResult.reason.includes('rm -rf'), 'Should mention dangerous pattern');
    });

    it('should pass CWD but block on chained rm', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT"; rm -rf tests/',
        run_in_background: true,
      };

      // CWD validator passes
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should pass CWD check');

      // Shell injection blocks (chained rm is dangerous)
      const injectionResult = await shellInjectionValidator.handler(input);
      assert.equal(injectionResult.allowed, false, 'Should block chained rm');
    });
  });

  describe('Background Task Fully Compliant', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';
    });

    it('should pass all validators (gold standard)', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find tests/ -name "*.test.*"',
        run_in_background: true,
      };

      // CWD validator passes
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should pass CWD check');

      // Shell injection passes
      const injectionResult = await shellInjectionValidator.handler(input);
      assert.equal(injectionResult.allowed, true, 'Should pass injection check');

      // Variable quoting passes (all quoted)
      const quotingResult = await variableQuotingValidator.handler(input);
      assert.equal(quotingResult.allowed, true, 'Should pass quoting check');
      assert.ok(!quotingResult.warning, 'Should have no warnings');
    });

    it('should pass all validators with complex command', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find tests/ -name "*.test.*" | wc -l',
        run_in_background: true,
      };

      // All validators pass
      const cwdResult = await bashCwdValidator.handler(input);
      const injectionResult = await shellInjectionValidator.handler(input);
      const quotingResult = await variableQuotingValidator.handler(input);

      assert.equal(cwdResult.allowed, true, 'CWD passes');
      assert.equal(injectionResult.allowed, true, 'Injection passes');
      assert.equal(quotingResult.allowed, true, 'Quoting passes');
    });
  });

  describe('Environment Override', () => {
    it('should allow violations when all validators set to off', async () => {
      process.env.BASH_CWD_VALIDATOR = 'off';
      process.env.SHELL_INJECTION_VALIDATOR = 'off';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'off';

      const input = {
        command: 'find $DIR && rm -rf /',
        run_in_background: true,
      };

      const cwdResult = await bashCwdValidator.handler(input);
      const injectionResult = await shellInjectionValidator.handler(input);
      const quotingResult = await variableQuotingValidator.handler(input);

      assert.equal(cwdResult.allowed, true, 'CWD off, allows');
      assert.equal(injectionResult.allowed, true, 'Injection off, allows');
      assert.equal(quotingResult.allowed, true, 'Quoting off, allows');
      assert.ok(!quotingResult.warning, 'No warnings when off');
    });

    it('should warn when CWD validator in warn mode', async () => {
      process.env.BASH_CWD_VALIDATOR = 'warn';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';

      const input = {
        command: 'find tests/ -name "*.test.*"',
        run_in_background: true,
      };

      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'Should allow in warn mode');
      assert.ok(cwdResult.warning, 'Should provide warning');
      assert.ok(cwdResult.warning.includes('CWD'), 'Should mention CWD');
    });
  });

  describe('Multi-Hook Coordination', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';
    });

    it('should not have conflicting validations', async () => {
      const input = {
        command: 'cd "$PROJECT_ROOT" && find "$DIR" -name "*.test.*"',
        run_in_background: true,
      };

      // All validators should agree this is safe
      const cwdResult = await bashCwdValidator.handler(input);
      const injectionResult = await shellInjectionValidator.handler(input);
      const quotingResult = await variableQuotingValidator.handler(input);

      assert.equal(cwdResult.allowed, true, 'CWD passes');
      assert.equal(injectionResult.allowed, true, 'Injection passes');
      assert.equal(quotingResult.allowed, true, 'Quoting passes (all quoted)');
    });

    it('should have clear error messages for each validator', async () => {
      // Missing CWD
      const noCwd = await bashCwdValidator.handler({
        command: 'find tests/',
        run_in_background: true,
      });
      assert.ok(noCwd.reason?.includes('CWD'), 'CWD error mentions CWD');

      // Injection pattern
      const injection = await shellInjectionValidator.handler({
        command: 'find tests/ && rm -rf /',
      });
      assert.ok(injection.reason?.includes('rm'), 'Injection error mentions dangerous command');

      // Unquoted variable
      const unquoted = await variableQuotingValidator.handler({
        command: 'cd $PROJECT_ROOT && find tests/',
      });
      assert.ok(
        unquoted.warning?.includes('unquoted') || unquoted.warning?.includes('$PROJECT_ROOT'),
        'Quoting warning mentions unquoted or variable'
      );
    });

    it('should suggest fixes for each validator', async () => {
      // CWD validator suggests fix
      const noCwd = await bashCwdValidator.handler({
        command: 'find tests/',
        run_in_background: true,
      });
      assert.ok(noCwd.fix, 'CWD validator should suggest fix');
      assert.ok(noCwd.fix.includes('cd "$PROJECT_ROOT"'), 'Fix should mention CWD initialization');

      // Variable quoting suggests fix
      const unquoted = await variableQuotingValidator.handler({
        command: 'cd $PROJECT_ROOT && find tests/',
      });
      assert.ok(unquoted.fix, 'Quoting validator should suggest fix');
      assert.ok(unquoted.fix.includes('"$PROJECT_ROOT"'), 'Fix should show quoted variable');
    });
  });

  describe('Foreground vs Background Behavior', () => {
    before(() => {
      process.env.BASH_CWD_VALIDATOR = 'block';
      process.env.SHELL_INJECTION_VALIDATOR = 'block';
      process.env.VARIABLE_QUOTING_VALIDATOR = 'warn';
    });

    it('should only enforce CWD on background tasks', async () => {
      const input = {
        command: 'find tests/ -name "*.test.*"',
        run_in_background: false, // foreground
      };

      // CWD validator skips foreground
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, true, 'CWD not enforced on foreground');

      // Injection and quoting still apply to foreground
      const injectionResult = await shellInjectionValidator.handler(input);
      const quotingResult = await variableQuotingValidator.handler(input);
      assert.equal(injectionResult.allowed, true, 'Injection check applies');
      assert.equal(quotingResult.allowed, true, 'Quoting check applies');
    });

    it('should enforce all validators on background tasks', async () => {
      const input = {
        command: 'find tests/ -name "*.test.*"',
        run_in_background: true, // background
      };

      // CWD validator enforces on background
      const cwdResult = await bashCwdValidator.handler(input);
      assert.equal(cwdResult.allowed, false, 'CWD enforced on background');

      // Others also apply
      const injectionResult = await shellInjectionValidator.handler(input);
      const quotingResult = await variableQuotingValidator.handler(input);
      assert.equal(injectionResult.allowed, true, 'Injection check applies');
      assert.equal(quotingResult.allowed, true, 'Quoting check applies');
    });
  });
});
