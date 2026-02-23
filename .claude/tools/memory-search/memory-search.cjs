#!/usr/bin/env node

/**
 * memory-search companion tool
 * Semantic search over global memory. Use to lookup specific gotchas, decisions, or patterns previously learned dynamically.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const searchScript = path.join(__dirname, '../../lib/memory/memory-search.cjs');

if (args.includes('--help')) {
  console.log('memory-search companion tool');
  console.log('Usage: node memory-search.cjs <query>');
  process.exit(0);
}

const proc = spawnSync(process.execPath, [searchScript, ...args], { stdio: 'inherit' });
process.exit(proc.status);
