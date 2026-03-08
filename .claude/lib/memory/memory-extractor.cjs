'use strict';

const { ModelClient } = require('../clients/model-client.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { getMemoryExtractionPrompt } = require('./prompts/memory-extraction.cjs');

const logger = createLogger('memory-extractor');

/**
 * Score the importance of a memory record based on its text content.
 * Returns a value in [0.1, 0.95].
 *
 * @param {string} text - The memory text to score
 * @returns {number} Importance score between 0.1 and 0.95
 */
function scoreImportance(text) {
  let score = 0.5;
  if (/CRITICAL|P0|IRON LAW|NEVER/i.test(text)) score = 0.9;
  else if (/P1|BLOCKING|MANDATORY/i.test(text)) score = 0.75;
  else if (/note:|pattern:|gotcha:/i.test(text)) score = 0.7;
  else if (/resolved|fixed|completed/i.test(text)) score = 0.4;
  if (text.length < 50) score = Math.max(0.1, score - 0.1);
  return Math.min(0.95, Math.max(0.1, score));
}
const RECENT_MESSAGES_LIMIT = Number(process.env.MEMORY_EXTRACTION_RECENT_MESSAGES_LIMIT || 40);
const RECENT_MESSAGES_MAX_CHARS = Number(process.env.MEMORY_EXTRACTION_RECENT_CHARS_LIMIT || 8000);
const LIST_LIMIT = Number(process.env.MEMORY_EXTRACTION_LIST_LIMIT || 12);

function buildRecentMessages(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') return '';

  if (Array.isArray(sessionData.recent_messages) && sessionData.recent_messages.length > 0) {
    const recent = sessionData.recent_messages.slice(-RECENT_MESSAGES_LIMIT);
    const joined = recent
      .map(entry => {
        if (!entry || typeof entry !== 'object') return '';
        const role = entry.role || 'unknown';
        const content = entry.content || '';
        return `[${role}]: ${content}`;
      })
      .filter(Boolean)
      .join('\n');

    if (joined.length > RECENT_MESSAGES_MAX_CHARS) {
      return joined.slice(-RECENT_MESSAGES_MAX_CHARS);
    }
    return joined;
  }

  const parts = [];
  if (sessionData.summary) {
    parts.push(`Session summary:\n${sessionData.summary}`);
  }
  if (Array.isArray(sessionData.decisions_made) && sessionData.decisions_made.length > 0) {
    const decisions = sessionData.decisions_made.slice(0, LIST_LIMIT);
    parts.push(`Decisions:\n- ${decisions.join('\n- ')}`);
  }
  if (Array.isArray(sessionData.patterns_found) && sessionData.patterns_found.length > 0) {
    const patterns = sessionData.patterns_found.slice(0, LIST_LIMIT);
    parts.push(`Patterns:\n- ${patterns.join('\n- ')}`);
  }
  if (
    Array.isArray(sessionData.gotchas_encountered) &&
    sessionData.gotchas_encountered.length > 0
  ) {
    const gotchas = sessionData.gotchas_encountered.slice(0, LIST_LIMIT);
    parts.push(`Gotchas:\n- ${gotchas.join('\n- ')}`);
  }
  if (Array.isArray(sessionData.tasks_completed) && sessionData.tasks_completed.length > 0) {
    const tasks = sessionData.tasks_completed.slice(0, LIST_LIMIT);
    parts.push(`Tasks completed:\n- ${tasks.join('\n- ')}`);
  }

  const joined = parts.join('\n\n');
  if (joined.length > RECENT_MESSAGES_MAX_CHARS) {
    return joined.slice(-RECENT_MESSAGES_MAX_CHARS);
  }
  return joined;
}

function buildFallbackCandidate(category, text, tag) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const label = tag ? `${tag}: ${clean}` : clean;
  return {
    category,
    abstract: label.slice(0, 80),
    overview: label,
    content: clean,
    importance: scoreImportance(clean),
  };
}

