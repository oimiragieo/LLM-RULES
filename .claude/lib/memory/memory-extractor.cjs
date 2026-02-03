'use strict';

const { ModelClient } = require('../clients/model-client.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { getMemoryExtractionPrompt } = require('./prompts/memory-extraction.cjs');

const logger = createLogger('memory-extractor');

function buildRecentMessages(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') return '';

  if (Array.isArray(sessionData.recent_messages) && sessionData.recent_messages.length > 0) {
    return sessionData.recent_messages
      .map(entry => {
        if (!entry || typeof entry !== 'object') return '';
        const role = entry.role || 'unknown';
        const content = entry.content || '';
        return `[${role}]: ${content}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  const parts = [];
  if (sessionData.summary) {
    parts.push(`Session summary:\n${sessionData.summary}`);
  }
  if (Array.isArray(sessionData.decisions_made) && sessionData.decisions_made.length > 0) {
    parts.push(`Decisions:\n- ${sessionData.decisions_made.join('\n- ')}`);
  }
  if (Array.isArray(sessionData.patterns_found) && sessionData.patterns_found.length > 0) {
    parts.push(`Patterns:\n- ${sessionData.patterns_found.join('\n- ')}`);
  }
  if (
    Array.isArray(sessionData.gotchas_encountered) &&
    sessionData.gotchas_encountered.length > 0
  ) {
    parts.push(`Gotchas:\n- ${sessionData.gotchas_encountered.join('\n- ')}`);
  }
  if (Array.isArray(sessionData.tasks_completed) && sessionData.tasks_completed.length > 0) {
    parts.push(`Tasks completed:\n- ${sessionData.tasks_completed.join('\n- ')}`);
  }

  return parts.join('\n\n');
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

  try {
    const response = await modelClient.generateText({ system, messages: userPrompt });
    const jsonPayload = extractJson(response);
    if (!jsonPayload) {
      return [];
    }
    const parsed = JSON.parse(jsonPayload);
    if (!parsed || !Array.isArray(parsed.memories)) {
      return [];
    }
    return parsed.memories;
  } catch (error) {
    logger.warn('Memory extraction failed', {
      error: error.message,
      projectRoot,
    });
    return [];
  }
}

module.exports = {
  buildRecentMessages,
  extractMemoriesFromSession,
};
