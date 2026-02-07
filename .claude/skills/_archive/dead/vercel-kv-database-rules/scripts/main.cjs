#!/usr/bin/env node
/**
 * vercel-kv-database-rules - Rule-based Skill
 * Converted from: vercel-kv-database-rules.mdc
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
vercel-kv-database-rules - Code Guidelines Skill

Usage:
  node main.cjs --check <file>    Check a file against guidelines
  node main.cjs --list            List all guidelines
  node main.cjs --help            Show this help

Description:
  Defines how to interact with Vercel's KV database for storing and retrieving session and application data.
`);
  process.exit(0);
}

if (options.list) {
  console.log('Guidelines for vercel-kv-database-rules:');
  console.log('See SKILL.md for full guidelines');
  process.exit(0);
}

console.log('vercel-kv-database-rules skill loaded. Use with Claude for code review.');
