#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TIERS,
  selectTier,
  summarize,
  detectContentType,
} = require('../../.claude/lib/orchestration/summarization-tiers.cjs');

describe('summarization-tiers', () => {
  describe('TIERS', () => {
    it('defines three tiers', () => {
      assert.ok(TIERS.normal);
      assert.ok(TIERS.aggressive);
      assert.ok(TIERS.truncation);
    });

    it('has increasing reduction targets', () => {
      assert.ok(TIERS.normal.reductionTarget < TIERS.aggressive.reductionTarget);
      assert.ok(TIERS.aggressive.reductionTarget < TIERS.truncation.reductionTarget);
    });
  });

  describe('selectTier', () => {
    it('returns normal when below 50%', () => {
      assert.equal(selectTier(40000, 200000), 'normal');
    });

    it('returns normal at 50-70%', () => {
      assert.equal(selectTier(120000, 200000), 'normal');
    });

    it('returns aggressive at 70-85%', () => {
      assert.equal(selectTier(150000, 200000), 'aggressive');
    });

    it('returns truncation above 85%', () => {
      assert.equal(selectTier(180000, 200000), 'truncation');
    });

    it('handles zero maxTokens', () => {
      assert.equal(selectTier(100, 0), 'normal');
    });
  });

  describe('detectContentType', () => {
    it('detects code', () => {
      assert.equal(detectContentType('const x = 1;\nfunction foo() {}'), 'code');
    });

    it('detects documentation', () => {
      assert.equal(detectContentType('# Heading\n\nSome text'), 'documentation');
    });

    it('detects logs', () => {
      assert.equal(detectContentType('2026-03-18 10:00:00 INFO Starting\n[ERROR] Failed'), 'logs');
    });

    it('detects conversation', () => {
      assert.equal(detectContentType('User: Hello\nAssistant: Hi there'), 'conversation');
    });
  });

  describe('summarize', () => {
    it('handles empty content', () => {
      const result = summarize('', 'normal');
      assert.equal(result.summary, '');
      assert.equal(result.reductionPct, 0);
    });

    it('produces shorter output for normal tier', () => {
      const fn = 'function test() {\n  const x = 1;\n  const y = 2;\n  return x + y;\n}\n';
      const code = Array(20).fill(fn).join('\n');
      const result = summarize(code, 'normal', { contentType: 'code' });
      assert.ok(result.summaryLength < result.originalLength);
      assert.equal(result.tier, 'normal');
    });

    it('produces shorter output for aggressive tier', () => {
      const fn = 'function test() {\n  const x = 1;\n  return x;\n}\n';
      const code = Array(20).fill(fn).join('\n');
      const result = summarize(code, 'aggressive', { contentType: 'code' });
      assert.ok(result.summaryLength < result.originalLength);
    });

    it('produces shortest output for truncation tier', () => {
      const fn = 'function test() {\n  return 42;\n}\n';
      const code = Array(50).fill(fn).join('\n');
      const truncResult = summarize(code, 'truncation', {
        contentType: 'code',
        filePath: 'test.js',
      });
      const normalResult = summarize(code, 'normal', { contentType: 'code' });
      assert.ok(truncResult.summaryLength <= normalResult.summaryLength);
    });

    it('includes file path in truncation summary', () => {
      const result = summarize('const x = 1;', 'truncation', {
        contentType: 'code',
        filePath: 'src/index.js',
      });
      assert.ok(result.summary.includes('src/index.js'));
    });

    it('summarizes logs with error counts', () => {
      const logs = [
        '2026-03-18 ERROR db failed',
        '2026-03-18 INFO started',
        '2026-03-18 WARN slow query',
        '2026-03-18 ERROR timeout',
      ].join('\n');
      const result = summarize(logs, 'truncation', {
        contentType: 'logs',
        filePath: 'app.log',
      });
      assert.ok(result.summary.includes('2 errors'));
      assert.ok(result.summary.includes('1 warning'));
    });
  });
});
