'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { EmbeddingGenerator } = require('../code-indexing/embedding-generator.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { classifyDomain } = require('./intent-classifier.cjs');

let cachedPrototypes = null;

// LRU embedding cache — avoids redundant embedding generation when semantic router is primary
const EMBEDDING_CACHE_MAX = 10;
const _embeddingCache = new Map();

function _getCachedEmbedding(prompt) {
  const cached = _embeddingCache.get(prompt);
  if (cached) {
    // Move to end (most recent)
    _embeddingCache.delete(prompt);
    _embeddingCache.set(prompt, cached);
    return cached;
  }
  return null;
}

function _setCachedEmbedding(prompt, embedding) {
  if (_embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    // Evict oldest (first key)
    const oldest = _embeddingCache.keys().next().value;
    _embeddingCache.delete(oldest);
  }
  _embeddingCache.set(prompt, embedding);
}

function normalizeL2(vec) {
  const norm = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vec;
  return vec.map(value => value / norm);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  const dot = a.reduce((sum, value, idx) => sum + value * b[idx], 0);
  return Math.max(-1, Math.min(1, dot));
}

function loadPrototypes(prototypesPath) {
  if (cachedPrototypes) return cachedPrototypes;
  const resolvedPath =
    prototypesPath || path.join(PROJECT_ROOT, '.claude', 'config', 'routing-prototypes.json');
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = safeParseJSON(raw);
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) return null;
    if (!parsed.prototypes || typeof parsed.dimensions !== 'number') return null;
    cachedPrototypes = {
      path: resolvedPath,
      dimensions: parsed.dimensions,
      model: parsed.model || null,
      prototypes: parsed.prototypes,
    };
    return cachedPrototypes;
  } catch (_err) {
    return null;
  }
}

async function predict(prompt, options = {}) {
  const { topK = 5, minScore = 0.2, prototypesPath } = options;
  const loaded = loadPrototypes(prototypesPath);
  if (!loaded || !prompt) return [];

  const startMs = Date.now();
  try {
    let embedding = _getCachedEmbedding(prompt);
    if (!embedding) {
      const generator = new EmbeddingGenerator({ cacheEnabled: false });
      await generator.initialize();
      embedding = await generator.embed(prompt, false);
      embedding = normalizeL2(embedding);
      _setCachedEmbedding(prompt, embedding);
    }
    if (process.env.ROUTER_DEBUG === 'true') {
      process.stderr.write(`[semantic-router] predict latency: ${Date.now() - startMs}ms\n`);
    }

    const results = [];
    for (const [agent, vector] of Object.entries(loaded.prototypes)) {
      if (!Array.isArray(vector) || vector.length !== embedding.length) continue;
      const score = cosineSimilarity(embedding, vector);
      if (score >= minScore) {
        results.push({ agent, score });
      }
    }

    const domainMatch = classifyDomain(prompt);
    if (domainMatch?.type === 'domain' && domainMatch.router) {
      const routerVector = loaded.prototypes[domainMatch.router];
      if (Array.isArray(routerVector) && routerVector.length === embedding.length) {
        const routerScore = cosineSimilarity(embedding, routerVector);
        const thresholdScore =
          results.length >= topK
            ? (results.slice().sort((a, b) => b.score - a.score)[Math.max(0, topK - 1)]?.score ??
              routerScore)
            : routerScore;

        const boostedScore = Math.max(routerScore, thresholdScore + 0.001);
        const existing = results.find(result => result.agent === domainMatch.router);
        if (existing) {
          existing.score = Math.max(existing.score, boostedScore);
        } else {
          results.push({
            agent: domainMatch.router,
            score: boostedScore,
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  } catch (_err) {
    return [];
  }
}

function _clearPrototypeCache() {
  cachedPrototypes = null;
}

module.exports = {
  loadPrototypes,
  cosineSimilarity,
  predict,
  _clearPrototypeCache,
  _clearEmbeddingCache() {
    _embeddingCache.clear();
  },
};
