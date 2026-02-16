#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');

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
    hours: Number(map.get('--hours') || 24),
    json: map.get('--json') === 'true',
    requireData: map.get('--require-data') === 'true',
    assertMaxChurnRate: map.has('--assert-max-churn-rate')
      ? Number(map.get('--assert-max-churn-rate'))
      : null,
    assertMinStableRate: map.has('--assert-min-stable-rate')
      ? Number(map.get('--assert-min-stable-rate'))
      : null,
    path:
      map.get('--path') ||
      path.join(process.cwd(), '.claude', 'context', 'metrics', 'memory-cache-stability.jsonl'),
  };
}

function readRows(filePath, cutoffMs) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      const row = safeParseJSON(line);
      const ts = Date.parse(row.timestamp || '');
      if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      rows.push(row);
    } catch (_err) {
      // ignore malformed lines
    }
  }
  return rows;
}

function summarize(rows, hours) {
  const total = rows.length;
  const churned = rows.filter(r => r.churned === true).length;
  const stable = total - churned;
  const churnRate = total > 0 ? churned / total : 0;
  const stableRate = total > 0 ? stable / total : 0;

  return {
    windowHours: hours,
    total,
    churned,
    stable,
    churnRate: Number(churnRate.toFixed(6)),
    stableRate: Number(stableRate.toFixed(6)),
    latestHash: total > 0 ? rows[rows.length - 1].memory_block_hash || null : null,
  };
}

function evaluate(summary, opts) {
  const failures = [];
  if (opts.requireData && summary.total === 0) {
    failures.push('No memory cache stability rows found.');
  }
  if (
    Number.isFinite(opts.assertMaxChurnRate) &&
    summary.total > 0 &&
    summary.churnRate > opts.assertMaxChurnRate
  ) {
    failures.push(
      `Memory churn rate ${summary.churnRate} exceeds ${opts.assertMaxChurnRate} threshold.`
    );
  }
  if (
    Number.isFinite(opts.assertMinStableRate) &&
    summary.total > 0 &&
    summary.stableRate < opts.assertMinStableRate
  ) {
    failures.push(
      `Memory stable rate ${summary.stableRate} below ${opts.assertMinStableRate} threshold.`
    );
  }
  return failures;
}

function main() {
  const opts = parseArgs(process.argv);
  const cutoffMs = Date.now() - opts.hours * 60 * 60 * 1000;
  const rows = readRows(opts.path, cutoffMs);
  const summary = summarize(rows, opts.hours);
  const failures = evaluate(summary, opts);

  if (opts.json) {
    console.log(JSON.stringify({ summary, failures }, null, 2));
  } else {
    console.log('Memory cache stability summary');
    console.log(`- Window: ${summary.windowHours}h`);
    console.log(`- Total rows: ${summary.total}`);
    console.log(`- Churned rows: ${summary.churned}`);
    console.log(`- Stable rows: ${summary.stable}`);
    console.log(`- Churn rate: ${summary.churnRate}`);
    console.log(`- Stable rate: ${summary.stableRate}`);
  }

  if (failures.length > 0) process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'memory-cache-stability-summary');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  readRows,
  summarize,
  evaluate,
};
