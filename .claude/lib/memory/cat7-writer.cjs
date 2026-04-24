#!/usr/bin/env node
/**
 * CAT7 Memory Record Writer
 * =========================
 * Implements the Cognitive Artifact Tier 7 (CAT7) schema per arXiv 2604.19540
 * Mesh Memory Protocol (MMP).
 *
 * Exports:
 *   createRecord(partial)   — Build a CAT7 record with defaults applied
 *   validateRecord(record)  — Validate against cat7-record.schema.json
 *   routeToTier(record)     — Return 'stm' | 'mtm' | 'ltm' based on confidence
 *   writeRecord(record, dir)— Write record to the appropriate tier subdirectory
 *   readRecord(filePath)    — Read and parse a CAT7 record from disk
 *
 * Tier routing thresholds (arXiv 2604.19540 §3.2):
 *   STM: confidence < 0.4
 *   MTM: 0.4 <= confidence < 0.8
 *   LTM: confidence >= 0.8
 *
 * DR-3 decision: lineage is a LINEAR CHAIN in v3.2.0 (not DAG).
 * DAG semantics deferred to v3.3.0. Rationale: arXiv §A.3 lineage field was
 * ambiguous; linear chain chosen for simplicity and append-only traceability.
 */

/**
 * @typedef {Object} Cat7Record
 * @property {string} id
 * @property {string} concept
 * @property {Object} attributes
 * @property {Object} temporality
 * @property {Object} provenance
 * @property {number} confidence
 * @property {string[]} lineage
 * @property {Object} embedding_refs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// ── Schema loading ────────────────────────────────────────────────────────

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'schemas', 'cat7-record.schema.json');

let _schema = null;
function loadSchema() {
  if (_schema) return _schema;
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  _schema = JSON.parse(raw);
  return _schema;
}

// ── Tier thresholds ───────────────────────────────────────────────────────

const TIER_THRESHOLDS = {
  STM_MAX: 0.4, // confidence < 0.4 → STM
  LTM_MIN: 0.8, // confidence >= 0.8 → LTM
  // 0.4 <= confidence < 0.8 → MTM
};

// ── Internal validation helpers ───────────────────────────────────────────

/**
 * Simple JSON Schema Draft-07 validator (subset sufficient for CAT7).
 * Only validates the fields defined in cat7-record.schema.json.
 * Does not pull in ajv to keep this zero-dependency.
 *
 * @param {object} schema - The JSON Schema object
 * @param {unknown} data  - The value to validate
 * @param {string} [path] - JSON path prefix for error messages
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAgainstSchema(schema, data, currentPath) {
  const errors = [];
  currentPath = currentPath || '';

  // Type check
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    if (!types.includes(actualType)) {
      errors.push(
        `${currentPath || 'root'}: expected type [${types.join('|')}] but got ${actualType}`
      );
      return { valid: errors.length === 0, errors };
    }
  }

  if (data === null || data === undefined) return { valid: errors.length === 0, errors };

  // String constraints
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${currentPath}: string length ${data.length} < minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push(`${currentPath}: string length ${data.length} > maxLength ${schema.maxLength}`);
    }
  }

  // Number constraints
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${currentPath}: value ${data} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${currentPath}: value ${data} > maximum ${schema.maximum}`);
    }
  }

  // Array constraints
  if (Array.isArray(data)) {
    if (schema.items) {
      data.forEach((item, idx) => {
        const sub = validateAgainstSchema(schema.items, item, `${currentPath}[${idx}]`);
        errors.push(...sub.errors);
      });
    }
  }

  // Object constraints
  if (typeof data === 'object' && !Array.isArray(data)) {
    // Required fields
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in data) || data[req] === undefined) {
          errors.push(`${currentPath || 'root'}: required field '${req}' is missing`);
        }
      }
    }

    // Additional properties
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) {
          errors.push(`${currentPath || 'root'}: additional property '${key}' is not allowed`);
        }
      }
    }

    // Recurse into defined properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const sub = validateAgainstSchema(propSchema, data[key], `${currentPath}.${key}`);
          errors.push(...sub.errors);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Temporal cross-field validation ──────────────────────────────────────

/**
 * Validate that valid_until >= valid_from (when both are non-null).
 * @param {object} temporality
 * @returns {string|null} error message or null if valid
 */
