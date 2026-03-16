'use strict';

/**
 * ccusage-adapter.cjs — Direct JSONL parser for Claude Code session logs
 *
 * Parses Claude Code session JSONL files directly from disk instead of calling
 * the ccusage CLI. This avoids the 60s+ startup penalty on Windows caused by
 * npm .cmd shim ENOENT issues with shell:false.
 *
 * Performance: ~2.5s vs 60s+ for CLI approach.
 *
 * Log location: ~/.claude/projects/<project-dir>/<session-uuid>.jsonl
 * Project dir: CWD path separators replaced with '-'
 *   e.g. C:/dev/projects/agent-studio → C--dev-projects-agent-studio
 *
 * JSONL entry schema:
 *   { timestamp, message: { usage: { input_tokens, output_tokens,
 *     cache_creation_input_tokens, cache_read_input_tokens }, model }, costUSD }
 *
 * Security: all JSON parsing uses safeParseJSON (prototype pollution protection).
 * No subprocess spawning — no shell injection surface.
 *
 * Graceful degradation: returns null when log directory does not exist,
 * CCUSAGE_DISABLED=true, or on any parse error.
 *
 * Testing: Inject a mock directory scanner via setParseOverride(fn) in tests.
 * Reset with setParseOverride(null). setExecOverride is kept for backwards
 * compatibility with existing tests that call it (it is ignored).
 *
 * @module ccusage-adapter
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { safeParseJSON } = require('./safe-json.cjs');

/** Version identifier */
const CCUSAGE_VERSION = '18';

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000;

/** Internal memoization cache */
const _cache = { data: null, timestamp: 0 };

/**
 * Test override: set via setParseOverride(fn) in test code.
 * The override function receives (projectDir, date) and returns
 * a usage object or null.
 */
let _parseOverride = null;

/**
 * Legacy test override for execFileSync (kept for backwards compat).
 * In the new implementation this is never called but kept so existing
 * test teardown code calling setExecOverride(null) does not throw.
 */
// Legacy _execOverride removed — no subprocess calls in JSONL-based implementation

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Derive the Claude Code project directory name from a filesystem path.
 * Claude Code replaces all path separator characters with '-'.
 *
 *   C:\dev\projects\agent-studio  →  C--dev-projects-agent-studio
 *   /home/user/projects/foo       →  -home-user-projects-foo
 *
 * @param {string} cwdPath - Absolute path (e.g. process.cwd())
 * @returns {string} Project directory name used by Claude Code
 */
function _cwdToProjectDir(cwdPath) {
  // Normalize backslashes to forward slashes, replace colon (drive letter on
  // Windows), then replace all forward slashes with '-'.
  // e.g. C:\dev\projects\foo  → C:/dev/projects/foo → C:-dev-projects-foo
  //      but Claude Code uses '-' for ':' too → C--dev-projects-foo
  // Verified: Claude Code replaces EVERY non-alphanumeric path separator with '-'
  return cwdPath
    .replace(/\\/g, '/') // backslash → forward slash
    .replace(/:/g, '-') // colon (Windows drive letter) → dash
    .replace(/\//g, '-'); // forward slash → dash
}

/**
 * Return the candidate log directories for Claude Code session files.
 * Claude Code may write to either location depending on OS / config.
 *
 * @param {string} projectDir - Project directory name (from _cwdToProjectDir)
 * @returns {string[]} Array of candidate absolute paths (may not exist)
 */
function _logDirs(projectDir) {
  const home = os.homedir();
  return [
    path.join(home, '.claude', 'projects', projectDir),
    path.join(home, '.config', 'claude', 'projects', projectDir),
  ];
}

/**
 * Return today's date as an ISO 8601 date prefix "YYYY-MM-DD".
 * JSONL timestamps are ISO strings; we use includes() for fast line filtering.
 *
 * @returns {string} e.g. "2026-03-16"
 */
function _todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Convert YYYYMMDD string (legacy ccusage format) to ISO date prefix.
 *
 * @param {string} yyyymmdd - e.g. "20260316"
 * @returns {string} e.g. "2026-03-16"
 */
function _yyyymmddToISO(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * Read all JSONL files in logDir and sum usage fields for lines containing
 * the given date prefix string.
 *
 * @param {string} logDir - Absolute path to log directory
 * @param {string} datePrefix - ISO date prefix to filter by (e.g. "2026-03-16")
 * @returns {{ inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalCost }}
 */
function _sumLogDir(logDir, datePrefix) {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let totalCost = 0;

  let entries;
  try {
    entries = fs.readdirSync(logDir);
  } catch (_err) {
    return null; // directory doesn't exist or not readable
  }

  const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) return null;

  let hasData = false;

  for (const file of jsonlFiles) {
    const filePath = path.join(logDir, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_err) {
      continue;
    }

    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      // Fast path: skip lines that don't contain the date prefix at all
      if (!line.includes(datePrefix)) continue;

      const parsed = safeParseJSON(line, null);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

      // Extract usage from message.usage
      const usage = parsed.message && parsed.message.usage;
      if (usage && typeof usage === 'object') {
        inputTokens += Number(usage.input_tokens ?? 0);
        outputTokens += Number(usage.output_tokens ?? 0);
        cacheCreationTokens += Number(usage.cache_creation_input_tokens ?? 0);
        cacheReadTokens += Number(usage.cache_read_input_tokens ?? 0);
        hasData = true;
      }

      // costUSD may appear at top level
      if (typeof parsed.costUSD === 'number') {
        totalCost += parsed.costUSD;
        hasData = true;
      }
    }
  }

  if (!hasData) return null;
  return { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalCost };
}

