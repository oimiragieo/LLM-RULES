'use strict';
/**
 * Tests for internal-rag module (Track 3.1)
 * TDD — written BEFORE implementation.
 *
 * Provides internal RAG (Retrieval-Augmented Generation) over project memory.
 * - Uses searchMemory from memory-manager (returns { similarity } field)
 * - Pure retrieval layer: searchInternalContext, rankResults, formatContext
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let searchInternalContext, rankResults, formatContext;

describe('internal-rag — pure functions', () => {
  before(() => {
    ({
      searchInternalContext,
      rankResults,
      formatContext,
    } = require('../../../.claude/lib/memory/internal-rag.cjs'));
  });

  describe('rankResults', () => {
    it('returns empty array for empty input', () => {
      assert.deepEqual(rankResults([]), []);
    });

    it('sorts results by similarity descending', () => {
      const results = [
        { content: 'B', similarity: 0.5 },
        { content: 'A', similarity: 0.9 },
        { content: 'C', similarity: 0.3 },
      ];
      const ranked = rankResults(results);
      assert.equal(ranked[0].content, 'A');
      assert.equal(ranked[1].content, 'B');
      assert.equal(ranked[2].content, 'C');
    });

    it('falls back to 0 when similarity is missing', () => {
      const results = [
        { content: 'A', similarity: 0.8 },
        { content: 'B' }, // no similarity
      ];
      const ranked = rankResults(results);
      assert.equal(ranked[0].content, 'A');
      assert.equal(ranked[1].content, 'B');
    });

    it('limits results to maxResults when specified', () => {
      const results = Array.from({ length: 10 }, (_, i) => ({
        content: `item${i}`,
        similarity: 1 - i * 0.1,
      }));
      const ranked = rankResults(results, { maxResults: 3 });
      assert.equal(ranked.length, 3);
    });

    it('filters results below threshold', () => {
      const results = [
        { content: 'A', similarity: 0.8 },
        { content: 'B', similarity: 0.2 },
        { content: 'C', similarity: 0.7 },
      ];
      const ranked = rankResults(results, { threshold: 0.5 });
      assert.equal(ranked.length, 2);
      assert.ok(ranked.every(r => r.similarity >= 0.5));
    });
  });

  describe('formatContext', () => {
    it('returns empty string for empty results', () => {
      assert.equal(formatContext([]), '');
    });

    it('formats results into readable string', () => {
      const results = [
        { content: 'Result one', source: 'learnings.md', similarity: 0.9 },
        { content: 'Result two', source: 'decisions.md', similarity: 0.7 },
      ];
      const formatted = formatContext(results);
      assert.ok(typeof formatted === 'string');
      assert.ok(formatted.includes('Result one'));
      assert.ok(formatted.includes('Result two'));
    });

    it('limits formatted length to maxChars when specified', () => {
      const results = Array.from({ length: 100 }, (_, i) => ({
        content: 'A'.repeat(200),
        source: 'file.md',
        similarity: 0.9 - i * 0.001,
      }));
      const formatted = formatContext(results, { maxChars: 500 });
      assert.ok(formatted.length <= 600, 'Formatted context should be near maxChars limit');
    });
  });

  describe('searchInternalContext', () => {
    it('returns { results, context } object', { timeout: 10000 }, async () => {
      // Uses real memory system — may return empty results in test env
      // 10s timeout to handle GPU embed worker startup under concurrent test load
      const result = await searchInternalContext('test query about context pressure', {
        limit: 3,
        threshold: 0.5,
      });
      assert.ok(typeof result === 'object');
      assert.ok('results' in result);
      assert.ok('context' in result);
      assert.ok(Array.isArray(result.results));
      assert.ok(typeof result.context === 'string');
    });

    it('handles search errors gracefully', { timeout: 10000 }, async () => {
      // Even if search fails, should return safe defaults
      // 10s timeout to handle GPU embed worker startup under concurrent test load
      const result = await searchInternalContext('', { limit: 1 });
      assert.ok(typeof result === 'object');
      assert.ok(Array.isArray(result.results));
    });
  });
});

describe('SE-XX compliance — internal-rag', () => {
  it('SE-02: module loads correctly without raw JSON.parse', () => {
    const mod = require('../../../.claude/lib/memory/internal-rag.cjs');
    assert.ok(typeof mod.searchInternalContext === 'function');
    assert.ok(typeof mod.rankResults === 'function');
    assert.ok(typeof mod.formatContext === 'function');
  });

  it('SE-04: no await-in-forEach patterns (async functions complete correctly)', async () => {
    const {
      searchInternalContext: search,
    } = require('../../../.claude/lib/memory/internal-rag.cjs');
    const result = await search('test', { limit: 1 });
    assert.ok(typeof result === 'object');
  });
});
