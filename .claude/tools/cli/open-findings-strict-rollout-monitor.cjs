#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const {
  getOpenFindings,
  getFindingsSummary,
  summarizeFindingsTrend,
} = require('../../lib/memory/findings-registry.cjs');

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
    days: map.has('--days') ? Number(map.get('--days')) : 7,
    staleDays: map.has('--stale-days') ? Number(map.get('--stale-days')) : 3,
    assertMaxOpenDelta: map.has('--assert-max-open-delta')
      ? Number(map.get('--assert-max-open-delta'))
      : 0,
    assertMaxStaleOpen: map.has('--assert-max-stale-open')
      ? Number(map.get('--assert-max-stale-open'))
      : 0,
  };
}

function evaluate(summary, trend, staleOpenCount, opts) {
  const failures = [];

  if (
    Number.isFinite(opts.assertMaxOpenDelta) &&
    Number(trend.openDelta || 0) > Number(opts.assertMaxOpenDelta)
  ) {
    failures.push(
      `Open findings delta ${trend.openDelta} exceeds strict rollout threshold ${opts.assertMaxOpenDelta}.`
    );
  }

  if (
    Number.isFinite(opts.assertMaxStaleOpen) &&
    Number(staleOpenCount || 0) > Number(opts.assertMaxStaleOpen)
  ) {
    failures.push(
      `Stale open findings ${staleOpenCount} exceeds threshold ${opts.assertMaxStaleOpen}.`
    );
  }

  if (Number(summary.bySeverity?.critical?.open || 0) > 0) {
    failures.push('Critical findings remain open during strict rollout.');
  }

  return failures;
}

function main() {
  const opts = parseArgs(process.argv);
  const previousMode = process.env.OPEN_FINDINGS_RESOLUTION_MODE;
  process.env.OPEN_FINDINGS_RESOLUTION_MODE = 'strict';

  const summary = getFindingsSummary(opts.projectRoot);
  const trend = summarizeFindingsTrend(opts.projectRoot, { days: opts.days });
  const openFindings = getOpenFindings(opts.projectRoot);
  const cutoff = Date.now() - opts.staleDays * 24 * 60 * 60 * 1000;
  const staleOpenCount = openFindings.filter(item => {
    const ts = Date.parse(String(item.lastSeenAt || item.createdAt || ''));
    return Number.isFinite(ts) && ts < cutoff;
  }).length;

  if (previousMode === undefined) delete process.env.OPEN_FINDINGS_RESOLUTION_MODE;
  else process.env.OPEN_FINDINGS_RESOLUTION_MODE = previousMode;

  const failures = evaluate(summary, trend, staleOpenCount, opts);
  const output = {
    summary,
    trend: {
      days: opts.days,
      sampleCount: trend.sampleCount,
      openDelta: trend.openDelta,
      openAvg: trend.openAvg,
    },
    staleOpenCount,
    staleDays: opts.staleDays,
    failures,
  };

  if (opts.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('Strict rollout monitor');
    console.log(`- Open critical: ${summary.bySeverity?.critical?.open || 0}`);
    console.log(`- Open high: ${summary.bySeverity?.high?.open || 0}`);
    console.log(`- Trend open delta (${opts.days}d): ${trend.openDelta}`);
    console.log(`- Stale open findings (>${opts.staleDays}d): ${staleOpenCount}`);
    if (failures.length > 0) {
      console.log('- Failures:');
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (failures.length > 0) process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'open-findings-strict-rollout-monitor');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  evaluate,
};