function fallbackExtractMemories(sessionData) {
  const candidates = [];
  const patterns = Array.isArray(sessionData?.patterns_found) ? sessionData.patterns_found : [];
  const gotchas = Array.isArray(sessionData?.gotchas_encountered)
    ? sessionData.gotchas_encountered
    : [];
  const decisions = Array.isArray(sessionData?.decisions_made) ? sessionData.decisions_made : [];
  const tasks = Array.isArray(sessionData?.tasks_completed) ? sessionData.tasks_completed : [];

  for (const item of patterns) {
    const candidate = buildFallbackCandidate('patterns', item, 'Pattern');
    if (candidate) candidates.push(candidate);
  }
  for (const item of gotchas) {
    const candidate = buildFallbackCandidate('cases', item, 'Gotcha');
    if (candidate) candidates.push(candidate);
  }
  for (const item of decisions) {
    const candidate = buildFallbackCandidate('events', item, 'Decision');
    if (candidate) candidates.push(candidate);
  }
  for (const item of tasks) {
    const candidate = buildFallbackCandidate('events', item, 'Task');
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

function extractCandidatesFromText(text) {
  const candidates = [];
  if (!text) return candidates;
  const lines = String(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const add = (category, line, tag) => {
    const candidate = buildFallbackCandidate(category, line, tag);
    if (candidate) candidates.push(candidate);
  };

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('pattern:') || lower.includes('pattern -')) {
      add('patterns', line.replace(/^pattern:\s*/i, ''), 'Pattern');
      continue;
    }
    if (lower.startsWith('gotcha:') || lower.includes('gotcha -')) {
      add('cases', line.replace(/^gotcha:\s*/i, ''), 'Gotcha');
      continue;
    }
    if (lower.startsWith('decision:') || lower.includes('decision -')) {
      add('events', line.replace(/^decision:\s*/i, ''), 'Decision');
      continue;
    }
    if (lower.startsWith('lesson:') || lower.startsWith('remember:')) {
      add('patterns', line.replace(/^(lesson|remember):\s*/i, ''), 'Lesson');
    }
  }

  return candidates;
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  const payload = fenced ? fenced[1] : trimmed;
  return payload.trim();
}

async function extractMemoriesFromSession(sessionData, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const user = options.user || 'default';
  const feedback = options.feedback || '';
  const summary = options.summary || '';
  const modelClient = options.modelClient || new ModelClient();

  const recentMessages = buildRecentMessages(sessionData);
  const { system, user: userPrompt } = getMemoryExtractionPrompt(
    recentMessages,
    user,
    feedback,
    summary
  );

  if (typeof modelClient.isMockMode === 'function' && modelClient.isMockMode()) {
    const fallback = fallbackExtractMemories(sessionData);
    if (fallback.length > 0) {
      logger.warn('Memory extraction mock mode fallback used', { count: fallback.length });
      return fallback;
    }
    const heuristic = extractCandidatesFromText(recentMessages);
    if (heuristic.length > 0) {
      logger.warn('Memory extraction mock mode heuristic used', { count: heuristic.length });
      return heuristic;
    }
  }

  try {
    const response = await modelClient.generateText({ system, messages: userPrompt });
    const jsonPayload = extractJson(response);
    if (!jsonPayload) {
      return [];
    }
    const parsed = JSON.parse(jsonPayload);
    if (!parsed || !Array.isArray(parsed.memories)) {
      return fallbackExtractMemories(sessionData);
    }
    return parsed.memories.map(record => ({
      ...record,
      importance: scoreImportance(record.text || record.content || record.overview || ''),
    }));
  } catch (error) {
    logger.warn('Memory extraction failed', {
      error: error.message,
      projectRoot,
    });
    const fallback = fallbackExtractMemories(sessionData);
    if (fallback.length > 0) {
      logger.warn('Memory extraction fallback used', { count: fallback.length });
      return fallback;
    }
    const heuristic = extractCandidatesFromText(recentMessages);
    if (heuristic.length > 0) {
      logger.warn('Memory extraction heuristic fallback used', { count: heuristic.length });
      return heuristic;
    }
    return [];
  }
}

module.exports = {
  scoreImportance,
  buildRecentMessages,
  extractMemoriesFromSession,
  fallbackExtractMemories,
  extractCandidatesFromText,
};
