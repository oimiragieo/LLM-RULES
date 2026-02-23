#!/usr/bin/env node

/**
 * Memory Search - Main Script
 * Semantic search over global memory.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const searchScript = path.join(__dirname, '../../../../.claude/lib/memory/memory-search.cjs');

const proc = spawnSync(process.execPath, [searchScript, ...args], { stdio: 'inherit' });
process.exit(proc.status);
