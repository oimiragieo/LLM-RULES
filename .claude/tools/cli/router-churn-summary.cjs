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
    assertMaxBlockRate: map.has('--assert-max-block-rate')
      ? Number(map.get('--assert-max-block-rate'))
      : null,
    assertMaxRepeatedBlocks: map.has('--assert-max-repeated-blocks')
      ? Number(map.get('--assert-max-repeated-blocks'))
      : null,
    file:
      map.get('--path') ||
      path.join(process.cwd(), '.claude', 'context', 'metrics', 'router-churn-metrics.jsonl'),
  };
}

function readRows(file, cutoff) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      const row = safeParseJSON(line);
      const ts = Date.parse(row.timestamp || '');
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      rows.push(row);
    } catch (_err) {
      // ignore malformed
    }
  }
  return rows;
}

function summarize(rows, hours) {
  const total = rows.length;
  const blocks = rows.filter(r => r.result === 'block').length;
  const warns = rows.filter(r => r.result === 'warn').length;
  const repeatedBlocks = rows.filter(
    r => r.result === 'block' && Number(r.dedupe_count || 0) >= 2
  ).length;
  const blockRate = total > 0 ? (blocks / total) * 100 : 0;
  const byCheck = {};
  for (const row of rows) {
    const check = row.check || 'unknown';
    byCheck[check] = byCheck[check] || { total: 0, block: 0, warn: 0 };
    byCheck[check].total++;
    if (row.result === 'block') byCheck[check].block++;
    if (row.result === 'warn') byCheck[check].warn++;
  }
  return {
    windowHours: hours,
    total,
    blocks,
    warns,
    blockRate: Number(blockRate.toFixed(3)),
    repeatedBlocks,
    repeatedBlocksPerHour: Number((repeatedBlocks / Math.max(hours, 1)).toFixed(3)),
    byCheck,
  };
}

function evaluate(summary, opts) {
  const failures = [];
  if (opts.requireData && summary.total === 0) {
    failures.push('No router churn metrics found in selected window.');
  }
  if (Number.isFinite(opts.assertMaxBlockRate) && summary.total > 0) {
    if (summary.blockRate > opts.assertMaxBlockRate) {
      failures.push(
        `Router block rate ${summary.blockRate}% exceeds ${opts.assertMaxBlockRate}% threshold.`
      );
    }
  }
  if (Number.isFinite(opts.assertMaxRepeatedBlocks) && summary.total > 0) {
    if (summary.repeatedBlocksPerHour > opts.assertMaxRepeatedBlocks) {
      failures.push(
        `Repeated blocks/hour ${summary.repeatedBlocksPerHour} exceeds ${opts.assertMaxRepeatedBlocks} threshold.`
      );
    }
  }
  return failures;
}

function main() {
  const opts = parseArgs(process.argv);
  const cutoff = Date.now() - opts.hours * 60 * 60 * 1000;
  const rows = readRows(opts.file, cutoff);
  const summary = summarize(rows, opts.hours);
  const failures = evaluate(summary, opts);

  if (opts.json) {
    console.log(JSON.stringify({ summary, failures }, null, 2));
  } else {
    console.log('Router churn summary');
    console.log(`- Window: ${summary.windowHours}h`);
    console.log(`- Total decisions: ${summary.total}`);
    console.log(`- Block rate: ${summary.blockRate}%`);
    console.log(`- Repeated blocks/hour: ${summary.repeatedBlocksPerHour}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}
const wrappedMain = wrapCLITool(main, 'router-churn-summary');

if (require.main === module) {
  wrappedMain();
}
