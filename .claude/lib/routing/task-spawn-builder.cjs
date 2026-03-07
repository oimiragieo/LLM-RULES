'use strict';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function generateFallbackTaskId(hookInput, toolInput) {
  const rawSessionId =
    hookInput?.session_id || hookInput?.sessionId || process.env.CLAUDE_SESSION_ID || 'session';
  const sessionPart =
    String(rawSessionId || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 12) || 'session';
  const description =
    typeof toolInput?.description === 'string' ? toolInput.description.toLowerCase() : '';
  const hint =
    description
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'spawn';
  return `task-${sessionPart}-${hint}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function deriveDescriptionFromPrompt(prompt) {
  if (!isNonEmptyString(prompt)) {
    return 'Task execution';
  }
  const firstLine = String(prompt)
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return 'Task execution';
  }
  const normalized = firstLine
    .replace(/^you are\b[:\s-]*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return 'Task execution';
  }
  return normalized.slice(0, 120);
}

function normalizeTaskSpawnInput(toolInput, hookInput) {
  const next = { ...(toolInput || {}) };
  let modified = false;

  const currentTaskId = next.task_id || next.id || null;
  if (typeof currentTaskId === 'string' || typeof currentTaskId === 'number') {
    if (next.task_id == null) {
      next.task_id = String(currentTaskId);
      modified = true;
    }
  } else {
    next.task_id = generateFallbackTaskId(hookInput, next);
    modified = true;
  }

  if (!isNonEmptyString(next.description)) {
    next.description = deriveDescriptionFromPrompt(next.prompt || '');
    modified = true;
  }

  return {
    toolInput: next,
    modified,
    taskId: String(next.task_id),
  };
}

module.exports = {
  normalizeTaskSpawnInput,
  deriveDescriptionFromPrompt,
  generateFallbackTaskId,
};
