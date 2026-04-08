'use strict';

const VALID_TASK_STATUSES = Object.freeze(['pending', 'in_progress', 'completed', 'deleted']);

// Metadata size caps — prevents agents from dumping unlimited test output into API context
const MAX_METADATA_FIELD_CHARS = 2048;
const MAX_METADATA_TOTAL_CHARS = 4096;
const TRUNCATION_SUFFIX = '[TRUNCATED]';

// Fields to preserve during total-size truncation (removed last)
const PRESERVED_FIELDS = new Set(['summary', 'filesModified', 'filesCreated', '_truncated']);

function normalizeStatus(rawStatus) {
  if (rawStatus == null) return null;
  return String(rawStatus).trim().toLowerCase().replace(/-/g, '_');
}

/**
 * Cap metadata field sizes and total serialized size.
 * Truncates long strings, preserves arrays and essential fields.
 */
function capMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata;

  const result = { ...metadata };
  let truncated = false;

  // Cap individual string fields
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.length > MAX_METADATA_FIELD_CHARS) {
      const maxContent = MAX_METADATA_FIELD_CHARS - TRUNCATION_SUFFIX.length;
      result[key] = value.slice(0, maxContent) + TRUNCATION_SUFFIX;
      truncated = true;
    }
  }

  // Check total serialized size — remove largest non-essential fields until under cap
  let serialized = JSON.stringify(result);
  while (serialized.length > MAX_METADATA_TOTAL_CHARS) {
    // Find largest non-essential string field to remove
    let largestKey = null;
    let largestSize = 0;
    for (const [key, value] of Object.entries(result)) {
      if (PRESERVED_FIELDS.has(key)) continue;
      const size = typeof value === 'string' ? value.length : JSON.stringify(value).length;
      if (size > largestSize) {
        largestSize = size;
        largestKey = key;
      }
    }
    if (!largestKey) break; // Only preserved fields remain
    delete result[largestKey];
    truncated = true;
    serialized = JSON.stringify(result);
  }

  if (truncated) result._truncated = true;
  return result;
}

function normalizeTaskUpdatePayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const rawTaskId = source.taskId ?? source.task_id ?? source.id ?? null;
  const rawStatus = source.status ?? null;
  const rawMetadata =
    source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata
      : {};

  return {
    taskId: rawTaskId != null && String(rawTaskId).trim().length > 0 ? String(rawTaskId) : null,
    status: normalizeStatus(rawStatus),
    metadata: capMetadata(rawMetadata),
    raw: source,
  };
}

function validateTaskUpdatePayload(normalized, options = {}) {
  const requireTaskId = options.requireTaskId !== false;
  const requireStatus = options.requireStatus !== false;
  const requireCompletionMetadata = options.requireCompletionMetadata === true;
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

  if (requireCompletionMetadata && normalized.status === 'completed') {
    const summary = normalized.metadata && normalized.metadata.summary;
    if (typeof summary !== 'string' || summary.trim().length === 0) {
      errors.push('Missing required completion metadata: metadata.summary');
    }
    const filesModified = Array.isArray(normalized.metadata?.filesModified)
      ? normalized.metadata.filesModified
      : [];
    const filesCreated = Array.isArray(normalized.metadata?.filesCreated)
      ? normalized.metadata.filesCreated
      : [];
    if (filesModified.length === 0 && filesCreated.length === 0) {
      errors.push(
        'Missing required completion metadata: metadata.filesModified or metadata.filesCreated'
      );
    }
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
  MAX_METADATA_FIELD_CHARS,
  MAX_METADATA_TOTAL_CHARS,
  normalizeStatus,
  normalizeTaskUpdatePayload,
  validateTaskUpdatePayload,
  parseAndValidateTaskUpdate,
  capMetadata,
};
