'use strict';

/**
 * Categorizes requirement questions into 5 standard categories.
 * Used by the discuss-phase skill to structure requirement disambiguation.
 */

const CATEGORIES = ['Scope', 'Architecture', 'Dependencies', 'Risk', 'AcceptanceCriteria'];

/**
 * Keyword maps for each category.
 * Each entry is a [keyword, weight] pair.
 */
const KEYWORD_MAP = {
  Scope: [
    ['scope', 2],
    ['included', 2],
    ['excluded', 2],
    ['boundary', 2],
    ['include', 1.5],
    ['exclude', 1.5],
    ['out of scope', 2],
    ['in scope', 2],
    ['cover', 1],
    ['feature', 1],
    ['functionality', 1],
    ['requirement', 1],
    ['deliverable', 1.5],
    ['what is', 0.5],
  ],
  Architecture: [
    ['architecture', 2],
    ['design pattern', 2],
    ['pattern', 1.5],
    ['framework', 1.5],
    ['structure', 1.5],
    ['layer', 1.5],
    ['component', 1],
    ['module', 1],
    ['database', 1],
    ['api', 1],
    ['service', 1],
    ['microservice', 1.5],
    ['monolith', 1.5],
    ['approach', 1],
    ['how should', 1],
    ['which design', 1.5],
    ['technology', 1],
    ['tech stack', 2],
    ['stack', 1],
    ['infrastructure', 1.5],
  ],
  Dependencies: [
    ['depend', 2],
    ['dependencies', 2],
    ['library', 2],
    ['libraries', 2],
    ['package', 2],
    ['packages', 2],
    ['external', 1.5],
    ['third-party', 2],
    ['third party', 2],
    ['integration', 1.5],
    ['require', 1],
    ['required', 1],
    ['install', 1.5],
    ['npm', 2],
    ['pip', 2],
    ['module', 1],
    ['tool', 1],
    ['tools', 1],
  ],
  Risk: [
    ['risk', 2],
    ['risks', 2],
    ['could go wrong', 2],
    ['might fail', 2],
    ['concern', 1.5],
    ['concerns', 1.5],
    ['issue', 1],
    ['issues', 1],
    ['problem', 1],
    ['problems', 1],
    ['challenge', 1.5],
    ['challenges', 1.5],
    ['danger', 1.5],
    ['vulnerability', 2],
    ['security', 1.5],
    ['failure', 1.5],
    ['limitation', 1.5],
    ['constraint', 1.5],
    ['tradeoff', 1.5],
    ['trade-off', 1.5],
    ['downside', 1.5],
  ],
  AcceptanceCriteria: [
    ['acceptance', 2],
    ['criteria', 2],
    ['done look', 2],
    ['definition of done', 2],
    ['verify', 1.5],
    ['verification', 1.5],
    ['validate', 1.5],
    ['validation', 1.5],
    ['test', 1],
    ['testing', 1],
    ['success', 1.5],
    ['complete', 1],
    ['completion', 1],
    ['pass', 1],
    ['measure', 1.5],
    ['metric', 1.5],
    ['how will we know', 2],
    ['expected result', 2],
    ['expected behavior', 2],
    ['what does done', 2],
  ],
};

/**
 * Categorizes a single requirement question.
 * @param {string} question - The question text to categorize
 * @returns {{ category: string, confidence: number, reason: string }}
 */
function categorizeQuestion(question) {
  if (!question || typeof question !== 'string') {
    return { category: 'Scope', confidence: 0, reason: 'Empty or invalid question; defaulting to Scope' };
  }

  const lower = question.toLowerCase();
  const scores = {};

  for (const category of CATEGORIES) {
    let score = 0;
    const matched = [];
    for (const [keyword, weight] of KEYWORD_MAP[category]) {
      if (lower.includes(keyword)) {
        score += weight;
        matched.push(keyword);
      }
    }
    scores[category] = { score, matched };
  }

  // Pick winner
  let bestCategory = 'Scope';
  let bestScore = -1;
  for (const category of CATEGORIES) {
    if (scores[category].score > bestScore) {
      bestScore = scores[category].score;
      bestCategory = category;
    }
  }

  // Normalize confidence: clamp score to [0,1] via sigmoid-ish approach
  const rawScore = bestScore;
  const confidence = rawScore <= 0 ? 0.1 : Math.min(1, rawScore / (rawScore + 3));

  const matched = scores[bestCategory].matched;
  const reason =
    matched.length > 0
      ? `Matched keywords: ${matched.slice(0, 3).join(', ')}`
      : 'No strong keyword match; using default category';

  return { category: bestCategory, confidence, reason };
}

/**
 * Categorizes multiple questions at once.
 * @param {string[]} questions
 * @returns {Array<{ question: string, category: string, confidence: number, reason: string }>}
 */
function categorizeQuestions(questions) {
  return questions.map(q => ({ question: q, ...categorizeQuestion(q) }));
}

module.exports = { categorizeQuestion, categorizeQuestions, CATEGORIES };
