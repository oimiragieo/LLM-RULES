#!/usr/bin/env node
/**
 * Worker Metrics Summary CLI
 *
 * Reads worker.jsonl and prints a short summary + last N ticks.
 *
 * Usage:
 *   node .claude/tools/cli/worker-metrics-summary.cjs --last 20
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

function readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  const lastIdx = args.indexOf('--last');
  const jsonIdx = args.indexOf('--json');
  const pathIdx = args.indexOf('--path');

  const last = lastIdx >= 0 ? Number(args[lastIdx + 1] || 20) : 20;
  const outputJson = jsonIdx >= 0;
  const metricsPath =
    pathIdx >= 0
      ? args[pathIdx + 1]
      : path.join(process.cwd(), '.claude', 'context', 'metrics', 'worker.jsonl');

  const lines = readLines(metricsPath);
  const entries = [];

  for (const line of lines) {
    const parsed = safeParseJSON(line);
    if (!parsed || Object.keys(parsed).length === 0) continue;
    entries.push(parsed);
  }

  const recent = entries.slice(-last);
  const summary = {
    total: entries.length,
    ok: entries.filter(e => e.status === 'ok').length,
    partialFail: entries.filter(e => e.status === 'partial-fail').length,
    lastTick: entries.length ? entries[entries.length - 1].timestamp : null,
    lastStatus: entries.length ? entries[entries.length - 1].status : null,
    file: metricsPath,
  };

  if (outputJson) {
    console.log(JSON.stringify({ summary, recent }, null, 2));
    return { ok: true };
  }

  console.log('Worker metrics summary');
  console.log(`- File: ${metricsPath}`);
  console.log(`- Total ticks: ${summary.total}`);
  console.log(`- OK: ${summary.ok}`);
  console.log(`- Partial fail: ${summary.partialFail}`);
  console.log(`- Last tick: ${summary.lastTick || 'n/a'}`);
  console.log(`- Last status: ${summary.lastStatus || 'n/a'}`);
  console.log('');
  console.log(`Last ${recent.length} tick(s):`);

  for (const entry of recent) {
    const tasks = entry.tasks || {};
    const parts = [
      entry.timestamp,
      entry.status,
      tasks.maintenance?.ok === false ? 'maintenance:fail' : null,
      tasks.index?.ok === false ? 'index:fail' : null,
      tasks.reflection?.ok === false ? 'reflection:fail' : null,
    ].filter(Boolean);
    console.log(`- ${parts.join(' | ')}`);
  }

  return { ok: true };
}

const wrappedMain = wrapCLITool(main, 'worker-metrics-summary');

if (require.main === module) {
  wrappedMain();
}
