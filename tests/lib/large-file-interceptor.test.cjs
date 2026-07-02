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

const MODULE_PATH = require.resolve('../../.claude/lib/orchestration/large-file-interceptor.cjs');

describe('large-file-interceptor', () => {
  describe('env limit parsing', () => {
    it('preserves an explicit limit of 0 (does not fall back to default)', () => {
      const saved = process.env.INTERCEPT_LIMIT_CODE;
      process.env.INTERCEPT_LIMIT_CODE = '0';
      try {
        delete require.cache[MODULE_PATH];
        const fresh = require('../../.claude/lib/orchestration/large-file-interceptor.cjs');
        assert.equal(fresh.LIMITS.code, 0, 'configured 0 must be preserved, not replaced by 50000');
      } finally {
        if (saved === undefined) delete process.env.INTERCEPT_LIMIT_CODE;
        else process.env.INTERCEPT_LIMIT_CODE = saved;
        delete require.cache[MODULE_PATH];
        require('../../.claude/lib/orchestration/large-file-interceptor.cjs');
      }
    });

    it('falls back to default for an unset/invalid limit', () => {
      const saved = process.env.INTERCEPT_LIMIT_CODE;
      process.env.INTERCEPT_LIMIT_CODE = 'not-a-number';
      try {
        delete require.cache[MODULE_PATH];
        const fresh = require('../../.claude/lib/orchestration/large-file-interceptor.cjs');
        assert.equal(fresh.LIMITS.code, 50000, 'invalid value must fall back to default');
      } finally {
        if (saved === undefined) delete process.env.INTERCEPT_LIMIT_CODE;
        else process.env.INTERCEPT_LIMIT_CODE = saved;
        delete require.cache[MODULE_PATH];
        require('../../.claude/lib/orchestration/large-file-interceptor.cjs');
      }
    });
  });
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
      const bigLogs = '2026-01-01 ERROR fail\n'.repeat(5000);
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
