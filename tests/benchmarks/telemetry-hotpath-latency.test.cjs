#!/usr/bin/env node
/**
 * Benchmark: Flight Recorder Latency Regression (TDD 1.1)
 * 
 * Measures the impact of file pruning on the recording hot-path.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { record } = require('../../.claude/lib/monitoring/flight-recorder.cjs');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const TEST_LOG = path.join(PROJECT_ROOT, '.claude', 'tmp', 'telemetry-hotpath-bench.jsonl');
const LOG_DIR = path.dirname(TEST_LOG);

async function runBenchmark() {
  console.log('--- Telemetry Hot-Path Benchmark ---');

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  
  // Cleanup
  const files = fs.readdirSync(LOG_DIR);
  for (const file of files) {
    if (file.includes('flight-recorder')) {
      try {
        fs.unlinkSync(path.join(LOG_DIR, file));
      } catch (_e) {
        // Best-effort cleanup.
      }
    }
  }

  // 1. Setup "Noise": Create 50 dummy rotated logs to slow down pruning
  console.log('Creating 50 dummy rotated logs...');
  for (let i = 0; i < 50; i++) {
    const dummyPath = path.join(LOG_DIR, `.flight-recorder.${Date.now() + i}.jsonl`);
    fs.writeFileSync(dummyPath, '{"dummy":true}\n');
  }

  // 2. Measure record() latency
  const ITERATIONS = 500;
  console.log(`Recording ${ITERATIONS} events...`);
  
  const start = Date.now();
  for (let i = 0; i < ITERATIONS; i++) {
    record({ event: 'bench', i }, TEST_LOG);
  }
  const elapsed = Date.now() - start;

  console.log(`Total Time: ${elapsed}ms`);
  console.log(`Avg Latency: ${(elapsed / ITERATIONS).toFixed(3)}ms per call`);

  // Target: With AsyncLogBuffer + Optimized Pruning, this should be < 0.1ms avg
  // Currently, if it's calling pruneOldFiles every time, it will be > 1ms.
  if (elapsed > 100) {
    console.error(`\n[FAIL] Performance regression detected: ${elapsed}ms is too slow for ${ITERATIONS} records.`);
    process.exit(1);
  } else {
    console.log('\n[PASS] Telemetry hot-path is efficient.');
    process.exit(0);
  }
}

runBenchmark();
