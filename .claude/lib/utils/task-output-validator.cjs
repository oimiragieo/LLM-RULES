'use strict';

/**
 * Error code constants for validation failures.
 * @type {Object<string, string>}
 */
const VALIDATION_ERRORS = {
  MISSING_SUMMARY: 'summary: required field missing',
  MISSING_FILES_MODIFIED: 'filesModified: required field missing',
  INVALID_SUMMARY_TYPE: 'summary: must be a string',
  SUMMARY_TOO_SHORT: 'summary: must be at least 10 characters',
  INVALID_FILES_MODIFIED_TYPE: 'filesModified: must be an array',
  INVALID_METADATA: 'metadata: must be a non-null object',
};

const SUMMARY_MIN_LENGTH = 10;

/**
 * Validate TaskUpdate(completed) metadata for required fields.
 *
 * Rules:
 *   - metadata must be a non-null object
 *   - summary: required, string, minimum 10 characters
 *   - filesModified: required, array (may be empty)
 *
 * This is a pure schema check — no I/O, no async, no network calls.
 * Designed to complete in well under 50ms for any input.
 *
 * @param {unknown} metadata - The metadata object from TaskUpdate(completed)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTaskOutput(metadata) {
  const errors = [];

  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    errors.push(VALIDATION_ERRORS.INVALID_METADATA);
    return { valid: false, errors };
  }

  // Validate summary
  if (!('summary' in metadata)) {
    errors.push(VALIDATION_ERRORS.MISSING_SUMMARY);
  } else if (typeof metadata.summary !== 'string') {
    errors.push(VALIDATION_ERRORS.INVALID_SUMMARY_TYPE);
  } else if (metadata.summary.length < SUMMARY_MIN_LENGTH) {
    errors.push(VALIDATION_ERRORS.SUMMARY_TOO_SHORT);
  }

  // Validate filesModified
  if (!('filesModified' in metadata)) {
    errors.push(VALIDATION_ERRORS.MISSING_FILES_MODIFIED);
  } else if (!Array.isArray(metadata.filesModified)) {
    errors.push(VALIDATION_ERRORS.INVALID_FILES_MODIFIED_TYPE);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateTaskOutput,
  VALIDATION_ERRORS,
  SUMMARY_MIN_LENGTH,
};
