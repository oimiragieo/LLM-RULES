#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldIntercept,
  interceptContent,
  getLimit,
  LIMITS,
} = require('../../.claude/lib/orchestration/large-file-interceptor.cjs');

describe('large-file-interceptor', () => {
  describe('shouldIntercept', () => {
    it('returns false for small content', () => {
      assert.equal(shouldIntercept('small text'), false);
    });

    it('returns true for oversized code', () => {
      const big = 'x'.repeat(LIMITS.code + 1);
      assert.equal(shouldIntercept(big, 'code'), true);
    });

    it('returns false for null/empty', () => {
      assert.equal(shouldIntercept(null), false);
      assert.equal(shouldIntercept(''), false);
    });

    it('auto-detects content type', () => {
      const bigLogs = ('2026-01-01 ERROR fail\n').repeat(5000);
      // logs limit is 30000, this is ~110000 chars
      assert.equal(shouldIntercept(bigLogs), true);
    });
  });

  describe('interceptContent', () => {
    it('does not intercept small content', () => {
      const result = interceptContent('hello world');
      assert.equal(result.intercepted, false);
      assert.equal(result.summary, 'hello world');
    });

    it('intercepts oversized content', () => {
      const big = 'const x = 1;\n'.repeat(5000);
      const result = interceptContent(big, { contentType: 'code', filePath: 'big.js' });
      assert.equal(result.intercepted, true);
      assert.ok(result.summary.includes('CONTENT INTERCEPTED'));
      assert.ok(result.summary.includes('big.js'));
      assert.ok(result.reduction_pct > 0);
    });

    it('uses aggressive tier by default', () => {
      const big = 'const x = 1;\n'.repeat(5000);
      const result = interceptContent(big, { contentType: 'code' });
      assert.equal(result.tier, 'aggressive');
    });

    it('respects custom tier', () => {
      const big = 'const x = 1;\n'.repeat(5000);
      const result = interceptContent(big, { contentType: 'code', tier: 'truncation' });
      assert.equal(result.tier, 'truncation');
    });
  });

  describe('getLimit', () => {
    it('returns configured limit for known types', () => {
      assert.equal(getLimit('code'), LIMITS.code);
      assert.equal(getLimit('logs'), LIMITS.logs);
    });

    it('returns default for unknown types', () => {
      assert.equal(getLimit('unknown'), LIMITS.default);
    });
  });
});
