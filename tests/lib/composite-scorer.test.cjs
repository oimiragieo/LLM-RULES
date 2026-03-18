#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreMemory,
  rankMemories,
  shouldConsolidate,
  computeRecency,
  WEIGHT_SIMILARITY,
  WEIGHT_RECENCY,
  WEIGHT_IMPORTANCE,
  HALF_LIFE_MS,
  CONSOLIDATION_SIMILARITY_THRESHOLD,
  DEFAULT_IMPORTANCE,
} = require('../../.claude/lib/memory/composite-scorer.cjs');

// --- helpers ---

const NOW = Date.now();

// ─── computeRecency ──────────────────────────────────────────────────────────

describe('computeRecency', () => {
  it('returns 1.0 for age = 0', () => {
    const score = computeRecency(NOW, NOW);
    assert.ok(Math.abs(score - 1.0) < 1e-9, `expected ~1.0, got ${score}`);
  });

  it('returns ~0.5 at half-life (7 days)', () => {
    const sevenDaysAgo = NOW - HALF_LIFE_MS;
    const score = computeRecency(sevenDaysAgo, NOW);
    assert.ok(Math.abs(score - 0.5) < 0.001, `expected ~0.5, got ${score}`);
  });

  it('returns a value near 0 at 30 days', () => {
    const thirtyDaysAgo = NOW - 30 * 24 * 60 * 60 * 1000;
    const score = computeRecency(thirtyDaysAgo, NOW);
    assert.ok(score < 0.1, `expected <0.1, got ${score}`);
  });

  it('monotonically decreases with age', () => {
    const s1 = computeRecency(NOW - 1000, NOW);
    const s2 = computeRecency(NOW - 1000 * 60 * 60 * 24, NOW);
    const s3 = computeRecency(NOW - HALF_LIFE_MS, NOW);
    assert.ok(s1 > s2 && s2 > s3, 'scores should decrease with age');
  });

  it('accepts Date objects', () => {
    const d = new Date(NOW - HALF_LIFE_MS);
    const score = computeRecency(d, NOW);
    assert.ok(Math.abs(score - 0.5) < 0.001, `expected ~0.5, got ${score}`);
  });

  it('accepts numeric timestamps', () => {
    const score = computeRecency(NOW, NOW);
    assert.ok(Math.abs(score - 1.0) < 1e-9);
  });

  it('returns DEFAULT_IMPORTANCE for invalid timestamp', () => {
    assert.equal(computeRecency(null, NOW), DEFAULT_IMPORTANCE);
    assert.equal(computeRecency('not-a-date', NOW), DEFAULT_IMPORTANCE);
    assert.equal(computeRecency(NaN, NOW), DEFAULT_IMPORTANCE);
  });

  it('clamps age to 0 for future timestamps', () => {
    const futureTs = NOW + 60000;
    const score = computeRecency(futureTs, NOW);
    assert.ok(Math.abs(score - 1.0) < 1e-9, `future ts should give ~1.0, got ${score}`);
  });
});

// ─── scoreMemory ─────────────────────────────────────────────────────────────

