#!/usr/bin/env node
/**
 * Benchmark: Hook Pool Latency
 *
 * Measures the speed of executing multiple hooks within the same process
 * using the HookRunner worker pool.
 */

'use strict';

const path = require('path');
const HookRunner = require('../../.claude/lib/utils/hook-runner.cjs');
const { resolveHookScriptPath } = require('../../.claude/hooks/run-hook.cjs');

const TEST_HOOK = 'validation/check-console-log';

async function runBenchmark(mode, iterations = 10) {
  const runner = new HookRunner({ mode });
  const { scriptPath } = resolveHookScriptPath(TEST_HOOK);

  // Warm up the pool if in worker mode
  if (mode === 'worker') {
    await runner.run(scriptPath, ['--dry-run']);
  }

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await runner.run(scriptPath, ['--dry-run']);
  }
  return Date.now() - start;
}

async function main() {
  console.log('--- Hook Pool Latency Benchmark (Same Process) ---');
  console.log(`Hook: ${TEST_HOOK}`);
  console.log(`Iterations: 20
`);

  try {
    const processTime = await runBenchmark('process', 20);
    console.log(`[MODE: process] Total: ${processTime}ms | Avg: ${processTime / 20}ms`);

    const workerTime = await runBenchmark('worker', 20);
    console.log(`[MODE: worker ] Total: ${workerTime}ms | Avg: ${workerTime / 20}ms`);

    const improvement = (((processTime - workerTime) / processTime) * 100).toFixed(1);
    console.log(`
Improvement: ${improvement}%`);

    // In same process, worker mode should be VERY fast (sub-10ms avg ideally)
    if (workerTime < processTime * 0.2) {
      console.log('\nResult: [PASS] Worker pool is exceptionally fast.');
      process.exit(0);
    } else {
      console.log('\nResult: [FAIL] Worker pool did not provide enough improvement.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Benchmark failed: ${err.message}
${err.stack}`);
    process.exit(1);
  }
}

main();
