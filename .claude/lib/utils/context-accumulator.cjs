/**
 * SPEC-009: Context Accumulator
 *
 * Accumulates answers with metadata, detects conflicts, suggests skips
 *
 * GREEN Phase: Minimal implementation to pass tests
 */

/**
 * ContextAccumulator - Stores answers with relevance scoring
 */
class ContextAccumulator {
  constructor() {
    this.answers = [];
  }

  /**
   * Add answer with metadata
   * @param {string} question
   * @param {string} answer
   * @param {Object} metadata
   */
  addAnswer(question, answer, metadata = {}) {
    const relevance = this._calculateRelevance(answer);
    const quality = this._calculateQuality(answer);

    this.answers.push({
      question,
      answer,
      timestamp: new Date().toISOString(),
      relevance,
      quality,
      ...metadata,
    });
  }

  /**
   * Get accumulated context
   * @returns {Object} - { answers, completeness }
   */
  getContext() {
    const completeness = this._calculateCompleteness();
    return {
      answers: this.answers,
      completeness,
    };
  }

  /**
   * Detect conflicts in answers
   * @returns {Array<string>} - Array of conflict descriptions
   */
  detectConflicts() {
    const conflicts = [];

    // Group answers by topic
    const topics = {};
    this.answers.forEach(a => {
      const topicWords = this._extractTopics(a.question);
      topicWords.forEach(topic => {
        if (!topics[topic]) topics[topic] = [];
        topics[topic].push(a);
      });
    });

    // Check for conflicting answers on same topic
    Object.keys(topics).forEach(topic => {
      const topicAnswers = topics[topic];
      if (topicAnswers.length > 1) {
        const uniqueAnswers = new Set(topicAnswers.map(a => a.answer.toLowerCase()));
        if (uniqueAnswers.size > 1) {
          conflicts.push(
            `Conflicting answers about ${topic}: ${Array.from(uniqueAnswers).join(' vs ')}`
          );
        }
      }
    });

    return conflicts;
  }

  /**
   * Suggest skipping a question if context already answers it
   * @param {string} question
   * @param {Object} context
   * @returns {boolean}
   */
  suggestSkip(question, _context) {
    const questionTopics = this._extractTopics(question);
    const answeredTopics = this.answers.map(a => this._extractTopics(a.question)).flat();

    // Skip if question topics already answered
    return questionTopics.some(qt => answeredTopics.some(at => at.includes(qt) || qt.includes(at)));
  }

  /**
   * Build human-readable summary
   * @returns {string}
   */
  buildSummary() {
    if (this.answers.length === 0) return 'No answers collected yet.';

    const lines = this.answers.map(a => {
      return `- ${a.question} → ${a.answer}`;
    });

    return lines.join('\n');
  }

  /**
   * Calculate relevance score (0-1)
   */
  _calculateRelevance(answer) {
    // More detailed answers have higher relevance
    const length = answer.length;
    if (length < 10) return 0.3;
    if (length < 30) return 0.5;
    if (length < 60) return 0.7;
    return 0.9;
  }

  /**
   * Calculate quality score (0-1)
   */
  _calculateQuality(answer) {
    if (!answer || answer.trim().length === 0) return 0;

    // Quality based on length and detail
    const length = answer.length;
    if (length < 10) return 0.3;
    if (length < 30) return 0.5;
    if (length < 60) return 0.7;
    return 0.9;
  }

  /**
   * Calculate completeness (0-1)
   */
  _calculateCompleteness() {
    const count = this.answers.length;
    if (count === 0) return 0;
    if (count < 3) return 0.3;
    if (count < 5) return 0.6;
    if (count < 7) return 0.8;
    return 1.0;
  }

  /**
   * Extract topics from question
   */
  _extractTopics(question) {
    const keywords = [
      'auth',
      'authentication',
      'token',
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
      'mysql',
      'postgresql',
      'postgres',
    ];

    const words = question.toLowerCase().split(/\s+/);
    const matches = words.filter(w => keywords.includes(w) || keywords.some(k => w.includes(k)));

    // Also extract from question text (e.g., "Database?" -> ["database"])
    const questionWords = question.toLowerCase().match(/\b(\w+)\b/g) || [];
    keywords.forEach(kw => {
      if (questionWords.some(qw => qw.includes(kw) || kw.includes(qw))) {
        matches.push(kw);
      }
    });

    return [...new Set(matches)]; // Deduplicate
  }
}

module.exports = { ContextAccumulator };
