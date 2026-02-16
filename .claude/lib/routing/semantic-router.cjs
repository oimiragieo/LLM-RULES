'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { EmbeddingGenerator } = require('../code-indexing/embedding-generator.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

let cachedPrototypes = null;

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

  const generator = new EmbeddingGenerator({ cacheEnabled: false });
  try {
    await generator.initialize();
    let embedding = await generator.embed(prompt, false);
    embedding = normalizeL2(embedding);

    const results = [];
    for (const [agent, vector] of Object.entries(loaded.prototypes)) {
      if (!Array.isArray(vector) || vector.length !== embedding.length) continue;
      const score = cosineSimilarity(embedding, vector);
      if (score >= minScore) {
        results.push({ agent, score });
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
};
