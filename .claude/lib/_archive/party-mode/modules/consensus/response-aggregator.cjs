/**
 * Response Aggregator
 * Aggregates multiple agent responses into structured summary
 *
 * @module party-mode/consensus/response-aggregator
 */

/**
 * Extract key points from agent response
 * @param {object} response - Agent response object
 * @param {string} response.content - Response content (or response.response)
 * @param {string} response.agentId - Agent identifier
 * @param {string} response.agentType - Agent type
 * @returns {object} Key points: { decisions, actionItems, concerns }
 */
function extractKeyPoints(response) {
  // Handle both formats: response.content (direct) and response.response (from aggregateResponses)
  const content = response.content || response.response || '';

  const keyPoints = {
    decisions: [],
    actionItems: [],
    concerns: [],
  };

  // Extract decisions (recommendations, choices)
  const decisionPatterns = [
    /\b(?:recommend|suggest|propose|choose|use)\s+([^.!?]+)/gi,
    /\b(?:should|must|need to)\s+([^.!?]+)/gi,
  ];

  for (const pattern of decisionPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const decision = match[0].trim();
      if (decision.length > 10 && decision.length < 200) {
        keyPoints.decisions.push(decision);
      }
    }
  }

  // Extract action items (tasks, todos)
  const actionPatterns = [
    /\b(?:we need to|let me|should|must)\s+([^.!?]+)/gi,
    /\b(?:write|update|implement|create|add)\s+([^.!?]+)/gi,
  ];

  for (const pattern of actionPatterns) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const action = match[0].trim();
      if (action.length > 10 && action.length < 200) {
        keyPoints.actionItems.push(action);
      }
    }
  }

  // Extract concerns (risks, issues) - look for complete sentences
  const sentences = content.split(/[.!?]+/);
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    if (
      lowerSentence.includes('concern') ||
      lowerSentence.includes('risk') ||
      lowerSentence.includes('issue') ||
      lowerSentence.includes('problem') ||
      lowerSentence.includes('worry')
    ) {
      const trimmed = sentence.trim();
      if (trimmed.length > 15 && trimmed.length < 200) {
        keyPoints.concerns.push(trimmed);
      }
    }
  }

  // Deduplicate
  keyPoints.decisions = [...new Set(keyPoints.decisions)];
  keyPoints.actionItems = [...new Set(keyPoints.actionItems)];
  keyPoints.concerns = [...new Set(keyPoints.concerns)];

  return keyPoints;
}

/**
 * Identify agreements across agent responses
 * @param {Array<object>} responses - Array of agent responses
 * @returns {Array<object>} Agreements: [{ theme, agentIds, confidence }]
 */
function identifyAgreements(responses) {
  const agreements = [];
  const themes = new Map(); // theme -> Set<agentId>

  // Extract themes from each response
  for (const response of responses) {
    const content = (response.content || response.response || '').toLowerCase();
    const keywords = extractKeywords(content);

    for (const keyword of keywords) {
      if (!themes.has(keyword)) {
        themes.set(keyword, new Set());
      }
      themes.get(keyword).add(response.agentId);
    }
  }

  // Identify themes with 2+ agents agreeing
  for (const [theme, agentIds] of themes.entries()) {
    if (agentIds.size >= 2) {
      const confidence = agentIds.size / responses.length;
      agreements.push({
        theme,
        agentIds: Array.from(agentIds),
        confidence,
      });
    }
  }

  // Sort by confidence (highest first)
  agreements.sort((a, b) => b.confidence - a.confidence);

  return agreements;
}

/**
 * Extract keywords from content (simple NLP)
 * @param {string} content - Text content
 * @returns {Array<string>} Keywords
 */
function extractKeywords(content) {
  const keywords = [];
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'for',
    'to',
    'of',
    'in',
    'on',
    'at',
    'by',
    'with',
    'from',
    'as',
    'and',
    'or',
    'but',
    'if',
    'we',
    'i',
    'you',
    'they',
    'this',
    'that',
    'it',
    'should',
    'will',
    'can',
    'would',
  ]);

  // Extract 2-3 word phrases
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    keywords.push(bigram);

    if (i < words.length - 2) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      keywords.push(trigram);
    }
  }

  // Also include significant single words
  const significantWords = words.filter(
    w =>
      w.length > 5 ||
      /^(typescript|postgresql|mongodb|jwt|api|database|security|caching|test)$/.test(w)
  );
  keywords.push(...significantWords);

  return keywords;
}

/**
 * Identify disagreements in agent responses
 * @param {Array<object>} responses - Array of agent responses
 * @returns {Array<object>} Disagreements: [{ topic, positions: [{ agentId, stance }] }]
 */
