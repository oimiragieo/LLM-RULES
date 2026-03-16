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

const path = require('path');
const { safeParseJSON } = require(path.resolve(__dirname, '../../lib/utils/safe-json.cjs'));

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
  const { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, totalCost } = data;

  const totalTokens = inputTokens + outputTokens;
  const lines = [];

  // Primary usage line
  lines.push(
    `[ccusage] Today: ${_fmtNum(totalTokens)} tokens` +
      ` (in: ${_fmtNum(inputTokens)}, out: ${_fmtNum(outputTokens)})` +
      ` | ${_fmtCost(totalCost)}`
  );

  // Cache savings line (only when cache was used)
  if (cacheCreationTokens > 0 || cacheReadTokens > 0) {
    lines.push(
      `[ccusage] Cache: ${_fmtNum(cacheReadTokens)} read, ${_fmtNum(cacheCreationTokens)} written`
    );
  }

  // Write to stderr (hooks use stderr for informational output)
  process.stderr.write(lines.join('\n') + '\n');
}

main();