function validateTemporality(temporality) {
  if (!temporality) return null;
  const { valid_from, valid_until } = temporality;
  if (valid_from && valid_until) {
    const from = new Date(valid_from).getTime();
    const until = new Date(valid_until).getTime();
    if (isNaN(from) || isNaN(until)) return null; // format errors caught by schema
    if (until < from) {
      return `temporality.valid_until (${valid_until}) must not be before valid_from (${valid_from})`;
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Create a new CAT7 record with required defaults applied.
 * @param {Partial<Cat7Record>} partial - Fields to set
 * @returns {Cat7Record}
 */
function createRecord(partial) {
  const now = new Date().toISOString();
  return Object.assign(
    {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `cat7-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      concept: '',
      attributes: {},
      temporality: {
        created_at: now,
        valid_from: now,
        valid_until: null,
        last_accessed: null,
      },
      provenance: {
        source_agent_id: 'unknown',
        source_session_id: null,
        trigger: null,
      },
      confidence: 0.5,
      lineage: [],
      embedding_refs: null,
    },
    partial
  );
}

/**
 * Validate a CAT7 record against the schema and cross-field rules.
 * @param {unknown} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRecord(record) {
  const schema = loadSchema();
  const result = validateAgainstSchema(schema, record, '');

  // Cross-field rule: temporality range
  if (result.valid && record && typeof record === 'object' && record.temporality) {
    const temporalError = validateTemporality(record.temporality);
    if (temporalError) {
      result.errors.push(temporalError);
      result.valid = false;
    }
  }

  return result;
}

/**
 * Route a CAT7 record to the correct memory tier based on confidence.
 * Thresholds per arXiv 2604.19540 §3.2:
 *   STM: confidence < 0.4
 *   MTM: 0.4 <= confidence < 0.8
 *   LTM: confidence >= 0.8
 *
 * @param {Cat7Record} record
 * @returns {'stm' | 'mtm' | 'ltm'}
 */
function routeToTier(record) {
  const confidence = record.confidence;
  if (confidence < TIER_THRESHOLDS.STM_MAX) return 'stm';
  if (confidence < TIER_THRESHOLDS.LTM_MIN) return 'mtm';
  return 'ltm';
}

/**
 * Write a validated CAT7 record to disk under the appropriate tier subdirectory.
 * The record is written to: <dir>/<tier>/<id>.json
 * Creates subdirectories as needed.
 *
 * @param {Cat7Record} record
 * @param {string} baseDir - Base directory (defaults to project memory dir)
 * @returns {string} The absolute path to the written file
 * @throws {Error} If the record fails validation
 */
function writeRecord(record, baseDir) {
  const validation = validateRecord(record);
  if (!validation.valid) {
    throw new Error(`CAT7 record validation failed: ${validation.errors.join('; ')}`);
  }

  const tier = routeToTier(record);
  const tierDir = path.join(baseDir, tier);
  fs.mkdirSync(tierDir, { recursive: true });

  const fileName = `${record.id}.json`;
  const filePath = path.join(tierDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');

  return filePath;
}

/**
 * Read and parse a CAT7 record from disk.
 * Uses safeParseJSON to guard against prototype pollution.
 *
 * @param {string} filePath - Absolute path to the .json file
 * @returns {Cat7Record}
 * @throws {Error} If the file cannot be read or parsed
 */
function readRecord(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = safeParseJSON(raw, 'cat7-record', null, {});
  if (!parsed || Object.keys(parsed).length === 0) {
    throw new Error(`Failed to parse CAT7 record at ${filePath}`);
  }
  // Restore normal prototype chain after safeParseJSON (which uses Object.create(null))
  // so callers can use deepStrictEqual and normal object operations.
  return JSON.parse(JSON.stringify(parsed));
}

module.exports = {
  createRecord,
  validateRecord,
  routeToTier,
  writeRecord,
  readRecord,
  TIER_THRESHOLDS,
};
