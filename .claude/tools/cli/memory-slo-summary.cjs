#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { summarizeOperationalSLO } = require('../../lib/memory/memory-slo-metrics.cjs');

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
    projectRoot: map.get('--project-root') || process.cwd(),
    assertMaxWriteP95Ms: map.has('--assert-max-write-p95-ms')
      ? Number(map.get('--assert-max-write-p95-ms'))
      : null,
    assertMaxLockWaitP95Ms: map.has('--assert-max-lock-wait-p95-ms')
      ? Number(map.get('--assert-max-lock-wait-p95-ms'))
      : null,
    assertMaxParseFailureRate: map.has('--assert-max-parse-failure-rate')
      ? Number(map.get('--assert-max-parse-failure-rate'))
      : null,
    assertMaxChurnRate: map.has('--assert-max-churn-rate')
      ? Number(map.get('--assert-max-churn-rate'))
      : null,
    requireData: map.get('--require-data') === 'true',
  };
}

function readCacheStability(projectRoot) {
  const filePath = path.join(
    projectRoot,
    '.claude',
    'context',
    'metrics',
    'memory-cache-stability.jsonl'
  );
  if (!fs.existsSync(filePath)) {
    return { total: 0, churned: 0, stable: 0, churnRate: 0, stableRate: 0 };
  }

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  let total = 0;
  let churned = 0;
  for (const line of lines) {
    try {
      const row = safeParseJSON(line);
      total += 1;
      if (row?.churned === true) churned += 1;
    } catch (_err) {
      // ignore malformed lines
    }
  }

  const stable = total - churned;
  const churnRate = total > 0 ? churned / total : 0;
  const stableRate = total > 0 ? stable / total : 0;
  return { total, churned, stable, churnRate, stableRate };
}

function evaluate(summary, opts) {
  const failures = [];

  const counters = summary?.operational?.counters || {};
  const operationalSignalCount =
    Number(counters.writesTotal || 0) +
    Number(counters.readsTotal || 0) +
    Number(counters.parseAttempts || 0) +
    Number(counters.lockAcquires || 0);

  if (opts.requireData && operationalSignalCount === 0) {
    failures.push('No operational memory samples found.');
  }

  if (
    Number.isFinite(opts.assertMaxWriteP95Ms) &&
    summary.operational.p95.writeLatencyMs > opts.assertMaxWriteP95Ms
  ) {
    failures.push(
      `Write p95 ${summary.operational.p95.writeLatencyMs}ms exceeds ${opts.assertMaxWriteP95Ms}ms threshold.`
    );
  }

  if (
    Number.isFinite(opts.assertMaxLockWaitP95Ms) &&
    summary.operational.p95.lockWaitMs > opts.assertMaxLockWaitP95Ms
  ) {
    failures.push(
      `Lock wait p95 ${summary.operational.p95.lockWaitMs}ms exceeds ${opts.assertMaxLockWaitP95Ms}ms threshold.`
    );
  }

  if (
    Number.isFinite(opts.assertMaxParseFailureRate) &&
    summary.operational.parseFailureRate > opts.assertMaxParseFailureRate
  ) {
    failures.push(
      `Parse failure rate ${summary.operational.parseFailureRate} exceeds ${opts.assertMaxParseFailureRate} threshold.`
    );
  }

  if (
    Number.isFinite(opts.assertMaxChurnRate) &&
    summary.cacheStability.total > 0 &&
    summary.cacheStability.churnRate > opts.assertMaxChurnRate
  ) {
    failures.push(
      `Memory cache churn rate ${summary.cacheStability.churnRate} exceeds ${opts.assertMaxChurnRate} threshold.`
    );
  }

  return failures;
}

function buildSummary(projectRoot) {
  const operational = summarizeOperationalSLO(projectRoot);
  const cacheStability = readCacheStability(projectRoot);
  return {
    projectRoot,
    timestamp: new Date().toISOString(),
    operational,
    cacheStability,
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const summary = buildSummary(opts.projectRoot);
  const failures = evaluate(summary, opts);

  if (opts.json) {
    console.log(JSON.stringify({ summary, failures }, null, 2));
  } else {
    console.log('Memory SLO summary');
    console.log(`- Write p95: ${summary.operational.p95.writeLatencyMs}ms`);
    console.log(`- Lock wait p95: ${summary.operational.p95.lockWaitMs}ms`);
    console.log(`- Parse failure rate: ${summary.operational.parseFailureRate}`);
    console.log(`- Cache churn rate: ${summary.cacheStability.churnRate}`);
    if (failures.length > 0) {
      console.log('- Threshold failures:');
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (failures.length > 0) process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'memory-slo-summary');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  readCacheStability,
  buildSummary,
  evaluate,
};
