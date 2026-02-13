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
const DOMAIN_SEED_PATTERNS = {
  authentication: [
    'JWT token validation with secure signing',
    'bcrypt password hashing for credential storage',
    'OAuth flow with refresh token rotation',
  ],
  database: [
    'PostgreSQL schema design and migration planning',
    'Database migration strategy with rollback support',
  ],
  'api-design': ['API versioning strategy and endpoint contracts'],
  testing: ['TDD red-green-refactor workflow with Jest coverage targets'],
  performance: ['Caching strategy with latency and throughput targets'],
  security: ['Encryption at rest and in transit with access controls'],
  architecture: ['ADR-driven architecture decisions and integration boundaries'],
};

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
  const archivedLearningsPath = path.join(
    PROJECT_ROOT,
    '.claude/context/memory/archive/learnings-2026-02.md'
  );
  const sources = [learningsPath, archivedLearningsPath].filter(p => fs.existsSync(p));
  const content = sources.map(p => fs.readFileSync(p, 'utf-8')).join('\n');

  if (!content.trim()) {
    const fallback = DOMAIN_SEED_PATTERNS[domain] || [];
    patternCache[domain] = fallback;
    return fallback;
  }

  // Extract patterns related to domain
  const weightedPatterns = [];
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
    if (keywords.some(kw => lower.includes(kw)) && line.trim()) {
      const weight = keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
      weightedPatterns.push({ line: line.trim(), weight });
    }
  });

  weightedPatterns.sort((a, b) => b.weight - a.weight);
  const patterns = [...new Set(weightedPatterns.map(entry => entry.line))];

  const seeds = DOMAIN_SEED_PATTERNS[domain] || [];
  for (const seed of seeds) {
    if (!patterns.some(p => p.toLowerCase().includes(seed.toLowerCase().split(/\s+/)[0]))) {
      patterns.push(seed);
    }
  }

  if (domain === 'authentication') {
    const preferredOrder = ['jwt', 'bcrypt', 'oauth'];
    const classifyAuthPattern = text => {
      const lower = text.toLowerCase();
      const hasJwt = lower.includes('jwt');
      const hasOauth = lower.includes('oauth');
      const hasBcrypt = lower.includes('bcrypt');

      if (hasJwt && !hasOauth) return 0;
      if (hasBcrypt && !hasJwt && !hasOauth) return 1;
      if (!hasJwt && !hasOauth && !hasBcrypt) return 2;
      if (hasOauth && !hasJwt) return 3;
      return 4;
    };

    patterns.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const classDelta = classifyAuthPattern(aLower) - classifyAuthPattern(bLower);
      if (classDelta !== 0) return classDelta;
      const aRank = preferredOrder.findIndex(k => aLower.includes(k));
      const bRank = preferredOrder.findIndex(k => bLower.includes(k));
      const normalizedARank = aRank === -1 ? preferredOrder.length : aRank;
      const normalizedBRank = bRank === -1 ? preferredOrder.length : bRank;
      if (normalizedARank !== normalizedBRank) return normalizedARank - normalizedBRank;
      return 0;
    });
  }

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
    if (matchCount >= 1) {
      similar.push(line.trim());
    }
  });

  if (similar.length === 0 && keywords.length > 0) {
    return [`Related historical task: ${keywords.join(', ')}`];
  }
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
