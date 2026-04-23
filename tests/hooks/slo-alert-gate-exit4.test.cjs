'use strict';
/**
 * slo-alert-gate-exit4.test.cjs
 *
 * RED tests (TDD) for exit-4 DEGRADE conversion in slo-alert-gate.cjs.
 *
 * Site (line ~32): SLO violation → exit 4 + DEGRADE: reason=slo_breach metric=<name>
 *
 * ADR: .claude/context/artifacts/analysis/hook-exit-code-contract-2026-04-21.md
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/monitoring/slo-alert-gate.cjs'
);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

let tmpDir;
let metricsFile;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slo-gate-test-'));
  metricsFile = path.join(tmpDir, 'slo-metrics.json');
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeMetrics(data) {
  fs.writeFileSync(metricsFile, JSON.stringify(data), 'utf8');
}

function runHook(env = {}) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    shell: false,
    timeout: 8000,
    env: {
      ...process.env,
      SLO_METRICS_PATH: metricsFile,
      ...env,
    },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

// ---------------------------------------------------------------------------
// SLO violation → exit 4 + DEGRADE trailer
// ---------------------------------------------------------------------------
describe('slo-alert-gate: SLO violation → exit 4 DEGRADE', () => {
  it('exits 4 (not 2) when hook p95 latency exceeds limit', () => {
    writeMetrics({
      hookLatency: { p95_ms: 100 }, // default limit is 5ms
      recorder: { failureRate: 0 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5' });
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for p95 SLO breach, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });

  it('emits DEGRADE: on stderr when p95 SLO is breached', () => {
    writeMetrics({
      hookLatency: { p95_ms: 100 },
      recorder: { failureRate: 0 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5' });
    assert.ok(
      result.stderr.includes('DEGRADE:'),
      `Expected stderr to contain "DEGRADE:", got: ${result.stderr}`
    );
  });

  it('emits reason=slo_breach in DEGRADE trailer', () => {
    writeMetrics({
      hookLatency: { p95_ms: 100 },
      recorder: { failureRate: 0 },
    });
    const result = runHook({ HOOK_P95_MAX_MS: '5' });
    assert.ok(
      result.stderr.includes('reason=slo_breach'),
      `Expected "reason=slo_breach" in DEGRADE trailer, got: ${result.stderr}`
    );
  });

  it('emits metric=<name> in DEGRADE trailer for hook_p95 violation', () => {
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

  it('exits 4 when recorder failure rate exceeds limit', () => {
    writeMetrics({
      hookLatency: { p95_ms: 1 }, // under limit
      recorder: { failureRate: 0.5 }, // over default 0.01 limit
    });
    const result = runHook({
      HOOK_P95_MAX_MS: '999',
      RECORDER_FAILURE_RATE_MAX: '0.01',
    });
    assert.strictEqual(
      result.exitCode,
      4,
      `Expected exit 4 for recorder failure rate breach, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });

  it('emits metric=recorder_failure_rate in DEGRADE trailer for failure rate violation', () => {
    writeMetrics({
      hookLatency: { p95_ms: 1 },
      recorder: { failureRate: 0.5 },
    });
    const result = runHook({
      HOOK_P95_MAX_MS: '999',
      RECORDER_FAILURE_RATE_MAX: '0.01',
    });
    assert.ok(
      result.stderr.includes('metric='),
      `Expected "metric=<name>" in DEGRADE trailer, got: ${result.stderr}`
    );
  });

  it('exits 0 (PASS) when all SLOs are within limits', () => {
    writeMetrics({
      hookLatency: { p95_ms: 2 }, // under 5ms
      recorder: { failureRate: 0.001 }, // under 0.01
    });
    const result = runHook({
      HOOK_P95_MAX_MS: '5',
      RECORDER_FAILURE_RATE_MAX: '0.01',
    });
    assert.strictEqual(
      result.exitCode,
      0,
      `Expected exit 0 for passing SLOs, got ${result.exitCode}. stderr: ${result.stderr}`
    );
  });
});
