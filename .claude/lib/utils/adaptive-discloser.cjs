/**
 * SPEC-009: Adaptive Questioniner
 *
 * Intelligently generates next question based on:
 * - Domain context (authentication, API, database, etc.)
 * - Question history (avoid redundancy)
 * - Accumulated context (skip answered topics)
 * - Memory patterns (leverage learnings.md)
 *
 * GREEN Phase: Minimal implementation to pass tests
 */

const path = require('path');
const { loadDomainPatterns } = require('./memory-integrated-suggester.cjs');
const {
  scoreCompleteness: _scoreCompleteness,
  scoreQuality,
  scoreConsistency,
  computeOverallReadiness,
} = require('./readiness-scorer.cjs');

/**
 * Domain-specific question templates
 */
const DOMAIN_QUESTIONS = {
  authentication: [
    {
      question: 'What authentication method will you use?',
      priority: 'CRITICAL',
      followups: ['token expiry', 'password requirements', 'rate limiting'],
    },
    {
      question: 'What token expiry timeframe?',
      priority: 'CRITICAL',
      followups: ['refresh tokens', 'session management'],
    },
    {
      question: 'Do you need refresh tokens?',
      priority: 'HIGH',
      followups: ['refresh token storage', 'rotation policy'],
    },
    {
      question: 'What are the password requirements?',
      priority: 'HIGH',
      followups: ['password hashing', 'reset flow'],
    },
    {
      question: 'What rate limiting strategy?',
      priority: 'HIGH',
      followups: ['lockout duration', 'IP-based limiting'],
    },
    {
      question: 'Do you need role-based access control?',
      priority: 'MEDIUM',
      followups: ['role hierarchy', 'permission granularity'],
    },
    {
      question: 'Single sign-on required?',
      priority: 'MEDIUM',
      followups: ['SSO provider', 'SAML vs OAuth'],
    },
  ],
  'api-design': [
    {
      question: 'REST or GraphQL API?',
      priority: 'CRITICAL',
      followups: ['API versioning', 'endpoint structure'],
    },
    {
      question: 'How will you version the API?',
      priority: 'HIGH',
      followups: ['version strategy', 'deprecation policy'],
    },
    {
      question: 'What request/response format?',
      priority: 'HIGH',
      followups: ['error format', 'pagination'],
    },
    {
      question: 'What authentication for API?',
      priority: 'CRITICAL',
      followups: ['API keys', 'OAuth tokens'],
    },
    {
      question: 'What rate limiting for endpoints?',
      priority: 'MEDIUM',
      followups: ['limits per endpoint', 'burst handling'],
    },
  ],
  database: [
    {
      question: 'What database type?',
      priority: 'CRITICAL',
      followups: ['schema design', 'migration strategy'],
    },
    {
      question: 'What migration strategy?',
      priority: 'HIGH',
      followups: ['migration tool', 'rollback plan'],
    },
    {
      question: 'How will you handle connection pooling?',
      priority: 'HIGH',
      followups: ['pool size', 'connection limits'],
    },
    {
      question: 'What indexing strategy?',
      priority: 'MEDIUM',
      followups: ['index types', 'performance targets'],
    },
    {
      question: 'What backup and recovery plan?',
      priority: 'HIGH',
      followups: ['backup frequency', 'recovery time'],
    },
  ],
  performance: [
    {
      question: 'What performance targets?',
      priority: 'CRITICAL',
      followups: ['response time', 'throughput'],
    },
    {
      question: 'What caching strategy?',
      priority: 'HIGH',
      followups: ['cache invalidation', 'TTL'],
    },
    {
      question: 'Do you need CDN?',
      priority: 'MEDIUM',
      followups: ['CDN provider', 'asset distribution'],
    },
    {
      question: 'What monitoring and alerting?',
      priority: 'MEDIUM',
      followups: ['metrics to track', 'alert thresholds'],
    },
  ],
  security: [
    {
      question: 'What authentication and authorization?',
      priority: 'CRITICAL',
      followups: ['auth method', 'permission model'],
    },
    {
      question: 'What encryption strategy?',
      priority: 'CRITICAL',
      followups: ['encryption at rest', 'encryption in transit'],
    },
    {
      question: 'What data protection requirements?',
      priority: 'CRITICAL',
      followups: ['PII handling', 'GDPR compliance'],
    },
    {
      question: 'What security audit logging?',
      priority: 'HIGH',
      followups: ['log retention', 'audit trail'],
    },
  ],
  testing: [
    {
      question: 'What testing framework?',
      priority: 'HIGH',
      followups: ['test types', 'coverage targets'],
    },
    {
      question: 'What test coverage target?',
      priority: 'MEDIUM',
      followups: ['unit tests', 'integration tests'],
    },
    {
      question: 'Do you need E2E tests?',
      priority: 'MEDIUM',
      followups: ['E2E framework', 'test environments'],
    },
    {
      question: 'What CI/CD integration?',
      priority: 'HIGH',
      followups: ['test automation', 'deployment gates'],
    },
  ],
  general: [
    {
      question: 'What is the primary goal?',
      priority: 'CRITICAL',
      followups: ['success metrics', 'acceptance criteria'],
    },
    {
      question: 'Who are the users?',
      priority: 'HIGH',
      followups: ['user roles', 'access patterns'],
    },
    {
      question: 'What are the constraints?',
      priority: 'HIGH',
      followups: ['timeline', 'budget', 'technology'],
    },
    {
      question: 'What are the success metrics?',
      priority: 'MEDIUM',
      followups: ['KPIs', 'measurement strategy'],
    },
  ],
};

