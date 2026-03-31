#!/usr/bin/env node
'use strict';

/**
 * ccusage-statusline.cjs — UserPromptSubmit hook
 *
 * Displays today's Claude API token usage and cost to stderr before each
 * prompt. Acts as a lightweight "status bar" so users can see cumulative
 * spend at a glance without leaving the Claude Code session.
 *
 * Kill switch: Set CCUSAGE_STATUSLINE=off to suppress all output.
 *
 * Fail-open: All errors are silently swallowed and the hook exits 0.
 * This hook is purely advisory — it must never block the user's prompt.
 *
 * Registration: settings.json UserPromptSubmit (matcher: "")
 *
 * @module ccusage-statusline
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require(path.resolve(__dirname, '../../lib/utils/safe-json.cjs'));

// ── Runtime file output ───────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const STATUS_FILE = process.env.CCUSAGE_RUNTIME_DIR
  ? path.join(process.env.CCUSAGE_RUNTIME_DIR, 'ccusage-status.txt')
  : path.join(RUNTIME_DIR, 'ccusage-status.txt');

// ── Adapter loading ──────────────────────────────────────────────────────────

/**
 * Lazily load the ccusage adapter so startup is fast and errors are contained.
 * Returns null if the adapter cannot be loaded.
 *
 * @returns {{ getTodayTotals: Function }|null}
 */
function _loadAdapter() {
  try {
    return require(path.resolve(__dirname, '../../lib/utils/ccusage-adapter.cjs'));
  } catch (_err) {
    return null;
  }
}

/**
 * Lazily load compression stats. Returns null if unavailable.
 *
 * @returns {{ totalCompressions: number, totalBytesSaved: number, averageReduction: string, lastCompressionTime: string }|null}
 */
function _loadCompressionStats() {
  try {
    const { getCompressionStats } = require(
      path.resolve(__dirname, '../../lib/utils/compression-trigger.cjs')
    );
    return getCompressionStats();
  } catch (_err) {
    return null;
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format a number with thousands-separator commas (en-US locale).
 *
 * @param {number} n
 * @returns {string}
 */
function _fmtNum(n) {
  return n.toLocaleString('en-US');
}

/**
 * Format a cost value as $X.XXXX (4 decimal places).
 *
 * @param {number} cost
 * @returns {string}
 */
function _fmtCost(cost) {
  return `$${cost.toFixed(4)}`;
}

// ── Mock data support (for testing) ─────────────────────────────────────────

/**
 * When CCUSAGE_TEST_MOCK_DATA is set, parse and return it instead of calling
 * the real adapter. This allows tests to inject controlled data without
 * spawning npx.
 *
 * @returns {{ inputTokens: number, outputTokens: number, cacheCreationTokens: number, cacheReadTokens: number, totalCost: number }|null}
 */
function _getMockData() {
  const raw = process.env.CCUSAGE_TEST_MOCK_DATA;
  if (!raw) return null;
  const parsed = safeParseJSON(raw, null);
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    inputTokens: Number(parsed.inputTokens ?? 0),
    outputTokens: Number(parsed.outputTokens ?? 0),
    cacheCreationTokens: Number(parsed.cacheCreationTokens ?? 0),
    cacheReadTokens: Number(parsed.cacheReadTokens ?? 0),
    totalCost: Number(parsed.totalCost ?? 0),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // 1. Kill switch — bail immediately if disabled
  if (process.env.CCUSAGE_STATUSLINE === 'off') {
    process.exit(0);
  }

  // 2. Read stdin (required by hook protocol, but content is unused here)
  let _stdinData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    _stdinData += chunk;
  });

  process.stdin.on('end', () => {
    try {
      _run();
    } catch (_err) {
      // Fail-open: never block the user's prompt
    }
    process.exit(0);
  });
}

function _run() {
  // 3. Get usage data — prefer mock (test) data, then real adapter
  let data = _getMockData();

  if (!data) {
    const adapter = _loadAdapter();
    if (!adapter) return; // adapter unavailable, skip silently
    data = adapter.getTodayTotals();
  }

  if (!data) return; // no data available (ccusage disabled/not installed)

  // 4. Build and emit the status line
  const { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens } = data;

  const totalTokens = inputTokens + outputTokens;
  const lines = [];

  // Calculate real costs using pricing table
  let costs = null;
  try {
    const adapter = _loadAdapter();
    if (adapter && adapter.calculateCost) {
      costs = adapter.calculateCost(data, process.env.CCUSAGE_MODEL || 'opus');
    }
  } catch (_e) {
    // fall back to no cost display
  }

  // Line 1: Token usage + real cost
  const costStr = costs ? _fmtCost(costs.actualCost) : _fmtCost(0);
  lines.push(
    `[tokens] ${_fmtNum(totalTokens)} today` +
      ` (in: ${_fmtNum(inputTokens)} / out: ${_fmtNum(outputTokens)})` +
      ` | Cost: ${costStr}`
  );

  // Line 2: Cache savings (only when cache was used)
  if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
    const savedStr = costs ? _fmtCost(costs.cacheSavings) : '?';
    lines.push(
      `[cache] ${savedStr} saved | ${_fmtNum(cacheReadTokens)} reads, ${_fmtNum(cacheCreationTokens)} writes`
    );
  }

  // Line 3: Compression stats (only when compressions have occurred)
  const compStats = _loadCompressionStats();
  if (compStats && compStats.totalCompressions > 0) {
    const kbFreed = (compStats.totalBytesSaved / 1024).toFixed(1);
    // Estimate tokens avoided: ~4 chars per token
    const tokensAvoided = Math.round(compStats.totalBytesSaved / 4);
    // Estimate cost saved (tokens that would have been input)
    const model = process.env.CCUSAGE_MODEL || 'opus';
    let compSaved = '';
    try {
      const adapter = _loadAdapter();
      if (adapter && adapter.PRICING) {
        const tier = adapter.PRICING[model] || adapter.PRICING['opus'];
        const saved = (tokensAvoided / 1_000_000) * tier.input;
        compSaved = ` | ~${_fmtCost(saved)} saved`;
      }
    } catch (_e) {
      // skip cost estimate
    }
    lines.push(
      `[compression] ${compStats.totalCompressions} events | ${kbFreed}KB freed (~${_fmtNum(tokensAvoided)} tokens)${compSaved}`
    );
  }

  const output = lines.join('\n') + '\n';

  // Write to runtime file so the router can read status without intercepting stderr
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, output, 'utf8');
  } catch (_writeErr) {
    // Fail-open: never block the user's prompt over a status file write failure
  }

  // Write to stderr (hooks use stderr for informational output)
  process.stderr.write(output);
}

if (require.main === module) {
  main();
}

// Export for programmatic use by consolidated bundles
module.exports = { _run, _getMockData, _loadAdapter };
