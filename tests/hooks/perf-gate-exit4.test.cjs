'use strict';
/**
 * perf-gate-exit4.test.cjs
 *
 * RED tests (TDD) for exit-4 DEGRADE conversion in perf-gate.cjs.
 *
 * Site (line ~8): latency regression in process mode → exit 4 + DEGRADE trailer
 *
 * ADR: .claude/context/artifacts/analysis/hook-exit-code-contract-2026-04-21.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/benchmarks/perf-gate.cjs'
);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

function runHook(env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    timeout: 8000,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ---------------------------------------------------------------------------
// Latency regression in process mode → exit 4 + DEGRADE trailer
// ---------------------------------------------------------------------------
describe('perf-gate: latency regression → exit 4 DEGRADE', () => {
  it('exits 4 (not 2) when HOOK_RUNNER_MODE=process (latency regression)', () => {
    const result = runHook({ HOOK_RUNNER_MODE: 'process' });
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for latency regression, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });

  it('emits DEGRADE: on stderr when latency regression detected', () => {
    const result = runHook({ HOOK_RUNNER_MODE: 'process' });
    assert.ok(
      result.stderr.includes('DEGRADE:'),
      `Expected stderr to contain "DEGRADE:", got: ${result.stderr}`
    );
  });

  it('emits reason=latency_regression_pct=<N> format in DEGRADE trailer', () => {
    const result = runHook({ HOOK_RUNNER_MODE: 'process' });
    assert.ok(
      result.stderr.includes('reason=latency_regression_pct='),
      `Expected "reason=latency_regression_pct=<N>" in DEGRADE trailer, got: ${result.stderr}`
    );
  });

  it('exits 0 (pass) when HOOK_RUNNER_MODE is not process (latency budget satisfied)', () => {
    const result = runHook({ HOOK_RUNNER_MODE: 'worker' });
    assert.strictEqual(
      result.exitCode,
      0,
      `Expected exit 0 for satisfied latency budget, got ${result.exitCode}`
    );
  });
});
