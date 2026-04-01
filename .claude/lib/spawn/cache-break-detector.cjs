#!/usr/bin/env node
/**
 * Cache-Break Detector
 * ====================
 *
 * Computes SHA-256 hashes of each assembled prompt section and detects
 * changes between consecutive assembleSpawnPrompt() calls.
 *
 * When any section hash changes, logs a structured cache-break event to
 * the flight recorder. When all hashes are stable, logs nothing.
 * The first call establishes a baseline without logging any event.
 *
 * Sections tracked:
 *   - toolsSection
 *   - skillsSection
 *   - discoverySection
 *   - memorySection
 *   - behaviourSection
 *   - basePrompt
 *
 * @module cache-break-detector
 */

'use strict';

const crypto = require('crypto');

// ============================================================
// Module-level state — stores previous hashes across calls
// ============================================================

/** @type {Object|null} */
let _previousHashes = null;

// Lazy-loaded record function (avoids load-time circular dep risk)
let _defaultRecordFn = null;

/**
 * Lazily resolves the default flight-recorder record() function.
 * @returns {Function}
 */
function getDefaultRecord() {
  if (!_defaultRecordFn) {
    _defaultRecordFn = require('../monitoring/flight-recorder.cjs').record;
  }
  return _defaultRecordFn;
}

// ============================================================
// Core hashing helpers
// ============================================================

/**
 * Compute a SHA-256 hex digest of a section's string content.
 *
 * @param {string|undefined|null} content
 * @returns {string} Hex digest
 */
function hashSection(content) {
  return crypto
    .createHash('sha256')
    .update(String(content || ''))
    .digest('hex');
}

/**
 * Compute a hash map for all tracked sections.
 *
 * @param {Object} sections
 * @param {string} [sections.toolsSection]
 * @param {string} [sections.skillsSection]
 * @param {string} [sections.discoverySection]
 * @param {string} [sections.memorySection]
 * @param {string} [sections.behaviourSection]
 * @param {string} [sections.basePrompt]
 * @returns {Object<string,string>} Map of sectionName → SHA-256 hex
 */
function computeHashes(sections) {
  return {
    toolsSection: hashSection(sections.toolsSection),
    skillsSection: hashSection(sections.skillsSection),
    discoverySection: hashSection(sections.discoverySection),
    memorySection: hashSection(sections.memorySection),
    behaviourSection: hashSection(sections.behaviourSection),
    basePrompt: hashSection(sections.basePrompt),
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Detect cache breaks between consecutive prompt assembly calls.
 *
 * On the first invocation, stores the hash baseline and returns without
 * logging. On subsequent calls, compares current hashes against the
 * stored baseline and, if any section changed, logs a cache-break event
 * to the flight recorder with the list of changed section names.
 *
 * FAIL-OPEN: Any internal error is silently swallowed so this detector
 * never disrupts the main assembly pipeline.
 *
 * @param {Object} sections - Named section strings to hash
 * @param {string} [sections.toolsSection]
 * @param {string} [sections.skillsSection]
 * @param {string} [sections.discoverySection]
 * @param {string} [sections.memorySection]
 * @param {string} [sections.behaviourSection]
 * @param {string} [sections.basePrompt]
 * @param {Function} [recordFn] - Optional record override (for testing)
 */
function detectCacheBreak(sections, recordFn) {
  try {
    const record = typeof recordFn === 'function' ? recordFn : getDefaultRecord();
    const currentHashes = computeHashes(sections);

    if (_previousHashes === null) {
      // First call — establish baseline, do not emit an event.
      _previousHashes = currentHashes;
      return;
    }

    const changedSections = Object.keys(currentHashes).filter(
      key => currentHashes[key] !== _previousHashes[key]
    );

    // Always advance the stored hashes so subsequent comparisons are relative
    // to the most recent call (not the very first baseline).
    _previousHashes = currentHashes;

    if (changedSections.length > 0) {
      record({
        event: 'cache-break',
        changedSections,
        timestamp: new Date().toISOString(),
        component: 'prompt-assembler',
      });
    }
  } catch (_err) {
    // FAIL-OPEN: never throw — cache-break detection must not break assembly.
    if (process.env.DEBUG_TELEMETRY) {
      console.error(`[CacheBreakDetector] Error: ${_err.message}`);
    }
  }
}

/**
 * Reset the stored hash baseline to null.
 * Call after compaction or cache clears to start fresh.
 */
function _resetHashes() {
  _previousHashes = null;
}

module.exports = {
  detectCacheBreak,
  _resetHashes,
};
