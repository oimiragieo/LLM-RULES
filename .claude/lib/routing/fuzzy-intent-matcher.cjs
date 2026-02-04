'use strict';

const DEFAULT_THRESHOLD = 0.6;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function jaccardSimilarity(aTokens, bTokens) {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function fuzzyMatchIntent(prompt, intentKeywords, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const normalized = String(prompt || '').trim().toLowerCase();
  if (normalized.length < 2 || !intentKeywords || typeof intentKeywords !== 'object') {
    return null;
  }
  const promptTokens = tokenize(normalized);
  if (promptTokens.length === 0) return null;

  const scores = [];
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    if (!Array.isArray(keywords)) continue;
    let best = 0;
    for (const kw of keywords) {
      const kwTokens = tokenize(kw);
      const score = jaccardSimilarity(promptTokens, kwTokens);
      if (score > best) best = score;
    }
    if (best >= threshold) {
      scores.push({ intent, confidence: best });
    }
  }
  if (scores.length === 0) return null;
  scores.sort((a, b) => b.confidence - a.confidence);
  const top = scores[0];
  return { intent: top.intent, confidence: top.confidence, method: 'fuzzy' };
}

module.exports = { fuzzyMatchIntent, jaccardSimilarity, tokenize };
