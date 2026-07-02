#!/usr/bin/env node
'use strict';

/**
 * Large File Interceptor (Feature D5)
 * ====================================
 * Detects oversized tool results and returns a summary instead of the
 * full content. Prevents context overflow from accidentally reading
 * massive files.
 *
 * Usage:
 *   const { shouldIntercept, interceptContent, LIMITS } = require('./large-file-interceptor.cjs');
 *
 *   if (shouldIntercept(content, 'code')) {
 *     return interceptContent(content, { filePath, contentType: 'code' });
 *   }
 */

const { summarize, detectContentType } = require('./summarization-tiers.cjs');

/**
 * Default size limits by content type (in characters).
 * Can be overridden via environment variables.
 */
function _envLimit(name, fallback) {
  // NaN-aware: preserve an explicit 0 (means "intercept everything") while
  // unset/invalid values still fall back to the default. `parseInt(x,10) || d`
  // would wrongly discard a configured 0.
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) ? n : fallback;
}

const LIMITS = {
  code: _envLimit('INTERCEPT_LIMIT_CODE', 50000), // ~12K tokens
  documentation: _envLimit('INTERCEPT_LIMIT_DOCS', 80000), // ~20K tokens
  logs: _envLimit('INTERCEPT_LIMIT_LOGS', 30000), // ~7K tokens
  conversation: _envLimit('INTERCEPT_LIMIT_CONV', 60000), // ~15K tokens
  default: _envLimit('INTERCEPT_LIMIT_DEFAULT', 50000),
};

/**
 * Check if content exceeds the size limit for its type.
 * @param {string} content
 * @param {string} [contentType] - Optional override; auto-detected if omitted
 * @returns {boolean}
 */
function shouldIntercept(content, contentType) {
  if (!content || typeof content !== 'string') return false;
  const type = contentType || detectContentType(content);
  const limit = LIMITS[type] || LIMITS.default;
  return content.length > limit;
}

/**
 * Intercept oversized content and return a compressed summary.
 * @param {string} content
 * @param {Object} [options]
 * @param {string} [options.filePath]
 * @param {string} [options.contentType]
 * @param {'normal'|'aggressive'|'truncation'} [options.tier='aggressive']
 * @returns {{ intercepted: boolean, original_size: number, summary: string, tier: string, reduction_pct: number }}
 */
function interceptContent(content, options = {}) {
  if (!shouldIntercept(content, options.contentType)) {
    return {
      intercepted: false,
      original_size: content ? content.length : 0,
      summary: content || '',
      tier: 'none',
      reduction_pct: 0,
    };
  }

  const tier = options.tier || 'aggressive';
  const result = summarize(content, tier, {
    filePath: options.filePath,
    contentType: options.contentType,
  });

  const header = [
    `⚠️ CONTENT INTERCEPTED — original ${content.length} chars exceeds limit`,
    `Tier: ${tier} | Reduction: ${result.reductionPct}%`,
    options.filePath ? `Source: ${options.filePath}` : '',
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    intercepted: true,
    original_size: content.length,
    summary: `${header}\n${result.summary}`,
    tier,
    reduction_pct: result.reductionPct,
  };
}

/**
 * Get the size limit for a given content type.
 * @param {string} contentType
 * @returns {number} Character limit
 */
function getLimit(contentType) {
  return LIMITS[contentType] || LIMITS.default;
}

module.exports = {
  shouldIntercept,
  interceptContent,
  getLimit,
  LIMITS,
};
