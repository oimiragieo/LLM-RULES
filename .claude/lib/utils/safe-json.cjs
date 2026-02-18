#!/usr/bin/env node
/* global structuredClone */
/**
 * Safe JSON Parser (SEC-007)
 * ==========================
 *
 * Provides safe JSON parsing with schema validation to prevent:
 * - Prototype pollution attacks
 * - Injection of unknown/malicious properties
 * - State poisoning through corrupted files
 *
 * Usage:
 *   const { safeParseJSON, safeReadJSON, SCHEMAS } = require('./safe-json.cjs');
 *
 *   // Parse JSON string with schema validation
 *   const state = safeParseJSON(jsonString, 'router-state');
 *
 *   // Read and parse JSON file with schema validation
 *   const state = safeReadJSON('/path/to/file.json', 'router-state');
 */

'use strict';

const fs = require('fs');
const warnedSchemas = new Set();
const MAX_WARNED_SCHEMAS = 200;

/**
 * Track a schema warning key with bounded FIFO eviction.
 * Returns true if key was already tracked (suppress warning), false if new.
 */
function trackWarned(key) {
  if (warnedSchemas.has(key)) return true;
  if (warnedSchemas.size >= MAX_WARNED_SCHEMAS) {
    const oldest = warnedSchemas.values().next().value;
    warnedSchemas.delete(oldest);
  }
  warnedSchemas.add(key);
  return false;
}

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Schema definitions for known state files
 * Each schema defines:
 * - required: Array of required property names (currently unused but reserved)
 * - defaults: Default values for all known properties
 */
const SCHEMAS = {
  // SEC-AUDIT-015 FIX: Complete router-state schema with all fields from router-state.cjs getDefaultState()
  'router-state': {
    required: [],
    defaults: {
      mode: 'router',
      lastReset: null,
      taskSpawned: false,
      taskSpawnedAt: null,
      taskDescription: null,
      sessionId: null,
      taskListCalledSincePrompt: false,
      // Complexity tracking fields
      complexity: 'trivial',
      requiresPlannerFirst: false,
      plannerSpawned: false,
      requiresSecurityReview: false,
      securitySpawned: false,
      architectSpawned: false,
      // TaskUpdate tracking fields
      lastTaskUpdateCall: null,
      lastTaskUpdateTaskId: null,
      lastTaskUpdateStatus: null,
      taskUpdatesThisSession: 0,
      currentSpawnTaskId: null,
      // Optimistic concurrency version field
      version: 0,
    },
  },
  'loop-state': {
    required: [],
    defaults: {
      // SEC-007 FIX: Schema aligned with loop-prevention.cjs getDefaultState()
      sessionId: '',
      evolutionCount: 0,
      lastEvolutions: {},
      spawnDepth: 0,
      actionHistory: [],
      createdAt: null,
      updatedAt: null,
    },
  },
  // SEC-SF-001 FIX: Add evolution-state schema for safe parsing
  // SEC-AUDIT-015 FIX: Complete evolution-state schema (aligned with evolution-state-sync.cjs DEFAULT_STATE)
  'evolution-state': {
    required: [],
    defaults: {
      version: '1.0.0',
      state: 'idle',
      currentEvolution: null,
      evolutions: [],
      patterns: [],
      suggestions: [],
      lastUpdated: null,
      locks: {},
    },
  },
  // BUG-NEW-001 FIX: Add settings-json schema for system-registration-handler.cjs
  'settings-json': {
    required: [],
    defaults: {
      hooks: [],
      model: null,
      permissions: {},
    },
  },
  // BUG-NEW-002 FIX: Add anomaly-entry schema for dashboard.cjs JSONL parsing
  'anomaly-entry': {
    required: [],
    defaults: {
      timestamp: null,
      type: null,
      detected: false,
      tool: null,
      current: null,
      average: null,
      count: null,
    },
  },
  // BUG-NEW-002 FIX: Add rollback-entry schema for dashboard.cjs JSONL parsing
  'rollback-entry': {
    required: [],
    defaults: {
      timestamp: null,
      operation: null,
      checkpointId: null,
      restoredCount: 0,
      failedCount: 0,
      skippedCount: 0,
      success: null,
    },
  },
  // NEW-CRIT-001 FIX: Add anomaly-state schema for anomaly-detector.cjs
  'anomaly-state': {
    required: [],
    defaults: {
      tokenHistory: [],
      durationHistory: [],
      failureTracking: {},
      promptPatterns: [],
      lastUpdated: null,
    },
  },
  // NEW-CRIT-002 FIX: Add rerouter-state schema for auto-rerouter.cjs
  'rerouter-state': {
    required: [],
    defaults: {
      agentFailures: {},
      taskStartTimes: {},
      modelUsage: {},
      lastUpdated: null,
    },
  },
};

