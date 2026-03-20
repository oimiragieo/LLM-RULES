#!/usr/bin/env node
'use strict';

/**
 * context-monitor.cjs — PostToolUse hook
 *
 * Monitors context window usage and injects warnings when approaching limits.
 * - WARNING at 35% remaining context
 * - CRITICAL at 25% remaining context
 * - Reads from bridge file, not computed inline
 * - Advisory hook: fail-open (exit 0)
 */

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const BRIDGE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'context',
  'runtime',
  'token-budget-bridge.json'
);

const WARNING_THRESHOLD = 0.35; // 35% remaining
const CRITICAL_THRESHOLD = 0.25; // 25% remaining

try {
  let _inputData = '';
  process.stdin.on('data', chunk => {
    _inputData += chunk;
  });

  process.stdin.on('end', () => {
    // Read bridge file for token budget info
    let budgetInfo = null;
    try {
      if (fs.existsSync(BRIDGE_PATH)) {
        const raw = fs.readFileSync(BRIDGE_PATH, 'utf8');
        budgetInfo = safeParseJSON(raw, null);
      }
    } catch {
      // Bridge file missing or invalid — skip monitoring
      process.exit(0);
    }

    if (!budgetInfo || typeof budgetInfo.remainingPercent !== 'number') {
      process.exit(0);
    }

    const remaining = budgetInfo.remainingPercent;

    // CRITICAL
    if (remaining <= CRITICAL_THRESHOLD) {
      console.error(
        `[CRITICAL] Context monitor: ${(remaining * 100).toFixed(0)}% remaining. Compress context immediately.`
      );
      process.exit(0);
    }

    // WARNING
    if (remaining <= WARNING_THRESHOLD) {
      console.error(
        `[WARNING] Context monitor: ${(remaining * 100).toFixed(0)}% remaining. Consider compressing.`
      );
    }

    process.exit(0);
  });
} catch {
  // Fail-open: advisory hook never blocks
  process.exit(0);
}