/**
 * AdaptiveQuestioner - Generates next question based on context and history
 */
class AdaptiveQuestioner {
  constructor(domain, memoryLoader = null) {
    this.domain = domain || 'general';
    this.memoryLoader = memoryLoader;
    this.questionPool = DOMAIN_QUESTIONS[this.domain] || DOMAIN_QUESTIONS.general;
  }

  /**
   * Get next question based on context and history
   * @param {Object} context - Accumulated context
   * @param {Array} history - Question/answer history
   * @returns {Object} - { question, followupAreas, alternatives }
   */
  async getNextQuestion(context, history) {
    // Filter out already-asked questions
    const askedQuestions = history.map(h => h.question.toLowerCase());
    const availableQuestions = this.questionPool.filter(
      q => !askedQuestions.some(asked => this._isSimilar(asked, q.question.toLowerCase()))
    );

    // Filter out questions already answered by context
    const contextKeys = Object.keys(context).map(k => k.toLowerCase());
    const relevantQuestions = availableQuestions.filter(q => {
      const questionTopics = this._extractTopics(q.question);
      return !questionTopics.some(topic => contextKeys.some(key => key.includes(topic)));
    });

    // Prioritize questions based on context gaps
    // If context indicates a feature exists but related feature doesn't, prioritize the related
    const contextGaps = this._identifyContextGaps(context);

    // Prioritize by question priority AND context gaps
    const priorityOrder = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
    const sorted = relevantQuestions.sort((a, b) => {
      // Context gap bonus (prioritize questions that fill gaps)
      const aGapBonus = contextGaps.some(gap => a.question.toLowerCase().includes(gap)) ? 2 : 0;
      const bGapBonus = contextGaps.some(gap => b.question.toLowerCase().includes(gap)) ? 2 : 0;

      const aScore = (priorityOrder[a.priority] || 0) + aGapBonus;
      const bScore = (priorityOrder[b.priority] || 0) + bGapBonus;

      return bScore - aScore;
    });

    const nextQuestion = sorted[0] || this.questionPool[0];

    // Generate alternatives
    const alternatives = this._generateAlternatives(nextQuestion.question);

    return {
      question: nextQuestion.question,
      followupAreas: nextQuestion.followups || [],
      alternatives,
    };
  }

  /**
   * Identify context gaps (features that should be asked about)
   */
  _identifyContextGaps(context) {
    const gaps = [];

    // If hasAuth is true but hasRBAC is false, ask about RBAC
    if (context.hasAuth === true && context.hasRBAC === false) {
      gaps.push('role');
      gaps.push('permission');
      gaps.push('rbac');
    }

    // If hasDatabase is true but hasBackup is false, ask about backup
    if (context.hasDatabase === true && context.hasBackup === false) {
      gaps.push('backup');
    }

    // If hasAPI is true but hasRateLimit is false, ask about rate limiting
    if (context.hasAPI === true && context.hasRateLimit === false) {
      gaps.push('rate');
      gaps.push('limit');
    }

    return gaps;
  }

