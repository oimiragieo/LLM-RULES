'use strict';

const { ModelClient } = require('../clients/model-client.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { getDedupDecisionPrompt } = require('./prompts/dedup-decision.cjs');

const logger = createLogger('memory-deduplicator');

function stripCodeFences(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function normalizeDecision(decision) {
  if (!decision) return null;
  const normalized = String(decision).trim().toLowerCase();
  const allowed = new Set(['create', 'update', 'merge', 'skip']);
  return allowed.has(normalized) ? normalized : null;
}

function normalizeCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();
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

function formatExistingMemories(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return 'None';
  }

  return results
    .map((result, index) => {
      const content = result && result.content ? String(result.content) : '';
      const snippet = content.length > 400 ? `${content.slice(0, 400)}...` : content;
      const meta = result && result.metadata ? JSON.stringify(result.metadata) : '';
      const metaBlock = meta ? ` (meta: ${meta})` : '';
      return `${index + 1}. ${snippet}${metaBlock}`;
    })
    .join('\n');
}

async function deduplicateCandidate(candidate, context = {}) {
  const projectRoot = context.projectRoot || PROJECT_ROOT;
  const memoryManager = context.memoryManager || require('./memory-manager.cjs');
  const modelClient = context.modelClient || new ModelClient();
  const limit = Number.isFinite(context.limit) ? context.limit : 5;
  const threshold = Number.isFinite(context.threshold) ? context.threshold : 0.7;

  if (!candidate || typeof candidate !== 'object') {
    return {
      decision: 'skip',
      candidate,
      similarMemories: [],
      mergedContent: null,
      reason: 'Invalid candidate',
    };
  }

  const searchText = `${candidate.abstract || ''} ${candidate.content || ''}`.trim();
  if (!searchText) {
    return {
      decision: 'skip',
      candidate,
      similarMemories: [],
      mergedContent: null,
      reason: 'Empty candidate content',
    };
  }

  let results = [];
  try {
    const normalizedCategory = normalizeCategory(candidate.category);
    results = await memoryManager.searchMemory(searchText, {
      limit,
      threshold,
      category: normalizedCategory || undefined,
    });
  } catch (error) {
    logger.warn('Search for similar memories failed', {
      error: error.message,
      projectRoot,
    });
    results = [];
  }

  if (!results || results.length === 0) {
    return {
      decision: 'create',
      candidate,
      similarMemories: [],
      mergedContent: null,
      reason: 'No similar memories found',
    };
  }

  const existingMemories = formatExistingMemories(results);
  const { system, user } = getDedupDecisionPrompt(
    candidate.content || '',
    candidate.abstract || '',
    candidate.overview || '',
    existingMemories
  );

  try {
    const response = await modelClient.generateText({ system, messages: user });
    const payload = stripCodeFences(response);
    const parsed = JSON.parse(payload);
    const decision = normalizeDecision(parsed && parsed.decision);

    return {
      decision: decision || 'create',
      candidate,
      similarMemories: results,
      mergedContent: parsed && parsed.merged_content ? String(parsed.merged_content) : null,
      reason: parsed && parsed.reason ? String(parsed.reason) : '',
    };
  } catch (error) {
    logger.warn('Dedup decision failed; defaulting to create', {
      error: error.message,
      projectRoot,
    });
    return {
      decision: 'create',
      candidate,
      similarMemories: results,
      mergedContent: null,
      reason: 'Decision parse failed',
    };
  }
}

module.exports = {
  deduplicateCandidate,
  formatExistingMemories,
  normalizeDecision,
  normalizeCategory,
};
