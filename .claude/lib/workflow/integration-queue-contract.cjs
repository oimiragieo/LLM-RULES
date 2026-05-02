'use strict';

const path = require('path');
const { PROJECT_ROOT } = require('../utils/project-root.cjs');
const { validateData } = require('../utils/schema-validator.cjs');

const INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'schemas',
  'integration-queue-entry.schema.json'
);

const VALID_ARTIFACT_TYPES = new Set([
  'agent',
  'skill',
  'hook',
  'workflow',
  'template',
  'schema',
  'tool',
  'rule',
  'command',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOwn(entry, key) {
  return Object.prototype.hasOwnProperty.call(entry, key);
}

function validateIntegrationQueueEntryShape(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return {
      valid: false,
      errors: [{ path: '/', message: 'entry must be an object', keyword: 'type' }],
    };
  }

  if (!isNonEmptyString(entry.timestamp)) errors.push('timestamp must be a non-empty string');
  if (!isNonEmptyString(entry.source)) errors.push('source must be a non-empty string');
  if (typeof entry.processed !== 'boolean') errors.push('processed must be a boolean');

  const hasPostCreationShape = [
    'artifactId',
    'creatorType',
    'changeType',
    'gaps',
    'priority',
  ].every(key => hasOwn(entry, key));
  const hasComplianceShape = ['artifactPath', 'artifactType', 'missingIntegration', 'detail'].every(
    key => hasOwn(entry, key)
  );

  if (hasPostCreationShape === hasComplianceShape) {
    errors.push('entry must match exactly one integration queue shape');
  }

  if (hasPostCreationShape) {
    if (!isNonEmptyString(entry.artifactId) || entry.artifactId === 'unknown:unknown') {
      errors.push('artifactId must be a known non-empty string');
    }
    if (!VALID_ARTIFACT_TYPES.has(entry.creatorType)) {
      errors.push('creatorType must be a known artifact type');
    }
    if (!['created', 'updated', 'deleted'].includes(entry.changeType)) {
      errors.push('changeType must be created, updated, or deleted');
    }
    if (!Array.isArray(entry.gaps) || entry.gaps.some(gap => !isNonEmptyString(gap))) {
      errors.push('gaps must be an array of non-empty strings');
    }
    if (!['P0', 'P1', 'P2', 'P3'].includes(entry.priority)) {
      errors.push('priority must be P0, P1, P2, or P3');
    }
  }

  if (hasComplianceShape) {
    if (!isNonEmptyString(entry.artifactPath)) {
      errors.push('artifactPath must be a non-empty string');
    }
    if (!VALID_ARTIFACT_TYPES.has(entry.artifactType)) {
      errors.push('artifactType must be a known artifact type');
    }
    if (!isNonEmptyString(entry.missingIntegration)) {
      errors.push('missingIntegration must be a non-empty string');
    }
    if (!isNonEmptyString(entry.detail)) {
      errors.push('detail must be a non-empty string');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.map(message => ({ path: '/', message, keyword: 'shape' })),
  };
}

function validateIntegrationQueueEntry(entry) {
  const schemaResult = validateData(entry, INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH);
  if (!schemaResult.skipped) {
    return schemaResult;
  }
  return validateIntegrationQueueEntryShape(entry);
}

function validateIntegrationQueueEntryForAppend(entry) {
  const validation = validateIntegrationQueueEntry(entry);
  if (validation.valid) return true;
  const details = (validation.errors || []).map(error => error.message).join('; ');
  process.stderr.write(
    `[post-creation-integration] Skipped malformed integration queue entry: ${
      details || 'schema validation failed'
    }\n`
  );
  return false;
}

module.exports = {
  INTEGRATION_QUEUE_ENTRY_SCHEMA_PATH,
  validateIntegrationQueueEntry,
  validateIntegrationQueueEntryForAppend,
  validateIntegrationQueueEntryShape,
};
