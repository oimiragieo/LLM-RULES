'use strict';

const path = require('path');
const { atomicWriteSync } = require('../utils/atomic-write.cjs');
const { ModelClient } = require('../clients/model-client.cjs');
const { createLogger } = require('../utils/logger.cjs');
const { PROJECT_ROOT, validatePathWithinProject } = require('../utils/project-root.cjs');
const { getSessionStructuredSummaryPrompt } = require('./prompts/session-structured-summary.cjs');

const logger = createLogger('session-summary');

function buildSessionContext(sessionData) {
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
  if (Array.isArray(sessionData.files_modified) && sessionData.files_modified.length > 0) {
    parts.push(`Files modified:\n- ${sessionData.files_modified.join('\n- ')}`);
  }

  return parts.join('\n\n');
}

function resolveSummaryPath({ mtmPath, projectRoot, sessionId }) {
  if (mtmPath && typeof mtmPath === 'string') {
    if (mtmPath.endsWith('.json')) {
      return mtmPath.replace(/\.json$/i, '.summary.md');
    }
    return `${mtmPath}.summary.md`;
  }

  const safeRoot = projectRoot || PROJECT_ROOT;
  const memoryDir = path.join(safeRoot, '.claude', 'context', 'memory', 'mtm');
  const filename = sessionId
    ? `session_${sessionId}.summary.md`
    : `session_${Date.now()}.summary.md`;
  return path.join(memoryDir, filename);
}

async function generateStructuredSummaryForSession(sessionData, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const modelClient = options.modelClient || new ModelClient();
  const sessionContext = buildSessionContext(sessionData);
  const { system, user } = getSessionStructuredSummaryPrompt(sessionContext);

  const summary = await modelClient.generateText({ system, messages: user });

  const summaryPath = resolveSummaryPath({
    mtmPath: options.mtmPath,
    projectRoot,
    sessionId: sessionData?.session_id,
  });

  const validation = validatePathWithinProject(summaryPath, projectRoot);
  if (!validation.safe) {
    throw new Error(`Invalid summary path: ${validation.reason}`);
  }

  atomicWriteSync(summaryPath, String(summary || ''));

  logger.info('Structured session summary written', { summaryPath });

  return { summary, summaryPath };
}

module.exports = {
  buildSessionContext,
  generateStructuredSummaryForSession,
};
