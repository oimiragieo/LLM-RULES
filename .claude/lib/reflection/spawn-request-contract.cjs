'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { safeParseJSON } = require('../utils/safe-json.cjs');
const { atomicWriteJSONSync } = require('../utils/atomic-write.cjs');

const DEFAULT_MAX_ENTRIES = Number(process.env.REFLECTION_SPAWN_REQUEST_MAX_ENTRIES || 200);
const MAX_ID_LENGTH = 200;
const MAX_AGENT_LENGTH = 120;
const MAX_DESC_LENGTH = 500;
const MAX_PROMPT_LENGTH = Number(process.env.REFLECTION_SPAWN_REQUEST_MAX_PROMPT_CHARS || 12000);

let validateEntry = null;

function getEntryValidator() {
  if (validateEntry) return validateEntry;
  try {
    const schemaPath = path.join(
      __dirname,
      '..',
      '..',
      'schemas',
      'reflection-spawn-request.schema.json'
    );
    const schema = safeParseJSON(fs.readFileSync(schemaPath, 'utf8'), null);
    const itemSchema = schema && typeof schema === 'object' ? schema.items : null;
    if (!itemSchema) {
      validateEntry = () => true;
      return validateEntry;
    }
    const ajv = new Ajv({ allErrors: false, strict: false });
    addFormats(ajv);
    validateEntry = ajv.compile(itemSchema);
    return validateEntry;
  } catch (_err) {
    validateEntry = () => true;
    return validateEntry;
  }
}

function toSafeString(value, maxLen) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeRawToArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const numericKeys = Object.keys(parsed)
      .filter(key => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length > 0) {
      return numericKeys.map(key => parsed[key]);
    }
  }
  return [];
}

function sanitizeSpawnRequest(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

  const subagentType = toSafeString(entry.subagent_type, MAX_AGENT_LENGTH);
  const prompt = toSafeString(entry.prompt, MAX_PROMPT_LENGTH);
  if (!subagentType || !prompt) return null;

  const id = toSafeString(entry.id, MAX_ID_LENGTH) || `spawn-request-${index + 1}`;
  const description = toSafeString(entry.description, MAX_DESC_LENGTH) || '';
  const priorityRaw = toSafeString(entry?.source?.priority || entry.priority, 16);
  const priority = ['low', 'medium', 'high'].includes((priorityRaw || '').toLowerCase())
    ? priorityRaw.toLowerCase()
    : 'medium';

  const source = entry.source && typeof entry.source === 'object' ? entry.source : {};
  const timestamp = isIsoTimestamp(source.timestamp) ? source.timestamp : new Date().toISOString();
  const status = ['pending', 'acknowledged', 'completed'].includes(entry.status)
    ? entry.status
    : 'pending';

  return {
    id,
    status,
    subagent_type: subagentType,
    description,
    prompt,
    source: {
      trigger: toSafeString(source.trigger, 64) || 'unknown',
      timestamp,
      taskId: toSafeString(source.taskId, 128) || null,
      context: toSafeString(source.context, 128) || null,
      priority,
    },
  };
}

function acknowledgeRequests(filePath, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (!fs.existsSync(filePath)) return;
  const requests = readSpawnRequestsFile(filePath);
  const idSet = new Set(ids);

  const updated = requests.map(req => {
    if (idSet.has(req.id)) {
      return { ...req, status: 'acknowledged' };
    }
    return req;
  });

  atomicWriteJSONSync(filePath, updated);
}

function removeRequests(filePath, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  if (!fs.existsSync(filePath)) return;
  const requests = readSpawnRequestsFile(filePath);
  const idSet = new Set(ids);

  const filtered = requests.filter(req => !idSet.has(req.id));

  atomicWriteJSONSync(filePath, filtered);
}

function parseSpawnRequests(content, options = {}) {
  if (!content || typeof content !== 'string' || !content.trim()) return [];
  const maxEntries = Number(options.maxEntries || DEFAULT_MAX_ENTRIES);
  const parsed = safeParseJSON(content, null);
  const arr = normalizeRawToArray(parsed);
  if (!Array.isArray(arr) || arr.length === 0) return [];

  const result = [];
  const isValidEntry = getEntryValidator();
  for (let i = 0; i < arr.length; i++) {
    const sanitized = sanitizeSpawnRequest(arr[i], i);
    if (sanitized && isValidEntry(sanitized)) {
      result.push(sanitized);
      if (result.length >= maxEntries) break;
    }
  }
  return result;
}

function readSpawnRequestsFile(filePath, options = {}) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseSpawnRequests(content, options);
    if (options.maxAge != null) {
      const maxAgeMs = Number(options.maxAge);
      if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
        const cutoff = Date.now() - maxAgeMs;
        return parsed.filter(req => {
          const ts = Date.parse(req?.source?.timestamp || '');
          return Number.isFinite(ts) ? ts >= cutoff : true;
        });
      }
    }
    return parsed;
  } catch (_err) {
    return [];
  }
}

/**
 * Remove reflection spawn requests older than the specified age.
 * Used to prune stale cross-session requests that were never cleaned up
 * because agents completed without emitting processedReflectionIds.
 *
 * @param {string} filePath - Path to reflection-spawn-request.json
 * @param {number} maxAgeMs - Maximum age in milliseconds; entries older than this are removed
 * @returns {number} Count of removed entries
 */
function removeStaleRequests(filePath, maxAgeMs) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const requests = readSpawnRequestsFile(filePath);
    if (!Array.isArray(requests) || requests.length === 0) return 0;

    const cutoff = Date.now() - Number(maxAgeMs);
    const fresh = requests.filter(req => {
      const ts = Date.parse(req?.source?.timestamp || '');
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });

    const removedCount = requests.length - fresh.length;
    if (removedCount > 0) {
      atomicWriteJSONSync(filePath, fresh);
    }
    return removedCount;
  } catch (_err) {
    return 0;
  }
}

module.exports = {
  parseSpawnRequests,
  readSpawnRequestsFile,
  acknowledgeRequests,
  removeRequests,
  removeStaleRequests,
  sanitizeSpawnRequest,
  normalizeRawToArray,
  DEFAULT_MAX_ENTRIES,
};
