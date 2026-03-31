#!/usr/bin/env node
'use strict';

/**
 * differential-review - Post-Execute Hook
 * Records metrics and findings summary after differential-review execution.
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

  // Summarise findings if provided
  if (payload.findings && Array.isArray(payload.findings)) {
    const critical = payload.findings.filter(f => f.severity === 'CRITICAL').length;
    const high = payload.findings.filter(f => f.severity === 'HIGH').length;
    if (critical > 0) {
      warnings.push(
        `${critical} CRITICAL finding(s) found — review must be addressed before merge`
      );
    }
    if (high > 0) {
      warnings.push(`${high} HIGH finding(s) found — recommend addressing before merge`);
    }
  }

  // Warn if verdict is BLOCK or REQUEST_CHANGES
  if (payload.verdict === 'BLOCK') {
    warnings.push('Review verdict: BLOCK — critical vulnerability introduced');
  } else if (payload.verdict === 'REQUEST_CHANGES') {
    warnings.push('Review verdict: REQUEST CHANGES — security issues must be addressed');
  }

  return warnings;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const result = parseResult();
const warnings = assessResult(result);

console.log('[DIFFERENTIAL-REVIEW] Post-execute processing...');

if (warnings.length > 0) {
  for (const w of warnings) {
    console.warn(`[DIFFERENTIAL-REVIEW] Warning: ${w}`);
  }
}

console.log('[DIFFERENTIAL-REVIEW] Post-processing complete');
process.exit(0);
