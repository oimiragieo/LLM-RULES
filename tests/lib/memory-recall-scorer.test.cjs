'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { scoreAndSort } = require('../../.claude/lib/utils/memory-recall-scorer.cjs');

describe('memory-recall-scorer', () => {
  const NOW = new Date('2026-01-08T00:00:00Z');

  it('returns results sorted by compositeScore descending', () => {
    const results = [
      {
        text: 'low',
        similarity: 0.2,
        timestamp: new Date('2026-01-07T00:00:00Z'),
        importance: 0.2,
      },
      {
        text: 'high',
        similarity: 0.9,
        timestamp: new Date('2026-01-08T00:00:00Z'),
        importance: 0.9,
      },
      {
        text: 'mid',
        similarity: 0.5,
        timestamp: new Date('2026-01-05T00:00:00Z'),
        importance: 0.5,
      },
    ];
    const scored = scoreAndSort({ results, now: NOW });
    assert.equal(scored[0].text, 'high');
    assert.ok(scored[0].compositeScore > scored[1].compositeScore);
    assert.ok(scored[1].compositeScore > scored[2].compositeScore);
  });

  it('attaches compositeScore to each result', () => {
    const results = [
      { text: 'a', similarity: 0.8, timestamp: new Date('2026-01-08T00:00:00Z'), importance: 0.5 },
    ];
    const scored = scoreAndSort({ results, now: NOW });
    assert.ok(typeof scored[0].compositeScore === 'number');
  });

  it('recency is 1.0 when timestamp equals now', () => {
    const results = [{ text: 'fresh', similarity: 0.0, timestamp: NOW, importance: 0.0 }];
    const scored = scoreAndSort({ results, now: NOW });
    // compositeScore = 0.5*0 + 0.3*1.0 + 0.2*0 = 0.3
    assert.ok(Math.abs(scored[0].compositeScore - 0.3) < 1e-9);
  });

  it('recency is 0.5 when timestamp is 3.5 days before now', () => {
    const threepointfiveDaysAgo = new Date(NOW.getTime() - 3.5 * 24 * 60 * 60 * 1000);
    const results = [
      { text: 'half', similarity: 0.0, timestamp: threepointfiveDaysAgo, importance: 0.0 },
    ];
    const scored = scoreAndSort({ results, now: NOW });
    // recency = max(0, 1 - 3.5/7) = 0.5
    // compositeScore = 0.3 * 0.5 = 0.15
    assert.ok(Math.abs(scored[0].compositeScore - 0.15) < 1e-9);
  });

  it('recency is 0.0 when timestamp is 7 or more days before now', () => {
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000);
    const results = [
      { text: 'old', similarity: 0.0, timestamp: sevenDaysAgo, importance: 0.0 },
      { text: 'older', similarity: 0.0, timestamp: eightDaysAgo, importance: 0.0 },
    ];
    const scored = scoreAndSort({ results, now: NOW });
    assert.ok(Math.abs(scored[0].compositeScore - 0.0) < 1e-9);
    assert.ok(Math.abs(scored[1].compositeScore - 0.0) < 1e-9);
  });

  it('applies all three weights correctly for a known input', () => {
    const results = [
      {
        text: 'known',
        similarity: 1.0,
        timestamp: new Date(NOW.getTime() - 3.5 * 24 * 60 * 60 * 1000),
        importance: 1.0,
      },
    ];
    const scored = scoreAndSort({ results, now: NOW });
    // 0.5*1 + 0.3*0.5 + 0.2*1 = 0.5 + 0.15 + 0.2 = 0.85
    assert.ok(Math.abs(scored[0].compositeScore - 0.85) < 1e-9);
  });

  it('returns empty array for empty input', () => {
    const scored = scoreAndSort({ results: [], now: NOW });
    assert.deepEqual(scored, []);
  });
});
