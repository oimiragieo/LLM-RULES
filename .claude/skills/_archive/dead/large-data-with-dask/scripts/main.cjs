#!/usr/bin/env node
/**
 * large-data-with-dask - Rule-based Skill
 * Converted from: large-data-with-dask.mdc
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    options[key] = value;
  }
}

if (options.help) {
  console.log(`
large-data-with-dask - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Specific optimization strategies for Python scripts working with larger-than-memory datasets via Dask.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for large-data-with-dask:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('large-data-with-dask skill loaded. Use with Claude for code review.');
