'use strict';

/**
 * Stub: error-summary-extractor was removed during reflection hook cleanup (2026-02-09).
 *
 * This stub satisfies consumer imports in:
 * - .claude/hooks/reflection/unified-reflection-handler.cjs (line 57)
 *
 * Verified API (from unified-reflection-handler.cjs lines 54-57):
 * - Consumer uses try/catch with graceful degradation (errorSummaryExtractor can be null)
 * - extractSummaryForReflection(options) -> object with errorCount, summaryPath, etc.
 *
 * Expected return structure:
 * - errorCount: number
 * - summaryPath: string | null
 * - reflectionWeight: number
 * - actionItems: array
 * - summary: { criticalErrors: array, patterns: { repeatedErrors: array, cascades: array } }
 */

module.exports = {
  extractSummaryForReflection: _options => ({
    errorCount: 0,
    summaryPath: null,
    reflectionWeight: 0,
    actionItems: [],
    summary: {
      criticalErrors: [],
      patterns: {
        repeatedErrors: [],
        cascades: [],
      },
    },
  }),
};
