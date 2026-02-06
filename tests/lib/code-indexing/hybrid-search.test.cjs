/**
 * Hybrid Search Tests (BM25 + Dense Embeddings + RRF Fusion)
 *
 * Tests for Reciprocal Rank Fusion (RRF) algorithm.
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

/**
 * RRF (Reciprocal Rank Fusion) implementation
 * Formula: score = Σ(1 / (k + rank))
 * k = 60 (standard constant)
 */
function fuseResults(sparseResults, denseResults, options = {}) {
  const k = options.rrf_k || 60;
  const sparseWeight = options.sparse_weight || 0.4;
  const denseWeight = options.dense_weight || 0.6;

  // Build score map
  const scoreMap = new Map();

  // Add sparse scores
  sparseResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);
    scoreMap.set(result.id, {
      id: result.id,
      sparseScore: rrfScore * sparseWeight,
      denseScore: 0,
    });
  });

  // Add dense scores
  denseResults.forEach((result, index) => {
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);
    if (scoreMap.has(result.id)) {
      scoreMap.get(result.id).denseScore = rrfScore * denseWeight;
    } else {
      scoreMap.set(result.id, {
        id: result.id,
        sparseScore: 0,
        denseScore: rrfScore * denseWeight,
      });
    }
  });

  // Calculate combined scores and sort
  const results = Array.from(scoreMap.values()).map(item => ({
    id: item.id,
    score: item.sparseScore + item.denseScore,
    sparseScore: item.sparseScore,
    denseScore: item.denseScore,
  }));

  results.sort((a, b) => b.score - a.score);
  return results;
}

// Tests
test('RRF Fusion - should fuse results from both sparse and dense', () => {
  const sparseResults = [
    { id: 'doc1', score: 0.9 },
    { id: 'doc2', score: 0.7 },
    { id: 'doc3', score: 0.5 },
  ];

  const denseResults = [
    { id: 'doc2', score: 0.95 },
    { id: 'doc1', score: 0.85 },
    { id: 'doc4', score: 0.6 },
  ];

  const fused = fuseResults(sparseResults, denseResults);

  assert.ok(fused.length >= 4);
  assert.ok(fused[0].id);
  assert.ok(typeof fused[0].score === 'number');
  assert.ok(typeof fused[0].sparseScore === 'number');
  assert.ok(typeof fused[0].denseScore === 'number');

  // Results should be sorted by combined score
  for (let i = 1; i < fused.length; i++) {
    assert.ok(fused[i-1].score >= fused[i].score);
  }
});

test('RRF Fusion - should prioritize documents that rank high in both lists', () => {
  const sparseResults = [
    { id: 'doc1', score: 1.0 },  // Rank 1
    { id: 'doc2', score: 0.8 },  // Rank 2
    { id: 'doc3', score: 0.6 },  // Rank 3
  ];

  const denseResults = [
    { id: 'doc2', score: 1.0 },  // Rank 1
    { id: 'doc1', score: 0.9 },  // Rank 2
    { id: 'doc4', score: 0.7 },  // Rank 3
  ];

  const fused = fuseResults(sparseResults, denseResults);

  // doc1 and doc2 both rank high in both lists
  // They should appear at top of fused results
  assert.ok(['doc1', 'doc2'].includes(fused[0].id));
  assert.ok(['doc1', 'doc2'].includes(fused[1].id));
});

test('RRF Fusion - should handle non-overlapping result sets', () => {
  const sparseResults = [
    { id: 'doc1', score: 1.0 },
    { id: 'doc2', score: 0.8 },
  ];

  const denseResults = [
    { id: 'doc3', score: 1.0 },
    { id: 'doc4', score: 0.9 },
  ];

  const fused = fuseResults(sparseResults, denseResults);

  assert.equal(fused.length, 4);
  const ids = fused.map(r => r.id).sort();
  assert.deepEqual(ids, ['doc1', 'doc2', 'doc3', 'doc4']);
});

test('RRF Fusion - should apply weight parameters correctly', () => {
  const sparseResults = [
    { id: 'doc1', score: 1.0 },
  ];

  const denseResults = [
    { id: 'doc2', score: 1.0 },
  ];

  // Test with 100% sparse weight
  const sparseOnly = fuseResults(sparseResults, denseResults, {
    sparse_weight: 1.0,
    dense_weight: 0.0,
  });
  const doc1Sparse = sparseOnly.find(r => r.id === 'doc1');
  assert.ok(doc1Sparse.sparseScore > 0);
  assert.equal(doc1Sparse.denseScore, 0);

  // Test with 100% dense weight
  const denseOnly = fuseResults(sparseResults, denseResults, {
    sparse_weight: 0.0,
    dense_weight: 1.0,
  });
  const doc2Dense = denseOnly.find(r => r.id === 'doc2');
  assert.equal(doc2Dense.sparseScore, 0);
  assert.ok(doc2Dense.denseScore > 0);
});

test('RRF Fusion - should use custom rrf_k parameter', () => {
  const sparseResults = [
    { id: 'doc1', score: 1.0 },
  ];

  const denseResults = [
    { id: 'doc2', score: 1.0 },
  ];

  const k30 = fuseResults(sparseResults, denseResults, { rrf_k: 30 });
  const k60 = fuseResults(sparseResults, denseResults, { rrf_k: 60 });

  // Scores should be different with different k values
  assert.notEqual(k30[0].score, k60[0].score);
});

test('RRF Fusion - should handle empty sparse results', () => {
  const sparseResults = [];
  const denseResults = [
    { id: 'doc1', score: 1.0 },
    { id: 'doc2', score: 0.8 },
  ];

  const fused = fuseResults(sparseResults, denseResults);
  assert.equal(fused.length, 2);
  assert.equal(fused[0].sparseScore, 0);
  assert.ok(fused[0].denseScore > 0);
});

test('RRF Fusion - should handle empty dense results', () => {
  const sparseResults = [
    { id: 'doc1', score: 1.0 },
    { id: 'doc2', score: 0.8 },
  ];
  const denseResults = [];

  const fused = fuseResults(sparseResults, denseResults);
  assert.equal(fused.length, 2);
  assert.ok(fused[0].sparseScore > 0);
  assert.equal(fused[0].denseScore, 0);
});

test('RRF Fusion - should handle both empty', () => {
  const fused = fuseResults([], []);
  assert.deepEqual(fused, []);
});

// Export for use in vector-store integration
module.exports = { fuseResults };
