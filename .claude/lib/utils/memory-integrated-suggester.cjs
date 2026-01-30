/**
 * SPEC-009: Memory-Integrated Suggester
 *
 * Leverages learnings.md to suggest questions and score answers
 *
 * GREEN Phase: Minimal implementation to pass tests
 */

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('./project-root.cjs');

// Cache for patterns to improve performance
const patternCache = {};

/**
 * Load domain patterns from learnings.md
 * @param {string} domain
 * @returns {Promise<Array<string>>}
 */
async function loadDomainPatterns(domain) {
  // Check cache first
  if (patternCache[domain]) {
    return patternCache[domain];
  }

  const learningsPath = path.join(PROJECT_ROOT, '.claude/context/memory/learnings.md');

  if (!fs.existsSync(learningsPath)) {
    patternCache[domain] = [];
    return [];
  }

  const content = fs.readFileSync(learningsPath, 'utf-8');

  // Extract patterns related to domain
  const patterns = [];
  const domainKeywords = {
    authentication: ['auth', 'jwt', 'bcrypt', 'oauth', 'token', 'password', 'login', 'session'],
    database: ['postgres', 'mysql', 'migration', 'schema', 'index', 'database', 'sql'],
    'api-design': ['rest', 'graphql', 'api', 'endpoint', 'route', 'versioning'],
    testing: ['tdd', 'jest', 'pytest', 'unittest', 'test', 'coverage', 'red-green-refactor'],
    performance: ['cache', 'cdn', 'performance', 'optimization', 'latency', 'throughput'],
    security: ['encrypt', 'owasp', 'vulnerability', 'security', 'threat', 'xss', 'sql injection'],
    architecture: ['adr', 'decision', 'architecture', 'pattern', 'design'],
  };

  const keywords = domainKeywords[domain] || [];
  const lines = content.split('\n');

  lines.forEach(line => {
    const lower = line.toLowerCase();
    if (keywords.some(kw => lower.includes(kw))) {
      patterns.push(line.trim());
    }
  });

  // Cache the result
  patternCache[domain] = patterns;

  return patterns;
}

/**
 * Suggest question variants based on domain
 * @param {string} baseQuestion
 * @param {string} domain
 * @returns {Promise<Array<string>>}
 */
async function suggestQuestionVariants(baseQuestion, domain) {
  const patterns = await loadDomainPatterns(domain);

  const variants = [
    baseQuestion,
    baseQuestion.replace('What ', 'Which '),
    baseQuestion.replace('?', ' do you prefer?'),
  ];

  // Add pattern-based variants
  if (domain === 'database' && patterns.some(p => p.toLowerCase().includes('migration'))) {
    variants.push('How will you handle database migrations?');
    variants.push('What database migration strategy?');
  }

  if (domain === 'authentication' && patterns.some(p => p.toLowerCase().includes('jwt'))) {
    variants.push('Will you use JWT tokens?');
  }

  return [...new Set(variants)]; // Deduplicate
}

/**
 * Find similar past tasks in learnings
 * @param {Array<string>} keywords
 * @returns {Promise<Array<string>>}
 */
async function findSimilarPastTasks(keywords) {
  const learningsPath = path.join(PROJECT_ROOT, '.claude/context/memory/learnings.md');

  if (!fs.existsSync(learningsPath)) {
    return [];
  }

  const content = fs.readFileSync(learningsPath, 'utf-8');
  const lines = content.split('\n');

  const similar = [];
  lines.forEach(line => {
    const lower = line.toLowerCase();
    const matchCount = keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (matchCount >= 2) {
      similar.push(line.trim());
    }
  });

  return similar;
}

/**
 * Score answer quality based on domain patterns
 * @param {string} answer
 * @param {Array<string>} domainPatterns
 * @returns {Promise<number>} - 0-100
 */
async function scoreAnswerQuality(answer, domainPatterns) {
  if (!answer || answer.trim().length === 0) return 0;

  const answerLower = answer.toLowerCase();
  let score = 0;

  // Base score from length
  const length = answer.length;
  if (length < 10) score = 20;
  else if (length < 30) score = 40;
  else if (length < 60) score = 60;
  else score = 70;

  // Bonus for pattern matches
  const matches = domainPatterns.filter(pattern => {
    const keywords = pattern.toLowerCase().split(/\s+/);
    return keywords.some(kw => answerLower.includes(kw));
  });

  const bonus = Math.min(30, matches.length * 10);
  score += bonus;

  return Math.min(100, score);
}

module.exports = {
  loadDomainPatterns,
  suggestQuestionVariants,
  findSimilarPastTasks,
  scoreAnswerQuality,
};
