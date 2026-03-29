#!/usr/bin/env node
'use strict';

/**
 * Token Saver Memory Dedup
 *
 * Deduplicates memory records against existing memory files.
 * Re-exports the deduplicateAgainstMemory function from token-saver-context-compression
 * for module resolution and testing purposes.
 */

const {
  deduplicateAgainstMemory,
} = require('../../token-saver-context-compression/scripts/main.cjs');

if (require.main === module) {
  const options = require('../../token-saver-context-compression/scripts/main.cjs').parseArgs(
    process.argv.slice(2)
  );
  if (options.help) {
    process.stdout.write(`token-saver-memory-dedup

Usage:
  node main.cjs --help

Deduplicates memory records against existing patterns.json and gotchas.json files.
Returns deduped records and statistics about filtered entries.
`);
    process.exit(0);
  }

  // This script is primarily used as a library export.
  // The actual deduplication requires memory records and memory directory path.
  process.stdout.write(JSON.stringify({ message: 'Use as library import' }, null, 2) + '\n');
}

module.exports = {
  deduplicateAgainstMemory,
};
