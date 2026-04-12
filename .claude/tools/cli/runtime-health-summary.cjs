#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = argv.slice(2);
  const map = new Map();
  const excludeComponents = [];
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--')) continue;
    if (key === '--exclude-component') {
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : '';
      if (val) excludeComponents.push(val);
      continue;
    }
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    map.set(key, value);
  }
  return {
    hours: Number(map.get('--hours') || 24),
    json: map.get('--json') === 'true',
    requireData: map.get('--require-data') === 'true',
    assertMaxP95Ms: map.has('--assert-max-p95-ms') ? Number(map.get('--assert-max-p95-ms')) : null,
    assertMaxHeapMb: map.has('--assert-max-heap-mb')
      ? Number(map.get('--assert-max-heap-mb'))
      : null,
    excludeComponents,
    path:
      map.get('--path') ||
      path.join(process.cwd(), '.claude', 'context', 'metrics', 'runtime-health-metrics.jsonl'),
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
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
  const durations = rows.map(r => Number(r.duration_ms)).filter(Number.isFinite);
  const heaps = rows.map(r => Number(r.heap_used_mb)).filter(Number.isFinite);
  const failures = rows.filter(r => String(r.status || '').startsWith('error')).length;
  return {
    windowHours: hours,
    total: rows.length,
    failures,
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    avgHeapMb: Number((heaps.reduce((sum, v) => sum + v, 0) / (heaps.length || 1)).toFixed(3)),
    p95HeapMb: Number(percentile(heaps, 0.95).toFixed(3)),
  };
}

function evaluate(summary, opts) {
  const failures = [];
  if (opts.requireData && summary.total === 0) {
    failures.push('No runtime health rows found.');
  }
  if (
    Number.isFinite(opts.assertMaxP95Ms) &&
    summary.total > 0 &&
    summary.p95Ms > opts.assertMaxP95Ms
  ) {
    failures.push(`Runtime p95 ${summary.p95Ms}ms exceeds ${opts.assertMaxP95Ms}ms threshold.`);
  }
  if (
    Number.isFinite(opts.assertMaxHeapMb) &&
    summary.total > 0 &&
    summary.p95HeapMb > opts.assertMaxHeapMb
  ) {
    failures.push(
      `Runtime heap p95 ${summary.p95HeapMb}MB exceeds ${opts.assertMaxHeapMb}MB threshold.`
    );
  }
  return failures;
}

function main() {
  const opts = parseArgs(process.argv);
  const cutoff = Date.now() - opts.hours * 60 * 60 * 1000;
  let rows = readRows(opts.path, cutoff);
  if (opts.excludeComponents.length > 0) {
    rows = rows.filter(r => !opts.excludeComponents.includes(r.component));
  }
  const summary = summarize(rows, opts.hours);
  const failures = evaluate(summary, opts);

  if (opts.json) {
    console.log(JSON.stringify({ summary, failures }, null, 2));
  } else {
    console.log('Runtime health summary');
    console.log(`- Window: ${summary.windowHours}h`);
    console.log(`- Total rows: ${summary.total}`);
    console.log(`- Runtime p95: ${summary.p95Ms}ms`);
    console.log(`- Heap p95: ${summary.p95HeapMb}MB`);
    console.log(`- Error rows: ${summary.failures}`);
  }

  if (failures.length > 0) process.exit(1);
}
const wrappedMain = wrapCLITool(main, 'runtime-health-summary');

if (require.main === module) {
  wrappedMain();
}
