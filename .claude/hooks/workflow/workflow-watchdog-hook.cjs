#!/usr/bin/env node
'use strict';
/**
 * workflow-watchdog-hook.cjs (Track 1.2)
 *
 * PostToolUse hook: calls runWatchdogOnce() after TaskUpdate operations
 * to detect stalled workflow phases and write them to the DLQ.
 *
 * Mode: PostToolUse
 * Matcher: TaskUpdate
 * Enforcement: advisory-only (always exits 0, SE-03)
 *
 * Environment:
 *   WORKFLOW_WATCHDOG_THRESHOLD_MS - stall threshold in ms (default: 300000 = 5 min)
 */

const { runWatchdogOnce } = require('../../lib/workflow/workflow-watchdog.cjs');

async function main() {
  try {
    const thresholdMs = Number(process.env.WORKFLOW_WATCHDOG_THRESHOLD_MS) || undefined;
    await runWatchdogOnce({ thresholdMs });
  } catch (_err) {
    // SE-03: never throw — advisory only
  }
  process.exit(0);
}

main();
