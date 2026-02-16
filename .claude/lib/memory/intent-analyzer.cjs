'use strict';

const { ModelClient } = require('../clients/model-client.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { getIntentAnalysisPrompt } = require('./prompts/intent-analysis.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

const logger = createLogger('intent-analyzer');

function stripCodeFences(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function normalizeContextType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'skill' || normalized === 'resource' || normalized === 'memory') {
    return normalized;
  }
  return null;
}

function normalizeCategory(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'profile' ||
    normalized === 'preferences' ||
    normalized === 'entities' ||
    normalized === 'events' ||
    normalized === 'cases' ||
    normalized === 'patterns'
  ) {
    return normalized;
  }
  return null;
}

function normalizePriority(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 3;
  return Math.max(1, Math.min(5, Math.round(num)));
}

async function analyzeIntent(context, options = {}) {
  const compressionSummary = context?.compressionSummary || '';
  const recentMessages = context?.recentMessages || '';
  const currentMessage = context?.currentMessage || '';
  const contextType = options.contextType || '';
  const targetAbstract = options.targetAbstract || '';
  const modelClient = options.modelClient || new ModelClient();

  const { system, user } = getIntentAnalysisPrompt(
    compressionSummary,
    recentMessages,
    currentMessage,
    contextType,
    targetAbstract
  );

  try {
    const response = await modelClient.generateText({ system, messages: user });
    const payload = stripCodeFences(response);
    const parsed = safeParseJSON(payload);
    const rawQueries = Array.isArray(parsed?.queries) ? parsed.queries : [];

    const queries = rawQueries
      .map(query => ({
        query: typeof query?.query === 'string' ? query.query.trim() : '',
        context_type: normalizeContextType(query?.context_type),
        category: normalizeCategory(query?.category),
        intent: typeof query?.intent === 'string' ? query.intent.trim() : '',
        priority: normalizePriority(query?.priority),
      }))
      .filter(entry => entry.query.length > 0 && entry.context_type);

    return {
      reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : '',
      queries,
      sessionContext: {
        compressionSummary,
        recentMessages,
        currentMessage,
      },
    };
  } catch (error) {
    logger.warn('Intent analysis failed', { error: error.message });
    return {
      reasoning: '',
      queries: [],
      sessionContext: {
        compressionSummary,
        recentMessages,
        currentMessage,
      },
    };
  }
}

module.exports = {
  analyzeIntent,
  stripCodeFences,
  normalizeContextType,
  normalizeCategory,
  normalizePriority,
};
