'use strict';
/**
 * exit4-degrade-slo-alert-gate.test.cjs
 *
 * RED tests (TDD) for exit-4 DEGRADE conversion in slo-alert-gate.cjs.
 *
 * Site 4 (line ~32): SLO violation → exit 4 + DEGRADE: reason=slo_breach metric=<name>
 *
 * ADR: .claude/context/artifacts/analysis/hook-exit-code-contract-2026-04-21.md
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOK_PATH = path.resolve(__dirname, '../../.claude/hooks/monitoring/slo-alert-gate.cjs');
const PROJECT_ROOT = path.resolve(__dirname, '../../');

let tmpDir;
let metricsPath;

function runHook(env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({}),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    timeout: 8000,
    env: { ...process.env, SLO_METRICS_PATH: metricsPath, ...env },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function writeMetrics(data) {
  fs.writeFileSync(metricsPath, JSON.stringify(data), 'utf8');
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slo-gate-test-'));
  metricsPath = path.join(tmpDir, 'slo-metrics.json');
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Site 4: SLO violation → exit 4 + DEGRADE trailer
// ---------------------------------------------------------------------------
describe('slo-alert-gate: Site 4 — SLO violation → exit 4 DEGRADE', () => {
  it('exits 4 (not 2) when hook p95 latency exceeds threshold', () => {
    writeMetrics({
      hookLatency: { p95_ms: 100 }, // default max is 5ms
      recorder: { failureRate: 0 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5' });
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for SLO violation, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });

  it('emits DEGRADE: reason=slo_breach trailer on stderr', () => {
    writeMetrics({
      hookLatency: { p95_ms: 100 },
      recorder: { failureRate: 0 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5' });
    assert.ok(
      result.stderr.includes('DEGRADE:'),
      `Expected stderr to contain "DEGRADE:", got: ${result.stderr}`
    );
    assert.ok(
      result.stderr.includes('reason=slo_breach'),
      `Expected "reason=slo_breach" in stderr, got: ${result.stderr}`
    );
  });

  it('emits metric=<name> in DEGRADE trailer identifying the breached SLO', () => {
    writeMetrics({
      hookLatency: { p95_ms: 100 },
      recorder: { failureRate: 0 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5' });
    assert.ok(
      result.stderr.includes('metric='),
      `Expected "metric=<name>" in DEGRADE trailer, got: ${result.stderr}`
    );
  });

  it('exits 4 when recorder failure rate exceeds threshold', () => {
    writeMetrics({
      hookLatency: { p95_ms: 0 },
      recorder: { failureRate: 0.5 }, // default max is 0.01
    });
    const result = runHook({ RECORDER_FAILURE_RATE_MAX: '0.01' });
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for recorder failure rate violation, got ${result.exitCode}`
    );
  });

  it('exits 0 when all SLOs pass', () => {
    writeMetrics({
      hookLatency: { p95_ms: 1 },
      recorder: { failureRate: 0.001 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5', RECORDER_FAILURE_RATE_MAX: '0.01' });
    assert.strictEqual(result.exitCode, 0, `Expected exit 0 when SLOs pass, got ${result.exitCode}`);
  });
});
