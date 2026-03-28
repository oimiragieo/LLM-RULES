'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const {
  ROUTING_TABLE,
  ROUTING_PREFIX_PATTERNS,
  ROUTING_PATTERNS,
  INTENT_KEYWORDS,
  INTENT_TO_AGENT,
  DISAMBIGUATION_RULES,
  getPreferredAgent,
} = require('./routing-table.cjs');
const { DOMAIN_ROUTING_TABLE } = require('./routing-table-hierarchical.cjs');
const { resolveByPattern } = require('./pattern-router.cjs');
const { fuzzyMatchIntent, fuzzyMatchIntentAlternatives } = require('./fuzzy-intent-matcher.cjs');
const { loadCapabilityRouting } = require('./capability-routing-loader.cjs');

const INTENT_FEEDBACK_PATH = path.join(PROJECT_ROOT, '.claude', 'config', 'intent-feedback.json');
const AGENT_TO_CANONICAL_INTENT = Object.entries(INTENT_TO_AGENT || {}).reduce(
  (acc, [intent, agent]) => {
    if (agent && !acc[agent]) {
      acc[agent] = intent;
    }
    return acc;
  },
  {}
);
const EXACT_INTENT_KEYWORD_MAP = Object.entries(INTENT_KEYWORDS || {}).reduce((acc, [intent, phrases]) => {
  if (!Array.isArray(phrases)) return acc;
  for (const phrase of phrases) {
    const normalized = String(phrase || '').trim().toLowerCase();
    if (normalized && !acc[normalized]) {
      acc[normalized] = intent;
    }
  }
  return acc;
}, {});

function loadCapabilityRoutingForClassifier() {
  return loadCapabilityRouting();
}

