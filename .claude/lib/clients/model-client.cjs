'use strict';

/**
 * Stub: ModelClient was deleted during archive cleanup (2026-02-09).
 *
 * This stub satisfies consumer imports in:
 * - .claude/lib/memory/intent-analyzer.cjs
 * - .claude/lib/memory/memory-extractor.cjs
 * - .claude/lib/memory/memory-deduplicator.cjs
 * - .claude/lib/memory/memory-extraction-writer.cjs
 * - .claude/lib/memory/session-summary.cjs
 *
 * All consumers have fallback logic for mock/empty mode.
 *
 * Verified API (from intent-analyzer.cjs and memory-extractor.cjs):
 * - new ModelClient(options?)
 * - isMockMode() -> boolean
 * - generateText({ system, messages }) -> Promise<string>
 */

class ModelClient {
  constructor(options) {
    this._mockMode = true;
    this.options = options || {};
  }

  isMockMode() {
    return this._mockMode;
  }

  async generateText(_params) {
    // Return empty string - consumers have fallback heuristics
    return '';
  }
}

module.exports = { ModelClient };
