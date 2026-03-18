#!/usr/bin/env node
'use strict';

/**
 * Round-Trip Compression Validation (Feature D6)
 * ===============================================
 * Validates that compressed content preserves key information from the
 * original by checking for presence of critical elements.
 *
 * Usage:
 *   const { validateCompression, VALIDATION_CHECKS } = require('./compression-validator.cjs');
 *
 *   const result = validateCompression(original, compressed, { contentType: 'code' });
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Overall pass/fail
 * @property {number} score - Score 0.0 to 1.0
 * @property {Array<{check: string, passed: boolean, detail?: string}>} checks
 * @property {string[]} warnings
 */

/**
 * Validation checks by content type.
 */
const VALIDATION_CHECKS = {
  code: [
    { name: 'exports_preserved', description: 'Module exports are mentioned in compressed output' },
    { name: 'function_names_preserved', description: 'Function/class names appear in compressed output' },
    { name: 'file_path_preserved', description: 'Source file path is referenced' },
    { name: 'reduction_achieved', description: 'Meaningful size reduction (>30%)' },
  ],
  documentation: [
    { name: 'headings_preserved', description: 'Section headings from original appear in compressed' },
    { name: 'key_terms_preserved', description: 'Domain-specific terms survive compression' },
    { name: 'reduction_achieved', description: 'Meaningful size reduction (>30%)' },
  ],
  logs: [
    { name: 'error_count_preserved', description: 'Error counts or error lines preserved' },
    { name: 'timestamps_preserved', description: 'First/last timestamp range preserved' },
    { name: 'reduction_achieved', description: 'Meaningful size reduction (>50%)' },
  ],
  conversation: [
    { name: 'decisions_preserved', description: 'Key decisions mentioned in compressed output' },
    { name: 'reduction_achieved', description: 'Meaningful size reduction (>40%)' },
  ],
};

/**
 * Validate that compressed content preserves critical information.
 * @param {string} original - Original content
 * @param {string} compressed - Compressed content
 * @param {Object} [options]
 * @param {string} [options.contentType='documentation']
 * @param {string} [options.filePath]
 * @returns {ValidationResult}
 */