function matchesPromptKeyword(promptLower, keyword) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!promptLower || !normalizedKeyword) return false;

  const isTechnical =
    normalizedKeyword.includes('.') ||
    normalizedKeyword.includes('/') ||
    normalizedKeyword.includes('://') ||
    normalizedKeyword.includes('_');

  if (isTechnical) {
    return promptLower.includes(normalizedKeyword);
  }

  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`);
  return re.test(promptLower);
}

function getRoutingIntentMetadata(keyword, agent) {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  const publicIntent = EXACT_INTENT_KEYWORD_MAP[normalizedKeyword] || normalizedKeyword;
  const ruleIntent = EXACT_INTENT_KEYWORD_MAP[normalizedKeyword] || AGENT_TO_CANONICAL_INTENT[agent] || publicIntent;

  return {
    intent: publicIntent || 'general',
    ruleIntent: ruleIntent || publicIntent || 'general',
  };
}

function applyDisambiguation(intent, promptLower, defaultAgent) {
  const rules = DISAMBIGUATION_RULES?.[intent];
  let resolvedAgent = defaultAgent;
  let disambiguated = false;

  if (!Array.isArray(rules)) {
    return { defaultAgent: resolvedAgent, disambiguated };
  }

  for (const rule of rules) {
    if (Array.isArray(rule?.condition) && rule.condition.some(cond => promptLower.includes(String(cond).toLowerCase()))) {
      resolvedAgent = rule.prefer;
      disambiguated = true;
    }
  }

  return { defaultAgent: resolvedAgent, disambiguated };
}

function evaluateRoutingCondition(capability, prompt, conditions) {
  if (!conditions || !capability || !conditions[capability]) return true;
  const c = conditions[capability];
  const promptText = String(prompt || '');
  const promptLower = promptText.toLowerCase();
  if (Number.isFinite(c.minPromptLength) && promptText.length < c.minPromptLength) {
    return false;
  }
  if (Array.isArray(c.requireAnyKeyword) && c.requireAnyKeyword.length > 0) {
    const hasAny = c.requireAnyKeyword.some(kw =>
      promptLower.includes(String(kw || '').toLowerCase())
    );
    if (!hasAny) return false;
  }
  return true;
}

function matchIntentFromKeywords(promptLower) {
  let bestMatch = null;
  let bestScore = 0;

  for (const [intentKey, phrases] of Object.entries(INTENT_KEYWORDS)) {
    if (!Array.isArray(phrases)) continue;
    let matchCount = 0;
    let longestMatchLen = 0;

    for (const phrase of phrases) {
      const kw = String(phrase || '').toLowerCase();
      if (!kw) continue;

      if (matchesPromptKeyword(promptLower, kw)) {
        matchCount++;
        if (kw.length > longestMatchLen) {
          longestMatchLen = kw.length;
        }
      }
    }

    if (matchCount > 0) {
      // Score: prioritize more keyword matches, then longer matches
      const score = matchCount * 100 + longestMatchLen;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { intent: intentKey, source: 'intent_keywords', score };
      }
    }
  }

  return bestMatch;
}

function matchIntentFromRoutingTable(promptLower) {
  let bestMatch = null;
  let bestScore = 0;

  for (const [keyword, agent] of Object.entries(ROUTING_TABLE)) {
    if (!matchesPromptKeyword(promptLower, keyword)) continue;

    const keywordText = String(keyword || '').trim();
    const score = keywordText.split(/\s+/).filter(Boolean).length * 100 + keywordText.length;
    if (score > bestScore) {
      const metadata = getRoutingIntentMetadata(keywordText, agent);
      bestMatch = {
        intent: metadata.intent,
        ruleIntent: metadata.ruleIntent,
        defaultAgent: agent,
        source: 'routing_table',
      };
      bestScore = score;
    }
  }

  return bestMatch;
}

function matchDomainFromRoutingTable(promptLower) {
  let bestMatch = null;
  let bestScore = 0;

  for (const [keyword, entry] of Object.entries(DOMAIN_ROUTING_TABLE)) {
    if (!matchesPromptKeyword(promptLower, keyword)) continue;

    const keywordText = String(keyword || '').trim();
    const score = keywordText.split(/\s+/).filter(Boolean).length * 100 + keywordText.length;
    if (score > bestScore) {
      bestMatch = {
        ...entry,
        keyword: keywordText,
        source: 'hierarchical_table',
      };
      bestScore = score;
    }
  }

  return bestMatch;
}

function matchIntentFromPrefixPatterns(promptLower) {
  if (!Array.isArray(ROUTING_PREFIX_PATTERNS) || ROUTING_PREFIX_PATTERNS.length === 0) return null;
  const words = promptLower.split(/\s+/).filter(Boolean);
  for (const entry of ROUTING_PREFIX_PATTERNS) {
    if (!entry || !entry.pattern || !entry.agent) continue;
    const pattern = String(entry.pattern).toLowerCase();
    const matched = words.some(word => word.startsWith(pattern)) || promptLower.includes(pattern);
    if (matched) {
      const metadata = getRoutingIntentMetadata(pattern, entry.agent);
      return {
        intent: metadata.intent,
        ruleIntent: metadata.ruleIntent,
        defaultAgent: entry.agent,
        source: 'prefix',
      };
    }
  }
  return null;
}

function recordIntentFeedback(intentId, success, options = {}) {
  const maxEntries = Number.isFinite(options.maxEntries) ? options.maxEntries : 500;
  const feedbackPath = process.env.INTENT_FEEDBACK_PATH || INTENT_FEEDBACK_PATH;
  let payload = { version: '1.0', entries: [] };
  try {
    if (fs.existsSync(feedbackPath)) {
      const raw = fs.readFileSync(feedbackPath, 'utf8');
      const parsed = safeParseJSON(raw);
      if (parsed && Array.isArray(parsed.entries)) {
        payload = parsed;
      }
    }
  } catch (_err) {
    // Best effort - fall back to empty payload
  }

  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  entries.push({
    intentId: String(intentId || ''),
    success: Boolean(success),
    timestamp: Date.now(),
  });
  const trimmed = entries.slice(-Math.max(0, maxEntries));
  payload.entries = trimmed;

  try {
    atomicWriteJSONSync(feedbackPath, payload);
  } catch (_err) {
    // Best effort - do not throw on feedback writes
  }
}

function resolvePrimaryIntent(promptLower) {
  const routingMatch = matchIntentFromRoutingTable(promptLower);
  if (routingMatch) {
    return routingMatch;
  }

  const prefixMatch = matchIntentFromPrefixPatterns(promptLower);
  if (prefixMatch) {
    return prefixMatch;
  }

  const keywordMatch = matchIntentFromKeywords(promptLower);
  const patternMatch = resolveByPattern(promptLower, ROUTING_PATTERNS);
  if (patternMatch) {
    const patternIntent = AGENT_TO_CANONICAL_INTENT[patternMatch.agent] || patternMatch.agent;
    const patternAgent = getPreferredAgent(patternIntent) ?? patternMatch.agent;
    const keywordAgent = keywordMatch ? getPreferredAgent(keywordMatch.intent) : null;
    const preferKeywordOverPattern =
      keywordMatch &&
      ['developer', 'planner'].includes(patternAgent) &&
      keywordAgent &&
      !['developer', 'planner', 'general-assistant'].includes(keywordAgent) &&
      (Number(keywordMatch.score || 0) >= 200 ||
        ['artifact-integrator', 'framework_maintenance', 'researcher'].includes(
          keywordMatch.intent
        ));

    if (!preferKeywordOverPattern) {
      return {
        intent: patternIntent,
        ruleIntent: patternIntent,
        source: 'pattern',
        defaultAgent: patternAgent,
      };
    }
  }

  if (keywordMatch) {
    return {
      intent: keywordMatch.intent,
      ruleIntent: keywordMatch.intent,
      source: keywordMatch.source,
      defaultAgent: getPreferredAgent(keywordMatch.intent),
    };
  }

  const fuzzyMatch = fuzzyMatchIntent(promptLower, INTENT_KEYWORDS, { threshold: 0.6 });
  if (fuzzyMatch) {
    return {
      intent: fuzzyMatch.intent,
      ruleIntent: fuzzyMatch.intent,
      source: 'fuzzy',
      defaultAgent: getPreferredAgent(fuzzyMatch.intent),
    };
  }

  return {
    intent: 'general',
    ruleIntent: 'general',
    source: 'none',
    defaultAgent: null,
  };
}

function classifyIntent(prompt, options = {}) {
  const normalizedPrompt = String(prompt || '').trim();
  if (normalizedPrompt.length < 2) {
    return {
      intent: 'general',
      capability: null,
      defaultAgent: null,
      confidence: 'low',
      source: 'none',
      alternatives: [],
    };
  }

  const promptLower = normalizedPrompt.toLowerCase();
  const primaryIntent = resolvePrimaryIntent(promptLower);
  const intent = primaryIntent.intent;
  let intentForRules = primaryIntent.ruleIntent || primaryIntent.intent;
  let source = primaryIntent.source;
  let defaultAgent = primaryIntent.defaultAgent;

  if (!intentForRules || intentForRules === 'general') {
    intentForRules = intent;
  }

  if (intent !== 'general' && !defaultAgent) {
    defaultAgent = getPreferredAgent(intentForRules) || getPreferredAgent(intent);
  }

  if (intent !== 'general') {
    const disambiguation = applyDisambiguation(intentForRules, promptLower, defaultAgent);
    defaultAgent = disambiguation.defaultAgent;
    if (disambiguation.disambiguated) {
      source = 'disambiguation';
    }
  }

  const capRouting = loadCapabilityRoutingForClassifier();
  const matchingCapabilities = [];
  if (capRouting?.capabilityMap) {
    for (const [keyword, capabilityName] of Object.entries(capRouting.capabilityMap)) {
      if (promptLower.includes(keyword)) {
        matchingCapabilities.push(capabilityName);
      }
    }
    for (const intentCandidate of [intent, intentForRules]) {
      const intentCapability = capRouting.capabilityMap[intentCandidate];
      if (intentCapability && !matchingCapabilities.includes(intentCapability)) {
        matchingCapabilities.push(intentCapability);
      }
    }
  }

  let capability = null;
  if (matchingCapabilities.length > 0) {
    const order = Array.isArray(capRouting?.capabilityPriorityOrder)
      ? capRouting.capabilityPriorityOrder
      : [];
    matchingCapabilities.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    capability = matchingCapabilities[0];
  }

  if (
    capability &&
    !evaluateRoutingCondition(capability, normalizedPrompt, capRouting.routingConditions)
  ) {
    capability = null;
  }

  if (!defaultAgent) {
    if (capability && capRouting?.defaultAgents) {
      defaultAgent = capRouting.defaultAgents[capability] || null;
    } else {
      defaultAgent = getPreferredAgent(intentForRules) || getPreferredAgent(intent);
    }
  }

  const hasIntent = intent !== 'general';
  const hasCapability = Boolean(capability);
  const confidence =
    hasIntent && hasCapability ? 'high' : hasIntent || hasCapability ? 'medium' : 'low';

  let alternatives = [];
  if (options.includeAlternatives) {
    const maxAlternatives = Number.isFinite(options.maxAlternatives) ? options.maxAlternatives : 3;
    const fuzzyAlternatives = fuzzyMatchIntentAlternatives(promptLower, INTENT_KEYWORDS, {
      threshold: 0.5,
      maxCandidates: maxAlternatives + 5,
    });
    alternatives = fuzzyAlternatives
      .filter(candidate => candidate.intent !== intent)
      .slice(0, Math.max(0, maxAlternatives))
      .map(candidate => ({
        intent: candidate.intent,
        confidence: candidate.confidence,
        source: 'fuzzy',
      }));
  }

  return {
    intent,
    capability,
    defaultAgent,
    confidence,
    source,
    alternatives,
  };
}

function classifyDomain(prompt) {
  const normalizedPrompt = String(prompt || '').trim();
  if (normalizedPrompt.length < 2) {
    return {
      type: 'direct',
      agent: 'developer',
      source: 'default',
      keyword: null,
    };
  }

  const promptLower = normalizedPrompt.toLowerCase();
  const domainMatch = matchDomainFromRoutingTable(promptLower);
  if (domainMatch) {
    return domainMatch;
  }

  return {
    type: 'direct',
    agent: 'developer',
    source: 'default',
    keyword: null,
  };
}

function getHierarchicalRoutingMode(defaultMode = 'off') {
  const normalized = String(process.env.HIERARCHICAL_ROUTING || defaultMode || 'off')
    .trim()
    .toLowerCase();

  return normalized === 'on' ? 'on' : 'off';
}

function isHierarchicalRoutingEnabled(defaultMode = 'off') {
  return getHierarchicalRoutingMode(defaultMode) === 'on';
}

module.exports = {
  classifyIntent,
  classifyDomain,
  evaluateRoutingCondition,
  getHierarchicalRoutingMode,
  isHierarchicalRoutingEnabled,
  loadCapabilityRoutingForClassifier,
  recordIntentFeedback,
};
