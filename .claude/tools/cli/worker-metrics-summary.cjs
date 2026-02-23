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

  const chalk = {
    green: t => `\x1b[32m${t}\x1b[0m`,
    red: t => `\x1b[31m${t}\x1b[0m`,
    yellow: t => `\x1b[33m${t}\x1b[0m`,
    blue: t => `\x1b[34m${t}\x1b[0m`,
    gray: t => `\x1b[90m${t}\x1b[0m`,
    bold: t => `\x1b[1m${t}\x1b[0m`,
  };
  chalk.green.bold = t => chalk.bold(chalk.green(t));
  chalk.red.bold = t => chalk.bold(chalk.red(t));
  chalk.yellow.bold = t => chalk.bold(chalk.yellow(t));

  console.log(chalk.bold('\n🤖 Worker Metrics Summary'));
  console.log(chalk.gray('================================================='));
  console.log(`📂 ${chalk.blue('File')}: ${metricsPath}`);
  console.log(`⏱️  ${chalk.blue('Total ticks')}: ${summary.total}`);
  console.log(`✅ ${chalk.green('OK')}: ${summary.ok}`);
  console.log(`⚠️  ${chalk.yellow('Partial fail')}: ${summary.partialFail}`);
  console.log(
    `🕒 ${chalk.blue('Last tick')}: ${summary.lastTick ? new Date(summary.lastTick).toLocaleString() : 'n/a'}`
  );
  console.log(
    `📈 ${chalk.blue('Last status')}: ${
      summary.lastStatus === 'ok'
        ? chalk.green.bold('OK')
        : summary.lastStatus
          ? chalk.yellow.bold(summary.lastStatus)
          : 'n/a'
    }`
  );

  if (recent.length > 0) {
    console.log(chalk.gray('-------------------------------------------------'));
    console.log(chalk.bold(`Recent Activity (Last ${recent.length} ticks):`));

    for (const entry of recent) {
      const timeStr = new Date(entry.timestamp).toLocaleTimeString();
      const statusIcon = entry.status === 'ok' ? chalk.green('✅ OK') : chalk.red('❌ FAIL');

      const tasks = entry.tasks || {};
      const fails = [];
      if (tasks.maintenance?.ok === false) fails.push('maintenance');
      if (tasks.index?.ok === false) fails.push('index');
      if (tasks.reflection?.ok === false) fails.push('reflection');

      const failStr = fails.length > 0 ? chalk.red(`(Failed: ${fails.join(', ')})`) : '';
      console.log(`  [${chalk.gray(timeStr)}] ${statusIcon} ${failStr}`);
    }
  }
  console.log(chalk.gray('=================================================\n'));

  return { ok: true };
}

const wrappedMain = wrapCLITool(main, 'worker-metrics-summary');

if (require.main === module) {
  wrappedMain();
}
