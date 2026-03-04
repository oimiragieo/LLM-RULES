'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

let SEARCH_TELEMETRY_LOG = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'search-telemetry.jsonl'
);

/**
 * Detect whether a Grep tool invocation looks like a broad search
 * (vs. a targeted single-file check).
 *
 * @param {object|null} toolInput - The tool_input from hook input
 * @returns {boolean} true if the usage looks like a broad/directory search
 */
function detectSearchLikeGrep(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  const p = (toolInput.path || '').trim();
  const inc = (toolInput.include || '').trim();
  // If include field has a glob pattern → broad search
  if (inc && (inc.includes('*') || inc.includes('?'))) return true;
  // No path or empty → broad search
  if (!p) return true;
  // Path is current directory or parent
  if (p === '.' || p === '..') return true;
  // Path ends with / or \ → directory
  if (p.endsWith('/') || p.endsWith('\\')) return true;
  // Path contains glob wildcards → broad
  if (p.includes('*') || p.includes('?')) return true;
  // Path has no file extension and no dot in the basename → likely directory
  const basename = path.basename(p);
  if (!basename.includes('.')) return true;
  // Otherwise it's a specific file → not search-like
  return false;
}

/**
 * Record a search telemetry event to the JSONL log.
 *
 * @param {object} toolInput - The tool_input from hook input
 */
function recordSearchTelemetry(hookInput) {
  try {
    const ti = (hookInput && hookInput.tool_input) || hookInput || {};
    if (!detectSearchLikeGrep(ti)) return;
    const entry = {
      timestamp: new Date().toISOString(),
      toolName: 'Grep',
      pattern: ti.pattern || '',
      path: ti.path || '',
      searchLike: true,
      note: 'Agent used raw Grep for broad search instead of ripgrep/semantic-search skill',
    };
    fs.mkdirSync(path.dirname(SEARCH_TELEMETRY_LOG), { recursive: true });
    fs.appendFileSync(SEARCH_TELEMETRY_LOG, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_e) {
    // Never crash the hook on telemetry failure
  }
}

module.exports = {
  get SEARCH_TELEMETRY_LOG() {
    return SEARCH_TELEMETRY_LOG;
  },
  setSearchTelemetryLog(filePath) {
    SEARCH_TELEMETRY_LOG = filePath;
  },
  detectSearchLikeGrep,
  recordSearchTelemetry,
};