function identifyDisagreements(responses) {
  const disagreements = [];

  // Look for explicit disagreement markers
  const disagreementMarkers = [
    'disagree',
    'however',
    'but',
    'alternatively',
    'instead',
    'prefer',
    'rather than',
  ];

  const responsesWithDisagreement = responses.filter(r => {
    const content = (r.content || r.response || '').toLowerCase();
    return disagreementMarkers.some(marker => content.includes(marker));
  });

  if (responsesWithDisagreement.length === 0) {
    return disagreements;
  }

  // Extract topics and stances
  const topics = new Map(); // topic -> [{ agentId, stance }]

  for (const response of responses) {
    const content = response.content || response.response || '';

    // Extract topic (look for database/framework/approach keywords)
    const topicKeywords = [
      { keyword: 'postgresql', topic: 'database' },
      { keyword: 'mongodb', topic: 'database' },
      { keyword: 'mysql', topic: 'database' },
      { keyword: 'database', topic: 'database' },
      { keyword: 'authentication', topic: 'authentication' },
      { keyword: 'jwt', topic: 'authentication' },
      { keyword: 'session', topic: 'authentication' },
      { keyword: 'cookie', topic: 'authentication' },
      { keyword: 'framework', topic: 'framework' },
      { keyword: 'architecture', topic: 'architecture' },
      { keyword: 'approach', topic: 'approach' },
      { keyword: 'technology', topic: 'technology' },
      { keyword: 'tool', topic: 'tool' },
    ];

    let topic = 'general';
    for (const { keyword, topic: topicName } of topicKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        topic = topicName;
        break;
      }
    }

    // Extract stance (main recommendation)
    const stanceMatch = content.match(
      /\b(?:recommend|prefer|suggest|choose|use)\s+([A-Za-z0-9\s]+?)(?:\s+for|\s+because|\.|,)/i
    );
    const stance = stanceMatch ? stanceMatch[1].trim() : content.substring(0, 100);

    if (!topics.has(topic)) {
      topics.set(topic, []);
    }

    topics.get(topic).push({
      agentId: response.agentId,
      agentType: response.agentType,
      stance,
    });
  }

  // Create disagreement objects for topics with conflicting stances
  for (const [topic, positions] of topics.entries()) {
    if (positions.length >= 2) {
      // Check if stances are different
      const uniqueStances = new Set(positions.map(p => p.stance.toLowerCase().substring(0, 20)));
      if (uniqueStances.size >= 2) {
        disagreements.push({
          topic,
          positions,
        });
      }
    }
  }

  return disagreements;
}

/**
 * Aggregate responses from multiple agents
 * @param {string} sessionId - Session identifier
 * @param {number} round - Round number
 * @param {Array<object>} agentResponses - Array of agent responses
 * @returns {object} Aggregated summary: { sessionId, round, agreements, disagreements, summary }
 */
function aggregateResponses(sessionId, round, agentResponses) {
  // Extract key points from all responses
  const allKeyPoints = agentResponses.map(extractKeyPoints);

  // Identify agreements and disagreements
  const agreements = identifyAgreements(agentResponses);
  const disagreements = identifyDisagreements(agentResponses);

  // Generate summary
  let summary = `Round ${round} with ${agentResponses.length} agents:\n`;

  if (agreements.length > 0) {
    const topAgreement = agreements[0];
    summary += `- Consensus: ${topAgreement.theme} (${Math.round(topAgreement.confidence * 100)}% agreement)\n`;
  }

  if (disagreements.length > 0) {
    summary += `- ${disagreements.length} point(s) of disagreement detected\n`;
    for (const disagreement of disagreements) {
      summary += `  * ${disagreement.topic}: ${disagreement.positions.length} different positions\n`;
    }
  }

  // Count total decisions and action items
  const totalDecisions = allKeyPoints.reduce((sum, kp) => sum + kp.decisions.length, 0);
  const totalActions = allKeyPoints.reduce((sum, kp) => sum + kp.actionItems.length, 0);
  const totalConcerns = allKeyPoints.reduce((sum, kp) => sum + kp.concerns.length, 0);

  summary += `- ${totalDecisions} decision(s), ${totalActions} action item(s), ${totalConcerns} concern(s) raised`;

  return {
    sessionId,
    round,
    agreements,
    disagreements,
    summary,
    keyPoints: allKeyPoints,
  };
}

module.exports = {
  aggregateResponses,
  extractKeyPoints,
  identifyAgreements,
  identifyDisagreements,
};
