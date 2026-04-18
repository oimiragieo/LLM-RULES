#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { recommendSkillsFallback, _resetCache } = require('../../../.claude/lib/spawn/skill-recommender-fallback.cjs');

describe('skill-recommender-fallback: recommendSkillsFallback', () => {
  beforeEach(() => _resetCache());

  it('returns [] for empty query', () => {
    const result = recommendSkillsFallback('');
    assert.deepEqual(result, []);
  });

  it('returns [] when no skills exceed minScore', () => {
    // Use a very high minScore so nothing passes
    const result = recommendSkillsFallback('debug testing coverage', { minScore: 999 });
    assert.deepEqual(result, []);
  });

  it('returns ranked array when matches exist', () => {
    // Hits the live skill-index, so tdd/debugging should score for this query
    const results = recommendSkillsFallback('tdd unit testing', { limit: 5, minScore: 0.1 });
    assert.ok(Array.isArray(results), 'should return array');
    assert.ok(results.length > 0, 'should have at least one result');
    // Scores should be descending
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, 'should be sorted descending');
    }
    // Each result should have name, score, description
    for (const r of results) {
      assert.ok(typeof r.name === 'string');
      assert.ok(typeof r.score === 'number');
      assert.ok(typeof r.description === 'string');
    }
  });

  it('cache hit on identical mtime returns same result', () => {
    // Call twice — second call should hit cache (no file re-read)
    const r1 = recommendSkillsFallback('tdd', { limit: 3, minScore: 0.1 });
    const r2 = recommendSkillsFallback('tdd', { limit: 3, minScore: 0.1 });
    // Results should be structurally identical
    assert.deepEqual(r1, r2);
  });
});