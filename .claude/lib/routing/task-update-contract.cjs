'use strict';

const VALID_TASK_STATUSES = Object.freeze(['pending', 'in_progress', 'completed', 'deleted']);

function normalizeStatus(rawStatus) {
  if (rawStatus == null) return null;
  return String(rawStatus).trim().toLowerCase().replace(/-/g, '_');
}

function normalizeTaskUpdatePayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const rawTaskId = source.taskId ?? source.task_id ?? source.id ?? null;
  const rawStatus = source.status ?? null;
  const metadata =
    source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata
      : {};

  return {
    taskId: rawTaskId != null && String(rawTaskId).trim().length > 0 ? String(rawTaskId) : null,
    status: normalizeStatus(rawStatus),
    metadata,
    raw: source,
  };
}

function validateTaskUpdatePayload(normalized, options = {}) {
  const requireTaskId = options.requireTaskId !== false;
  const requireStatus = options.requireStatus !== false;
  const errors = [];

  if (requireTaskId && !normalized.taskId) {
    errors.push('Missing required field: taskId');
  }

  if (requireStatus && !normalized.status) {
    errors.push('Missing required field: status');
  } else if (
    normalized.status &&
    Array.isArray(options.allowedStatuses || VALID_TASK_STATUSES) &&
    !(options.allowedStatuses || VALID_TASK_STATUSES).includes(normalized.status)
  ) {
    errors.push(
      `Invalid status value: "${normalized.status}". Valid statuses: ${(options.allowedStatuses || VALID_TASK_STATUSES).join(', ')}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function parseAndValidateTaskUpdate(payload = {}, options = {}) {
  const normalized = normalizeTaskUpdatePayload(payload);
  const validation = validateTaskUpdatePayload(normalized, options);
  return {
    ...validation,
    normalized,
  };
}

module.exports = {
  VALID_TASK_STATUSES,
  normalizeStatus,
  normalizeTaskUpdatePayload,
  validateTaskUpdatePayload,
  parseAndValidateTaskUpdate,
};
