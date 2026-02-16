#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const { replay } = require('../../lib/monitoring/flight-recorder-replay.cjs');
const { getRecorderPath } = require('../../lib/monitoring/flight-recorder.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  let traceId = '';
  let filePath = '';
  let compact = false;
  let limit = 0;
  let since = '';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--trace-id') {
      traceId = args[i + 1] || '';
      i += 1;
      continue;
    }
    if (args[i] === '--file') {
      filePath = args[i + 1] || '';
      i += 1;
      continue;
    }
    if (args[i] === '--compact') {
      compact = true;
      continue;
    }
    if (args[i] === '--limit') {
      limit = Number(args[i + 1] || 0);
      i += 1;
      continue;
    }
    if (args[i] === '--since') {
      since = args[i + 1] || '';
      i += 1;
    }
  }
  return { traceId, filePath, compact, limit, since };
}

function formatCompactTimeline(traceId, timeline) {
  const lines = [];
  lines.push(`traceId=${traceId} count=${timeline.length}`);
  for (const row of timeline) {
    const timestamp = row.timestamp || 'unknown-time';
    const component = row.component || 'unknown-component';
    const event = row.event || 'unknown-event';
    const taskId = row.taskId ? ` taskId=${row.taskId}` : '';
    const phase = row.phase ? ` phase=${row.phase}` : '';
    lines.push(`${timestamp} ${component} ${event}${taskId}${phase}`);
  }
  return lines.join('\n');
}

function main() {
  const { traceId, filePath, compact, limit, since } = parseArgs(process.argv);
  if (!traceId) {
    console.error(
      'Usage: node .claude/tools/cli/trace-query.cjs --trace-id <id> [--file <path>] [--compact] [--limit <n>] [--since <ISO-8601>]'
    );
    process.exit(1);
  }
  let sinceMs = 0;
  if (since) {
    sinceMs = Date.parse(since);
    if (!Number.isFinite(sinceMs)) {
      console.error(`Invalid --since value: ${since}`);
      process.exit(1);
    }
  }
  const sourcePath = filePath || getRecorderPath();
  const { entries } = replay(sourcePath);
  let timeline = entries
    .filter(row => row && row.traceId === traceId)
    .filter(row => {
      if (!sinceMs) return true;
      const rowMs = Date.parse(String(row.timestamp || ''));
      return Number.isFinite(rowMs) && rowMs >= sinceMs;
    })
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  if (Number.isFinite(limit) && limit > 0) {
    timeline = timeline.slice(-Math.floor(limit));
  }

  if (timeline.length === 0) {
    console.error(`No events found for traceId ${traceId}`);
    process.exit(1);
  }

  if (compact) {
    console.log(formatCompactTimeline(traceId, timeline));
    process.exit(0);
  }

  console.log(
    JSON.stringify(
      {
        traceId,
        count: timeline.length,
        timeline,
      },
      null,
      2
    )
  );
  process.exit(0);
}

const wrappedMain = wrapCLITool(main, 'trace-query');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  formatCompactTimeline,
  main,
};
