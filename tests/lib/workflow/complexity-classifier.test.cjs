/**
 * Complexity Classifier Tests
 * ============================
 *
 * Tests for complexity classification logic.
 * Based on enterprise-orchestration-plan-2026-02-06.md Task 2.2
 */

'use strict';

const assert = require('assert');
const path = require('path');
const { describe, it } = require('node:test');

const { classifyRequest } = require(
  path.join(__dirname, '../../../.claude/lib/workflow/complexity-classifier.cjs')
);

describe('ComplexityClassifier', () => {
  describe('TRIVIAL complexity', () => {
    it('should classify "fix typo" as TRIVIAL', () => {
      const result = classifyRequest('fix typo in README');
      assert.strictEqual(result.complexity, 'TRIVIAL');
      assert.strictEqual(result.risk, 'LOW');
    });

    it('should classify "rename" as TRIVIAL', () => {
      const result = classifyRequest('rename variable');
      assert.strictEqual(result.complexity, 'TRIVIAL');
    });

    it('should classify short requests as TRIVIAL', () => {
      const result = classifyRequest('update doc');
      assert.strictEqual(result.complexity, 'TRIVIAL');
    });

    it('should return phase path for TRIVIAL', () => {
      const result = classifyRequest('fix typo');
      assert.deepStrictEqual(result.phasePath, [
        'PHASE_0_TRIAGE',
        'PHASE_2_IMPLEMENT',
        'PHASE_4_DEPLOY',
      ]);
    });
  });

  describe('LOW complexity', () => {
    it('should classify single file mention as LOW', () => {
      const result = classifyRequest('add helper function to utils.js');
      assert.strictEqual(result.complexity, 'LOW');
    });

    it('should classify clear scope as LOW', () => {
      const result = classifyRequest('add validation to email field');
      assert.strictEqual(result.complexity, 'LOW');
    });

    it('should return phase path for LOW', () => {
      const result = classifyRequest('add helper function');
      assert.deepStrictEqual(result.phasePath, [
        'PHASE_0_TRIAGE',
        'PHASE_1_DESIGN',
        'PHASE_2_IMPLEMENT',
        'PHASE_3_REVIEW',
        'PHASE_4_DEPLOY',
      ]);
    });
  });

  describe('MEDIUM complexity', () => {
    it('should classify multiple files as MEDIUM', () => {
      const result = classifyRequest('update auth module across 5 files');
      assert.strictEqual(result.complexity, 'MEDIUM');
    });

    it('should classify "refactor" as MEDIUM', () => {
      const result = classifyRequest('refactor user service');
      assert.strictEqual(result.complexity, 'MEDIUM');
    });

    it('should classify "improve" as MEDIUM', () => {
      const result = classifyRequest('improve error handling');
      assert.strictEqual(result.complexity, 'MEDIUM');
    });

    it('should return phase path for MEDIUM', () => {
      const result = classifyRequest('refactor auth module');
      assert.deepStrictEqual(result.phasePath, [
        'PHASE_0_TRIAGE',
        'PHASE_1_DESIGN',
        'PHASE_2_IMPLEMENT',
        'PHASE_3_REVIEW',
        'PHASE_4_DEPLOY',
        'PHASE_5_DOCUMENT',
      ]);
    });
  });

  describe('HIGH complexity', () => {
    it('should classify "architecture" as HIGH', () => {
      const result = classifyRequest('design new architecture for API layer');
      assert.strictEqual(result.complexity, 'HIGH');
    });

    it('should classify "system" as HIGH', () => {
      const result = classifyRequest('update system configuration');
      assert.strictEqual(result.complexity, 'HIGH');
    });

    it('should classify "auth" as HIGH', () => {
      const result = classifyRequest('add OAuth2 authentication');
      assert.strictEqual(result.complexity, 'HIGH');
      assert.strictEqual(result.risk, 'HIGH'); // Auth is high risk
    });

    it('should classify "security" as HIGH', () => {
      const result = classifyRequest('implement security hardening');
      assert.strictEqual(result.complexity, 'HIGH');
      assert.strictEqual(result.risk, 'HIGH');
    });

    it('should return phase path for HIGH', () => {
      const result = classifyRequest('add OAuth2 authentication');
      assert.deepStrictEqual(result.phasePath, [
        'PHASE_0_TRIAGE',
        'PHASE_1_DESIGN',
        'PHASE_2_IMPLEMENT',
        'PHASE_3_REVIEW',
        'PHASE_4_DEPLOY',
        'PHASE_5_DOCUMENT',
        'PHASE_6_REFLECT',
      ]);
    });
  });

  describe('EPIC complexity', () => {
    it('should classify "migrate" as EPIC', () => {
      const result = classifyRequest('migrate entire API to GraphQL');
      assert.strictEqual(result.complexity, 'EPIC');
    });

    it('should classify "rewrite" as EPIC', () => {
      const result = classifyRequest('rewrite authentication system');
      assert.strictEqual(result.complexity, 'EPIC');
    });

    it('should classify "overhaul" as EPIC', () => {
      const result = classifyRequest('overhaul database layer');
      assert.strictEqual(result.complexity, 'EPIC');
    });

    it('should return phase path for EPIC', () => {
      const result = classifyRequest('migrate to microservices');
      assert.deepStrictEqual(result.phasePath, [
        'PHASE_0_TRIAGE',
        'PHASE_1_DESIGN',
        'PHASE_2_IMPLEMENT',
        'PHASE_3_REVIEW',
        'PHASE_4_DEPLOY',
        'PHASE_5_DOCUMENT',
        'PHASE_6_REFLECT',
      ]);
    });
  });

  describe('Risk classification', () => {
    it('should classify non-security tasks as LOW risk', () => {
      const result = classifyRequest('add unit tests');
      assert.strictEqual(result.risk, 'LOW');
    });

    it('should classify "api" as MEDIUM risk', () => {
      const result = classifyRequest('add new API endpoint');
      assert.strictEqual(result.risk, 'MEDIUM');
    });

    it('should classify "data" as MEDIUM risk', () => {
      const result = classifyRequest('update data validation');
      assert.strictEqual(result.risk, 'MEDIUM');
    });

    it('should classify "auth" as HIGH risk', () => {
      const result = classifyRequest('update authentication logic');
      assert.strictEqual(result.risk, 'HIGH');
    });

    it('should classify "password" as HIGH risk', () => {
      const result = classifyRequest('change password hashing');
      assert.strictEqual(result.risk, 'HIGH');
    });

    it('should classify "credentials" as HIGH risk', () => {
      const result = classifyRequest('update credentials storage');
      assert.strictEqual(result.risk, 'HIGH');
    });

    it('should classify "payment" as HIGH risk', () => {
      const result = classifyRequest('implement payment processing');
      assert.strictEqual(result.risk, 'HIGH');
    });

    it('should classify "production" as CRITICAL risk', () => {
      const result = classifyRequest('deploy to production');
      assert.strictEqual(result.risk, 'CRITICAL');
    });

    it('should classify "deploy" as CRITICAL risk', () => {
      const result = classifyRequest('deploy database migration');
      assert.strictEqual(result.risk, 'CRITICAL');
    });

    it('should classify "database migration" as CRITICAL risk', () => {
      const result = classifyRequest('run database migration on live data');
      assert.strictEqual(result.risk, 'CRITICAL');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = classifyRequest('');
      assert.strictEqual(result.complexity, 'TRIVIAL');
      assert.strictEqual(result.risk, 'LOW');
    });

    it('should handle very long request', () => {
      const longRequest =
        'migrate the entire authentication system from JWT to OAuth2 and update all services to use the new token format and add refresh token support and implement token rotation and add security logging and update documentation';
      const result = classifyRequest(longRequest);
      assert.strictEqual(result.complexity, 'EPIC'); // Has "migrate"
      assert.strictEqual(result.risk, 'HIGH'); // Has "authentication"
    });

    it('should be case-insensitive', () => {
      const result1 = classifyRequest('MIGRATE DATABASE');
      const result2 = classifyRequest('migrate database');
      assert.strictEqual(result1.complexity, result2.complexity);
      assert.strictEqual(result1.risk, result2.risk);
    });

    it('should not classify "author" as HIGH via auth substring', () => {
      const result = classifyRequest('update author bio in docs');
      assert.notStrictEqual(result.complexity, 'HIGH');
      assert.strictEqual(result.risk, 'LOW');
    });

    it('should not classify "fix all typos" as EPIC', () => {
      const result = classifyRequest('fix all typos in README');
      assert.notStrictEqual(result.complexity, 'EPIC');
    });

    it('should not classify security doc updates as HIGH complexity by keyword alone', () => {
      const result = classifyRequest('security doc update in handbook');
      assert.notStrictEqual(result.complexity, 'HIGH');
      assert.strictEqual(result.risk, 'HIGH');
    });
  });
});
