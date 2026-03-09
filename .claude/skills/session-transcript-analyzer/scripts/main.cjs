#!/usr/bin/env node

/**
 * Session Transcript Analyzer - Main Script
 * Parses and merges Claude .jsonl transcripts with debug logs to generate a timeline heuristics report of API limits, context overflows, hook blocks, and tool failures.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const options = Object.fromEntries(
  process.argv
    .slice(2)
    .filter(arg => arg.startsWith('--'))
    .map(flag => {
      const [key, value] = flag.replace(/^--/, '').split('=');
      return [key, value || true];
    })
);

if (options.help) {
  console.log('Session Transcript Analyzer - Main Script');
  console.log('Usage: node main.cjs [--session=<uuid>]');
  process.exit(0);
}

const args = [];
if (process.argv.includes('--session')) {
  const idx = process.argv.indexOf('--session');
  args.push('--session', process.argv[idx + 1]);
} else if (options.session && options.session !== true) {
  args.push('--session', options.session);
}

// Target the existing analyzer script
const analyzerScript = path.resolve(
  __dirname,
  '../../../../scripts/analyze-session-transcript.mjs'
);

console.log(`Executing analyzer script...`);
const result = spawnSync('node', [analyzerScript, ...args], { stdio: 'inherit' });

process.exit(result.status || 0);
