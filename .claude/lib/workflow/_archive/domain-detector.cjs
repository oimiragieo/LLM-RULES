/**
 * Domain Detector
 * ===============
 *
 * Analyzes user request text to detect which domain(s) are involved.
 * Used by the router to pick specialized agents.
 *
 * Task #38 (Deliverable 2) - Enterprise Orchestration Phase 4
 *
 * Domain Categories:
 * - security
 * - database
 * - frontend
 * - backend
 * - devops
 * - mobile
 * - ai-ml
 * - testing
 * - documentation
 * - performance
 *
 * @module domain-detector
 */

'use strict';

// =============================================================================
// DOMAIN KEYWORD DEFINITIONS
// =============================================================================

/**
 * Domain keyword patterns with weighted scoring
 * Higher weight = stronger domain signal
 */
const DOMAIN_KEYWORDS = {
  security: {
    keywords: [
      { term: 'authentication', weight: 10 },
      { term: 'authorization', weight: 10 },
      { term: 'auth', weight: 8 },
      { term: 'credential', weight: 10 },
      { term: 'password', weight: 9 },
      { term: 'token', weight: 8 },
      { term: 'JWT', weight: 9 },
      { term: 'OAuth', weight: 9 },
      { term: 'security', weight: 10 },
      { term: 'secure', weight: 8 },
      { term: 'vulnerability', weight: 10 },
      { term: 'OWASP', weight: 10 },
      { term: 'encrypt', weight: 8 },
      { term: 'decrypt', weight: 8 },
      { term: 'permission', weight: 8 },
      { term: 'access control', weight: 9 },
    ],
  },
  database: {
    keywords: [
      { term: 'database', weight: 10 },
      { term: 'schema', weight: 9 },
      { term: 'migration', weight: 9 },
      { term: 'SQL', weight: 8 },
      { term: 'query', weight: 7 },
      { term: 'PostgreSQL', weight: 9 },
      { term: 'MySQL', weight: 9 },
      { term: 'MongoDB', weight: 9 },
      { term: 'table', weight: 6 },
      { term: 'index', weight: 6 },
      { term: 'transaction', weight: 7 },
    ],
  },
  frontend: {
    keywords: [
      { term: 'React', weight: 10 },
      { term: 'Vue', weight: 10 },
      { term: 'Angular', weight: 10 },
      { term: 'component', weight: 7 },
      { term: 'CSS', weight: 8 },
      { term: 'HTML', weight: 7 },
      { term: 'UI', weight: 8 },
      { term: 'responsive', weight: 7 },
      { term: 'browser', weight: 6 },
      { term: 'DOM', weight: 7 },
      { term: 'client-side', weight: 8 },
    ],
  },
  backend: {
    keywords: [
      { term: 'API', weight: 9 },
      { term: 'REST', weight: 9 },
      { term: 'GraphQL', weight: 10 },
      { term: 'endpoint', weight: 8 },
      { term: 'server', weight: 7 },
      { term: 'Express', weight: 9 },
      { term: 'FastAPI', weight: 9 },
      { term: 'Django', weight: 9 },
      { term: 'validation', weight: 6 },
      { term: 'middleware', weight: 8 },
      { term: 'route', weight: 7 },
    ],
  },
  devops: {
    keywords: [
      { term: 'CI/CD', weight: 10 },
      { term: 'deploy', weight: 9 },
      { term: 'deployment', weight: 9 },
      { term: 'Docker', weight: 10 },
      { term: 'Kubernetes', weight: 10 },
      { term: 'k8s', weight: 10 },
      { term: 'pipeline', weight: 9 },
      { term: 'container', weight: 8 },
      { term: 'infrastructure', weight: 8 },
      { term: 'Jenkins', weight: 9 },
      { term: 'GitHub Actions', weight: 9 },
    ],
  },
  mobile: {
    keywords: [
      { term: 'iOS', weight: 10 },
      { term: 'Android', weight: 10 },
      { term: 'Swift', weight: 9 },
      { term: 'Kotlin', weight: 9 },
      { term: 'React Native', weight: 10 },
      { term: 'mobile app', weight: 10 },
      { term: 'Flutter', weight: 10 },
      { term: 'mobile', weight: 8 },
    ],
  },
  'ai-ml': {
    keywords: [
      { term: 'machine learning', weight: 10 },
      { term: 'neural network', weight: 10 },
      { term: 'AI', weight: 7 },
      { term: 'model', weight: 6 },
      { term: 'training', weight: 5 },
      { term: 'TensorFlow', weight: 10 },
      { term: 'PyTorch', weight: 10 },
      { term: 'LLM', weight: 10 },
      { term: 'embeddings', weight: 9 },
    ],
  },
  testing: {
    keywords: [
      { term: 'test', weight: 8 },
      { term: 'unit test', weight: 10 },
      { term: 'integration test', weight: 10 },
      { term: 'e2e', weight: 9 },
      { term: 'coverage', weight: 9 },
      { term: 'assertion', weight: 8 },
      { term: 'Jest', weight: 9 },
      { term: 'pytest', weight: 9 },
      { term: 'regression', weight: 8 },
    ],
  },
  documentation: {
    keywords: [
      { term: 'documentation', weight: 10 },
      { term: 'docs', weight: 9 },
      { term: 'readme', weight: 9 },
      { term: 'guide', weight: 8 },
      { term: 'tutorial', weight: 8 },
      { term: 'API documentation', weight: 10 },
      { term: 'API reference', weight: 10 },
      { term: 'user guide', weight: 9 },
    ],
  },
  performance: {
    keywords: [
      { term: 'performance', weight: 10 },
      { term: 'optimize', weight: 9 },
      { term: 'memory', weight: 7 },
      { term: 'speed', weight: 7 },
      { term: 'latency', weight: 8 },
      { term: 'cache', weight: 7 },
      { term: 'benchmark', weight: 8 },
      { term: 'profiling', weight: 9 },
    ],
  },
};

// =============================================================================
// DOMAIN DETECTION
// =============================================================================

/**
 * Detect domains in the request text using keyword-based scoring
 * @param {string} text - The request text to analyze
 * @returns {{ domains: string[], primaryDomain: string|null, confidence: number }}
 */
function detectDomains(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {
      domains: [],
      primaryDomain: null,
      confidence: 0,
    };
  }

  const normalized = text.toLowerCase();
  const domainScores = {};

  // Score each domain based on keyword matches
  for (const [domain, config] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const { term, weight } of config.keywords) {
      if (normalized.includes(term.toLowerCase())) {
        score += weight;
      }
    }
    if (score > 0) {
      domainScores[domain] = score;
    }
  }

  // Sort domains by score (descending)
  const sortedDomains = Object.entries(domainScores)
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain);

  // Primary domain is the highest-scoring one
  const primaryDomain = sortedDomains.length > 0 ? sortedDomains[0] : null;

  // Calculate confidence based on signal density
  // Confidence = (total score) / (text length in words) capped at 1.0
  const totalScore = Object.values(domainScores).reduce((sum, score) => sum + score, 0);
  const wordCount = text.split(/\s+/).length;
  const rawConfidence = totalScore / Math.max(wordCount, 1);
  const confidence = Math.min(rawConfidence / 10, 1.0); // Normalize to 0-1

  return {
    domains: sortedDomains,
    primaryDomain,
    confidence,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  detectDomains,
  DOMAIN_KEYWORDS,
};
