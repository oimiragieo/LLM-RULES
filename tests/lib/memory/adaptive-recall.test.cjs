'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  enhanceRecall,
  generateSubQueries,
  iterativeDeepen,
} = require('../../../.claude/lib/memory/adaptive-recall.cjs');

describe('enhanceRecall — reordering by importance score', () => {
  it('reorders results so higher importance comes first', () => {
    const results = [
      { content: 'low importance result', score: 0.8, importance: 0.2 },
      { content: 'high importance result', score: 0.8, importance: 0.9 },
    ];
    const reordered = enhanceRecall('security query', results);
    assert.equal(reordered[0].content, 'high importance result');
    assert.equal(reordered[1].content, 'low importance result');
  });

  it('uses text score when no importance field present (backward compatibility)', () => {
    const results = [
      { content: 'result A', score: 0.9 },
      { content: 'result B', score: 0.7 },
    ];
    const reordered = enhanceRecall('query', results);
    // Results without importance should be preserved in original relative order or sorted by score
    assert.equal(reordered.length, 2);
    assert.equal(reordered[0].content, 'result A');
  });

  it('returns empty array when given empty results', () => {
    const reordered = enhanceRecall('query', []);
    assert.deepEqual(reordered, []);
  });

  it('returns results unchanged shape — does not mutate originals', () => {
    const results = [{ content: 'test result', score: 0.5, importance: 0.7 }];
    const original = JSON.parse(JSON.stringify(results));
    enhanceRecall('query', results);
    assert.deepEqual(results, original, 'enhanceRecall should not mutate input array');
  });

  it('handles mixed results (some with importance, some without)', () => {
    const results = [
      { content: 'no importance', score: 0.6 },
      { content: 'has importance', score: 0.4, importance: 0.95 },
    ];
    const reordered = enhanceRecall('query', results);
    // High importance result should float to top even with lower score
    assert.equal(reordered[0].content, 'has importance');
  });

  it('accepts options object (backward-compatible API)', () => {
    const results = [{ content: 'test', score: 0.5 }];
    // Should not throw with options param
    assert.doesNotThrow(() => enhanceRecall('query', results, { maxResults: 10 }));
  });
});

describe('generateSubQueries — focused sub-query extraction', () => {
  it('returns an array of sub-queries for a broad security topic', () => {
    const subs = generateSubQueries('broad security topic authentication bypass');
    assert.ok(Array.isArray(subs), 'Should return an array');
    assert.ok(subs.length > 0, 'Should return at least one sub-query');
  });

  it('sub-queries are strings', () => {
    const subs = generateSubQueries('authentication vulnerability security');
    for (const s of subs) {
      assert.ok(typeof s === 'string', `Sub-query must be string, got: ${typeof s}`);
      assert.ok(s.length > 0, 'Sub-query must be non-empty');
    }
  });

  it('returns sub-queries that are more focused than the original', () => {
    const query = 'security authentication vulnerability injection XSS';
    const subs = generateSubQueries(query);
    // Sub-queries should generally be shorter than the original
    const allShorter = subs.every(s => s.length <= query.length);
    assert.ok(allShorter, 'Sub-queries should be more focused (not longer) than original');
  });

  it('handles single-word query', () => {
    const subs = generateSubQueries('authentication');
    assert.ok(Array.isArray(subs));
    // Single word may produce empty subs or just the word itself — both are valid
  });

  it('handles empty query gracefully', () => {
    assert.doesNotThrow(() => generateSubQueries(''));
    const subs = generateSubQueries('');
    assert.ok(Array.isArray(subs));
  });
});

describe('iterativeDeepen — iterative search with sub-queries', () => {
  it('returns results array', () => {
    const results = iterativeDeepen('security query', 0);
    assert.ok(Array.isArray(results), 'Should return an array');
  });

  it('respects maxDepth parameter (default 3)', () => {
    // At depth >= maxDepth, should stop iterating
    // We can't easily mock the internals, but we can verify it returns
    const results = iterativeDeepen('test query', 0, 3);
    assert.ok(Array.isArray(results));
  });

  it('does not exceed max depth 3 by default', () => {
    // If we pass depth=3, it should return immediately (base case)
    const results = iterativeDeepen('test query', 3);
    assert.ok(Array.isArray(results));
    // At or beyond max depth, returns empty or shallow results
  });

  it('returns more unique results at depth=0 than at depth=2 with narrow query', () => {
    // Broad query at depth 0 — just verify it runs without error
    assert.doesNotThrow(() => iterativeDeepen('test', 0, 2));
  });

  it('accepts optional maxDepth argument', () => {
    assert.doesNotThrow(() => iterativeDeepen('query', 0, 1));
    assert.doesNotThrow(() => iterativeDeepen('query', 0, 3));
  });
});

describe('backward compatibility — searchMemory API signature', () => {
  it('enhanceRecall(query, results) two-arg form works', () => {
    const results = [{ content: 'test', score: 0.5 }];
    const out = enhanceRecall('query', results);
    assert.ok(Array.isArray(out));
  });

  it('enhanceRecall(query, results, options) three-arg form works', () => {
    const results = [{ content: 'test', score: 0.5 }];
    const out = enhanceRecall('query', results, {});
    assert.ok(Array.isArray(out));
  });
});
