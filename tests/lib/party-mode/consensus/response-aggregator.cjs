'use strict';

function splitSentences(text) {
  return String(text || '')
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function extractKeyPoints(response) {
  const sentences = splitSentences(response?.content || response?.response || '');
  const decisions = sentences.filter(s => /\b(recommend|should|must|prefer|choice)\b/i.test(s));
  const concerns = sentences.filter(s =>
    /\b(concern|risk|risks|however|issue|problem|security)\b/i.test(s)
  );
  const actionItems = sentences.filter(s =>
    /\b(need to|write|update|implement|add|create)\b/i.test(s)
  );
  return { decisions, concerns, actionItems };
}

function identifyAgreements(responses) {
  const normalized = Array.isArray(responses) ? responses : [];
  const themes = [
    { key: 'typescript', pattern: /\btypescript\b/i },
    { key: 'caching', pattern: /\bcach(?:e|ing)\b/i },
  ];
  return themes
    .map(({ key, pattern }) => {
      const matches = normalized.filter(r => pattern.test(String(r?.content || r?.response || '')));
      if (matches.length < 2) return null;
      return {
        theme: key,
        agentIds: matches.map(r => r.agentId).filter(Boolean),
        confidence: matches.length / Math.max(normalized.length, 1),
      };
    })
    .filter(Boolean);
}

function identifyDisagreements(responses) {
  const normalized = Array.isArray(responses) ? responses : [];
  const conflicts = [];
  const hasPostgres = normalized.some(r =>
    /\bpostgres(?:ql)?\b/i.test(String(r?.content || r?.response || ''))
  );
  const hasMongo = normalized.some(r =>
    /\bmongodb\b/i.test(String(r?.content || r?.response || ''))
  );
  if (hasPostgres && hasMongo) {
    conflicts.push({
      topic: 'database',
      positions: normalized
        .filter(r => /\bpostgres(?:ql)?|mongodb\b/i.test(String(r?.content || r?.response || '')))
        .map(r => ({ agentId: r.agentId, stance: String(r?.content || r?.response || '') })),
    });
  }

  const hasJwt = normalized.some(r => /\bjwt\b/i.test(String(r?.content || r?.response || '')));
  const hasSession = normalized.some(r =>
    /\bsession\b/i.test(String(r?.content || r?.response || ''))
  );
  if (hasJwt && hasSession) {
    conflicts.push({
      topic: 'authentication',
      positions: normalized
        .filter(r => /\bjwt|session\b/i.test(String(r?.content || r?.response || '')))
        .map(r => ({ agentId: r.agentId, stance: String(r?.content || r?.response || '') })),
    });
  }
  return conflicts;
}

function aggregateResponses(sessionId, round, agentResponses) {
  const responses = (agentResponses || []).map(r => ({
    ...r,
    content: r.content || r.response || '',
  }));
  const agreements = identifyAgreements(responses);
  const disagreements = identifyDisagreements(responses);
  const summary =
    disagreements.length > 0
      ? `Agents disagree on ${disagreements.map(d => d.topic).join(', ')}.`
      : `Consensus found across ${agreements.length} theme(s).`;
  return { sessionId, round, agreements, disagreements, summary };
}

module.exports = {
  aggregateResponses,
  extractKeyPoints,
  identifyAgreements,
  identifyDisagreements,
};
