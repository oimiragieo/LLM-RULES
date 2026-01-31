/**
 * Tests for ResultRanker - Hybrid search result combination and ranking
 *
 * TDD Workflow:
 * 1. RED: Write failing tests
 * 2. GREEN: Implement minimal code
 * 3. REFACTOR: Clean up
 */

'use strict';

const { test, suite } = require('node:test');
const assert = require('node:assert');
const { ResultRanker } = require('../../.claude/lib/code-indexing/result-ranker.cjs');

suite('ResultRanker', () => {
  // 1. Score Combination
  test('combines semantic and structural scores with default weights', () => {
    const ranker = new ResultRanker();
    const score = ranker.calculateScore(0.8, 1.0);

    // (0.8 * 0.7) + (1.0 * 0.3) = 0.56 + 0.3 = 0.86
    assert.ok(Math.abs(score - 0.86) < 0.001, `Expected ~0.86, got ${score}`);
  });

  test('combines scores with custom weights', () => {
    const ranker = new ResultRanker({ semantic: 0.5, structural: 0.5 });
    const score = ranker.calculateScore(0.6, 0.8);

    // (0.6 * 0.5) + (0.8 * 0.5) = 0.3 + 0.4 = 0.7
    assert.strictEqual(score, 0.7);
  });

  test('handles semantic-only results', () => {
    const ranker = new ResultRanker();
    const score = ranker.calculateScore(0.9, 0.0);

    // (0.9 * 0.7) + (0.0 * 0.3) = 0.63
    assert.ok(Math.abs(score - 0.63) < 0.001, `Expected ~0.63, got ${score}`);
  });

  // 2. Deduplication
  test('deduplicates results with same file and line range', () => {
    const ranker = new ResultRanker();

    const results = [
      { filePath: 'test.js', lineStart: 10, lineEnd: 20, score: 0.8 },
      { filePath: 'test.js', lineStart: 10, lineEnd: 20, score: 0.9 },
      { filePath: 'test.js', lineStart: 30, lineEnd: 40, score: 0.7 },
    ];

    const deduped = ranker.deduplicate(results);

    assert.strictEqual(deduped.length, 2);
    // Should keep highest score
    assert.strictEqual(deduped[0].score, 0.9);
  });

  test('does not deduplicate results from different files', () => {
    const ranker = new ResultRanker();

    const results = [
      { filePath: 'test1.js', lineStart: 10, lineEnd: 20, score: 0.8 },
      { filePath: 'test2.js', lineStart: 10, lineEnd: 20, score: 0.9 },
    ];

    const deduped = ranker.deduplicate(results);

    assert.strictEqual(deduped.length, 2);
  });

  // 3. Combine Function
  test('combines semantic and structural results', () => {
    const ranker = new ResultRanker();

    const semanticResults = [
      {
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 20,
        content: 'function authenticate() {}',
        semanticScore: 0.8,
      },
    ];

    const structuralResults = [
      {
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 20,
        code: 'function authenticate() {}',
      },
    ];

    const combined = ranker.combine(semanticResults, structuralResults);

    assert.strictEqual(combined.length, 1);
    assert.strictEqual(combined[0].semanticScore, 0.8);
    assert.strictEqual(combined[0].structuralScore, 1.0);
    assert.ok(
      Math.abs(combined[0].score - 0.86) < 0.001,
      `Expected ~0.86, got ${combined[0].score}`
    ); // (0.8*0.7 + 1.0*0.3)
    assert.deepStrictEqual(combined[0].sources, ['semantic', 'structural']);
  });

  test('handles semantic-only results in combine', () => {
    const ranker = new ResultRanker();

    const semanticResults = [
      {
        filePath: 'src/util.ts',
        lineStart: 5,
        lineEnd: 15,
        content: 'function helper() {}',
        semanticScore: 0.7,
      },
    ];

    const combined = ranker.combine(semanticResults, []);

    assert.strictEqual(combined.length, 1);
    assert.strictEqual(combined[0].semanticScore, 0.7);
    assert.strictEqual(combined[0].structuralScore, 0.0);
    assert.ok(
      Math.abs(combined[0].score - 0.49) < 0.001,
      `Expected ~0.49, got ${combined[0].score}`
    ); // (0.7*0.7 + 0.0*0.3)
    assert.deepStrictEqual(combined[0].sources, ['semantic']);
  });

  // 4. Sorting
  test('sorts results by combined score descending', () => {
    const ranker = new ResultRanker();

    const results = [
      { filePath: 'a.js', lineStart: 1, lineEnd: 10, score: 0.5 },
      { filePath: 'b.js', lineStart: 1, lineEnd: 10, score: 0.9 },
      { filePath: 'c.js', lineStart: 1, lineEnd: 10, score: 0.7 },
    ];

    const sorted = ranker.sort(results);

    assert.strictEqual(sorted[0].score, 0.9);
    assert.strictEqual(sorted[1].score, 0.7);
    assert.strictEqual(sorted[2].score, 0.5);
  });

  // 5. Top-K Selection
  test('returns top-K results', () => {
    const ranker = new ResultRanker();

    const results = [
      { filePath: 'a.js', lineStart: 1, lineEnd: 10, score: 0.9 },
      { filePath: 'b.js', lineStart: 1, lineEnd: 10, score: 0.8 },
      { filePath: 'c.js', lineStart: 1, lineEnd: 10, score: 0.7 },
      { filePath: 'd.js', lineStart: 1, lineEnd: 10, score: 0.6 },
    ];

    const topK = ranker.topK(results, 2);

    assert.strictEqual(topK.length, 2);
    assert.strictEqual(topK[0].score, 0.9);
    assert.strictEqual(topK[1].score, 0.8);
  });

  // 6. Keyword Boost
  test('applies keyword boost to results', () => {
    const ranker = new ResultRanker();

    const results = [
      {
        filePath: 'auth.js',
        lineStart: 1,
        lineEnd: 10,
        content: 'function authenticate(user, pass) {}',
        score: 0.7,
      },
    ];

    const boosted = ranker.applyKeywordBoost(results, ['authenticate', 'user']);

    // Should boost by +0.1 for keyword match
    assert.ok(Math.abs(boosted[0].score - 0.8) < 0.001, `Expected ~0.8, got ${boosted[0].score}`);
  });

  // 7. Recency Boost
  test('applies recency boost to newer files', () => {
    const ranker = new ResultRanker();

    const results = [
      {
        filePath: 'old.js',
        lineStart: 1,
        lineEnd: 10,
        score: 0.7,
        metadata: { mtime: new Date('2020-01-01').getTime() },
      },
      {
        filePath: 'new.js',
        lineStart: 1,
        lineEnd: 10,
        score: 0.7,
        metadata: { mtime: new Date().getTime() },
      },
    ];

    const boosted = ranker.applyRecencyBoost(results);

    // Newer file should have higher score
    assert.ok(boosted[1].score > boosted[0].score);
  });

  // 8. Edge Cases
  test('handles empty results', () => {
    const ranker = new ResultRanker();

    const combined = ranker.combine([], []);
    assert.strictEqual(combined.length, 0);

    const deduped = ranker.deduplicate([]);
    assert.strictEqual(deduped.length, 0);

    const sorted = ranker.sort([]);
    assert.strictEqual(sorted.length, 0);
  });

  test('handles single result', () => {
    const ranker = new ResultRanker();

    const results = [{ filePath: 'test.js', lineStart: 1, lineEnd: 10, score: 0.8 }];

    const deduped = ranker.deduplicate(results);
    assert.strictEqual(deduped.length, 1);

    const sorted = ranker.sort(results);
    assert.strictEqual(sorted.length, 1);
  });

  test('handles score ties', () => {
    const ranker = new ResultRanker();

    const results = [
      { filePath: 'a.js', lineStart: 1, lineEnd: 10, score: 0.8 },
      { filePath: 'b.js', lineStart: 1, lineEnd: 10, score: 0.8 },
      { filePath: 'c.js', lineStart: 1, lineEnd: 10, score: 0.8 },
    ];

    const sorted = ranker.sort(results);

    // All should have same score
    assert.strictEqual(sorted[0].score, 0.8);
    assert.strictEqual(sorted[1].score, 0.8);
    assert.strictEqual(sorted[2].score, 0.8);
  });

  // 9. Confidence Threshold
  test('filters results below confidence threshold', () => {
    const ranker = new ResultRanker({ confidenceThreshold: 0.5 });

    const results = [
      { filePath: 'a.js', lineStart: 1, lineEnd: 10, score: 0.7 },
      { filePath: 'b.js', lineStart: 1, lineEnd: 10, score: 0.4 },
      { filePath: 'c.js', lineStart: 1, lineEnd: 10, score: 0.6 },
    ];

    const filtered = ranker.filterByConfidence(results);

    assert.strictEqual(filtered.length, 2);
    assert.ok(filtered.every(r => r.score >= 0.5));
  });

  // 10. Performance (Large Result Sets)
  test('handles 1000+ results efficiently', () => {
    const ranker = new ResultRanker();

    const results = [];
    for (let i = 0; i < 1000; i++) {
      results.push({
        filePath: `file${i}.js`,
        lineStart: 1,
        lineEnd: 10,
        score: Math.random(),
      });
    }

    const start = Date.now();
    const sorted = ranker.sort(results);
    const duration = Date.now() - start;

    assert.strictEqual(sorted.length, 1000);
    assert.ok(duration < 50, `Sorting should take <50ms, took ${duration}ms`);

    // Verify sorted correctly
    for (let i = 0; i < sorted.length - 1; i++) {
      assert.ok(sorted[i].score >= sorted[i + 1].score);
    }
  });

  // 11. Metadata Preservation
  test('preserves metadata from semantic and structural results', () => {
    const ranker = new ResultRanker();

    const semanticResults = [
      {
        filePath: 'test.js',
        lineStart: 10,
        lineEnd: 20,
        content: 'function test() {}',
        semanticScore: 0.8,
        metadata: { type: 'function', language: 'javascript' },
      },
    ];

    const structuralResults = [
      {
        filePath: 'test.js',
        lineStart: 10,
        lineEnd: 20,
        code: 'function test() {}',
        matches: { NAME: 'test' },
      },
    ];

    const combined = ranker.combine(semanticResults, structuralResults);

    assert.strictEqual(combined[0].metadata.type, 'function');
    assert.strictEqual(combined[0].metadata.language, 'javascript');
    assert.strictEqual(combined[0].matches.NAME, 'test');
  });
});
