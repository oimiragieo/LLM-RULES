#!/usr/bin/env node
'use strict';

const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { summarizeFlakeLedger } = require('../../lib/ci/flake-ledger.cjs');

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
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const summary = summarizeFlakeLedger(opts.projectRoot);

  if (opts.json) {
    console.log(JSON.stringify({ summary }, null, 2));
    return;
  }

  console.log('Flake ledger summary');
  console.log(`- Ledger: ${summary.ledgerPath}`);
  console.log(`- Entries: ${summary.totalEntries}`);
  console.log(`- Occurrences: ${summary.totalOccurrences}`);
  console.log(`- Product regression: ${summary.byCategory.product_regression}`);
  console.log(`- Test defect: ${summary.byCategory.test_defect}`);
  console.log(`- Environment nondeterminism: ${summary.byCategory.env_nondeterminism}`);
  console.log(`- Unknown: ${summary.byCategory.unknown}`);
}

const wrappedMain = wrapCLITool(main, 'flake-report');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  main,
};