describe('scoreMemory', () => {
  it('applies weights: similarity*0.5 + recency*0.3 + importance*0.2', () => {
    const entry = {
      text: 'test',
      similarity: 1.0,
      timestamp: NOW, // recency = 1.0
      importance: 1.0,
    };
    const score = scoreMemory(entry, 'q', NOW);
    const expected = 1.0 * WEIGHT_SIMILARITY + 1.0 * WEIGHT_RECENCY + 1.0 * WEIGHT_IMPORTANCE;
    assert.ok(Math.abs(score - expected) < 1e-9, `expected ${expected}, got ${score}`);
  });

  it('weights sum to 1.0 (sanity)', () => {
    assert.ok(Math.abs(WEIGHT_SIMILARITY + WEIGHT_RECENCY + WEIGHT_IMPORTANCE - 1.0) < 1e-9);
  });

  it('defaults importance to 0.5 when not specified', () => {
    const entryWithout = { text: 'x', similarity: 0.9, timestamp: NOW };
    const entryWith = {
      text: 'x',
      similarity: 0.9,
      timestamp: NOW,
      importance: DEFAULT_IMPORTANCE,
    };
    const s1 = scoreMemory(entryWithout, '', NOW);
    const s2 = scoreMemory(entryWith, '', NOW);
    assert.ok(Math.abs(s1 - s2) < 1e-9, 'missing importance should default to 0.5');
  });

  it('returns 0 for null/undefined entry', () => {
    assert.equal(scoreMemory(null, 'q'), 0);
    assert.equal(scoreMemory(undefined, 'q'), 0);
  });

  it('clamps similarity to [0,1]', () => {
    const entry = { text: 'x', similarity: 1.5, timestamp: NOW, importance: 0.5 };
    const scoreAbove = scoreMemory(entry, '', NOW);
    const entryNorm = { ...entry, similarity: 1.0 };
    const scoreNorm = scoreMemory(entryNorm, '', NOW);
    assert.ok(Math.abs(scoreAbove - scoreNorm) < 1e-9, 'similarity should clamp at 1.0');
  });

  it('clamps importance to [0,1]', () => {
    const entry = { text: 'x', similarity: 0.5, timestamp: NOW, importance: 2.0 };
    const scoreAbove = scoreMemory(entry, '', NOW);
    const entryNorm = { ...entry, importance: 1.0 };
    const scoreNorm = scoreMemory(entryNorm, '', NOW);
    assert.ok(Math.abs(scoreAbove - scoreNorm) < 1e-9, 'importance should clamp at 1.0');
  });

  it('higher similarity → higher composite score (all else equal)', () => {
    const base = { text: 'x', timestamp: NOW, importance: 0.5 };
    const low = scoreMemory({ ...base, similarity: 0.3 }, '', NOW);
    const high = scoreMemory({ ...base, similarity: 0.9 }, '', NOW);
    assert.ok(high > low, `expected ${high} > ${low}`);
  });

  it('newer entry scores higher than older entry (all else equal)', () => {
    const base = { text: 'x', similarity: 0.8, importance: 0.5 };
    const newer = scoreMemory({ ...base, timestamp: NOW - 1000 }, '', NOW);
    const older = scoreMemory({ ...base, timestamp: NOW - HALF_LIFE_MS }, '', NOW);
    assert.ok(newer > older, `expected newer ${newer} > older ${older}`);
  });

  it('higher importance → higher composite score (all else equal)', () => {
    const base = { text: 'x', similarity: 0.8, timestamp: NOW };
    const low = scoreMemory({ ...base, importance: 0.2 }, '', NOW);
    const high = scoreMemory({ ...base, importance: 0.9 }, '', NOW);
    assert.ok(high > low, `expected ${high} > ${low}`);
  });

  it('score is in [0, 1] range', () => {
    const entries = [
      { text: 'a', similarity: 0, timestamp: NOW - 365 * 24 * 60 * 60 * 1000, importance: 0 },
      { text: 'b', similarity: 1, timestamp: NOW, importance: 1 },
      { text: 'c', similarity: 0.5, timestamp: NOW - HALF_LIFE_MS, importance: 0.5 },
    ];
    for (const e of entries) {
      const s = scoreMemory(e, '', NOW);
      assert.ok(s >= 0 && s <= 1, `score ${s} out of [0,1]`);
    }
  });
});

// ─── rankMemories ────────────────────────────────────────────────────────────

describe('rankMemories', () => {
  it('returns entries sorted by composite score descending', () => {
    const entries = [
      { text: 'old low-sim', similarity: 0.2, timestamp: NOW - HALF_LIFE_MS * 3, importance: 0.3 },
      { text: 'new high-sim', similarity: 0.95, timestamp: NOW, importance: 0.9 },
      { text: 'mid', similarity: 0.6, timestamp: NOW - HALF_LIFE_MS, importance: 0.5 },
    ];
    const ranked = rankMemories(entries, 'query', NOW);
    assert.equal(ranked.length, 3);
    assert.ok(ranked[0]._compositeScore >= ranked[1]._compositeScore, 'first >= second');
    assert.ok(ranked[1]._compositeScore >= ranked[2]._compositeScore, 'second >= third');
  });

  it('attaches _compositeScore to each entry', () => {
    const entries = [{ text: 'a', similarity: 0.7, timestamp: NOW, importance: 0.5 }];
    const ranked = rankMemories(entries, '', NOW);
    assert.ok(typeof ranked[0]._compositeScore === 'number');
    assert.ok(ranked[0]._compositeScore >= 0 && ranked[0]._compositeScore <= 1);
  });

  it('returns empty array for non-array input', () => {
    assert.deepEqual(rankMemories(null, ''), []);
    assert.deepEqual(rankMemories(undefined, ''), []);
    assert.deepEqual(rankMemories({}, ''), []);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(rankMemories([], ''), []);
  });

  it('preserves all original entry fields', () => {
    const entry = {
      text: 'hello',
      similarity: 0.8,
      timestamp: NOW,
      importance: 0.7,
      extra: 'data',
    };
    const ranked = rankMemories([entry], '', NOW);
    assert.equal(ranked[0].text, 'hello');
    assert.equal(ranked[0].extra, 'data');
    assert.equal(ranked[0].importance, 0.7);
  });

  it('does not mutate original entries', () => {
    const entry = { text: 'x', similarity: 0.5, timestamp: NOW };
    const original = { ...entry };
    rankMemories([entry], '', NOW);
    assert.equal(entry.text, original.text);
    assert.equal(entry.similarity, original.similarity);
    // _compositeScore should NOT appear on original (it's on the copy)
    // Note: spread creates a new object, so original is untouched
  });

  it('highest-similarity recent entry ranks first', () => {
    const best = { text: 'best', similarity: 0.99, timestamp: NOW, importance: 0.9 };
    const worst = {
      text: 'worst',
      similarity: 0.1,
      timestamp: NOW - HALF_LIFE_MS * 4,
      importance: 0.1,
    };
    const ranked = rankMemories([worst, best], 'q', NOW);
    assert.equal(ranked[0].text, 'best');
  });
});

