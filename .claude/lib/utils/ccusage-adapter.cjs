'use strict';

/**
 * ccusage-adapter.cjs — CLI wrapper for ccusage token tracking
 *
 * Fetches actual API token usage from Claude Code session logs using the
 * `ccusage` CLI tool via `npx`. All subprocess calls use shell: false with
 * array arguments to prevent command injection. All JSON parsing uses
 * safeParseJSON to prevent prototype pollution.
 *
 * Graceful degradation: returns null on any error (ccusage not installed,
 * timeout, malformed output, etc.). Callers should fall back to heuristics.
 *
 * Testing: Inject a mock via `setExecOverride(fn)` in tests. Reset with
 * `setExecOverride(null)`.
 *
 * @module ccusage-adapter
 */

const { execFileSync } = require('child_process');
const { safeParseJSON } = require('./safe-json.cjs');

/** Pinned major version — do NOT use @latest (breaks reproducibility) */
const CCUSAGE_VERSION = '1';

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000;

/** Sensitive env vars to strip before spawning subprocess */
const SENSITIVE_VARS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CLAUDE_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

/** Internal memoization cache */
const _cache = { data: null, timestamp: 0 };

/** Test override: set via setExecOverride(fn) in test code */
let _execOverride = null;

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Build a sanitized copy of process.env with sensitive keys removed.
 * Prevents credential leakage to subprocess.
 *
 * @returns {NodeJS.ProcessEnv} Sanitized environment object
 */
function _sanitizedEnv() {
  const env = { ...process.env };
  for (const key of SENSITIVE_VARS) {
    delete env[key];
  }
  return env;
}

/**
 * Return today's date in YYYYMMDD format (ccusage --since/--until format).
 *
 * @returns {string} e.g. "20260316"
 */
function _todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Execute ccusage via npx and parse the JSON output.
 * Uses shell: false with array args (security requirement).
 *
 * @param {string[]} extraArgs - Additional CLI args (e.g. ['--since', '20260316'])
 * @returns {object|null} Normalized usage or null on any error
 */
function _execCcusage(extraArgs) {
  if (process.env.CCUSAGE_DISABLED === 'true' || process.env.CCUSAGE_DISABLED === '1') {
    return null;
  }

  const args = [
    `ccusage@${CCUSAGE_VERSION}`,
    'daily',
    '--json',
    '--offline',
    ...extraArgs,
  ];

  let stdout;
  try {
    if (_execOverride) {
      // Test injection point — override execFileSync behavior
      stdout = _execOverride('npx', args, {
        encoding: 'utf8',
        timeout: 15_000,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: _sanitizedEnv(),
        windowsHide: true,
      });
    } else {
      stdout = execFileSync('npx', args, {
        encoding: 'utf8',
        timeout: 15_000,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: _sanitizedEnv(),
        windowsHide: true,
      });
    }
  } catch (_err) {
    // ccusage not installed, timeout, non-zero exit, etc. — all gracefully degraded
    return null;
  }

  // safeParseJSON returns the parsed object directly (no {success, data} wrapper).
  // Pass null as schemaName to use the fallback (no schema validation, just safe parse).
  const parsed = safeParseJSON(stdout.trim(), null);
  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) return null;

  return _normalize(parsed);
}

/**
 * Normalize ccusage output to a consistent shape.
 * ccusage may return a summary wrapper or a direct object.
 *
 * @param {object} raw - Raw parsed JSON from ccusage
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 */
function _normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // ccusage daily --json returns { summary: {...}, models: [...], days: [...] }
  const src = raw.summary || raw;

  const inputTokens = Number(src.inputTokens ?? src.input_tokens ?? 0);
  const outputTokens = Number(src.outputTokens ?? src.output_tokens ?? 0);
  const cacheCreationTokens = Number(src.cacheCreationTokens ?? src.cache_creation_tokens ?? 0);
  const cacheReadTokens = Number(src.cacheReadTokens ?? src.cache_read_tokens ?? 0);
  const totalCost = Number(src.totalCost ?? src.total_cost ?? 0);

  return { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalCost };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get token usage for the current session (today's date, memoized 30s).
 *
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 *   Null when ccusage is unavailable or disabled.
 */
function getSessionUsage() {
  const now = Date.now();
  if (_cache.data && (now - _cache.timestamp) < CACHE_TTL_MS) {
    return _cache.data;
  }

  const data = _execCcusage(['--since', _todayYYYYMMDD()]);
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
  return _execCcusage(['--since', date, '--until', date]);
}

/**
 * Get aggregated token totals for today (not memoized).
 *
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 */
function getTodayTotals() {
  return _execCcusage(['--since', _todayYYYYMMDD()]);
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
 * Set a test override for execFileSync behavior.
 * Pass null to restore real behavior.
 *
 * @param {Function|null} fn - Replacement function with same signature as execFileSync, or null
 */
function setExecOverride(fn) {
  _execOverride = fn;
}

module.exports = {
  getSessionUsage,
  getDailyUsage,
  getTodayTotals,
  clearCache,
  _forceExpireCache,
  setExecOverride,
  CCUSAGE_VERSION,
};
