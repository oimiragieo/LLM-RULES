#!/usr/bin/env node
'use strict';

/**
 * Token Saver Adaptive Ratio
 *
 * Computes adaptive skeleton ratio based on corpus token count.
 * Re-exports the computeAdaptiveRatio function from token-saver-context-compression
 * for module resolution and testing purposes.
 */

const { computeAdaptiveRatio } = require('../../token-saver-context-compression/scripts/main.cjs');

if (require.main === module) {
  const options = require('../../token-saver-context-compression/scripts/main.cjs').parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`token-saver-adaptive-ratio

Usage:
  node main.cjs --corpus-tokens <number>
  node main.cjs --help

Returns the adaptive compression ratio based on corpus size:
  - <8K tokens: 0.8 (keep 80%)
  - 8-32K tokens: 0.5 (keep 50%)
  - 32-100K tokens: 0.2 (keep 20%)
  - >100K tokens: 0.1 (keep 10%)
`);
    process.exit(0);
  }

  const corpusTokens = options['corpus-tokens'] ? Number(options['corpus-tokens']) : 0;
  const ratio = computeAdaptiveRatio(corpusTokens);
  process.stdout.write(JSON.stringify({ corpusTokens, ratio }, null, 2) + '\n');
}

module.exports = {
  computeAdaptiveRatio,
};
