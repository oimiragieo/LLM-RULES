#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const { recordFindingsTrendSnapshot } = require('../../lib/memory/findings-registry.cjs');

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
    source: map.get('--source') || 'manual',
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const snapshot = recordFindingsTrendSnapshot(opts.projectRoot, opts.source);
  if (opts.json) {
    console.log(JSON.stringify({ snapshot }, null, 2));
  } else {
    console.log('Open findings trend snapshot');
    console.log(JSON.stringify(snapshot));
  }
}

const wrappedMain = wrapCLITool(main, 'open-findings-trend-snapshot');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
};
