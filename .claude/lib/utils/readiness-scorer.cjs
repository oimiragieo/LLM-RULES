/**
 * SPEC-009: Readiness Scorer
 *
 * Calculates completeness, quality, consistency, and overall readiness
 *
 * GREEN Phase: Minimal implementation to pass tests
 */

/**
 * Score completeness (0-100)
 * @param {Array} answers - Array of answer objects
 * @param {Array} expectedFields - Array of expected field names
 * @returns {number} - 0-100
 */
function scoreCompleteness(answers, expectedFields) {
  if (expectedFields.length === 0) return 100;

  const answeredFields = answers.filter(a => a.answer && a.answer.trim().length > 0).length;
  const coverage = answeredFields / expectedFields.length;

  return Math.round(coverage * 100);
}

/**
 * Score quality (0-100)
 * @param {Array} answers - Array of { answer, quality } objects
 * @param {Array} domainPatterns - Domain-specific patterns
 * @returns {number} - 0-100
 */
function scoreQuality(answers, domainPatterns) {
  if (answers.length === 0) return 0;

  // Average quality from answers
  const avgQuality = answers.reduce((sum, a) => sum + (a.quality || 0), 0) / answers.length;

  // Base score from quality (0-1 scale to 0-100)
  let score = avgQuality * 100;

  // Bonus for pattern matches
  if (domainPatterns && domainPatterns.length > 0) {
    const matches = answers.filter(a => {
      const lower = a.answer.toLowerCase();
      return domainPatterns.some(pattern => {
        const keywords = pattern.toLowerCase().split(/\s+/);
        return keywords.some(kw => lower.includes(kw));
      });
    });
    const bonus = (matches.length / answers.length) * 10;
    score += bonus;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Score consistency (0-100)
 * @param {Array} answers - Array of answer objects
 * @param {Object} context - Accumulated context
 * @returns {number} - 0-100
 */
function scoreConsistency(answers, context) {
  if (answers.length === 0) return 100;

  let conflicts = 0;
  const topics = {};
  const canonicalTopic = topic => {
    if (topic === 'db') return 'database';
    if (topic === 'postgres' || topic === 'postgresql' || topic === 'mysql') return 'database';
    return topic;
  };

  // Group answers by topic
  answers.forEach(a => {
    const topicWords = extractTopics(a.question || a.answer);
    topicWords.forEach(topic => {
      const canonical = canonicalTopic(topic);
      if (!topics[canonical]) topics[canonical] = [];
      topics[canonical].push(a.answer);
    });
  });

  // Check for conflicting answers (different non-trivial answers to same topic)
  Object.keys(topics).forEach(topic => {
    const topicAnswers = topics[topic];
    if (topicAnswers.length > 1) {
      const normalized = topicAnswers.map(a => a.trim().toLowerCase());
      const uniqueAnswers = new Set(normalized);

      // Only count as conflict if answers are substantially different
      if (uniqueAnswers.size > 1) {
        // Check if they're contradictory (e.g., "PostgreSQL" vs "MySQL")
        const answerList = Array.from(uniqueAnswers);
        let hasContradiction = false;

        for (let i = 0; i < answerList.length; i++) {
          for (let j = i + 1; j < answerList.length; j++) {
            // Check if answers don't overlap at all (likely conflicting)
            const words1 = answerList[i].split(/\s+/);
            const words2 = answerList[j].split(/\s+/);
            const overlap = words1.filter(w => words2.includes(w));

            if (overlap.length === 0 && words1.length > 0 && words2.length > 0) {
              hasContradiction = true;
              break;
            }
          }
          if (hasContradiction) break;
        }

        if (hasContradiction) conflicts++;
      }
    }
  });

  // Check consistency with context
  Object.keys(context).forEach(key => {
    const contextValue = String(context[key]).toLowerCase();
    answers.forEach(a => {
      const answerValue = String(a.answer).toLowerCase();
      if (answerValue.includes(key.toLowerCase())) {
        if (!answerValue.includes(contextValue)) {
          conflicts++;
        }
      }
    });
  });

  const consistency = Math.max(0, 100 - conflicts * 60); // Penalize true contradictions heavily
  return Math.round(consistency);
}

/**
 * Compute overall readiness (0-100)
 * @param {Object} scores - { completeness, quality, consistency }
 * @returns {number} - 0-100
 */
function computeOverallReadiness(scores) {
  const { completeness, quality, consistency } = scores;

  // Weighted average: completeness (60%), quality (25%), consistency (15%)
  // Completeness is weighted highest as it's most critical
  const weighted = completeness * 0.6 + quality * 0.25 + consistency * 0.15;

  return Math.round(weighted);
}

/**
 * Extract topics from text
 */
function extractTopics(text) {
  if (!text) return [];

  const keywords = [
    'auth',
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
  ];

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.filter(w => keywords.includes(w) || keywords.some(k => w.includes(k)));
}

module.exports = {
  scoreCompleteness,
  scoreQuality,
  scoreConsistency,
  computeOverallReadiness,
};
