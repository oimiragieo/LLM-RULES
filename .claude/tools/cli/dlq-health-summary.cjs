#!/usr/bin/env node
'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../../lib/utils/project-root.cjs');

function parseBool(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'true'
  );
}

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
    file:
      map.get('--file') || path.join(PROJECT_ROOT, '.claude', 'context', 'data', 'tasks-dlq.jsonl'),
    hours: Number(map.get('--hours') || 24),
    json: parseBool(map.get('--json')),
    requireData: parseBool(map.get('--require-data')),
    assertMaxTotal: map.has('--assert-max-total') ? Number(map.get('--assert-max-total')) : null,
    assertMaxRatePerHour: map.has('--assert-max-rate-per-hour')
      ? Number(map.get('--assert-max-rate-per-hour'))
      : null,
    assertMaxFailed: map.has('--assert-max-failed') ? Number(map.get('--assert-max-failed')) : null,
    assertMaxCancelled: map.has('--assert-max-cancelled')
      ? Number(map.get('--assert-max-cancelled'))
      : null,
  };
}

function parseTimestamp(entry) {
  const raw = entry.archivedAt || entry.timestamp || entry.updatedAt || entry.completedAt;
  const ts = Date.parse(String(raw || ''));
  return Number.isFinite(ts) ? ts : null;
}

function readRows(filePath, cutoffMs) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      const parsed = safeParseJSON(line);
      const ts = parseTimestamp(parsed);
      if (ts == null || ts < cutoffMs) continue;
      rows.push(parsed);
    } catch (_err) {
      // ignore malformed rows
    }
  }
  return rows;
}

function summarize(rows, hours) {
  const failed = rows.filter(row => String(row.status || '').toLowerCase() === 'failed').length;
  const cancelled = rows.filter(
    row => String(row.status || '').toLowerCase() === 'cancelled'
  ).length;
  const total = rows.length;
  const ratePerHour = hours > 0 ? Number((total / hours).toFixed(3)) : total;
  return {
    windowHours: hours,
    total,
    failed,
    cancelled,
    ratePerHour,
  };
}

function evaluate(summary, opts) {
  const failures = [];

  if (opts.requireData && summary.total === 0) {
    failures.push('No DLQ rows found in the selected time window.');
  }
  if (Number.isFinite(opts.assertMaxTotal) && summary.total > opts.assertMaxTotal) {
    failures.push(`DLQ total ${summary.total} exceeds threshold ${opts.assertMaxTotal}.`);
  }
  if (
    Number.isFinite(opts.assertMaxRatePerHour) &&
    summary.ratePerHour > opts.assertMaxRatePerHour
  ) {
    failures.push(
      `DLQ rate/hour ${summary.ratePerHour} exceeds threshold ${opts.assertMaxRatePerHour}.`
    );
  }
  if (Number.isFinite(opts.assertMaxFailed) && summary.failed > opts.assertMaxFailed) {
    failures.push(`DLQ failed count ${summary.failed} exceeds threshold ${opts.assertMaxFailed}.`);
  }
  if (Number.isFinite(opts.assertMaxCancelled) && summary.cancelled > opts.assertMaxCancelled) {
    failures.push(
      `DLQ cancelled count ${summary.cancelled} exceeds threshold ${opts.assertMaxCancelled}.`
    );
  }

  return failures;
}

function main() {
  const opts = parseArgs(process.argv);
  const now = Date.now();
  const cutoffMs = now - opts.hours * 60 * 60 * 1000;
  const rows = readRows(opts.file, cutoffMs);
  const summary = summarize(rows, opts.hours);
  const failures = evaluate(summary, opts);

  if (opts.json) {
    process.stdout.write(JSON.stringify({ summary, failures }, null, 2) + '\n');
  } else {
    process.stdout.write('DLQ health summary\n');
    process.stdout.write(`- File: ${opts.file}\n`);
    process.stdout.write(`- Window: ${summary.windowHours}h\n`);
    process.stdout.write(`- Total: ${summary.total}\n`);
    process.stdout.write(`- Failed: ${summary.failed}\n`);
    process.stdout.write(`- Cancelled: ${summary.cancelled}\n`);
    process.stdout.write(`- Rate/hour: ${summary.ratePerHour}\n`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}
const wrappedMain = wrapCLITool(main, 'dlq-health-summary');

if (require.main === module) {
  wrappedMain();
}
