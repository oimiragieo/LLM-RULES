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
    json: map.get('--json') === 'true',
    hours: Number(map.get('--hours') || 24),
    assertMaxP95Ms: map.has('--assert-max-p95-ms') ? Number(map.get('--assert-max-p95-ms')) : null,
    assertMaxBurnRate: map.has('--assert-max-burn-rate')
      ? Number(map.get('--assert-max-burn-rate'))
      : null,
    assertMinCompactness: map.has('--assert-min-compactness')
      ? Number(map.get('--assert-min-compactness'))
      : null,
    requireData: map.get('--require-data') === 'true',
    assemblyPath:
      map.get('--assembly-path') ||
      path.join(process.cwd(), '.claude', 'context', 'metrics', 'spawn-assembly-metrics.jsonl'),
    tokenPath:
      map.get('--token-path') ||
      path.join(process.cwd(), '.claude', 'context', 'metrics', 'token-burn-metrics.jsonl'),
  };
}

function readJsonl(filePath, cutoffMs) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    try {
      const row = safeParseJSON(line);
      const ts = Date.parse(row.timestamp || '');
      if (!Number.isFinite(ts) || ts < cutoffMs) continue;
      out.push(row);
    } catch (_err) {
      // ignore malformed lines
    }
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function summarize(assemblyRows, tokenRows, hours) {
  const assemblyMs = assemblyRows.map(r => Number(r.total_ms)).filter(Number.isFinite);
  const burnRates = tokenRows
    .map(r => Number(r.burn_rate_tokens_per_second))
    .filter(Number.isFinite);
  const outputTokens = tokenRows.map(r => Number(r.output_tokens_est)).filter(Number.isFinite);
  const compactness = assemblyRows.map(r => Number(r.compactness_score)).filter(Number.isFinite);

  return {
    windowHours: hours,
    assembly: {
      samples: assemblyMs.length,
      avgMs: Number(avg(assemblyMs).toFixed(3)),
      p50Ms: Number(percentile(assemblyMs, 0.5).toFixed(3)),
      p95Ms: Number(percentile(assemblyMs, 0.95).toFixed(3)),
      p99Ms: Number(percentile(assemblyMs, 0.99).toFixed(3)),
      avgCompactness: Number(avg(compactness).toFixed(3)),
      p50Compactness: Number(percentile(compactness, 0.5).toFixed(3)),
      p95CompactnessLowTail: Number(percentile(compactness, 0.05).toFixed(3)),
    },
    tokenBurn: {
      samples: burnRates.length,
      avgTokensPerSecond: Number(avg(burnRates).toFixed(3)),
      p50TokensPerSecond: Number(percentile(burnRates, 0.5).toFixed(3)),
      p95TokensPerSecond: Number(percentile(burnRates, 0.95).toFixed(3)),
      avgOutputTokens: Number(avg(outputTokens).toFixed(2)),
    },
  };
}

function evaluateThresholds(summary, opts) {
  const failures = [];

  if (opts.requireData && (summary.assembly.samples === 0 || summary.tokenBurn.samples === 0)) {
    failures.push('No metric samples available in selected window.');
  }

  if (Number.isFinite(opts.assertMaxP95Ms) && summary.assembly.samples > 0) {
    if (summary.assembly.p95Ms > opts.assertMaxP95Ms) {
      failures.push(
        `Assembly p95 ${summary.assembly.p95Ms}ms exceeds ${opts.assertMaxP95Ms}ms threshold.`
      );
    }
  }

  if (Number.isFinite(opts.assertMaxBurnRate) && summary.tokenBurn.samples > 0) {
    if (summary.tokenBurn.p95TokensPerSecond > opts.assertMaxBurnRate) {
      failures.push(
        `Token burn p95 ${summary.tokenBurn.p95TokensPerSecond} tok/s exceeds ${opts.assertMaxBurnRate} tok/s threshold.`
      );
    }
  }

  if (Number.isFinite(opts.assertMinCompactness) && summary.assembly.samples > 0) {
    if (summary.assembly.p95CompactnessLowTail < opts.assertMinCompactness) {
      failures.push(
        `Compactness low-tail p05 ${summary.assembly.p95CompactnessLowTail} below ${opts.assertMinCompactness} threshold.`
      );
    }
  }

  return failures;
}

function main() {
  const opts = parseArgs(process.argv);
  const cutoffMs = Date.now() - opts.hours * 60 * 60 * 1000;
  const assemblyRows = readJsonl(opts.assemblyPath, cutoffMs);
  const tokenRows = readJsonl(opts.tokenPath, cutoffMs);
  const summary = summarize(assemblyRows, tokenRows, opts.hours);
  const failures = evaluateThresholds(summary, opts);

  if (opts.json) {
    console.log(JSON.stringify({ summary, failures }, null, 2));
  } else {
    console.log('Spawn assembly metrics');
    console.log(`- Window: ${summary.windowHours}h`);
    console.log(`- Assembly: samples=${summary.assembly.samples} p95=${summary.assembly.p95Ms}ms`);
    console.log(
      `- Token burn: samples=${summary.tokenBurn.samples} p95=${summary.tokenBurn.p95TokensPerSecond} tok/s`
    );
    if (failures.length > 0) {
      console.log('- Threshold failures:');
      for (const f of failures) console.log(`  - ${f}`);
    }
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}
const wrappedMain = wrapCLITool(main, 'spawn-assembly-metrics-summary');

if (require.main === module) {
  wrappedMain();
}
