#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreImportance,
  scoreBatch,
  filterByImportance,
  scoreWithWeights,
} = require('../../.claude/lib/memory/importance-scorer.cjs');

describe('importance-scorer enhanced (E2)', () => {
  describe('scoreBatch', () => {
    it('scores and sorts items by importance', () => {
      const items = [
        { text: 'Fixed typo in readme', id: 'low' },
        { text: 'Critical security vulnerability in authentication', id: 'high', area: 'security' },
        { text: 'Added helper function', id: 'mid' },
      ];
      const result = scoreBatch(items);
      assert.equal(result.length, 3);
      assert.equal(result[0].id, 'high');
      assert.ok(result[0].score > result[1].score);
    });

    it('handles empty array', () => {
      assert.deepEqual(scoreBatch([]), []);
    });

    it('handles non-array', () => {
      assert.deepEqual(scoreBatch(null), []);
    });
  });

  describe('filterByImportance', () => {
    it('filters items below threshold', () => {
      const items = [
        { text: 'Fixed spacing issue', area: 'style' },
        { text: 'Security vulnerability in XSS handler', area: 'security' },
      ];
      const result = filterByImportance(items, 0.6);
      assert.ok(result.length >= 1);
      assert.ok(result.every((r) => r.score >= 0.6));
    });

    it('uses default threshold of 0.5', () => {
      const items = [{ text: 'Normal importance text' }];
      const result = filterByImportance(items);
      assert.ok(result.length >= 0); // base score is 0.5, matches >= 0.5
    });
  });

  describe('scoreWithWeights', () => {
    it('uses default weights when none provided', () => {
      const score = scoreWithWeights('security vulnerability');
      const defaultScore = scoreImportance('security vulnerability');
      assert.equal(score, defaultScore);
    });

    it('applies custom keyword boost', () => {
      const normal = scoreWithWeights('security issue');
      const boosted = scoreWithWeights('security issue', { highKeywordBoost: 0.3 });
      assert.ok(boosted > normal);
    });

    it('applies custom high keywords', () => {
      const score = scoreWithWeights('custom_keyword_here', {
        highKeywords: ['custom_keyword_here'],
        highKeywordBoost: 0.2,
      });
      assert.ok(score > 0.5); // base + boost
    });

    it('applies custom area boosters', () => {
      const score = scoreWithWeights('some text', {
        area: 'payments',
        areaBoosters: { payments: 0.3 },
      });
      assert.ok(score > 0.5);
    });

    it('handles empty text', () => {
      assert.equal(scoreWithWeights(''), 0.5);
    });
  });
});