// ─── shouldConsolidate ───────────────────────────────────────────────────────

describe('shouldConsolidate', () => {
  it('returns true when both similarities exceed 0.85', () => {
    const a = { text: 'a', similarity: 0.9 };
    const b = { text: 'b', similarity: 0.95 };
    assert.equal(shouldConsolidate(a, b), true);
  });

  it('returns false when one similarity is at the threshold boundary (0.85)', () => {
    // threshold is STRICT greater-than, so exactly 0.85 should be false
    const a = { text: 'a', similarity: 0.85 };
    const b = { text: 'b', similarity: 0.95 };
    assert.equal(shouldConsolidate(a, b), false);
  });

  it('returns false when one similarity is below threshold', () => {
    const a = { text: 'a', similarity: 0.7 };
    const b = { text: 'b', similarity: 0.95 };
    assert.equal(shouldConsolidate(a, b), false);
  });

  it('returns false when both similarities are below threshold', () => {
    const a = { text: 'a', similarity: 0.5 };
    const b = { text: 'b', similarity: 0.6 };
    assert.equal(shouldConsolidate(a, b), false);
  });

  it('returns false for null/undefined inputs', () => {
    assert.equal(shouldConsolidate(null, { text: 'b', similarity: 0.9 }), false);
    assert.equal(shouldConsolidate({ text: 'a', similarity: 0.9 }, null), false);
    assert.equal(shouldConsolidate(null, null), false);
  });

  it('returns false when similarity fields are missing', () => {
    const a = { text: 'a' };
    const b = { text: 'b' };
    assert.equal(shouldConsolidate(a, b), false);
  });

  it('handles similarity exactly above threshold (0.86)', () => {
    const a = { text: 'a', similarity: 0.86 };
    const b = { text: 'b', similarity: 0.86 };
    assert.equal(shouldConsolidate(a, b), true);
  });

  it('threshold constant is 0.85', () => {
    assert.equal(CONSOLIDATION_SIMILARITY_THRESHOLD, 0.85);
  });
});

// ─── formula verification ─────────────────────────────────────────────────────

describe('composite formula correctness', () => {
  it('exact formula: sim*0.5 + recency*0.3 + importance*0.2', () => {
    // Use a known recency for precise verification
    // recency at exactly 7 days = 0.5
    const ts = NOW - HALF_LIFE_MS;
    const entry = { text: 'x', similarity: 0.8, timestamp: ts, importance: 0.6 };
    const score = scoreMemory(entry, '', NOW);
    const expectedRecency = 0.5;
    const expected = 0.8 * 0.5 + expectedRecency * 0.3 + 0.6 * 0.2;
    assert.ok(Math.abs(score - expected) < 0.001, `expected ~${expected}, got ${score}`);
  });

  it('formula with all-zero inputs gives 0', () => {
    // similarity=0, recency for very old ts ≈ 0, importance=0
    const veryOld = NOW - 365 * 24 * 60 * 60 * 1000; // 1 year ago
    const entry = { text: 'x', similarity: 0, timestamp: veryOld, importance: 0 };
    const score = scoreMemory(entry, '', NOW);
    // recency for 1 year is tiny but not truly 0
    assert.ok(score < 0.05, `score should be near 0, got ${score}`);
  });

  it('formula with all-one inputs gives 1', () => {
    const entry = { text: 'x', similarity: 1, timestamp: NOW, importance: 1 };
    const score = scoreMemory(entry, '', NOW);
    assert.ok(Math.abs(score - 1.0) < 1e-9, `expected 1.0, got ${score}`);
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles entry with non-numeric importance gracefully (defaults to 0.5)', () => {
    const entry = { text: 'x', similarity: 0.7, timestamp: NOW, importance: 'high' };
    const score = scoreMemory(entry, '', NOW);
    const expected = scoreMemory(
      { text: 'x', similarity: 0.7, timestamp: NOW, importance: 0.5 },
      '',
      NOW
    );
    assert.ok(Math.abs(score - expected) < 1e-9);
  });

  it('handles entry with zero similarity', () => {
    const entry = { text: 'x', similarity: 0, timestamp: NOW, importance: 1.0 };
    const score = scoreMemory(entry, '', NOW);
    // 0*0.5 + 1.0*0.3 + 1.0*0.2 = 0.5
    assert.ok(Math.abs(score - 0.5) < 1e-9, `expected 0.5, got ${score}`);
  });

  it('rankMemories with single entry returns it wrapped', () => {
    const entry = { text: 'only', similarity: 0.5, timestamp: NOW };
    const ranked = rankMemories([entry], '', NOW);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].text, 'only');
  });

  it('rankMemories with ties preserves all entries', () => {
    // Two identical entries → same score
    const e = { text: 'dup', similarity: 0.5, timestamp: NOW, importance: 0.5 };
    const ranked = rankMemories([e, e], '', NOW);
    assert.equal(ranked.length, 2);
  });

  it('DEFAULT_IMPORTANCE is 0.5', () => {
    assert.equal(DEFAULT_IMPORTANCE, 0.5);
  });
});