function validateCompression(original, compressed, options = {}) {
  const contentType = options.contentType || 'documentation';
  const checks = [];
  const warnings = [];

  if (!original || !compressed) {
    return { valid: false, score: 0, checks: [], warnings: ['Empty content'] };
  }

  // Reduction check (universal)
  const reductionPct = ((original.length - compressed.length) / original.length) * 100;
  const minReduction = contentType === 'logs' ? 50 : contentType === 'conversation' ? 40 : 30;
  checks.push({
    check: 'reduction_achieved',
    passed: reductionPct >= minReduction,
    detail: `${reductionPct.toFixed(1)}% reduction (min: ${minReduction}%)`,
  });

  if (reductionPct < 0) {
    warnings.push('Compressed output is LARGER than original');
  }

  // Content-specific checks
  if (contentType === 'code') {
    checks.push(...validateCodeCompression(original, compressed, options));
  } else if (contentType === 'documentation') {
    checks.push(...validateDocsCompression(original, compressed));
  } else if (contentType === 'logs') {
    checks.push(...validateLogsCompression(original, compressed));
  } else if (contentType === 'conversation') {
    checks.push(...validateConversationCompression(original, compressed));
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? passedCount / checks.length : 0;

  return {
    valid: score >= 0.5, // At least half of checks must pass
    score: Math.round(score * 100) / 100,
    checks,
    warnings,
  };
}

function validateCodeCompression(original, compressed, options) {
  const checks = [];
  const compressedLower = compressed.toLowerCase();

  // Check function/class names preserved
  const funcNames = extractFunctionNames(original);
  const preserved = funcNames.filter((n) => compressedLower.includes(n.toLowerCase()));
  checks.push({
    check: 'function_names_preserved',
    passed: funcNames.length === 0 || preserved.length >= Math.ceil(funcNames.length * 0.5),
    detail: `${preserved.length}/${funcNames.length} function names preserved`,
  });

  // Check exports preserved
  const exportLines = original.split('\n').filter((l) => /module\.exports|exports\./.test(l));
  const exportsFound = exportLines.some((l) => {
    const key = l.match(/(?:module\.exports|exports\.(\w+))/);
    return key && compressedLower.includes(key[0].toLowerCase());
  });
  checks.push({
    check: 'exports_preserved',
    passed: exportLines.length === 0 || exportsFound,
    detail: exportLines.length > 0 ? (exportsFound ? 'Exports referenced' : 'Exports missing') : 'No exports to check',
  });

  // Check file path preserved
  if (options.filePath) {
    checks.push({
      check: 'file_path_preserved',
      passed: compressed.includes(options.filePath),
      detail: options.filePath,
    });
  }

  return checks;
}

function validateDocsCompression(original, compressed) {
  const checks = [];
  const compressedLower = compressed.toLowerCase();

  // Check headings preserved
  const headings = original
    .split('\n')
    .filter((l) => /^#{1,3}\s/.test(l))
    .map((l) => l.replace(/^#+\s*/, '').trim());
  const preserved = headings.filter((h) => compressedLower.includes(h.toLowerCase()));
  checks.push({
    check: 'headings_preserved',
    passed: headings.length === 0 || preserved.length >= Math.ceil(headings.length * 0.3),
    detail: `${preserved.length}/${headings.length} headings preserved`,
  });

  // Check key terms (words that appear 3+ times)
  const keyTerms = extractKeyTerms(original);
  const termsPreserved = keyTerms.filter((t) => compressedLower.includes(t));
  checks.push({
    check: 'key_terms_preserved',
    passed: keyTerms.length === 0 || termsPreserved.length >= Math.ceil(keyTerms.length * 0.5),
    detail: `${termsPreserved.length}/${keyTerms.length} key terms preserved`,
  });

  return checks;
}

function validateLogsCompression(original, compressed) {
  const checks = [];

  // Check error references
  const errorLines = original.split('\n').filter((l) => /error|fatal|critical/i.test(l));
  const hasErrorRef = /\berror/i.test(compressed) || /\d+\s*error/i.test(compressed);
  checks.push({
    check: 'error_count_preserved',
    passed: errorLines.length === 0 || hasErrorRef,
    detail: `${errorLines.length} errors in original, reference in compressed: ${hasErrorRef}`,
  });

  // Check timestamp range
  const timestamps = original.match(/\d{4}-\d{2}-\d{2}/g) || [];
  const hasTimestamp = /\d{4}-\d{2}-\d{2}/.test(compressed);
  checks.push({
    check: 'timestamps_preserved',
    passed: timestamps.length === 0 || hasTimestamp,
    detail: `${timestamps.length} dates in original, found in compressed: ${hasTimestamp}`,
  });

  return checks;
}

function validateConversationCompression(original, compressed) {
  const checks = [];

  // Check decisions preserved
  const decisionLines = original
    .split('\n')
    .filter((l) => /\bdecid|chose|decision|agreed|let'?s\s+use\b/i.test(l));
  const hasDecisionRef = /decision|chose|agreed/i.test(compressed);
  checks.push({
    check: 'decisions_preserved',
    passed: decisionLines.length === 0 || hasDecisionRef,
    detail: `${decisionLines.length} decisions in original, reference found: ${hasDecisionRef}`,
  });

  return checks;
}

// --- Helpers ---

function extractFunctionNames(code) {
  const names = [];
  const patterns = [
    /function\s+(\w+)/g,
    /const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    /class\s+(\w+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code)) !== null) {
      names.push(match[1]);
    }
  }
  return [...new Set(names)];
}

function extractKeyTerms(text) {
  const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const freq = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.entries(freq)
    .filter(([, count]) => count >= 3)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([word]) => word);
}

module.exports = {
  validateCompression,
  VALIDATION_CHECKS,
};