/**
 * Parse JSONL logs for the given ISO date prefix.
 * Tries each candidate log directory, returns the first non-null result,
 * or merges results if multiple directories have data.
 *
 * @param {string} datePrefix - ISO date prefix "YYYY-MM-DD"
 * @returns {{ inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalCost }|null}
 */
function _parseForDate(datePrefix) {
  if (process.env.CCUSAGE_DISABLED === 'true' || process.env.CCUSAGE_DISABLED === '1') {
    return null;
  }

  if (_parseOverride) {
    return _parseOverride(datePrefix);
  }

  const projectDir = _cwdToProjectDir(process.cwd());
  const dirs = _logDirs(projectDir);

  let merged = null;

  for (const dir of dirs) {
    const result = _sumLogDir(dir, datePrefix);
    if (!result) continue;
    if (!merged) {
      merged = { ...result };
    } else {
      merged.inputTokens += result.inputTokens;
      merged.outputTokens += result.outputTokens;
      merged.cacheCreationTokens += result.cacheCreationTokens;
      merged.cacheReadTokens += result.cacheReadTokens;
      merged.totalCost += result.totalCost;
    }
  }

  return merged;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get token usage for the current session (today's date, memoized 30s).
 *
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 *   Null when logs are unavailable or adapter is disabled.
 */
function getSessionUsage() {
  const now = Date.now();
  if (_cache.data && now - _cache.timestamp < CACHE_TTL_MS) {
    return _cache.data;
  }

  const data = _parseForDate(_todayISO());
  if (data) {
    _cache.data = data;
    _cache.timestamp = now;
  }
  return data;
}

/**
 * Get token usage for a specific date (not memoized).
 *
 * @param {string} date - Date in YYYYMMDD format (e.g. "20260316")
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 */
function getDailyUsage(date) {
  return _parseForDate(_yyyymmddToISO(date));
}

/**
 * Get aggregated token totals for today (not memoized).
 *
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 */
function getTodayTotals() {
  return _parseForDate(_todayISO());
}

/**
 * Clear the internal memoization cache.
 * Useful in tests and when forcing a fresh fetch.
 */
function clearCache() {
  _cache.data = null;
  _cache.timestamp = 0;
}

/**
 * Force-expire the cache by resetting its timestamp (for TTL expiry tests).
 */
function _forceExpireCache() {
  _cache.timestamp = 0;
}

/**
 * Set a test override for the JSONL parsing logic.
 * The override function receives (datePrefix: string) and returns a usage
 * object or null — same contract as _parseForDate().
 * Pass null to restore real behavior.
 *
 * @param {Function|null} fn - Replacement function or null
 */
function setParseOverride(fn) {
  _parseOverride = fn;
}

/**
 * Legacy alias kept for backwards compatibility with tests that call
 * setExecOverride(null) in afterEach cleanup.
 * In the new implementation the exec path does not exist; calling this
 * with a non-null function will NOT intercept any calls.
 *
 * @param {Function|null} _fn - Ignored in new implementation
 */
function setExecOverride(_fn) {
  // No-op in new JSONL-based implementation.
  // Kept so old test teardown code (setExecOverride(null)) does not throw.
}

module.exports = {
  getSessionUsage,
  getDailyUsage,
  getTodayTotals,
  clearCache,
  _forceExpireCache,
  setExecOverride,
  setParseOverride,
  _cwdToProjectDir,
  _yyyymmddToISO,
  CCUSAGE_VERSION,
};
