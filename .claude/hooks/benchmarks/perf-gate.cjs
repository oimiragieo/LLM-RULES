#!/usr/bin/env node
/**
 * Performance Regression Gate
 *
 * Runs the hook latency benchmark and enforces strict enterprise SLOs.
 * Exit Codes:
 * - 0: PASS (within bounds)
 * - 2: REGRESSION (performance too slow)
 * - 1: ERROR (benchmark failed to run)
 */

'use strict';

const HookRunner = require('../../lib/utils/hook-runner.cjs');
const { resolveHookScriptPath } = require('../run-hook.cjs');

const TEST_HOOK = 'validation/check-console-log';
const MAX_AVG_LATENCY_MS = Number(process.env.PERF_GATE_MAX_LATENCY_MS || 5);

async function main() {
  const mode = process.env.HOOK_RUNNER_MODE || 'worker';
  const runner = new HookRunner({ mode });
  const { scriptPath } = resolveHookScriptPath(TEST_HOOK);

  const iterations = 10;

  // Warm up
  if (mode === 'worker') {
    await runner.run(scriptPath, ['--dry-run']);
  }

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await runner.run(scriptPath, ['--dry-run']);
  }
  const total = Date.now() - start;
  const avg = total / iterations;

  if (avg > MAX_AVG_LATENCY_MS) {
    console.error(
      `[PERF-GATE] REGRESSION DETECTED: Avg latency ${avg.toFixed(2)}ms exceeds limit of ${MAX_AVG_LATENCY_MS}ms`
    );
    process.exit(2);
  }

  console.log(`[PERF-GATE] PASS: Avg latency ${avg.toFixed(2)}ms`);
  process.exit(0);
}

main().catch(err => {
  console.error(`[PERF-GATE] ERROR: ${err.message}`);
  process.exit(1);
});