  /**
   * Detect optimal stopping point
   * @param {Array} history - Question/answer history
   * @param {Object} context - Accumulated context
   * @returns {Object} - { shouldStop, readiness, missingAreas }
   */
  async detectOptimalStop(history, context) {
    if (history.length === 0) {
      return {
        shouldStop: false,
        readiness: 0,
        missingAreas: this.questionPool.map(q => q.question),
      };
    }

    // Calculate scores
    const expectedFields = this.questionPool
      .map(q => this._extractTopics(q.question)[0])
      .filter(f => f !== undefined); // Filter out undefined values

    const answers = history.map(h => ({
      answer: h.answer,
      question: h.question,
      quality: this._calculateAnswerQuality(h.answer),
    }));

    // Calculate completeness based on actual answer coverage vs expected topics
    // Use flexible matching - if history covers similar topics to expected fields
    const answeredTopics = new Set();
    history.forEach(h => {
      const topics = this._extractTopics(h.question);
      topics.forEach(t => answeredTopics.add(t));
      // Also extract topics from answers (sometimes answers mention related topics)
      const answerTopics = this._extractTopics(h.answer);
      answerTopics.forEach(t => answeredTopics.add(t));
    });

    // Match answered topics to expected fields
    const expectedMatched = expectedFields.filter(
      f =>
        f &&
        (answeredTopics.has(f) ||
          Array.from(answeredTopics).some(at => at && (at.includes(f) || f.includes(at))))
    );

    const completenessScore =
      expectedFields.length > 0
        ? Math.round((expectedMatched.length / expectedFields.length) * 100)
        : 100;

    // Load domain patterns for quality scoring
    const domainPatterns = await loadDomainPatterns(this.domain);
    const qualityScore = scoreQuality(answers, domainPatterns);
    const consistencyScore = scoreConsistency(answers, context);

    const readiness = computeOverallReadiness({
      completeness: completenessScore,
      quality: qualityScore,
      consistency: consistencyScore,
    });

    // Identify missing areas (check for CRITICAL priority questions)
    const criticalQuestions = this.questionPool.filter(q => q.priority === 'CRITICAL');
    const missingCritical = criticalQuestions.filter(q => {
      const topics = this._extractTopics(q.question);
      return !topics.some(
        t =>
          answeredTopics.has(t) ||
          Array.from(answeredTopics).some(at => at.includes(t) || t.includes(at))
      );
    });

    const missingAreas = missingCritical.map(q => q.question);

    // Stopping criteria:
    // 1. Readiness >= 80 AND no missing critical areas
    // 2. OR history.length >= 5 AND quality score >= 70 AND completeness >= 60
    // 3. OR history.length >= 10 (very long history - always stop)
    // 4. Never stop if quality score < 50 (low-quality answers)
    let shouldStop = false;

    if (qualityScore >= 50) {
      shouldStop =
        (readiness >= 80 && missingCritical.length === 0) ||
        (history.length >= 5 && qualityScore >= 70 && completenessScore >= 60) ||
        history.length >= 10;
    }

    return { shouldStop, readiness, missingAreas };
  }

  /**
   * Check if two questions are similar
   */
  _isSimilar(q1, q2) {
    const topics1 = this._extractTopics(q1);
    const topics2 = this._extractTopics(q2);
    return topics1.some(t1 => topics2.some(t2 => t1.includes(t2) || t2.includes(t1)));
  }

  /**
   * Extract topics from question
   */
  _extractTopics(question) {
    const keywords = [
      'auth',
      'authentication',
      'method',
      'token',
      'expiry',
      'password',
      'database',
      'db',
      'api',
      'endpoint',
      'cache',
      'performance',
      'test',
      'security',
      'encrypt',
      'role',
      'permission',
      'migration',
      'schema',
      'index',
      'backup',
      'rate',
      'limit',
      'version',
      'jwt',
      'oauth',
    ];

    const words = question.toLowerCase().split(/\s+/);
    return words.filter(w => keywords.includes(w) || keywords.some(k => w.includes(k)));
  }

  /**
   * Generate alternative phrasings
   */
  _generateAlternatives(question) {
    const alternatives = [
      question.replace('What ', 'Which '),
      question.replace('?', ' do you prefer?'),
      question.replace('will you', 'should the system'),
    ];
    return alternatives.filter(a => a !== question).slice(0, 2);
  }

  /**
   * Calculate answer quality (0-1 scale)
   */
  _calculateAnswerQuality(answer) {
    if (!answer || answer.trim().length === 0) return 0;

    // Quality based on length and detail
    const length = answer.length;
    if (length < 10) return 0.3;
    if (length < 30) return 0.5;
    if (length < 60) return 0.7;
    return 0.9;
  }
}

module.exports = { AdaptiveQuestioner };
