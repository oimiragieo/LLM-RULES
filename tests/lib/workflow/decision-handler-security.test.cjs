// security-lint-ignore: test file contains intentional malicious expression strings for security validation
/**
 * Security tests for DecisionHandler - SEC-TOOL-001
 *
 * Tests that the safeEvaluateExpression method rejects malicious input
 * while still supporting legitimate workflow expressions.
 *
 * @see .claude/context/reports/security/tools-system-security-review-2026-02-07.md
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// DecisionHandler is an ESM module; we need dynamic import
let DecisionHandler;
let handler;

describe('DecisionHandler Security (SEC-TOOL-001)', () => {
  before(async () => {
    const mod = await import('../../../.claude/lib/workflow/decision-handler.mjs');
    DecisionHandler = mod.default;
    handler = new DecisionHandler();
  });

  describe('safeEvaluateExpression - rejects malicious expressions', () => {
    const maliciousExpressions = [
      // Code injection via closing parenthesis
      'true); process.exit(1); //',
      // Function constructor escape
      "Function('return process')().exit(1)",
      // Require injection
      "require('child_process').execSync('whoami')",
      // Process access
      'process.exit(1)',
      // Global access
      'global.process.exit(1)',
      // Prototype pollution
      '({}).__proto__.polluted = true',
      // Constructor access
      '({}).constructor.constructor("return process")()',
      // Template literal injection
      '`${process.exit(1)}`',
      // Computed property access
      'global["pro" + "cess"].exit(1)',
      // Assignment attempt
      'x = 1',
      // Delete operator
      'delete Object.prototype',
      // Import expression
      'import("fs")',
      // Void with side effect
      'void process.exit(1)',
      // Comma operator with side effect
      '1, process.exit(1)',
      // Array access to globals
      '[].constructor.constructor("return this")()',
      // RegExp constructor abuse
      '/foo/.constructor("return process")()',
      // While loop (should not be allowed)
      'while(true){}',
      // For loop (should not be allowed)
      'for(;;){}',
      // Function call (arbitrary)
      'eval("code")',
      // new expression
      'new Function("return 1")()',
    ];

    for (const expr of maliciousExpressions) {
      it(`rejects: ${expr.slice(0, 60)}`, () => {
        const result = handler.safeEvaluateExpression(expr);
        assert.strictEqual(result, false, `Expected false for malicious expression: ${expr}`);
      });
    }
  });

  describe('safeEvaluateExpression - accepts legitimate expressions', () => {
    it('evaluates simple boolean true', () => {
      const result = handler.safeEvaluateExpression('true');
      assert.strictEqual(result, true);
    });

    it('evaluates simple boolean false', () => {
      const result = handler.safeEvaluateExpression('false');
      assert.strictEqual(result, false);
    });

    it('evaluates equality comparison', () => {
      const result = handler.safeEvaluateExpression("'success' === 'success'");
      assert.strictEqual(result, true);
    });

    it('evaluates inequality comparison', () => {
      const result = handler.safeEvaluateExpression("'error' !== 'success'");
      assert.strictEqual(result, true);
    });

    it('evaluates numeric comparison greater than', () => {
      const result = handler.safeEvaluateExpression('10 > 5');
      assert.strictEqual(result, true);
    });

    it('evaluates numeric comparison less than', () => {
      const result = handler.safeEvaluateExpression('3 < 7');
      assert.strictEqual(result, true);
    });

    it('evaluates greater than or equal', () => {
      const result = handler.safeEvaluateExpression('5 >= 5');
      assert.strictEqual(result, true);
    });

    it('evaluates less than or equal', () => {
      const result = handler.safeEvaluateExpression('5 <= 10');
      assert.strictEqual(result, true);
    });

    it('evaluates logical AND', () => {
      const result = handler.safeEvaluateExpression('true && true');
      assert.strictEqual(result, true);
    });

    it('evaluates logical OR', () => {
      const result = handler.safeEvaluateExpression('false || true');
      assert.strictEqual(result, true);
    });

    it('evaluates logical NOT', () => {
      const result = handler.safeEvaluateExpression('!false');
      assert.strictEqual(result, true);
    });

    it('evaluates numeric literal', () => {
      const result = handler.safeEvaluateExpression('42');
      assert.strictEqual(result, 42);
    });

    it('evaluates string literal', () => {
      const result = handler.safeEvaluateExpression("'hello'");
      assert.strictEqual(result, 'hello');
    });

    it('evaluates combined logical expression', () => {
      const result = handler.safeEvaluateExpression("true && 'done' === 'done'");
      assert.strictEqual(result, true);
    });

    it('evaluates parenthesized expressions', () => {
      const result = handler.safeEvaluateExpression('(true || false) && true');
      assert.strictEqual(result, true);
    });

    it('evaluates double negation', () => {
      const result = handler.safeEvaluateExpression('!!true');
      assert.strictEqual(result, true);
    });
  });

  describe('evaluateCondition - integration with context', () => {
    it('evaluates context variable access', async () => {
      const result = await handler.evaluateCondition('context.status', {
        status: 'success',
      });
      assert.strictEqual(result, 'success');
    });

    it('evaluates nested context variable', async () => {
      const result = await handler.evaluateCondition('context.result.code', {
        result: { code: 200 },
      });
      assert.strictEqual(result, 200);
    });

    it('evaluates environment variable check', async () => {
      process.env.TEST_SEC_001 = 'set';
      const result = await handler.evaluateCondition('env.TEST_SEC_001', {});
      delete process.env.TEST_SEC_001;
      assert.strictEqual(result, true);
    });
  });

  describe('evaluateComplexCondition - safely handles context substitution', () => {
    it('evaluates condition with context values', () => {
      const result = handler.evaluateComplexCondition("context.status === 'success'", {
        status: 'success',
      });
      assert.strictEqual(result, true);
    });

    it('rejects injected context values', () => {
      // Even if context value contains malicious code, it should be safe
      const result = handler.evaluateComplexCondition("context.status === 'success'", {
        status: "success'; process.exit(1); //",
      });
      assert.strictEqual(result, false);
    });
  });
});
