'use strict';

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const {
  ROUTING_TABLE,
  ROUTING_PREFIX_PATTERNS,
  ROUTING_PATTERNS,
  INTENT_KEYWORDS,
  getPreferredAgent,
} = require('./routing-table.cjs');
const { resolveByPattern } = require('./pattern-router.cjs');
const { fuzzyMatchIntent } = require('./fuzzy-intent-matcher.cjs');

const CAPABILITY_ROUTING_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'config',
  'capability-routing.json'
);

let capabilityRoutingCache = null;

function loadCapabilityRoutingForClassifier() {
  if (capabilityRoutingCache) return capabilityRoutingCache;
  try {
    const raw = fs.readFileSync(CAPABILITY_ROUTING_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    capabilityRoutingCache = {
      capabilityMap:
        parsed && parsed.capabilityMap && typeof parsed.capabilityMap === 'object'
          ? parsed.capabilityMap
          : null,
      defaultAgents:
        parsed && parsed.defaultAgents && typeof parsed.defaultAgents === 'object'
          ? parsed.defaultAgents
          : null,
      capabilityPriorityOrder:
        parsed && parsed.capabilityPriority && Array.isArray(parsed.capabilityPriority.order)
          ? parsed.capabilityPriority.order
          : [],
      routingConditions:
        parsed && parsed.routingConditions && typeof parsed.routingConditions === 'object'
          ? parsed.routingConditions
          : null,
    };
    return capabilityRoutingCache;
  } catch (_err) {
    capabilityRoutingCache = {
      capabilityMap: null,
      defaultAgents: null,
      capabilityPriorityOrder: [],
      routingConditions: null,
    };
    return capabilityRoutingCache;
  }
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
  for (const [intentKey, phrases] of Object.entries(INTENT_KEYWORDS)) {
    if (!Array.isArray(phrases)) continue;
    for (const phrase of phrases) {
      if (promptLower.includes(String(phrase || '').toLowerCase())) {
        return { intent: intentKey, source: 'intent_keywords' };
      }
    }
  }
  return null;
}

function matchIntentFromRoutingTable(promptLower) {
  for (const [keyword, _agent] of Object.entries(ROUTING_TABLE)) {
    if (promptLower.includes(keyword)) {
      return { intent: keyword, source: 'routing_table' };
    }
  }
  return null;
}

function matchIntentFromPrefixPatterns(promptLower) {
  if (!Array.isArray(ROUTING_PREFIX_PATTERNS) || ROUTING_PREFIX_PATTERNS.length === 0) return null;
  const words = promptLower.split(/\s+/).filter(Boolean);
  for (const entry of ROUTING_PREFIX_PATTERNS) {
    if (!entry || !entry.pattern || !entry.agent) continue;
    const pattern = String(entry.pattern).toLowerCase();
    const matched = words.some(word => word.startsWith(pattern)) || promptLower.includes(pattern);
    if (matched) {
      return { intent: pattern, agent: entry.agent, source: 'prefix' };
    }
  }
  return null;
}

function classifyIntent(prompt) {
  const normalizedPrompt = String(prompt || '').trim();
  if (normalizedPrompt.length < 2) {
    return {
      intent: 'general',
      capability: null,
      defaultAgent: null,
      confidence: 'low',
      source: 'none',
    };
  }

  const promptLower = normalizedPrompt.toLowerCase();
  let intent = 'general';
  let source = 'none';
  let defaultAgent = null;

  const keywordMatch = matchIntentFromKeywords(promptLower);
  if (keywordMatch) {
    intent = keywordMatch.intent;
    source = keywordMatch.source;
  } else {
    const routingMatch = matchIntentFromRoutingTable(promptLower);
    if (routingMatch) {
      intent = routingMatch.intent;
      source = routingMatch.source;
    }
  }

  if (intent === 'general') {
    const prefixMatch = matchIntentFromPrefixPatterns(promptLower);
    if (prefixMatch) {
      intent = prefixMatch.intent;
      source = prefixMatch.source;
      defaultAgent = prefixMatch.agent;
    }
  }

  if (intent === 'general' && !defaultAgent) {
    const patternMatch = resolveByPattern(promptLower, ROUTING_PATTERNS);
    if (patternMatch) {
      intent = patternMatch.agent;
      source = 'pattern';
      defaultAgent = getPreferredAgent(patternMatch.agent) ?? patternMatch.agent;
    }
  }

  if (intent === 'general' && !defaultAgent) {
    const fuzzyMatch = fuzzyMatchIntent(promptLower, INTENT_KEYWORDS, { threshold: 0.6 });
    if (fuzzyMatch) {
      intent = fuzzyMatch.intent;
      source = 'fuzzy';
      defaultAgent = getPreferredAgent(fuzzyMatch.intent);
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
    const intentCapability = capRouting.capabilityMap[intent];
    if (intentCapability && !matchingCapabilities.includes(intentCapability)) {
      matchingCapabilities.push(intentCapability);
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
      defaultAgent = getPreferredAgent(intent);
    }
  }

  const hasIntent = intent !== 'general';
  const hasCapability = Boolean(capability);
  const confidence =
    hasIntent && hasCapability ? 'high' : hasIntent || hasCapability ? 'medium' : 'low';

  return {
    intent,
    capability,
    defaultAgent,
    confidence,
    source,
  };
}

module.exports = {
  classifyIntent,
  evaluateRoutingCondition,
  loadCapabilityRoutingForClassifier,
};
