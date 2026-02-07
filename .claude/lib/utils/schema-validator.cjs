'use strict';

/**
 * Schema Validator Utility
 * ========================
 *
 * Shared Ajv validation helper for wiring JSON schemas to consumers.
 * Provides graceful degradation: if Ajv or schema fails to load,
 * validation is SKIPPED (never crashes).
 *
 * Advisory validation only -- logs warnings but does NOT block operations.
 *
 * Usage:
 *   const { createValidator, validateData } = require('./schema-validator.cjs');
 *
 *   // Create and cache a compiled validator
 *   const validate = createValidator('/path/to/schema.json');
 *   if (validate) {
 *     const isValid = validate(data);
 *     if (!isValid) console.warn('Validation errors:', validate.errors);
 *   }
 *
 *   // Or use the higher-level validateData helper
 *   const result = validateData(data, '/path/to/schema.json');
 *   // result: { valid: true/false, errors: null|[...], skipped: true/false }
 *
 * @module schema-validator
 */

const fs = require('fs');

// Lazy-load Ajv (graceful if missing)
let Ajv = null;
try {
  const ajvModule = require('ajv');
  Ajv = ajvModule.default || ajvModule;
} catch (_e) {
  // Ajv not installed -- all validation will be skipped
}

// Cache compiled validators by schema path
const _validatorCache = new Map();

/**
 * Create a compiled Ajv validator from a schema file.
 * Returns null if Ajv is unavailable or schema can't be loaded.
 * Results are cached by schemaPath.
 *
 * @param {string} schemaPath - Absolute path to JSON schema file
 * @returns {Function|null} Compiled Ajv validate function, or null on failure
 */
function createValidator(schemaPath) {
  // Return cached if available
  if (_validatorCache.has(schemaPath)) {
    return _validatorCache.get(schemaPath);
  }

  // Graceful degradation: no Ajv -> no validation
  if (!Ajv) {
    _validatorCache.set(schemaPath, null);
    return null;
  }

  try {
    if (!fs.existsSync(schemaPath)) {
      _validatorCache.set(schemaPath, null);
      return null;
    }

    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    // validateSchema:false allows schemas with $schema meta-references
    // (draft-2020-12, draft-07) that Ajv doesn't auto-resolve
    const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
    const validate = ajv.compile(schema);

    _validatorCache.set(schemaPath, validate);
    return validate;
  } catch (_e) {
    _validatorCache.set(schemaPath, null);
    return null;
  }
}

/**
 * Validate data against a JSON schema file.
 * Returns { valid: true, errors: null } on success.
 * Returns { valid: false, errors: [...] } on validation failure.
 * Returns { valid: true, errors: null, skipped: true } when validation
 * can't run (Ajv missing, schema missing, data null).
 *
 * @param {*} data - Data to validate
 * @param {string} schemaPath - Absolute path to JSON schema file
 * @returns {{ valid: boolean, errors: Array|null, skipped?: boolean }}
 */
function validateData(data, schemaPath) {
  // Graceful degradation: null/undefined data -> skip
  if (data === null || data === undefined) {
    return { valid: true, errors: null, skipped: true };
  }

  const validate = createValidator(schemaPath);

  // Graceful degradation: no validator -> skip
  if (!validate) {
    return { valid: true, errors: null, skipped: true };
  }

  const isValid = validate(data);
  if (isValid) {
    return { valid: true, errors: null };
  }

  return {
    valid: false,
    errors: validate.errors ? validate.errors.map(e => ({
      path: e.instancePath || '/',
      message: e.message,
      keyword: e.keyword,
    })) : [],
  };
}

module.exports = {
  createValidator,
  validateData,
};
