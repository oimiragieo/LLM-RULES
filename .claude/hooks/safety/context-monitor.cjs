#!/usr/bin/env node
'use strict';

/**
 * context-monitor.cjs — PostToolUse hook
 *
 * Monitors context window usage and injects warnings when approaching limits.
 * - WARNING at 35% remaining context
 * - CRITICAL at 25% remaining context
 * - Debounce: max 1 warning per 5 tool uses (CRITICAL bypasses debounce)
 * - Reads from bridge file, not computed inline
 * - Advisory hook: fail-open (exit 0)
 */

const fs = require('fs');
const path = require('path');

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
const DEBOUNCE_INTERVAL = 5; // tool uses between warnings

let toolUsesSinceLastWarning = 0;

try {
  let _inputData = '';
  process.stdin.on('data', chunk => {
    _inputData += chunk;
  });

  process.stdin.on('end', () => {
    toolUsesSinceLastWarning++;

    // Read bridge file for token budget info
    let budgetInfo = null;
    try {
      if (fs.existsSync(BRIDGE_PATH)) {
        const raw = fs.readFileSync(BRIDGE_PATH, 'utf8');
        budgetInfo = JSON.parse(raw);
      }
    } catch {
      // Bridge file missing or invalid — skip monitoring
      process.exit(0);
    }

    if (!budgetInfo || typeof budgetInfo.remainingPercent !== 'number') {
      process.exit(0);
    }

    const remaining = budgetInfo.remainingPercent;

    // CRITICAL: bypass debounce
    if (remaining <= CRITICAL_THRESHOLD) {
      console.error(
        `[CRITICAL] Context monitor: ${(remaining * 100).toFixed(0)}% remaining. Compress context immediately.`
      );
      toolUsesSinceLastWarning = 0;
      process.exit(0);
    }

    // WARNING: respect debounce
    if (remaining <= WARNING_THRESHOLD && toolUsesSinceLastWarning >= DEBOUNCE_INTERVAL) {
      console.error(
        `[WARNING] Context monitor: ${(remaining * 100).toFixed(0)}% remaining. Consider compressing.`
      );
      toolUsesSinceLastWarning = 0;
    }

    process.exit(0);
  });
} catch {
  // Fail-open: advisory hook never blocks
  process.exit(0);
}
