#!/usr/bin/env node
/**
 * Benchmark for Hook Overhead
 * 
 * Measures time to run a simple hook 10 times using spawn.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(__dirname, '..', '..', '.claude', 'hooks', 'run-hook.cjs');
const SIMPLE_HOOK = 'metrics/collector'; // Assuming this exists or is fast

async function benchmark() {
  console.log('Hook Latency Benchmark (Current Spawn-based)');
  
  const start = Date.now();
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [HOOK_PATH, SIMPLE_HOOK, '--dry-run'], { stdio: 'ignore' });
      child.on('close', resolve);
    });
  }
  const total = Date.now() - start;
  console.log(`Total time for 5 hooks: ${total}ms`);
  console.log(`Average overhead: ${total / 5}ms per hook`);
}

benchmark();
