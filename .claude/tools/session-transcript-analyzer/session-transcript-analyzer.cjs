#!/usr/bin/env node

/**
 * session-transcript-analyzer companion tool
 * Parses and merges Claude .jsonl transcripts with debug logs to generate a timeline heuristics report of API limits, context overflows, hook blocks, and tool failures.
 */

if (process.argv.includes('--help')) {
  console.log('session-transcript-analyzer companion tool');
  console.log('Usage: node session-transcript-analyzer.cjs [--session=<uuid>]');
  process.exit(0);
}

const { spawnSync } = require('child_process');
const path = require('path');

const mainScript = path.resolve(
  __dirname,
  '../../skills/session-transcript-analyzer/scripts/main.cjs'
);
const args = process.argv.slice(2);

const result = spawnSync('node', [mainScript, ...args], { stdio: 'inherit' });
process.exit(result.status || 0);
