#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const fs = require('node:fs');
const path = require('node:path');
const {
  resolveFindingsTrendPath,
  recordFindingsTrendSnapshot,
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
    reset: map.get('--reset') === 'true',
    baseline: map.get('--baseline') === 'true',
  };
}

function runAdmin(opts) {
  const trendPath = resolveFindingsTrendPath(opts.projectRoot);
  const result = {
    trendPath,
    reset: false,
    baselineRecorded: false,
  };

  if (opts.reset) {
    fs.mkdirSync(path.dirname(trendPath), { recursive: true });
    fs.writeFileSync(trendPath, '', 'utf8');
    result.reset = true;
  }

  if (opts.baseline) {
    result.baselineSnapshot = recordFindingsTrendSnapshot(opts.projectRoot, 'manual-baseline');
    result.baselineRecorded = true;
  }

  return result;
}

function main() {
  const opts = parseArgs(process.argv);
  const result = runAdmin(opts);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Open findings trend admin');
    console.log(`- Trend file: ${result.trendPath}`);
    console.log(`- Reset: ${result.reset}`);
    console.log(`- Baseline recorded: ${result.baselineRecorded}`);
  }
}

const wrappedMain = wrapCLITool(main, 'open-findings-trend-admin');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  runAdmin,
};
