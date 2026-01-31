#!/usr/bin/env node
/**
 * SEC-005: Code Injection Prevention Tests
 * ========================================
 *
 * Security tests for safeEvaluateCondition to prevent code injection
 * via new Function() constructor.
 *
 * This test file verifies that:
 * 1. Malicious code injection is blocked
 * 2. Predefined safe conditions work correctly
 * 3. Unknown conditions are rejected
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Import the function we're testing (will be added)
const { safeEvaluateCondition } = require('../../../.claude/lib/workflow/step-validators.cjs');

describe('SEC-005: Code Injection Prevention', () => {
  describe('Malicious code injection blocking', () => {
    it('blocks arbitrary function execution', () => {
      const malicious = "(() => { require('child_process').execSync('whoami'); return true })()";
      const result = safeEvaluateCondition(malicious, {});
      assert.strictEqual(result.passed, false, 'Should block malicious code');
      assert.strictEqual(result.blocked, true, 'Should mark as blocked');
      assert.ok(result.error.includes('Unknown condition'), 'Should report unknown condition');
    });

    it('blocks process.exit injection', () => {
      const malicious = 'process.exit(1)';
      const result = safeEvaluateCondition(malicious, {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, true);
    });

    it('blocks require injection', () => {
      const malicious = "require('fs').unlinkSync('/etc/passwd')";
      const result = safeEvaluateCondition(malicious, {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, true);
    });

    it('blocks eval injection', () => {
      const malicious = "eval('process.exit(1)')";
      const result = safeEvaluateCondition(malicious, {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, true);
    });

    it('blocks constructor injection', () => {
      const malicious = "this.constructor.constructor('return process')().exit(1)";
      const result = safeEvaluateCondition(malicious, {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, true);
    });

    it('blocks prototype pollution attempts', () => {
      const malicious = '__proto__.polluted = true';
      const result = safeEvaluateCondition(malicious, {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, true);
    });
  });

  describe('Predefined safe conditions', () => {
    it('allows steps.research.passed when true', () => {
      const result = safeEvaluateCondition('steps.research.passed', {
        steps: { research: { passed: true } },
      });
      assert.strictEqual(result.passed, true);
      assert.strictEqual(result.blocked, undefined);
    });

    it('returns false for steps.research.passed when false', () => {
      const result = safeEvaluateCondition('steps.research.passed', {
        steps: { research: { passed: false } },
      });
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, undefined);
    });

    it('allows steps.research.passed === true syntax', () => {
      const result = safeEvaluateCondition('steps.research.passed === true', {
        steps: { research: { passed: true } },
      });
      assert.strictEqual(result.passed, true);
    });

    it('allows steps.validation.passed', () => {
      const result = safeEvaluateCondition('steps.validation.passed', {
        steps: { validation: { passed: true } },
      });
      assert.strictEqual(result.passed, true);
    });

    it('allows combined condition steps.research.passed && steps.validation.passed', () => {
      const result = safeEvaluateCondition('steps.research.passed && steps.validation.passed', {
        steps: {
          research: { passed: true },
          validation: { passed: true },
        },
      });
      assert.strictEqual(result.passed, true);
    });

    it('returns false for combined condition when one is false', () => {
      const result = safeEvaluateCondition('steps.research.passed && steps.validation.passed', {
        steps: {
          research: { passed: true },
          validation: { passed: false },
        },
      });
      assert.strictEqual(result.passed, false);
    });

    it('allows literal true', () => {
      const result = safeEvaluateCondition('true', {});
      assert.strictEqual(result.passed, true);
    });

    it('allows literal false', () => {
      const result = safeEvaluateCondition('false', {});
      assert.strictEqual(result.passed, false);
    });
  });

  describe('Edge cases', () => {
    it('handles missing steps object gracefully', () => {
      const result = safeEvaluateCondition('steps.research.passed', {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, undefined); // Not blocked, just evaluated to false
    });

    it('handles null context gracefully', () => {
      const result = safeEvaluateCondition('steps.research.passed', null);
      assert.strictEqual(result.passed, false);
    });

    it('handles undefined context gracefully', () => {
      const result = safeEvaluateCondition('steps.research.passed', undefined);
      assert.strictEqual(result.passed, false);
    });

    it('handles whitespace in condition', () => {
      const result = safeEvaluateCondition('  steps.research.passed  ', {
        steps: { research: { passed: true } },
      });
      assert.strictEqual(result.passed, true);
    });

    it('rejects unknown conditions with helpful error', () => {
      const result = safeEvaluateCondition('steps.unknown.field', {});
      assert.strictEqual(result.passed, false);
      assert.strictEqual(result.blocked, true);
      assert.ok(result.error.includes('Unknown condition'));
      assert.ok(result.error.includes('predefined conditions only'));
    });
  });
});