// =============================================================================
// Safe JSON Parsing
// =============================================================================

/**
 * Strip dangerous keys (__proto__, constructor, prototype) recursively from an object.
 * Prevents prototype pollution attacks on deeply nested structures.
 *
 * @param {*} obj - Value to sanitize
 * @param {number} [depth=0] - Current recursion depth
 * @param {number} [maxDepth=10] - Maximum recursion depth
 * @returns {*} Sanitized value
 */
function stripDangerousKeys(obj, depth, maxDepth) {
  if (depth === undefined) depth = 0;
  if (maxDepth === undefined) maxDepth = 10;
  if (depth >= maxDepth) return obj;
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    // Return a new array — do not mutate the original
    const result = [];
    for (let i = 0; i < obj.length; i++) {
      result[i] = stripDangerousKeys(obj[i], depth + 1, maxDepth);
    }
    return result;
  }

  // Return a new null-prototype object — do not mutate the original
  const result = Object.create(null);
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      // Skip dangerous keys — do not copy them to the result
      continue;
    }
    result[key] = stripDangerousKeys(obj[key], depth + 1, maxDepth);
  }
  return result;
}

/**
 * Safely parse JSON with schema validation
 *
 * Security features:
 * 1. Returns defaults on parse error (no exceptions for invalid JSON)
 * 2. Strips unknown properties (prevents injection)
 * 3. Uses Object.create(null) to avoid prototype pollution
 * 4. Only copies known properties from defaults
 * 5. Recursively strips dangerous keys (__proto__, constructor, prototype)
 *
 * @param {string} content - JSON string to parse
 * @param {string|null} schemaName - Name of schema to validate against (or inline name)
 * @param {Object} [inlineSchema] - Optional inline schema definition (keys with type/required metadata)
 * @param {Object} [inlineDefaults] - Optional inline defaults (used with inlineSchema)
 * @returns {Object} Parsed object with only known properties, or defaults on error
 */
