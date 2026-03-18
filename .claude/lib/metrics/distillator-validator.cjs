'use strict';

/**
 * Distillator Validator
 *
 * Validates compression output quality:
 * - Compression ratio within acceptable bounds (10%-95%)
 * - Key term preservation from query/original
 * - Evidence sufficiency scoring
 *
 * @module distillator-validator
 */

const COMPRESSION_RATIO_MIN = 0.1; // At least 10% reduction
const COMPRESSION_RATIO_MAX = 0.95; // No more than 95% reduction
const EVIDENCE_THRESHOLD = 0.6; // 60% of query terms must be preserved

/**
 * Validate that compression ratio is within acceptable bounds.
 *
 * @param {string} original - Original text
 * @param {string} compressed - Compressed text
 * @returns {{ valid: boolean, ratio: number, reason?: string }}
 */
function validateCompression(original, compressed) {
  if (!original || typeof original !== 'string' || original.length === 0) {
    return { valid: false, ratio: 0, reason: 'Empty or invalid original input' };
  }
  if (!compressed || typeof compressed !== 'string' || compressed.length === 0) {
    return { valid: false, ratio: 0, reason: 'Empty or invalid compressed output' };
  }

  const ratio = compressed.length / original.length;

  if (ratio > 1) {
    return { valid: false, ratio, reason: 'Compressed output is larger than original' };
  }

  const reduction = 1 - ratio;

  if (reduction < COMPRESSION_RATIO_MIN) {
    return {
      valid: false,
      ratio,
      reason: `Compression ratio too low: ${(reduction * 100).toFixed(1)}% reduction (min ${COMPRESSION_RATIO_MIN * 100}%)`,
    };
  }

  if (reduction > COMPRESSION_RATIO_MAX) {
    return {
      valid: false,
      ratio,
      reason: `Compression ratio too high: ${(reduction * 100).toFixed(1)}% reduction (max ${COMPRESSION_RATIO_MAX * 100}%)`,
    };
  }

  return { valid: true, ratio };
}

/**
 * Extract significant terms from text (words 3+ chars, lowercased, deduplicated).
 * @private
 */
function _extractTerms(text) {
  if (!text || typeof text !== 'string') return [];
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3)
    ),
  ];
}

/**
 * Validate that key terms from the query are preserved in compressed output.
 *
 * @param {string} original - Original text
 * @param {string} compressed - Compressed output
 * @param {string} query - Search query / key terms to check
 * @returns {{ valid: boolean, score: number, preservedTerms: string[], missingTerms: string[] }}
 */
function validateEvidence(original, compressed, query) {
  if (!original || typeof original !== 'string') {
    return { valid: false, score: 0, preservedTerms: [], missingTerms: [] };
  }
  if (!compressed || typeof compressed !== 'string') {
    return { valid: false, score: 0, preservedTerms: [], missingTerms: [] };
  }

  const queryTerms = _extractTerms(query);

  if (queryTerms.length === 0) {
    return { valid: true, score: 1, preservedTerms: [], missingTerms: [] };
  }

  const compressedLower = compressed.toLowerCase();
  const preservedTerms = [];
  const missingTerms = [];

  for (const term of queryTerms) {
    if (compressedLower.includes(term)) {
      preservedTerms.push(term);
    } else {
      missingTerms.push(term);
    }
  }

  const score = queryTerms.length > 0 ? preservedTerms.length / queryTerms.length : 1;
  const valid = score >= EVIDENCE_THRESHOLD;

  return { valid, score, preservedTerms, missingTerms };
}

module.exports = {
  validateCompression,
  validateEvidence,
  COMPRESSION_RATIO_MIN,
  COMPRESSION_RATIO_MAX,
  EVIDENCE_THRESHOLD,
};
