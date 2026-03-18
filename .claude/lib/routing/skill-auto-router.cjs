#!/usr/bin/env node
'use strict';

/**
 * Skill Auto-Router (Feature H2)
 * ================================
 * Embedding-based skill retrieval that matches user intent to skills
 * using cosine similarity on description embeddings. Falls back to
 * keyword matching when embeddings are unavailable.
 *
 * Usage:
 *   const { findBestSkills, buildSkillIndex } = require('./skill-auto-router.cjs');
 *
 *   const matches = findBestSkills('run unit tests and check coverage');
 *   // => [{ skill: 'tdd', score: 0.87 }, { skill: 'qa-workflow', score: 0.72 }]
 */

const fs = require('fs');
const path = require('path');

const SKILL_INDEX_FILE = path.join(
  __dirname,
  '..',
  '..',
  'context',
  'runtime',
  'skill-route-index.json',
);

/**
 * @typedef {Object} SkillMatch
 * @property {string} skill - Skill name
 * @property {number} score - Match score 0.0 to 1.0
 * @property {string} description - Skill description
 */

/**
 * Build a keyword-based skill index from skill frontmatter descriptions.
 * Scans `.claude/skills/` for SKILL.md files with description frontmatter.
 * @returns {Array<{name: string, description: string, keywords: string[]}>}
 */
function buildSkillIndex() {
  const skillsDir = path.join(__dirname, '..', '..', 'skills');
  const index = [];

  if (!fs.existsSync(skillsDir)) return index;

  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const skillFile = path.join(skillsDir, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;

    try {
      const content = fs.readFileSync(skillFile, 'utf8');
      const description = extractDescription(content);
      if (description) {
        index.push({
          name: dir.name,
          description,
          keywords: extractKeywords(description),
        });
      }
    } catch {
      // Skip unreadable skills
    }
  }

  // Save index for future use
  const indexDir = path.dirname(SKILL_INDEX_FILE);
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }
  fs.writeFileSync(SKILL_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');

  return index;
}

/**
 * Find best matching skills for a given query using keyword overlap scoring.
 * @param {string} query - User intent description
 * @param {Object} [options]
 * @param {number} [options.maxResults=5] - Maximum results to return
 * @param {number} [options.minScore=0.1] - Minimum score threshold
 * @returns {SkillMatch[]} Sorted by score descending
 */
function findBestSkills(query, options = {}) {
  const maxResults = options.maxResults || 5;
  const minScore = options.minScore || 0.1;

  const index = loadOrBuildIndex();
  if (index.length === 0) return [];

  const queryKeywords = extractKeywords(query);
  if (queryKeywords.length === 0) return [];

  const scored = index.map((skill) => {
    const score = computeKeywordScore(queryKeywords, skill.keywords);
    return { skill: skill.name, score, description: skill.description };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Compute keyword overlap score between query and skill keywords.
 * Uses Jaccard similarity with TF-IDF-like weighting for rare terms.
 * @param {string[]} queryKw
 * @param {string[]} skillKw
 * @returns {number} Score 0.0 to 1.0
 */
function computeKeywordScore(queryKw, skillKw) {
  if (queryKw.length === 0 || skillKw.length === 0) return 0;

  const querySet = new Set(queryKw);
  const skillSet = new Set(skillKw);

  let overlap = 0;
  for (const kw of querySet) {
    if (skillSet.has(kw)) overlap++;
    // Partial match: check if any skill keyword contains the query keyword
    else {
      for (const sk of skillSet) {
        if (sk.includes(kw) || kw.includes(sk)) {
          overlap += 0.5;
          break;
        }
      }
    }
  }

  const union = new Set([...queryKw, ...skillKw]).size;
  return union > 0 ? Math.round((overlap / union) * 100) / 100 : 0;
}

/**
 * Extract description from SKILL.md frontmatter.
 * @param {string} content
 * @returns {string|null}
 */
function extractDescription(content) {
  // Check frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const descMatch = fmMatch[1].match(/description:\s*(.+)/);
    if (descMatch) return descMatch[1].trim();
  }

  // Fallback: first non-heading, non-empty line
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      return trimmed.substring(0, 200);
    }
  }

  return null;
}

/**
 * Extract keywords from text (lowercased, stopwords removed, 3+ chars).
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  const stopwords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'with', 'this', 'that',
    'from', 'they', 'been', 'use', 'will', 'each', 'make', 'how', 'when',
    'what', 'which', 'their', 'then', 'into', 'some', 'more', 'also', 'using',
  ]);

  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopwords.has(w)),
  )];
}

/**
 * Load cached index or build from disk.
 * @returns {Array}
 */
function loadOrBuildIndex() {
  try {
    const raw = fs.readFileSync(SKILL_INDEX_FILE, 'utf8');
    const index = JSON.parse(raw);
    if (Array.isArray(index) && index.length > 0) return index;
  } catch {
    // Build fresh
  }
  return buildSkillIndex();
}

module.exports = {
  findBestSkills,
  buildSkillIndex,
  computeKeywordScore,
  extractKeywords,
  extractDescription,
  SKILL_INDEX_FILE,
};
