'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateTaskOutput,
  VALIDATION_ERRORS,
} = require('../../.claude/lib/utils/task-output-validator.cjs');

describe('task-output-validator', () => {
  describe('validateTaskOutput - valid inputs', () => {
    it('accepts valid metadata with summary and filesModified array', () => {
      const result = validateTaskOutput({
        summary: 'Implemented the authentication flow',
        filesModified: ['src/auth.js', 'tests/auth.test.js'],
      });
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('accepts metadata with empty filesModified array', () => {
      const result = validateTaskOutput({
        summary: 'Refactored internal constants only',
        filesModified: [],
      });
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    it('accepts metadata with extra unknown fields', () => {
      const result = validateTaskOutput({
        summary: 'Added logging middleware',
        filesModified: ['src/middleware.js'],
        completedAt: '2026-03-17T00:00:00Z',
        worktreePath: '/some/path',
      });
      assert.strictEqual(result.valid, true);
    });

    it('accepts summary exactly 10 chars', () => {
      const result = validateTaskOutput({
        summary: '1234567890',
        filesModified: [],
      });
      assert.strictEqual(result.valid, true);
    });

    it('accepts summary longer than 10 chars', () => {
      const result = validateTaskOutput({
        summary: 'This is a longer summary describing the work done.',
        filesModified: ['a.js'],
      });
      assert.strictEqual(result.valid, true);
    });
  });

  describe('validateTaskOutput - invalid inputs', () => {
    it('rejects null metadata', () => {
      const result = validateTaskOutput(null);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('rejects undefined metadata', () => {
      const result = validateTaskOutput(undefined);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('rejects non-object metadata', () => {
      const result = validateTaskOutput('not an object');
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('rejects missing summary field', () => {
      const result = validateTaskOutput({
        filesModified: ['src/foo.js'],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('summary')));
    });

    it('rejects summary that is not a string', () => {
      const result = validateTaskOutput({
        summary: 42,
        filesModified: ['src/foo.js'],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('summary')));
    });

    it('rejects summary shorter than 10 chars', () => {
      const result = validateTaskOutput({
        summary: 'Too short',
        filesModified: [],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('summary')));
    });

    it('rejects empty string summary', () => {
      const result = validateTaskOutput({
        summary: '',
        filesModified: [],
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('summary')));
    });

    it('rejects missing filesModified field', () => {
      const result = validateTaskOutput({
        summary: 'Valid summary here',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('filesModified')));
    });

    it('rejects filesModified that is not an array', () => {
      const result = validateTaskOutput({
        summary: 'Valid summary here',
        filesModified: 'not-an-array',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('filesModified')));
    });

    it('rejects filesModified as object', () => {
      const result = validateTaskOutput({
        summary: 'Valid summary here',
        filesModified: { file: 'foo.js' },
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('filesModified')));
    });

    it('collects multiple errors when both fields are invalid', () => {
      const result = validateTaskOutput({
        summary: 'bad',
        filesModified: 'nope',
      });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length >= 2);
    });
  });

  describe('validateTaskOutput - performance', () => {
    it('completes under 50ms for typical input', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        validateTaskOutput({
          summary: 'Implemented the authentication flow',
          filesModified: ['src/auth.js', 'tests/auth.test.js'],
        });
      }
      const elapsed = Date.now() - start;
      // 1000 iterations should complete well under 50ms total
      assert.ok(elapsed < 50, `1000 iterations took ${elapsed}ms (expected < 50ms)`);
    });
  });

  describe('VALIDATION_ERRORS constants', () => {
    it('exports VALIDATION_ERRORS with expected keys', () => {
      assert.ok(typeof VALIDATION_ERRORS === 'object');
      assert.ok(VALIDATION_ERRORS !== null);
      assert.ok('MISSING_SUMMARY' in VALIDATION_ERRORS);
      assert.ok('MISSING_FILES_MODIFIED' in VALIDATION_ERRORS);
    });
  });

  describe('result shape', () => {
    it('always returns an object with valid and errors fields', () => {
      const valid = validateTaskOutput({
        summary: 'Ten chars!!',
        filesModified: [],
      });
      assert.ok('valid' in valid);
      assert.ok('errors' in valid);
      assert.ok(typeof valid.valid === 'boolean');
      assert.ok(Array.isArray(valid.errors));

      const invalid = validateTaskOutput(null);
      assert.ok('valid' in invalid);
      assert.ok('errors' in invalid);
    });
  });
});
