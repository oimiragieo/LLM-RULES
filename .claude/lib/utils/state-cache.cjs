#!/usr/bin/env node
/**
 * State Cache Utility
 * ====================
 *
 * TTL-based caching layer for state files (like router-state.json).
 * Reduces redundant file I/O across hooks that independently read the same state.
 *
 * Performance Impact:
 * - Before: 10-15 redundant fs.readFileSync() calls per Edit/Write operation
 * - After: 1 read per file per TTL window (default 1 second)
 * - Expected I/O reduction: ~60%
 *
 * Usage:
 *   const { getCachedState, invalidateCache, clearAllCache } = require('./state-cache.cjs');
 *
 *   // Read with caching (1 second TTL default)
 *   const state = getCachedState('/path/to/router-state.json', {});
 *
 *   // Custom TTL (5 seconds)
 *   const state = getCachedState('/path/to/file.json', {}, 5000);
 *
 *   // Invalidate after writing
 *   invalidateCache('/path/to/router-state.json');
 *
 *   // Clear all cached data
 *   clearAllCache();
 */

'use strict';

const fs = require('fs');
const { safeParseJSON } = require('./safe-json.cjs');

/**
 * Default TTL in milliseconds (1 second)
 * This balances freshness with I/O reduction.
 * For hooks that run sequentially within the same tool operation,
 * 1 second is sufficient to serve all hooks from cache.
 */
const DEFAULT_TTL_MS = 1000;

/**
 * Sentinel object used to detect JSON parse failures from safeParseJSON.
 * safeParseJSON returns its inlineDefaults argument on parse error; by passing
 * this unique sentinel we can distinguish failure from a valid empty-object result.
 */
const PARSE_ERROR_SENTINEL = Object.freeze({ __stateCacheParseError: true });

/**
 * In-memory cache storage
 * Structure: Map<filePath, { data: any, timestamp: number }>
 */
const cache = new Map();

/**
 * Deep-convert a value that may contain null-prototype objects (returned by
 * safeParseJSON's prototype-pollution protection) into standard plain objects.
 * Primitives, null, and arrays are handled correctly.
 *
 * @param {any} value
 * @returns {any}
 */
function toPlainObject(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toPlainObject);
  const result = {};
  for (const key of Object.keys(value)) {
    result[key] = toPlainObject(value[key]);
  }
  return result;
}

/**
 * Get cached state from a JSON file.
 *
 * - If cached and within TTL: returns cached data
 * - If not cached or TTL expired: reads file, caches result, returns data
 * - If file doesn't exist or parse error: returns defaultValue
 *
 * @param {string} filePath - Absolute path to the JSON file
 * @param {any} defaultValue - Value to return if file cannot be read (default: {})
 * @param {number} ttlMs - Cache TTL in milliseconds (default: 1000)
 * @returns {any} - Parsed JSON data or defaultValue
 */
function getCachedState(filePath, defaultValue = {}, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  const cached = cache.get(filePath);

  // Check if we have a valid cached entry
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data;
  }

  // Read fresh from file
  try {
    // Check if file exists first
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    // safeParseJSON with PARSE_ERROR_SENTINEL as inlineDefaults:
    //   - on valid JSON object: returns Object.create(null) (null-prototype object)
    //   - on valid JSON array/primitive: returns the value directly
    //   - on parse failure: returns PARSE_ERROR_SENTINEL
    // We then convert null-prototype objects to plain objects via toPlainObject.
    const rawData = safeParseJSON(fileContent, null, null, PARSE_ERROR_SENTINEL);

    if (rawData === PARSE_ERROR_SENTINEL) {
      // JSON parse failed — return default without caching
      return defaultValue;
    }

    // Convert any null-prototype objects from safeParseJSON to plain objects
    // so callers can use deepStrictEqual and standard property checks without issues.
    const data = toPlainObject(rawData);

    // Cache the result
    cache.set(filePath, { data, timestamp: now });

    return data;
  } catch (err) {
    // On any error (permission, parse, etc.), return default
    // Log warning for debugging but don't throw
    if (process.env.STATE_CACHE_DEBUG === 'true') {
      console.error(`[state-cache] Error reading ${filePath}: ${err.message}`);
    }
    return defaultValue;
  }
}

/**
 * Invalidate cache for a specific file.
 * Call this after writing to a cached file to ensure next read gets fresh data.
 *
 * @param {string} filePath - Absolute path to the file
 */
function invalidateCache(filePath) {
  cache.delete(filePath);
}

/**
 * Clear the entire cache.
 * Useful for testing or when significant state changes occur.
 */
function clearAllCache() {
  cache.clear();
}

module.exports = {
  getCachedState,
  invalidateCache,
  clearAllCache,
  DEFAULT_TTL_MS,
};
