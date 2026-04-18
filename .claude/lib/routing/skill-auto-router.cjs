'use strict';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'from',
  'in',
  'is',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
]);

function normalizeWord(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .trim();
}

function extractKeywords(text) {
  return String(text || '')
    .split(/[^A-Za-z0-9-]+/)
    .map(normalizeWord)
    .filter(word => word && !STOPWORDS.has(word));
}

function extractDescription(content) {
  const raw = String(content || '');
  const frontmatterBlock = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatterBlock) {
    const descriptionLine = frontmatterBlock[1].match(/^description:\s*(.+)$/im);
    if (descriptionLine) {
      return descriptionLine[1].trim();
    }
  }

  const paragraphs = raw
    .split(/\r?\n\r?\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .filter(block => !block.startsWith('---'))
    .filter(block => !block.startsWith('#'));

  return paragraphs[0] || '';
}

function computeKeywordScore(queryKeywords, skillKeywords) {
  const source = [...new Set((queryKeywords || []).map(normalizeWord).filter(Boolean))];
  const target = [...new Set((skillKeywords || []).map(normalizeWord).filter(Boolean))];
  if (source.length === 0 || target.length === 0) {
    return 0;
  }

  let score = 0;
  for (const query of source) {
    if (target.includes(query)) {
      score += 1;
      continue;
    }

    if (target.some(keyword => keyword.includes(query) || query.includes(keyword))) {
      score += 0.5;
    }
  }

  return score / source.length;
}

module.exports = {
  computeKeywordScore,
  extractDescription,
  extractKeywords,
};
