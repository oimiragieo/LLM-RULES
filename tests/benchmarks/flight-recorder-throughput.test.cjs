#!/usr/bin/env node
/**
 * Benchmark: Flight Recorder Throughput
 * 
 * Measures the time to write 10,000 log entries.
 * Compares Synchronous (Current) vs Async Buffer (Target).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { record } = require('../../.claude/lib/monitoring/flight-recorder.cjs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const TEST_LOG = path.join(PROJECT_ROOT, '.claude', 'tmp', 'flight-recorder-bench.jsonl');

async function benchmark() {
  console.log('Flight Recorder Benchmark');
  console.log('=========================');

  // Ensure dir
  if (!fs.existsSync(path.dirname(TEST_LOG))) fs.mkdirSync(path.dirname(TEST_LOG), { recursive: true });
  if (fs.existsSync(TEST_LOG)) fs.unlinkSync(TEST_LOG);

  const ITERATIONS = 5000;
  
  console.log(`Writing ${ITERATIONS} records (Sync Mode)...`);
  const start = Date.now();
  
  for (let i = 0; i < ITERATIONS; i++) {
    record({
      event: 'benchmark_event',
      traceId: `trace-${i}`,
      data: { i, random: Math.random() }
    }, TEST_LOG);
  }
  
  const elapsed = Date.now() - start;
  console.log(`Total Time: ${elapsed}ms`);
  console.log(`Throughput: ${(ITERATIONS / (elapsed / 1000)).toFixed(0)} events/sec`);
  console.log(`Avg Latency: ${(elapsed / ITERATIONS).toFixed(3)}ms per call (Blocking)`);

  // Target: Non-blocking call should return effectively instantly (< 0.1ms)
  // The actual flush happens later, but the agent thread isn't blocked.
  
  if (elapsed / ITERATIONS > 0.5) {
    console.log('\n[INFO] Blocking I/O detected (> 0.5ms per write). Optimization needed.');
  }
}

benchmark();