function safeParseJSON(content, schemaName, inlineSchema, inlineDefaults) {
  // Resolve schema: inline schema takes precedence over built-in SCHEMAS lookup
  let resolvedSchema = null;
  if (inlineSchema && inlineDefaults) {
    resolvedSchema = { required: [], defaults: inlineDefaults };
  } else if (schemaName && SCHEMAS[schemaName]) {
    resolvedSchema = SCHEMAS[schemaName];
  }

  // If no schema, do simple parse with fallback
  if (!resolvedSchema) {
    // SEC-LIB-005 FIX: Optional warning path when fallback is used without schema protection.
    // Keep this quiet by default to avoid noisy logs in normal operation.
    const shouldWarnFallback =
      String(process.env.SAFE_JSON_WARN_FALLBACK || '').toLowerCase() === 'true' ||
      process.env.SAFE_JSON_WARN_FALLBACK === '1';
    const warnKey = schemaName || '__missing__';
    if (
      shouldWarnFallback &&
      !trackWarned(warnKey) &&
      process.stderr &&
      typeof process.stderr.write === 'function'
    ) {
      process.stderr.write(
        `[WARN] safe-json: No schema provided for JSON parsing. Using fallback with limited protection.\n`
      );
    }

    try {
      const parsed = JSON.parse(content);
      // SEC-LIB-005 FIX: Use Object.create(null) to prevent prototype pollution even in fallback
      const safe = Object.create(null);
      // Deep copy properties to safe object (top-level)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue; // Skip dangerous keys at top level
          }
          // Strip dangerous keys BEFORE assigning to safe
          safe[key] = stripDangerousKeys(parsed[key]);
        }
      } else if (Array.isArray(parsed)) {
        // Handle array input in fallback path
        return stripDangerousKeys(parsed);
      } else {
        return parsed;
      }
      return safe;
    } catch (_e) {
      // SEC-LIB-005 FIX: Return inlineDefaults if provided, otherwise Object.create(null)
      if (inlineDefaults && typeof inlineDefaults === 'object') {
        return inlineDefaults;
      }
      return Object.create(null);
    }
  }

  const schema = resolvedSchema;

  // Schema-based validation: emit warning for schema mismatch
  if (schemaName && inlineSchema) {
    // Inline schema with a name: check for unexpected keys and warn
    try {
      const parsedCheck = JSON.parse(content);
      if (parsedCheck && typeof parsedCheck === 'object' && !Array.isArray(parsedCheck)) {
        const parsedKeys = Object.keys(parsedCheck);
        const schemaKeys = Object.keys(schema.defaults);
        const unknownKeys = parsedKeys.filter(k => !schemaKeys.includes(k));
        if (unknownKeys.length > 0) {
          const warnKey = schemaName;
          if (
            !trackWarned(warnKey) &&
            process.stderr &&
            typeof process.stderr.write === 'function'
          ) {
            process.stderr.write(
              `[WARN] safe-json: test-schema: ${schemaName} has unknown keys: ${unknownKeys.join(', ')}\n`
            );
          }
        }
      }
    } catch (_e) {
      // Ignore parse errors here; handled below
    }
  }

  // Try to parse JSON
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_e) {
    // Return defaults on parse error
    return { ...schema.defaults };
  }

  // Create validated object starting with defaults
  // Use Object.create(null) to create object without prototype
  const validated = Object.create(null);

  // Copy defaults first
  for (const key of Object.keys(schema.defaults)) {
    validated[key] = schema.defaults[key];
  }

  // Only copy known properties from parsed data
  // This strips unknown/malicious properties like __proto__, constructor, etc.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const key of Object.keys(schema.defaults)) {
      if (Object.prototype.hasOwnProperty.call(parsed, key)) {
        // SEC-AUDIT-006 FIX: Deep copy for all nested objects to prevent reference issues
        // Use structuredClone for complete deep copy (preserves Date, etc.)
        const value = parsed[key];
        if (value === null || value === undefined) {
          validated[key] = value;
        } else if (Array.isArray(value) || typeof value === 'object') {
          try {
            let copied = structuredClone(value);
            copied = stripDangerousKeys(copied);
            validated[key] = copied;
          } catch (_cloneErr) {
            // structuredClone fails on functions -- try JSON roundtrip
            try {
              let copied = JSON.parse(JSON.stringify(value));
              copied = stripDangerousKeys(copied);
              validated[key] = copied;
            } catch (_jsonErr) {
              // PRESERVE original value, LOG error (never silently default)
              process.stderr.write(
                `[WARN] safe-json: Deep copy failed for key "${key}" in schema "${schemaName}": ` +
                  `${_jsonErr.message}. Using original reference.\n`
              );
              validated[key] = stripDangerousKeys(value);
            }
          }
        } else {
          // Primitives can be assigned directly
          validated[key] = value;
        }
      }
    }
  }

  // Return the null-prototype validated object directly.
  // Do NOT use Object.assign({}, validated) — that would restore Object.prototype,
  // defeating the null-prototype pollution protection created above (SEC-007).
  return validated;
}

/**
 * Safely read and parse JSON from a file
 *
 * @param {string} filePath - Path to JSON file
 * @param {string|null} schemaName - Name of schema to validate against
 * @returns {Object} Parsed object with only known properties, or defaults on error
 */
function safeReadJSON(filePath, schemaName) {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    // Return defaults if schema exists, empty object otherwise
    if (schemaName && SCHEMAS[schemaName]) {
      return { ...SCHEMAS[schemaName].defaults };
    }
    return {};
  }

  // Try to read file
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    // Return defaults on read error
    if (schemaName && SCHEMAS[schemaName]) {
      return { ...SCHEMAS[schemaName].defaults };
    }
    return {};
  }

  // Empty file returns defaults
  if (!content || content.trim() === '') {
    if (schemaName && SCHEMAS[schemaName]) {
      return { ...SCHEMAS[schemaName].defaults };
    }
    return {};
  }

  // Parse with schema validation
  return safeParseJSON(content, schemaName);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  safeParseJSON,
  safeReadJSON,
  stripDangerousKeys,
  trackWarned,
  warnedSchemas,
  MAX_WARNED_SCHEMAS,
  SCHEMAS,
};
