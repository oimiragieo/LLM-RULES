#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = process.cwd();
const METRICS_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'metrics',
  'memory-soak-regimen.jsonl'
);
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'reports',
  'memory-soak-regimen-latest.json'
);

function parseArgs(argv) {
  const args = argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--')) continue;
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    map.set(key, value);
  }
  return {
    json: map.get('--json') === 'true',
    writeReport: map.get('--write-report') !== 'false',
    testTimeoutMs: Number(map.get('--test-timeout-ms') || 300000),
  };
}

function runNodeTest(testPath, timeoutMs) {
  const startedAt = Date.now();
  console.log(`[memory-soak] start ${testPath}`);
  const result = spawnSync(process.execPath, ['--test', testPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024 * 16,
    windowsHide: true,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  const status = typeof result.status === 'number' ? result.status : 1;
  const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT');
  console.log(
    `[memory-soak] done ${testPath} status=${status} timeout=${timedOut} duration_ms=${Date.now() - startedAt}`
  );
  return {
    testPath,
    status,
    signal: result.signal || null,
    durationMs: Date.now() - startedAt,
    timedOut,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendMetric(entry) {
  ensureDir(METRICS_PATH);
  fs.appendFileSync(METRICS_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

function writeReport(report) {
  ensureDir(REPORT_PATH);
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function main() {
  const opts = parseArgs(process.argv);
  const startedAt = Date.now();
  const tests = [
    'tests/lib/memory/memory-soak-chaos.test.cjs',
    'tests/lib/memory/memory-stress.test.cjs',
  ];

  const runs = tests.map(testPath => runNodeTest(testPath, opts.testTimeoutMs));
  const failed = runs.filter(run => run.status !== 0);
  const report = {
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - startedAt,
    runs: runs.map(run => ({
      testPath: run.testPath,
      status: run.status,
      signal: run.signal,
      durationMs: run.durationMs,
      timedOut: run.timedOut,
      error: run.error,
    })),
    failedCount: failed.length,
    ok: failed.length === 0,
  };

  appendMetric({
    event: 'memory_soak_regimen',
    timestamp: report.timestamp,
    total_duration_ms: report.totalDurationMs,
    failed_count: report.failedCount,
    run_count: report.runs.length,
    ok: report.ok,
  });

  if (opts.writeReport) {
    writeReport(report);
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Memory soak regimen');
    console.log(`- Total duration: ${report.totalDurationMs}ms`);
    console.log(`- Runs: ${report.runs.length}`);
    console.log(`- Failed: ${report.failedCount}`);
  }

  if (!report.ok) {
    for (const run of failed) {
      process.stderr.write(`\n[${run.testPath}] failed with status ${run.status}\n`);
      if (run.timedOut) {
        process.stderr.write(`[${run.testPath}] timed out after ${opts.testTimeoutMs}ms\n`);
      }
      if (run.error) {
        process.stderr.write(`[${run.testPath}] error: ${run.error}\n`);
      }
      if (run.stdout) {
        process.stderr.write(run.stdout.slice(0, 4000));
      }
      if (run.stderr) {
        process.stderr.write(run.stderr.slice(0, 4000));
      }
    }
    process.exit(1);
  }
}

const wrappedMain = wrapCLITool(main, 'run-memory-soak-regimen');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  runNodeTest,
};
