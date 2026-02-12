#!/usr/bin/env node
'use strict';

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
  };
}

function runNodeTest(testPath) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ['--test', testPath], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024 * 16,
  });
  return {
    testPath,
    status: result.status ?? 1,
    signal: result.signal || null,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
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

  const runs = tests.map(runNodeTest);
  const failed = runs.filter(run => run.status !== 0);
  const report = {
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - startedAt,
    runs: runs.map(run => ({
      testPath: run.testPath,
      status: run.status,
      signal: run.signal,
      durationMs: run.durationMs,
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
      if (run.stderr) {
        process.stderr.write(run.stderr.slice(0, 4000));
      }
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runNodeTest,
};
