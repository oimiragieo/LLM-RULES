#!/usr/bin/env node
'use strict';

const impl = require('../../context-compressor/scripts/main.cjs');

if (require.main === module) {
  const options = impl.parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`
token-saver-context-compression wrapper

Usage:
  node main.cjs --query "<question>" [--mode evidence_aware|query_guided|baseline] [--limit 20]
                [--no-fail-on-insufficient-evidence] [--persist-files] [--skeleton-ratio 0.5]
                [--model claude-sonnet-4.6]
`);
    process.exit(0);
  }

  const result = impl.main({
    query: options.query,
    mode: options.mode,
    limit: options.limit ? Number(options.limit) : undefined,
    failOnInsufficientEvidence: !(
      options['no-fail-on-insufficient-evidence'] === true ||
      String(options['fail-on-insufficient-evidence']).toLowerCase() === 'false'
    ),
    persistFiles: options['persist-files'] === true,
    skeletonRatio: options['skeleton-ratio'] ? Number(options['skeleton-ratio']) : undefined,
    model: options.model,
  });

  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

module.exports = impl;
