#!/usr/bin/env node
'use strict';

/**
 * github-mcp - Post-Execute Hook
 * Records execution result and logs completion of GitHub MCP operations.
 */

const { safeParseJSON } = require('../../../lib/utils/safe-json.cjs');

// ─── Result parsing ────────────────────────────────────────────────────────────

function parseResult() {
  const raw = process.argv.length > 2 ? process.argv.slice(2).join(' ') : '{}';
  try {
    return safeParseJSON(raw) || {};
  } catch (_err) {
    return {};
  }
}

// ─── Result assessment ─────────────────────────────────────────────────────────

function assessResult(result) {
  const warnings = [];
  const payload = result && typeof result === 'object' ? result : {};

  // Warn if the operation reported errors
  if (payload.error) {
    warnings.push(`GitHub MCP reported an error: ${payload.error}`);
  }

  // Warn if authentication issues detected
  if (payload.authError || payload.statusCode === 401 || payload.statusCode === 403) {
    warnings.push('GitHub authentication issue detected; verify GITHUB_PERSONAL_ACCESS_TOKEN');
  }

  // Warn if rate-limited
  if (payload.statusCode === 429 || payload.rateLimited) {
    warnings.push('GitHub API rate limit reached; consider waiting before retrying');
  }

  return warnings;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const result = parseResult();
const warnings = assessResult(result);

console.log('[GITHUB-MCP] Post-execute processing...');

if (warnings.length > 0) {
  for (const w of warnings) {
    console.warn(`[GITHUB-MCP] Warning: ${w}`);
  }
}

console.log('[GITHUB-MCP] Post-processing complete');
process.exit(0);
