#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const { summarizeFindingsTrend } = require('../../lib/memory/findings-registry.cjs');

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
    requireData: map.get('--require-data') === 'true',
    assertMaxOpenDelta: map.has('--assert-max-open-delta')
      ? Number(map.get('--assert-max-open-delta'))
      : null,
  };
}

function evaluate(summary, opts) {
  const failures = [];
  if (opts.requireData && Number(summary.sampleCount || 0) === 0) {
    failures.push('No findings trend data available.');
  }

  if (
    Number.isFinite(opts.assertMaxOpenDelta) &&
    Number(summary.openDelta || 0) > opts.assertMaxOpenDelta
  ) {
    failures.push(`Open findings delta ${summary.openDelta} exceeds ${opts.assertMaxOpenDelta}.`);
  }

  return failures;
}

function buildSummary(projectRoot, days) {
  return {
    projectRoot,
    days,
    ...summarizeFindingsTrend(projectRoot, { days }),
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const summary = buildSummary(opts.projectRoot, opts.days);
  const failures = evaluate(summary, opts);

  if (opts.json) {
    console.log(JSON.stringify({ summary, failures }, null, 2));
  } else {
    console.log('Open findings trend summary');
    console.log(`- Samples: ${summary.sampleCount}`);
    console.log(`- Open min: ${summary.openMin}`);
    console.log(`- Open max: ${summary.openMax}`);
    console.log(`- Open avg: ${summary.openAvg}`);
    console.log(`- Open delta: ${summary.openDelta}`);
    if (failures.length > 0) {
      console.log('- Threshold failures:');
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (failures.length > 0) process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'open-findings-trend-summary');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  evaluate,
  buildSummary,
};
