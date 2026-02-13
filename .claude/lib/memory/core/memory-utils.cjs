#!/usr/bin/env node
/**
 * memory-utils.cjs - Shared Memory Utilities (C-001 Fix)
 * ======================================================
 *
 * Neutral module for utilities shared across memory modules.
 * Prevents circular dependencies between contextual-memory.cjs and memory-query.cjs.
 *
 * Created: 2026-02-13 (C-001 Fix)
 */

'use strict';

/**
 * Build semantic context from memory entries.
 * Extracted from contextual-memory.cjs to break circular dependency.
 *
 * @param {Array} entries - Memory entries with metadata
 * @param {Object} options - Context building options
 * @param {number} [options.maxEntries=20] - Max entries to include
 * @param {number} [options.maxChars=3000] - Max characters for output
 * @returns {string} Formatted semantic context
 */
function buildSemanticContext(entries, options = {}) {
  const { maxEntries = 20, maxChars = 3000 } = options;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return '';
  }

  const sorted = entries
    .filter(e => e && e.content)
    .slice(0, maxEntries);

  const contextParts = sorted.map(entry => {
    const metadata = entry.metadata || {};
    const timestamp = metadata.timestamp || entry.timestamp || 'unknown';
    const category = metadata.category || entry.category || 'general';

    return `[${category}] (${timestamp}): ${entry.content.substring(0, 500)}`;
  });

  const context = contextParts.join('\n\n');

  if (context.length > maxChars) {
    return context.substring(0, maxChars) + '\n\n[truncated...]';
  }

  return context;
}

/**
 * Normalize memory entry for storage.
 * @param {Object} entry - Raw memory entry
 * @returns {Object} Normalized entry with standard structure
 */
function normalizeMemoryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new TypeError('Entry must be an object');
  }

  const normalized = {
    content: String(entry.content || '').trim(),
    timestamp: entry.timestamp || new Date().toISOString(),
    category: entry.category || 'general',
    metadata: entry.metadata || {},
  };

  if (!normalized.content) {
    throw new Error('Entry content cannot be empty');
  }

  return normalized;
}

/**
 * Calculate entry quality score.
 * @param {Object} entry - Memory entry with access tracking
 * @returns {number} Quality score 0.0 to 1.0
 */
function calculateQualityScore(entry) {
  const accessCount = entry.accessCount || 0;
  const ageInDays = entry.ageInDays || 0;
  const length = (entry.content || '').length;

  const accessScore = Math.min(Math.log1p(accessCount) / Math.log1p(20), 1);
  const recencyScore = Math.max(0, 1 - (ageInDays / 90));
  const lengthScore = Math.min(length / 2000, 1);

  return (accessScore * 0.5) + (recencyScore * 0.3) + (lengthScore * 0.2);
}

module.exports = {
  buildSemanticContext,
  normalizeMemoryEntry,
  calculateQualityScore,
};
