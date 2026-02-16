#!/usr/bin/env node
/**
 * Benchmark: Hook Execution Latency (Process vs Worker)
 *
 * Compares traditional process spawn overhead against the new worker thread runner.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const HOOK_DISPATCHER = path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'run-hook.cjs');
const TEST_HOOK = 'validation/check-console-log'; // Use a simple existing JS hook

async function runBenchmark(mode, iterations = 10) {
  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [HOOK_DISPATCHER, TEST_HOOK, '--dry-run'], {
        stdio: 'inherit',
        env: { ...process.env, HOOK_RUNNER_MODE: mode },
      });
      child.on('close', code => {
        if (code === 0 || code === null) resolve();
        else reject(new Error(`Hook failed with code ${code}`));
      });
    });
  }
  return Date.now() - start;
}

async function main() {
  console.log('--- Hook Latency Benchmark ---');
  console.log(`Hook: ${TEST_HOOK}`);
  console.log(`Iterations: 10
`);

  try {
    const processTime = await runBenchmark('process');
    console.log(`[MODE: process] Total: ${processTime}ms | Avg: ${processTime / 10}ms`);

    const workerTime = await runBenchmark('worker');
    console.log(`[MODE: worker ] Total: ${workerTime}ms | Avg: ${workerTime / 10}ms`);

    const improvement = (((processTime - workerTime) / processTime) * 100).toFixed(1);
    console.log(`\nImprovement: ${improvement}%`);

    if (workerTime >= processTime * 0.9) {
      console.log(
        '\nResult: [FAIL] Worker mode did not provide significant improvement (or not implemented).'
      );
      process.exit(1);
    } else {
      console.log('\nResult: [PASS] Worker mode is significantly faster.');
      process.exit(0);
    }
  } catch (err) {
    console.error(`Benchmark failed: ${err.message}`);
    process.exit(1);
  }
}

main();
