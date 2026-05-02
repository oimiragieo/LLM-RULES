#!/usr/bin/env node
/**
 * Tests for Performance Gate (Phase 4.1)
 *
 * Verifies that the performance gate:
 * 1. Correctly identifies regressions (exit code 4).
 * 2. Allows healthy performance (exit code 0).
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const GATE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.claude',
  'hooks',
  'benchmarks',
  'perf-gate.cjs'
);

async function testPerfGate() {
  console.log('Performance Gate Hook Tests');
  console.log('===========================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.log(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // Ensure directory exists
  const gateDir = path.dirname(GATE_PATH);
  if (!fs.existsSync(gateDir)) fs.mkdirSync(gateDir, { recursive: true });

  await test('should exit 0 when performance is within bounds', async () => {
    // This will run the actual gate we're about to implement
    const child = spawn(process.execPath, [GATE_PATH], {
      stdio: 'inherit',
      env: { ...process.env, HOOK_RUNNER_MODE: 'worker' },
    });

    const code = await new Promise(r => child.on('close', r));
    if (code !== 0) throw new Error(`Expected 0, got ${code}`);
  });

  await test('should exit 4 when performance regresses (mode: process)', async () => {
    // In process mode, latency is ~40ms, which is > 10ms limit
    const child = spawn(process.execPath, [GATE_PATH], {
      stdio: 'ignore',
      env: { ...process.env, HOOK_RUNNER_MODE: 'process' },
    });

    const code = await new Promise(r => child.on('close', r));
    if (code !== 4) throw new Error(`Expected 4 (regression), got ${code}`);
  });

  console.log(`
Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

testPerfGate();
